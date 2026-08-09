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

/** Stub fetch with a canned HTML response; exposes the URL it was called with. */
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

const NOW_EPOCH_SECONDS = Math.floor(Date.now() / 1000)

function searchHtml(opts: { liveStartAt?: number; role?: string } = {}): string {
  const nextData = {
    props: {
      pageProps: {
        apolloState: {
          data: {
            ROOT_QUERY: {
              __typename: "Query",
              talent: {
                __typename: "Talent",
                viewer: {
                  __typename: "TalentViewer",
                  [`seoLandingPageJobSearchResults({"page":1,"remote":true,"role":"${opts.role ?? "quality-assurance"}"})`]: {
                    __typename: "Results",
                    totalJobCount: 1,
                    pageCount: 1,
                    startups: [{ __ref: "StartupResult:100" }],
                  },
                },
              },
            },
            "StartupResult:100": {
              __typename: "StartupResult",
              name: "Acme Startup",
              slug: "acme-startup",
              highlightedJobListings: [{ __ref: "JobListingSearchResult:200" }],
            },
            "JobListingSearchResult:200": {
              __typename: "JobListingSearchResult",
              id: "200",
              slug: "junior-qa-engineer",
              title: "Junior QA Engineer",
              description: "Test our product with Selenium.",
              jobType: "full-time",
              remote: true,
              liveStartAt: opts.liveStartAt ?? NOW_EPOCH_SECONDS,
              locationNames: ["Toronto"],
              acceptedRemoteLocationNames: ["Canada"],
              compensation: "$60k – $75k",
              yearsExperienceMin: 0,
              yearsExperienceMax: 1,
            },
          },
        },
      },
    },
  }
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`
}

function detailHtml(): string {
  const jsonLd = {
    "@context": "http://schema.org/",
    "@type": "JobPosting",
    title: "Junior QA Engineer",
    employmentType: "FULL_TIME",
    hiringOrganization: { "@type": "Organization", name: "Acme Startup" },
    datePosted: "2026-08-01T00:00:00Z",
    jobLocation: [{ "@type": "Place", address: { addressLocality: "Toronto", addressCountry: "Canada" } }],
    jobLocationType: "TELECOMMUTE",
    description: "<p>Test our product.</p>",
  }
  return `<html><body><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></body></html>`
}

const baseOpts = { jobage: 9999, page: 1, format: "json" as const }

describe("runSearch (mocked fetch)", () => {
  test("infers a role from --query and requests that role's page", async () => {
    const mock = mockFetch(200, searchHtml())
    captureStdout()

    await runSearch({ ...baseOpts, query: "QA automation" })

    expect(mock.url()).toBe("https://wellfound.com/role/r/quality-assurance?page=1")
  })

  test("--role overrides inference", async () => {
    const mock = mockFetch(200, searchHtml({ role: "software-engineer" }))
    captureStdout()

    await runSearch({ ...baseOpts, query: "QA automation", role: "software-engineer" })

    expect(mock.url()).toBe("https://wellfound.com/role/r/software-engineer?page=1")
  })

  test("emits the contract envelope with meta.count/page/total", async () => {
    mockFetch(200, searchHtml())
    const out = captureStdout()

    const code = await runSearch({ ...baseOpts, query: "QA" })
    expect(code).toBe(0)

    const parsed = JSON.parse(out.get())
    expect(parsed.meta.page).toBe(1)
    expect(parsed.meta.total).toBe(1)
    expect(parsed.results).toHaveLength(1)
    expect(parsed.results[0].id).toBe("200-junior-qa-engineer")
    expect(parsed.results[0].url).toBe("https://wellfound.com/jobs/200-junior-qa-engineer")
  })

  test("client-side --query filter drops non-matching titles/descriptions", async () => {
    mockFetch(200, searchHtml())
    const out = captureStdout()

    await runSearch({ ...baseOpts, query: "totally unrelated phrase xyz", role: "quality-assurance" })

    expect(JSON.parse(out.get()).results).toHaveLength(0)
  })

  test("--location filters against location + accepted-remote-location text", async () => {
    mockFetch(200, searchHtml())
    const out1 = captureStdout()
    await runSearch({ ...baseOpts, query: "QA", location: "canada" })
    expect(JSON.parse(out1.get()).results).toHaveLength(1)

    mockFetch(200, searchHtml())
    const out2 = captureStdout()
    await runSearch({ ...baseOpts, query: "QA", location: "germany" })
    expect(JSON.parse(out2.get()).results).toHaveLength(0)
  })

  test("--jobage filters out postings older than N days", async () => {
    const eightDaysAgo = NOW_EPOCH_SECONDS - 8 * 86400
    mockFetch(200, searchHtml({ liveStartAt: eightDaysAgo }))
    const out = captureStdout()

    await runSearch({ ...baseOpts, query: "QA", jobage: 7 })

    expect(JSON.parse(out.get()).results).toHaveLength(0)
  })

  test("a posting within the jobage window survives the filter", async () => {
    const yesterday = NOW_EPOCH_SECONDS - 1 * 86400
    mockFetch(200, searchHtml({ liveStartAt: yesterday }))
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
  test("prints the reshaped detail from the JobPosting JSON-LD", async () => {
    mockFetch(200, detailHtml())
    const out = captureStdout()

    const code = await runDetail({ id: "200-junior-qa-engineer", format: "json" })
    expect(code).toBe(0)

    const parsed = JSON.parse(out.get())
    expect(parsed.id).toBe("200-junior-qa-engineer")
    expect(parsed.title).toBe("Junior QA Engineer")
    expect(parsed.company).toBe("Acme Startup")
    expect(parsed.description).toBe("Test our product.")
  })

  test("a bare numeric id exits 1 with BAD_ID before any network call", async () => {
    const mock = mockFetch(200, detailHtml())
    const err = captureStderr()
    captureStdout()

    const code = await runDetail({ id: "200", format: "json" })
    err.restore()

    expect(code).toBe(1)
    expect(JSON.parse(err.get()).code).toBe("BAD_ID")
    expect(mock.url()).toBe("") // never called
  })

  test("404 exits 1 with NOT_FOUND", async () => {
    mockFetch(404, "")
    const err = captureStderr()
    captureStdout()

    const code = await runDetail({ id: "999-does-not-exist", format: "json" })
    err.restore()

    expect(code).toBe(1)
    expect(JSON.parse(err.get()).code).toBe("NOT_FOUND")
  })

  test("a page with no JobPosting JSON-LD exits 1 with NOT_FOUND", async () => {
    mockFetch(200, "<html><body>no structured data</body></html>")
    const err = captureStderr()
    captureStdout()

    const code = await runDetail({ id: "200-junior-qa-engineer", format: "json" })
    err.restore()

    expect(code).toBe(1)
    expect(JSON.parse(err.get()).code).toBe("NOT_FOUND")
  })
})
