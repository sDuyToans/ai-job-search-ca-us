import { describe, test, expect } from "bun:test"
import {
  buildSearchUrl,
  extractRscStream,
  buildRscTextRefs,
  extractBalancedJsonObjects,
  parseSearchPage,
  parseDetailPage,
  cleanHtml,
  normalizeGuid,
} from "../src/helpers"

describe("buildSearchUrl", () => {
  test("query only -> /jobs/q-<keywords>-jobs", () => {
    expect(buildSearchUrl("junior software engineer", undefined, 1)).toBe(
      "https://www.dice.com/jobs/q-junior%20software%20engineer-jobs",
    )
  })
  test("location only -> /jobs/l-<location>-jobs", () => {
    expect(buildSearchUrl(undefined, "Toronto, ON", 1)).toBe("https://www.dice.com/jobs/l-Toronto%2C%20ON-jobs")
  })
  test("query + location -> /jobs/q-<keywords>-l-<location>-jobs", () => {
    expect(buildSearchUrl("QA automation", "Remote", 1)).toBe(
      "https://www.dice.com/jobs/q-QA%20automation-l-Remote-jobs",
    )
  })
  test("neither -> bare /jobs", () => {
    expect(buildSearchUrl(undefined, undefined, 1)).toBe("https://www.dice.com/jobs")
  })
  test("page > 1 appends ?page=N", () => {
    expect(buildSearchUrl("QA", undefined, 2)).toBe("https://www.dice.com/jobs/q-QA-jobs?page=2")
  })
  test("never produces the robots.txt-disallowed /jobs?q= form", () => {
    const url = buildSearchUrl("anything", "anywhere", 3)
    expect(url).not.toMatch(/\/jobs\?q=/)
    expect(url).not.toMatch(/\/jobs\/\?q=/)
  })
})

describe("normalizeGuid", () => {
  const guid = "11111111-1111-1111-1111-111111111111"
  test("accepts a bare guid", () => {
    expect(normalizeGuid(guid)).toBe(guid)
  })
  test("extracts it from a full job-detail URL", () => {
    expect(normalizeGuid(`https://www.dice.com/job-detail/${guid}`)).toBe(guid)
  })
  test("rejects a non-guid string", () => {
    expect(normalizeGuid("not-a-guid")).toBeNull()
    expect(normalizeGuid("")).toBeNull()
  })
})

describe("cleanHtml", () => {
  test("preserves paragraph breaks between blocks", () => {
    expect(cleanHtml("<p>One</p><p>Two</p>")).toBe("One\nTwo")
  })
  test("returns null for empty input", () => {
    expect(cleanHtml("")).toBeNull()
    expect(cleanHtml(null)).toBeNull()
  })
})

// --- RSC flight-data stream fixtures -----------------------------------
// Real Dice pages embed job data as self.__next_f.push([1, "<escaped>"])
// chunks (confirmed live 2026-08-09 — see url-reference.md). These fixtures
// replicate that exact wire format rather than a simplified stand-in, so the
// parser is exercised against the real escaping/chunking rules.

/** Escape raw text the way it appears inside a push call's JS string literal. */
function escapeForPush(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}

function pushChunk(raw: string): string {
  return `<script>self.__next_f.push([1,"${escapeForPush(raw)}"])</script>`
}

describe("extractRscStream + buildRscTextRefs", () => {
  test("decodes escaped chunks and joins them in order", () => {
    const html = pushChunk('a:{"x":1}') + pushChunk('\nb:{"y":2}')
    const stream = extractRscStream(html)
    expect(stream).toBe('a:{"x":1}\nb:{"y":2}')
  })

  test("resolves a T-prefixed text chunk by its declared hex length", () => {
    const text = "Hello, world! This has \"quotes\" and\nnewlines."
    const hexLen = text.length.toString(16)
    const html = pushChunk(`49:T${hexLen},${text}TRAILING_SHOULD_NOT_APPEAR`)
    const refs = buildRscTextRefs(extractRscStream(html))
    expect(refs.get("49")).toBe(text)
  })
})

