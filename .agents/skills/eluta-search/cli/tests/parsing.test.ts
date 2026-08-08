import { describe, test, expect } from "bun:test";
import { parseJobCards, parseJobDetail, extractDivContent } from "../src/helpers";
import { normalizeId } from "../src/commands/detail";

function searchCard(
  id: string,
  title: string,
  opts: { company?: string; location?: string; date?: string; snippetInner?: string } = {},
): string {
  const {
    company = "Acme Inc",
    location = "Toronto ON",
    date = "1 hour ago",
    snippetInner = `...matches <span class="highlight">${title.split(" ")[0]}</span> teams to ensure product quality...`,
  } = opts;
  return `<div data-url="spl/${id}?imo=12"
       class="organic-job odd">
    <h2 class="title">
      <a class="lk-job-title"
  data-url="spl/${id}?imo=12"
  href="#!" rel="noopener noreferrer"
  title="${title}">${title}</a>
    </h2>
    <a class="employer lk-employer" href="#!"
       onclick="window.location.href='/jobs-at-acme?imo=12'"
       title="See all jobs at ${company}">${company}</a>
    <span class="location">
        <span>${location}</span>
    </span>
    <span class="description">${snippetInner}</span>
    <a class="lk lastseen" href="#!"
       onclick="enavOpenNew('cache?u=123:example.com')"
       rel="noopener noreferrer"
       title="See how this page looked when Eluta indexed it">${date}</a>
  </div>`;
}

describe("parseJobCards", () => {
  test("extracts id, title, company, location, date from a card", () => {
    const [card] = parseJobCards(searchCard("test-specialist-iii-50d82efaa08c83f4f6d15d940bd72ce9", "Test Specialist (III)"));
    expect(card.id).toBe("test-specialist-iii-50d82efaa08c83f4f6d15d940bd72ce9");
    expect(card.title).toBe("Test Specialist (III)");
    expect(card.company).toBe("Acme Inc");
    expect(card.location).toBe("Toronto ON");
    expect(card.date).toBe("1 hour ago");
    expect(card.url).toBe("https://www.eluta.ca/spl/test-specialist-iii-50d82efaa08c83f4f6d15d940bd72ce9");
  });

  test("strips the trailing ?imo= query from the id", () => {
    const [card] = parseJobCards(searchCard("abc-123", "Developer"));
    expect(card.id).toBe("abc-123");
    expect(card.id).not.toContain("?");
  });

  test("extracts the full snippet past a nested <span class=highlight> — regression for naive first-</span> truncation", () => {
    const [card] = parseJobCards(
      searchCard("abc-123", "Engineer", {
        snippetInner: '...<span class="highlight">engineering</span> teams to ensure product quality and reliability...',
      }),
    );
    expect(card.snippet).toContain("engineering");
    expect(card.snippet).toContain("teams to ensure product quality and reliability");
  });

  test("skips a chunk with no title", () => {
    const noTitle = `<div data-url="spl/no-title?imo=12" class="organic-job odd"><span class="location">X</span></div>`;
    const cards = parseJobCards(noTitle);
    expect(cards).toHaveLength(0);
  });

  test("one malformed card does not break parsing of the rest", () => {
    const malformed = `<div data-url="spl/999?imo=12" class="organic-job odd">no title here</div>`;
    const html = malformed + searchCard("abc-123", "Backend Developer");
    const cards = parseJobCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("abc-123");
  });
});

describe("extractDivContent (used for detail description)", () => {
  test("extracts nested content correctly", () => {
    const html = '<div class="doc-source-html"><p>Hello</p><ul><li>World</li></ul></div>';
    expect(extractDivContent(html, "doc-source-html")).toBe("<p>Hello</p><ul><li>World</li></ul>");
  });
});

describe("parseJobDetail", () => {
  const html = `
    <header>
      <meta itemprop="datePosted" content="2026-08-07T19:18:42" />
      <meta itemprop="employmentType" content="FULL_TIME" />
      <h1 class="job-title" itemprop="title">
        <a href="#" onclick="enavOpenNew('/direct/i?i=abc123&amp;imo=12')">
          <span>Test Specialist (III)</span>
        </a>
      </h1>
      <h5 class="employer-name" itemprop="hiringOrganization" itemscope itemtype="http://schema.org/Organization">
        <a href="#" title="Employer"><span itemprop="name">FLIR Systems, Inc.</span></a>
      </h5>
    </header>
    <div class="summary">
      <h5 class="city">
        <span itemprop="jobLocation" itemscope itemtype="http://schema.org/Place">
          <span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
            <meta itemprop="addressLocality" content="Waterloo" />
            <meta itemprop="addressRegion" content="ON" />
            <meta itemprop="addressCountry" content="Canada" />
          </span>
        </span>
      </h5>
    </div>
    <div>
      <div class="short-text" itemprop="description"><div class="doc-source-html">
        <p>Be visionary. We build things.</p>
        <p>Second paragraph.</p>
      </div></div>
    </div>
    <span itemprop="location" itemscope itemtype="http://schema.org/Place">
      <span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
        <meta itemprop="addressLocality" content="Burlington" />
        <meta itemprop="addressRegion" content="Ontario" />
      </span>
    </span>
    <a class="apply-btn" href="#" onclick="enavOpenNew('/direct/i?i=abc123&amp;imo=12')">Apply Now</a>
  `;

  test("extracts title, company, employment type, date posted", () => {
    const job = parseJobDetail(html, "test-specialist-iii-abc123");
    expect(job.title).toBe("Test Specialist (III)");
    expect(job.company).toBe("FLIR Systems, Inc.");
    expect(job.employmentType).toBe("FULL_TIME");
    expect(job.datePosted).toBe("2026-08-07T19:18:42");
  });

  test("extracts the JOB location, not the employer's registered address — regression", () => {
    const job = parseJobDetail(html, "test-specialist-iii-abc123");
    expect(job.location).toBe("Waterloo, ON");
    expect(job.location).not.toContain("Burlington");
  });

  test("extracts the full nested description via extractDivContent", () => {
    const job = parseJobDetail(html, "test-specialist-iii-abc123");
    expect(job.description).toContain("Be visionary. We build things.");
    expect(job.description).toContain("Second paragraph.");
  });

  test("extracts and decodes the apply URL", () => {
    const job = parseJobDetail(html, "test-specialist-iii-abc123");
    expect(job.applyUrl).toBe("https://www.eluta.ca/direct/i?i=abc123&imo=12");
  });

  test("canonical url is constructed from the id, not scraped", () => {
    const job = parseJobDetail(html, "test-specialist-iii-abc123");
    expect(job.url).toBe("https://www.eluta.ca/spl/test-specialist-iii-abc123");
  });
});

describe("normalizeId", () => {
  test("accepts a percent-encoded id as-is — regression for the %26 rejection bug", () => {
    expect(normalizeId("product-%26-npi-lead-strapping-systems-656968e076514c66b926d7835a6a013a")).toBe(
      "product-%26-npi-lead-strapping-systems-656968e076514c66b926d7835a6a013a",
    );
  });

  test("extracts the id from a full /spl/<id> URL", () => {
    expect(normalizeId("https://www.eluta.ca/spl/abc-123?imo=12")).toBe("abc-123");
  });

  test("rejects an empty string", () => {
    expect(normalizeId("")).toBeNull();
  });

  test("rejects a URL that isn't a /spl/ job page", () => {
    expect(normalizeId("https://www.eluta.ca/some-other-page")).toBeNull();
  });
});
