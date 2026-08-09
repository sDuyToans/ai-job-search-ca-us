import { describe, test, expect } from "bun:test"
import {
  inferRole,
  parseSearchPage,
  parseDetailPage,
  cleanHtml,
  normalizeDetailId,
  locationHaystack,
} from "../src/helpers"

describe("inferRole", () => {
  test("maps QA/test keywords to quality-assurance", () => {
    expect(inferRole("junior QA automation")).toBe("quality-assurance")
    expect(inferRole("SDET")).toBe("quality-assurance")
    expect(inferRole("test automation engineer")).toBe("quality-assurance")
  })
  test("maps full-stack keywords to full-stack-developer", () => {
    expect(inferRole("full-stack developer React")).toBe("full-stack-developer")
    expect(inferRole("fullstack engineer")).toBe("full-stack-developer")
  })
  test("defaults to software-engineer for unrecognized/empty queries", () => {
    expect(inferRole(undefined)).toBe("software-engineer")
    expect(inferRole("something totally unrelated")).toBe("software-engineer")
  })
})

describe("normalizeDetailId", () => {
  test("accepts the exact <id>-<slug> pair", () => {
    expect(normalizeDetailId("3317746-software-engineer")).toBe("3317746-software-engineer")
  })
  test("extracts it from a full wellfound.com/jobs/<id>-<slug> URL", () => {
    expect(normalizeDetailId("https://wellfound.com/jobs/3317746-software-engineer")).toBe(
      "3317746-software-engineer",
    )
  })
  test("rejects a bare numeric id with no slug", () => {
    expect(normalizeDetailId("3317746")).toBeNull()
  })
  test("rejects a non-matching string", () => {
    expect(normalizeDetailId("not a slug!")).toBeNull()
  })
})

describe("cleanHtml", () => {
  test("preserves paragraph breaks between blocks", () => {
    expect(cleanHtml("<p>One</p><p>Two</p>")).toBe("One\nTwo")
  })
  test("decodes hex numeric entities", () => {
    expect(cleanHtml("Caf&#xE9;")).toBe("Café")
  })
  test("returns null for empty input", () => {
    expect(cleanHtml("")).toBeNull()
    expect(cleanHtml(null)).toBeNull()
  })
})

