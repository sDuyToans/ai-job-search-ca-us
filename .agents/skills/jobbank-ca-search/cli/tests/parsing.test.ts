import { describe, test, expect } from "bun:test";
import { parseJobCards, parseJobDetail, parseResultCount, jobageToFage } from "../src/helpers";

function searchCard(id: string, title: string, opts: { company?: string; location?: string; date?: string } = {}): string {
  const { company = "Acme Inc", location = "Toronto (ON)", date = "August 1, 2026" } = opts;
  return `<article id="article-${id}" class="action-buttons"><a href="/jobsearch/jobposting/${id};jsessionid=X?source=searchresults" class="resultJobItem">
    <h3 class="title">
      <span class="noctitle"> ${title}
      </span>
    </h3>
    <ul class="list-unstyled">
      <li class="date">${date}</li>
      <li class="business">${company}</li>
      <li class="location"><span class="fas fa-map-marker-alt"></span> <span class="wb-inv">Location</span> ${location}</li>
    </ul></a>
  </article>`;
}

describe("parseJobCards", () => {
  test("extracts id, title, company, location, date from an article chunk", () => {
    const [card] = parseJobCards(searchCard("123", "Software Engineer"));
    expect(card.id).toBe("123");
    expect(card.title).toBe("Software Engineer");
    expect(card.company).toBe("Acme Inc");
    expect(card.location).toBe("Toronto (ON)");
    expect(card.date).toBe("August 1, 2026");
    expect(card.url).toBe("https://www.jobbank.gc.ca/jobsearch/jobposting/123");
  });

  test("decodes HTML entities in the title", () => {
    const [card] = parseJobCards(searchCard("124", "Caf&#xE9; Manager"));
    expect(card.title).toBe("Café Manager");
  });

  test("skips a chunk with no id", () => {
    const cards = parseJobCards("<article id=\"article-\">no id here</article>");
    expect(cards).toHaveLength(0);
  });

  test("one malformed card does not break parsing of the rest", () => {
    const malformed = `<article id="article-999" class="action-buttons">no title here</article>`;
    const html = malformed + searchCard("125", "Backend Developer");
    const cards = parseJobCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("125");
  });

  test("extracts salary when present", () => {
    const html = `<article id="article-126" class="action-buttons"><a href="/x" class="resultJobItem">
      <h3 class="title"><span class="noctitle">Developer</span></h3>
      <ul class="list-unstyled">
        <li class="date">August 1, 2026</li>
        <li class="business">Acme</li>
        <li class="location">Toronto (ON)</li>
        <li class="salary"><span class="fa fa-dollar"></span> Salary $90,000.00 to $120,000.00 annually</li>
      </ul></a></article>`;
    const [card] = parseJobCards(html);
    expect(card.salary).toBe("$90,000.00 to $120,000.00 annually");
  });
});

describe("parseResultCount", () => {
  test("extracts the total from the results-count span", () => {
    const html = '<div class="results-summary"><h2><span class="found" id="results-count">84</span> results</h2></div>';
    expect(parseResultCount(html)).toBe(84);
  });

  test("returns 0 when not found", () => {
    expect(parseResultCount("<div>no count here</div>")).toBe(0);
  });
});

describe("jobageToFage", () => {
  test("undefined/omitted maps to no filter", () => {
    expect(jobageToFage(undefined)).toBeNull();
  });

  test("9999 (default 'all') maps to no filter", () => {
    expect(jobageToFage(9999)).toBeNull();
  });

  test("1 and 2 map to the 2-day tier", () => {
    expect(jobageToFage(1)).toBe("2");
    expect(jobageToFage(2)).toBe("2");
  });

  test("3 through 30 map to the 30-day tier", () => {
    expect(jobageToFage(3)).toBe("30");
    expect(jobageToFage(30)).toBe("30");
  });

  test("anything above 30 (but below the 9999 sentinel) maps to no filter", () => {
    expect(jobageToFage(45)).toBeNull();
  });
});

describe("parseJobDetail", () => {
  const html = `
    <h1 property="name" id="wb-cont" class="title">
      <span property="title">software engineer
      </span>
    </h1>
    <p class="date-business">
      <span property="datePosted" class="date"> Posted on
        July 29, 2026
      </span> <span> by </span>
      <span class="business">
        <span property="hiringOrganization" typeof="Organization">
          <span property="name"><strong>Agile Electromagnetics</strong></span>
        </span>
      </span>
    </p>
    <span class="hidden" property="description">Job description:

Line two of the description.</span>
    <span><span property="joblocation" typeof="Place"><span class="city" property="address" typeof="PostalAddress"><span property="addressLocality">Kanata</span>, <span property="addressRegion">ON</span></span></span></span>
    <span class="fa-icon-desc fa-icon fas fa-building"></span>
    <span class="wb-inv">Work location</span>
    <span>On site</span>
    <span property="employmentType" class="attribute-value"><span style="display: block;" class="attribute-value">Full time</span></span>
    <span class="attribute-value" property="baseSalary" typeof="MonetaryAmount"><span property="value" typeof="QuantitativeValue"><span property="currency" content="CAD" class="hidden">$</span><span property="minValue" content="90,000">90,000</span> to <span property="currency" content="CAD" class="hidden">$</span><span property="maxValue" content="120,000">120,000</span><span property="unitText" class="hidden">YEAR</span> annually</span></span>
    <a id="externalJobLink" class="btn btn-primary" href="https://ca.indeed.com/viewjob?jk=abc123">View</a>
  `;

  test("extracts title, company, location, date", () => {
    const job = parseJobDetail(html, "49974739");
    expect(job.title).toBe("software engineer");
    expect(job.company).toBe("Agile Electromagnetics");
    expect(job.location).toBe("Kanata, ON");
    expect(job.date).toBe("July 29, 2026");
  });

  test("preserves line breaks in the plain-text description", () => {
    const job = parseJobDetail(html, "49974739");
    expect(job.description).toContain("Job description:");
    expect(job.description).toContain("Line two of the description.");
    expect(job.description).toContain("\n");
  });

  test("extracts employment type and workplace type", () => {
    const job = parseJobDetail(html, "49974739");
    expect(job.employmentType).toBe("Full time");
    expect(job.workplaceType).toBe("On site");
  });

  test("extracts the external apply URL", () => {
    const job = parseJobDetail(html, "49974739");
    expect(job.applyUrl).toBe("https://ca.indeed.com/viewjob?jk=abc123");
  });

  test("applyUrl is null when no external link is present", () => {
    const noApply = html.replace(/<a id="externalJobLink"[\s\S]*?<\/a>/, "");
    const job = parseJobDetail(noApply, "49974739");
    expect(job.applyUrl).toBeNull();
  });

  test("canonical url is constructed from the id, not scraped", () => {
    const job = parseJobDetail(html, "49974739");
    expect(job.url).toBe("https://www.jobbank.gc.ca/jobsearch/jobposting/49974739");
  });
});
