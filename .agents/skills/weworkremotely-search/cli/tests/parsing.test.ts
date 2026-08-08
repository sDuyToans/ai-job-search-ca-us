import { describe, test, expect } from "bun:test";
import { parseFeed, parseFeedRaw, filterJobs, cleanDescription } from "../src/helpers";

function feedItem(opts: {
  title?: string;
  link?: string;
  region?: string;
  category?: string;
  pubDate?: string;
  description?: string;
} = {}): string {
  const {
    title = "Acme Inc.: Senior Software Engineer",
    link = "https://weworkremotely.com/remote-jobs/acme-inc-senior-software-engineer",
    region = "Anywhere in the World",
    category = "Full-Stack Programming",
    pubDate = "Wed, 22 Jul 2026 07:01:32 +0000",
    description = "&lt;p&gt;We build things.&lt;/p&gt;",
  } = opts;
  return `<item>
    <title>${title}</title>
    <link>${link}</link>
    <region>${region}</region>
    <category>${category}</category>
    <pubDate>${pubDate}</pubDate>
    <description>${description}</description>
  </item>`;
}

function feed(items: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss><channel>${items.join("")}</channel></rss>`;
}

describe("parseFeed", () => {
  test("splits 'Company: Position' on the first colon", () => {
    const [job] = parseFeed(feed([feedItem()]));
    expect(job.company).toBe("Acme Inc.");
    expect(job.title).toBe("Senior Software Engineer");
  });

  test("handles a title with a colon inside the position itself", () => {
    const [job] = parseFeed(
      feed([feedItem({ title: "Grafana Labs: Associate Observability Architect | EST: Remote" })]),
    );
    expect(job.company).toBe("Grafana Labs");
    expect(job.title).toBe("Associate Observability Architect | EST: Remote");
  });

  test("falls back to treating the whole string as title when there's no colon", () => {
    const [job] = parseFeed(feed([feedItem({ title: "Just A Title No Colon" })]));
    expect(job.company).toBeNull();
    expect(job.title).toBe("Just A Title No Colon");
  });

  test("extracts id from the URL slug", () => {
    const [job] = parseFeed(feed([feedItem()]));
    expect(job.id).toBe("acme-inc-senior-software-engineer");
  });

  test("extracts region, category, and date", () => {
    const [job] = parseFeed(feed([feedItem({ region: "US Only", category: "DevOps" })]));
    expect(job.location).toBe("US Only");
    expect(job.category).toBe("DevOps");
    expect(job.date).toBe("Wed, 22 Jul 2026 07:01:32 +0000");
  });

  test("skips an item with no title or no link", () => {
    const noLink = `<item><title>X: Y</title></item>`;
    const jobs = parseFeed(feed([noLink, feedItem()]));
    expect(jobs).toHaveLength(1);
  });

  test("decodes entities in the title (company name with &amp;)", () => {
    const [job] = parseFeed(feed([feedItem({ title: "J&amp;D Inc.: Backend Engineer" })]));
    expect(job.company).toBe("J&D Inc.");
  });
});

describe("parseFeedRaw", () => {
  test("resolves XML-escaped description to real HTML in one decode pass", () => {
    const map = parseFeedRaw(feed([feedItem({ description: "&lt;p&gt;Hello &amp;nbsp;world&lt;/p&gt;" })]));
    const entry = map.get("acme-inc-senior-software-engineer");
    expect(entry?.description).toContain("<p>");
    expect(entry?.description).toContain("</p>");
  });
});

describe("filterJobs", () => {
  const xml = feed([
    feedItem({
      title: "Acme: Frontend Developer",
      link: "https://weworkremotely.com/remote-jobs/acme-frontend",
      region: "Anywhere in the World",
      description: "&lt;p&gt;React and TypeScript work.&lt;/p&gt;",
    }),
    feedItem({
      title: "Beta Corp: QA Automation Engineer",
      link: "https://weworkremotely.com/remote-jobs/beta-qa",
      region: "US Only",
      description: "&lt;p&gt;Selenium and Java testing.&lt;/p&gt;",
    }),
    feedItem({
      title: "Gamma LLC: Backend Developer",
      link: "https://weworkremotely.com/remote-jobs/gamma-backend",
      region: "Anywhere in the World",
      description: "&lt;p&gt;Spring Boot APIs.&lt;/p&gt;",
    }),
  ]);
  const jobs = parseFeed(xml);
  const descriptionsById = parseFeedRaw(xml);

  test("query matches across title and description", () => {
    const results = filterJobs(jobs, { query: "selenium" }, descriptionsById);
    expect(results.map((r) => r.id)).toEqual(["beta-qa"]);
  });

  test("query requires all terms to match (AND semantics)", () => {
    const results = filterJobs(jobs, { query: "react typescript" }, descriptionsById);
    expect(results.map((r) => r.id)).toEqual(["acme-frontend"]);
  });

  test("location filter matches substring case-insensitively", () => {
    const results = filterJobs(jobs, { location: "us only" }, descriptionsById);
    expect(results.map((r) => r.id)).toEqual(["beta-qa"]);
  });

  test("combining query and location applies both filters", () => {
    const results = filterJobs(jobs, { query: "developer", location: "anywhere" }, descriptionsById);
    expect(results.map((r) => r.id).sort()).toEqual(["acme-frontend", "gamma-backend"]);
  });
});

describe("cleanDescription", () => {
  test("converts <br> and block-closing tags to newlines", () => {
    expect(cleanDescription("<p>First.</p><p>Second.</p>")).toBe("First.\nSecond.");
  });

  test("decodes HTML entities", () => {
    expect(cleanDescription("Caf&#xE9; &amp; Bar")).toBe("Café & Bar");
  });

  test("strips remaining inline tags", () => {
    expect(cleanDescription("<strong>Bold</strong> text")).toBe("Bold text");
  });
});