// Minimal but structurally faithful fixture of what wellfound.com/role/r/<slug>
// actually embeds (confirmed live 2026-08-09): a Next.js pages-router
// __NEXT_DATA__ blob with an Apollo cache, results grouped by StartupResult ->
// highlightedJobListings -> JobListingSearchResult.
function searchPageFixture(): string {
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
                  'seoLandingPageJobSearchResults({"page":1,"remote":true,"role":"quality-assurance"})': {
                    __typename: "Results",
                    totalJobCount: 42,
                    pageCount: 3,
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
              description: "<h3>About</h3>\n<p>Test our product.</p>",
              jobType: "full-time",
              remote: true,
              liveStartAt: 1785272337,
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
  return `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`
}

describe("parseSearchPage", () => {
  test("joins startup + job-listing refs into flat contract-shaped results", () => {
    const page = parseSearchPage(searchPageFixture())
    expect(page.totalJobCount).toBe(42)
    expect(page.pageCount).toBe(3)
    expect(page.results).toHaveLength(1)

    const job = page.results[0]!
    expect(job.id).toBe("200-junior-qa-engineer")
    expect(job.title).toBe("Junior QA Engineer")
    expect(job.company).toBe("Acme Startup")
    expect(job.companySlug).toBe("acme-startup")
    expect(job.location).toBe("Toronto")
    expect(job.url).toBe("https://wellfound.com/jobs/200-junior-qa-engineer")
    expect(job.date).toBe(new Date(1785272337 * 1000).toISOString())
    expect(job.description).toContain("Test our product")
    expect(job.yearsExperienceMin).toBe(0)
  })

  test("returns an empty result set (not a throw) when __NEXT_DATA__ is absent", () => {
    const page = parseSearchPage("<html><body>no data here</body></html>")
    expect(page.results).toHaveLength(0)
    expect(page.totalJobCount).toBeNull()
  })

  test("returns an empty result set when the search-results key isn't found", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"apolloState":{"data":{"ROOT_QUERY":{}}}}}}</script>`
    const page = parseSearchPage(html)
    expect(page.results).toHaveLength(0)
  })
})

describe("locationHaystack", () => {
  test("combines location with accepted remote locations, lowercased for matching", () => {
    const job = parseSearchPage(searchPageFixture()).results[0]!
    const haystack = locationHaystack(job, ["Canada"])
    expect(haystack).toContain("toronto")
    expect(haystack).toContain("canada")
  })
})

// Minimal fixture of the schema.org JobPosting JSON-LD confirmed live on
// wellfound.com/jobs/<id>-<slug> (2026-08-09).
function detailPageFixture(): string {
  const jsonLd = {
    "@context": "http://schema.org/",
    "@type": "JobPosting",
    title: "Software Engineer",
    employmentType: "FULL_TIME",
    hiringOrganization: { "@type": "Organization", name: "Acme Startup" },
    datePosted: "2026-07-28T20:58:57Z",
    jobLocation: [
      { "@type": "Place", address: { addressLocality: "San Francisco", addressRegion: "California", addressCountry: "United States" } },
    ],
    jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: { "@type": "Country", name: "United States" },
    experienceRequirements: "no requirements",
    baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { minValue: 135000, maxValue: 175000 } },
    description: "<h3>Mission</h3>\n<p>Build things.</p>",
  }
  return `<html><body><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></body></html>`
}

describe("parseDetailPage", () => {
  test("extracts the schema.org JobPosting fields", () => {
    const job = parseDetailPage(detailPageFixture(), "200-software-engineer")
    expect(job).not.toBeNull()
    expect(job!.title).toBe("Software Engineer")
    expect(job!.company).toBe("Acme Startup")
    expect(job!.location).toBe("San Francisco, California, United States")
    expect(job!.date).toBe("2026-07-28T20:58:57Z")
    expect(job!.remote).toBe(true)
    expect(job!.jobLocationType).toBe("TELECOMMUTE")
    expect(job!.applicantLocationRequirement).toBe("United States")
    expect(job!.salary).toBe("USD 135000–175000")
    // The source has a literal newline between </h3> and <p>, plus cleanHtml's
    // own tag-close -> \n substitution — same double-newline behavior as
    // freehire-search's cleanHtml this was adapted from.
    expect(job!.description).toBe("Mission\n\nBuild things.")
  })

  test("returns null when no JobPosting JSON-LD block is present", () => {
    expect(parseDetailPage("<html><body>gone</body></html>", "1-x")).toBeNull()
  })

  // schema.org allows experienceRequirements as free text OR a structured
  // OccupationalExperienceRequirements object — confirmed live 2026-08-09
  // (a Marketeq Digital posting emitted the object form). Regression test for
  // a bug where the object form rendered as the literal string "[object Object]".
  test("renders a structured experienceRequirements object as readable text", () => {
    const jsonLd = {
      "@context": "http://schema.org/",
      "@type": "JobPosting",
      title: "QA Intern",
      hiringOrganization: { name: "Acme" },
      experienceRequirements: { "@type": "OccupationalExperienceRequirements", monthsOfExperience: 6 },
      description: "<p>Test things.</p>",
    }
    const html = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    const job = parseDetailPage(html, "1-qa-intern")
    expect(job!.experienceRequirements).toBe("6 months of experience")
  })

  test("string-form experienceRequirements passes through unchanged", () => {
    const jsonLd = {
      "@context": "http://schema.org/",
      "@type": "JobPosting",
      title: "QA Intern",
      hiringOrganization: { name: "Acme" },
      experienceRequirements: "no requirements",
      description: "<p>Test things.</p>",
    }
    const html = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    const job = parseDetailPage(html, "1-qa-intern")
    expect(job!.experienceRequirements).toBe("no requirements")
  })
})