describe("extractBalancedJsonObjects", () => {
  test("extracts a complete object, ignoring braces inside quoted strings", () => {
    const stream = 'noise {"id":"1","note":"a { b } c","nested":{"x":1}} more noise'
    const objs = extractBalancedJsonObjects(stream, '{"id":"')
    expect(objs).toHaveLength(1)
    expect(JSON.parse(objs[0]!)).toEqual({ id: "1", note: "a { b } c", nested: { x: 1 } })
  })

  test("finds multiple non-overlapping objects", () => {
    const stream = '{"id":"1","a":1}xx{"id":"2","a":2}'
    const objs = extractBalancedJsonObjects(stream, '{"id":"')
    expect(objs).toHaveLength(2)
  })
})

function searchJobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "internal-id-1",
    guid: "11111111-1111-1111-1111-111111111111",
    title: "Junior QA Engineer",
    companyName: "Acme",
    jobLocation: { city: "Toronto", state: "ON", country: "Canada", region: "ON", displayName: "Toronto, ON" },
    postedDate: "2026-08-01T00:00:00Z",
    detailsPageUrl: "https://www.dice.com/job-detail/11111111-1111-1111-1111-111111111111",
    isRemote: true,
    employmentType: "Full-time",
    salary: "USD 60,000.00 - 75,000.00 per year",
    summary: "Test our product with Selenium and API testing.",
    ...overrides,
  }
}

describe("parseSearchPage", () => {
  test("extracts a job card from the RSC stream into the contract shape", () => {
    const html = pushChunk(`x:{"positions":[${JSON.stringify(searchJobFixture())}]}`)
    const jobs = parseSearchPage(html)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Junior QA Engineer",
      company: "Acme",
      location: "Toronto, ON",
      date: "2026-08-01T00:00:00Z",
      url: "https://www.dice.com/job-detail/11111111-1111-1111-1111-111111111111",
      remote: true,
      employmentType: "Full-time",
      salary: "USD 60,000.00 - 75,000.00 per year",
      description: "Test our product with Selenium and API testing.",
    })
  })

  test("deduplicates repeated guids (e.g. a job appearing in a 'Similar Jobs' block too)", () => {
    const job = searchJobFixture()
    const html = pushChunk(`x:{"positions":[${JSON.stringify(job)},${JSON.stringify(job)}]}`)
    expect(parseSearchPage(html)).toHaveLength(1)
  })

  test("ignores unrelated {\"id\":...} objects that aren't job cards", () => {
    const html = pushChunk('x:{"id":"not-a-job","somethingElse":true}')
    expect(parseSearchPage(html)).toHaveLength(0)
  })

  test("returns an empty array when there's no RSC data at all", () => {
    expect(parseSearchPage("<html><body>nothing here</body></html>")).toHaveLength(0)
  })
})

describe("parseDetailPage", () => {
  test("resolves title/company from jobsData and description via the $-ref text chunk", () => {
    const guid = "11111111-1111-1111-1111-111111111111"
    const jobsData = {
      jobGuid: guid,
      legacyJobId: "legacy1",
      jobTitle: "Junior QA Engineer",
      companyName: "Acme",
      isFeatured: false,
      isAuthedCandidate: false,
      applyType: "External",
      correlationId: "c1",
    }
    const descriptionText = "<p>Test our product.</p>"
    const hexLen = descriptionText.length.toString(16)

    const html =
      pushChunk(`a:${JSON.stringify(jobsData)}`) +
      pushChunk(
        `b:{"description":"$49","companyId":"999","positionId":"R123","postedDate":"2026-08-01T00:00:00Z"}`,
      ) +
      pushChunk(`c:{"skills":["Selenium","Java","API Testing"]}`) +
      pushChunk(`\n49:T${hexLen},${descriptionText}`) +
      `<meta property="og:title" content="Junior QA Engineer - Acme - Toronto, ON"/>`

    const job = parseDetailPage(html, guid)
    expect(job).not.toBeNull()
    expect(job!.id).toBe(guid)
    expect(job!.title).toBe("Junior QA Engineer")
    expect(job!.company).toBe("Acme")
    expect(job!.date).toBe("2026-08-01T00:00:00Z")
    expect(job!.description).toBe("Test our product.")
    expect(job!.skills).toEqual(["Selenium", "Java", "API Testing"])
    expect(job!.location).toBe("Toronto, ON")
    expect(job!.url).toBe(`https://www.dice.com/job-detail/${guid}`)
  })

  test("returns null when there's no jobsData object on the page", () => {
    expect(parseDetailPage("<html><body>gone</body></html>", "11111111-1111-1111-1111-111111111111")).toBeNull()
  })
})
