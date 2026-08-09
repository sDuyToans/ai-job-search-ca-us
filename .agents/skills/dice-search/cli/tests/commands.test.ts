import { afterEach, describe, expect, test } from "bun:test"
import { runSearch } from "../src/commands/search"
import { runDetail } from "../src/commands/detail"

const originalFetch = globalThis.fetch
const originalStdoutWrite = process.stdout.write

function captureStdout(): { get: () => string } {
  let buf = ""
  process.stdout.write = ((chunk: string | Uint8Array) => {
    buf += chunk.toString()
    return true
  }) as typeof process.stdout.write
  return { get: () => buf }
}

function captureStderr(): { get: () => string; restore: () => void } {
  let buf = ""
  const original = process.stderr.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    buf += chunk.toString()
    return true
  }) as typeof process.stderr.write
  return { get: () => buf, restore: () => (process.stderr.write = original) }
}

function mockFetch(status: number, html: string): { url: () => string } {
  let requested = ""
  globalThis.fetch = (async (input: string | URL | Request) => {
    requested = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    return new Response(html, { status, headers: { "content-type": "text/html" } })
  }) as typeof fetch
  return { url: () => requested }
}

afterEach(() => {
  globalThis.fetch = originalFetch
  process.stdout.write = originalStdoutWrite
})

function escapeForPush(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}
function pushChunk(raw: string): string {
  return `<script>self.__next_f.push([1,"${escapeForPush(raw)}"])</script>`
}

const NOW = new Date()
function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 86400 * 1000).toISOString()
}

const GUID = "11111111-1111-1111-1111-111111111111"

function searchHtml(postedDate = daysAgoIso(0)): string {
  const job = {
    id: "internal-1",
    guid: GUID,
    title: "Junior QA Engineer",
    companyName: "Acme",
    jobLocation: { displayName: "Toronto, ON" },
    postedDate,
    detailsPageUrl: `https://www.dice.com/job-detail/${GUID}`,
    isRemote: true,
    employmentType: "Full-time",
    salary: "USD 60,000.00 - 75,000.00 per year",
    summary: "Test our product with Selenium.",
  }
  return pushChunk(`x:{"positions":[${JSON.stringify(job)}]}`)
}

function detailHtml(): string {
  const jobsData = {
    jobGuid: GUID,
    jobTitle: "Junior QA Engineer",
    companyName: "Acme",
    isFeatured: false,
    isAuthedCandidate: false,
    applyType: "External",
    correlationId: "c1",
  }
  const descriptionText = "<p>Test our product.</p>"
  const hexLen = descriptionText.length.toString(16)
  return (
    pushChunk(`a:${JSON.stringify(jobsData)}`) +
    pushChunk(`b:{"description":"$49","companyId":"999","positionId":"R123","postedDate":"${daysAgoIso(0)}"}`) +
    pushChunk(`c:{"skills":["Selenium","Java"]}`) +
    pushChunk(`\n49:T${hexLen},${descriptionText}`) +
    `<meta property="og:title" content="Junior QA Engineer - Acme - Toronto, ON"/>`
  )
}

const baseOpts = { jobage: 9999, page: 1, format: "json" as const }

describe("runSearch (mocked fetch)", () => {
  test("builds the allowed SEO search URL, never the disallowed ?q= form", async () => {
    const mock = mockFetch(200, searchHtml())
    captureStdout()

    await runSearch({ ...baseOpts, query: "QA automation", location: "Toronto, ON" })

    expect(mock.url()).toBe("https://www.dice.com/jobs/q-QA%20automation-l-Toronto%2C%20ON-jobs")
  })

  test("emits the contract envelope", async () => {
    mockFetch(200, searchHtml())
    const out = captureStdout()

    const code = await runSearch({ ...baseOpts, query: "QA" })
    expect(code).toBe(0)

    const parsed = JSON.parse(out.get())
    expect(parsed.meta.page).toBe(1)
    expect(parsed.results).toHaveLength(1)
    expect(parsed.results[0].id).toBe(GUID)
    expect(parsed.results[0].url).toBe(`https://www.dice.com/job-detail/${GUID}`)
  })

  test("--jobage filters out postings older than N days", async () => {
    mockFetch(200, searchHtml(daysAgoIso(8)))
    const out = captureStdout()

    await runSearch({ ...baseOpts, query: "QA", jobage: 7 })

    expect(JSON.parse(out.get()).results).toHaveLength(0)
  })

  test("a posting within the jobage window survives the filter", async () => {
    mockFetch(200, searchHtml(daysAgoIso(1)))
    const out = captureStdout()

    await runSearch({ ...baseOpts, query: "QA", jobage: 7 })

    expect(JSON.parse(out.get()).results).toHaveLength(1)
  })

  test("network failure exits 1 with SEARCH_FAILED", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED")
    }) as typeof fetch
    const err = captureStderr()
    captureStdout()

    const code = await runSearch({ ...baseOpts, query: "QA" })
    err.restore()

    expect(code).toBe(1)
    expect(JSON.parse(err.get()).code).toBe("SEARCH_FAILED")
  })
})

describe("runDetail (mocked fetch)", () => {
  test("prints the reshaped detail with resolved description and skills", async () => {
    mockFetch(200, detailHtml())
    const out = captureStdout()

    const code = await runDetail({ id: GUID, format: "json" })
    expect(code).toBe(0)

    const parsed = JSON.parse(out.get())
    expect(parsed.id).toBe(GUID)
    expect(parsed.title).toBe("Junior QA Engineer")
    expect(parsed.description).toBe("Test our product.")
    expect(parsed.skills).toEqual(["Selenium", "Java"])
    expect(parsed.location).toBe("Toronto, ON")
  })

  test("an unparseable id exits 1 with BAD_ID before any network call", async () => {
    const mock = mockFetch(200, detailHtml())
    const err = captureStderr()
    captureStdout()

    const code = await runDetail({ id: "not-a-guid", format: "json" })
    err.restore()

    expect(code).toBe(1)
    expect(JSON.parse(err.get()).code).toBe("BAD_ID")
    expect(mock.url()).toBe("")
  })

  test("404 exits 1 with NOT_FOUND", async () => {
    mockFetch(404, "")
    const err = captureStderr()
    captureStdout()

    const code = await runDetail({ id: GUID, format: "json" })
    err.restore()

    expect(code).toBe(1)
    expect(JSON.parse(err.get()).code).toBe("NOT_FOUND")
  })

  test("a page with no jobsData exits 1 with NOT_FOUND", async () => {
    mockFetch(200, "<html><body>no structured data</body></html>")
    const err = captureStderr()
    captureStdout()

    const code = await runDetail({ id: GUID, format: "json" })
    err.restore()

    expect(code).toBe(1)
    expect(JSON.parse(err.get()).code).toBe("NOT_FOUND")
  })
})
