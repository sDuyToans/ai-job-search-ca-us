import { describe, test, expect } from "bun:test";
import { parseJobs, filterJobs, cleanDescription } from "../src/helpers";

const legalNotice = { last_updated: 1786127337, legal: "API Terms..." };

function rawJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "100",
    slug: "remote-software-engineer-100",
    position: "Software Engineer",
    company: "Acme",
    location: "Toronto, Canada",
    date: "2026-08-01T00:00:00+00:00",
    url: "https://remoteok.com/remote-jobs/remote-software-engineer-100",
    apply_url: "https://remoteok.com/remote-jobs/remote-software-engineer-100",
    tags: ["dev", "react"],
    description: "Build things.",
    salary_min: 0,
    salary_max: 0,
    ...overrides,
  };
}

describe("parseJobs", () => {
  test("drops the leading legal-notice element", () => {
    const jobs = parseJobs([legalNotice, rawJob()] as any);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("100");
  });

  test("maps core fields", () => {
    const [job] = parseJobs([rawJob()] as any);
    expect(job.title).toBe("Software Engineer");
    expect(job.company).toBe("Acme");
    expect(job.location).toBe("Toronto, Canada");
    expect(job.tags).toEqual(["dev", "react"]);
  });

  test("decodes HTML entities in title and company — regression for J&amp;D-style names", () => {
    const [job] = parseJobs([rawJob({ position: "Ops &amp; Support Engineer", company: "J&amp;D Repairs" })] as any);
    expect(job.title).toBe("Ops & Support Engineer");
    expect(job.company).toBe("J&D Repairs");
  });

  test("collapses embedded newlines in the title to spaces", () => {
    const [job] = parseJobs([rawJob({ position: "IDEAS THAT\nSTICK.\nliterally" })] as any);
    expect(job.title).toBe("IDEAS THAT STICK. literally");
  });

  test("blank location becomes null", () => {
    const [job] = parseJobs([rawJob({ location: "" })] as any);
    expect(job.location).toBeNull();
  });

  test("trailing comma-only location becomes null", () => {
    const [job] = parseJobs([rawJob({ location: "Providenciales, " })] as any);
    expect(job.location).toBe("Providenciales");
  });

  test("formats a salary range when both bounds are set", () => {
    const [job] = parseJobs([rawJob({ salary_min: 80000, salary_max: 120000 })] as any);
    expect(job.salary).toBe("$80,000 - $120,000");
  });

  test("salary is null when both bounds are zero", () => {
    const [job] = parseJobs([rawJob({ salary_min: 0, salary_max: 0 })] as any);
    expect(job.salary).toBeNull();
  });

  test("skips an element with no id or position", () => {
    const jobs = parseJobs([{ company: "Acme" }] as any);
    expect(jobs).toHaveLength(0);
  });
});

describe("filterJobs", () => {
  const jobs = parseJobs([
    rawJob({ id: "1", position: "Frontend Developer", location: "Berlin, Germany", tags: ["react"] }),
    rawJob({ id: "2", position: "QA Automation Engineer", location: "", tags: ["qa", "selenium"] }),
    rawJob({ id: "3", position: "Backend Developer", location: "Toronto, Canada", tags: ["java"] }),
  ] as any);
  const rawById = new Map(
    [
      rawJob({ id: "1", position: "Frontend Developer", description: "React and TypeScript work." }),
      rawJob({ id: "2", position: "QA Automation Engineer", description: "Selenium and Java testing." }),
      rawJob({ id: "3", position: "Backend Developer", description: "Spring Boot APIs." }),
    ].map((j) => [j.id as string, j as any]),
  );

  test("query matches across title, tags, and description", () => {
    const results = filterJobs(jobs, { query: "selenium" }, rawById);
    expect(results.map((r) => r.id)).toEqual(["2"]);
  });

  test("query requires all terms to match (AND semantics)", () => {
    const results = filterJobs(jobs, { query: "react typescript" }, rawById);
    expect(results.map((r) => r.id)).toEqual(["1"]);
  });

  test("location filter matches substring case-insensitively", () => {
    const results = filterJobs(jobs, { location: "toronto" }, rawById);
    expect(results.map((r) => r.id)).toEqual(["3"]);
  });

  test('location "remote" matches everything regardless of the location field', () => {
    const results = filterJobs(jobs, { location: "remote" }, rawById);
    expect(results).toHaveLength(3);
  });

  test("combining query and location applies both filters", () => {
    const results = filterJobs(jobs, { query: "developer", location: "canada" }, rawById);
    expect(results.map((r) => r.id)).toEqual(["3"]);
  });
});

describe("cleanDescription", () => {
  test("strips the _x000D_ artifact", () => {
    expect(cleanDescription("Hello_x000D_<br>world")).toBe("Hello\nworld");
  });

  test("converts <br> and block-closing tags to newlines", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
    expect(cleanDescription(html)).toBe("First paragraph.\nSecond paragraph.");
  });

  test("decodes HTML entities", () => {
    expect(cleanDescription("Caf&#xE9; &amp; Bar")).toBe("Café & Bar");
  });

  test("collapses 3+ consecutive newlines to a blank line", () => {
    expect(cleanDescription("a<br><br><br><br>b")).toBe("a\n\nb");
  });
});
