// Data source: Government of Canada Job Bank (jobbank.gc.ca) public HTML pages.
// No authentication required, no API key. Search returns an HTML results page;
// detail returns a single job posting's HTML. We parse both with regex — the
// markup is shallow and stable, and the description field ships as plain text
// inside a single <span>, so a full DOM parser is unnecessary.

export const SEARCH_URL = "https://www.jobbank.gc.ca/jobsearch/jobsearch"
export const DETAIL_URL = "https://www.jobbank.gc.ca/jobsearch/jobposting"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  workplaceType: string | null
  applyUrl: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji) decode
 * correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Decode entities and trim, but preserve internal line breaks (used for the plain-text description field). */
function cleanPreserveLines(text: string): string {
  return decodeHtmlEntities(text).replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * Parse the search results page: a flat list of <article id="article-<id>">
 * blocks. We split on that marker and parse each chunk independently so one
 * malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<article id="article-/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    const titleMatch = chunk.match(/class="noctitle"[^>]*>([\s\S]*?)<\/span>/i)
    const title = titleMatch ? clean(titleMatch[1]) : null
    if (!title) continue

    const dateMatch = chunk.match(/<li class="date">([\s\S]*?)<\/li>/i)
    const date = dateMatch ? clean(dateMatch[1]) || null : null

    const companyMatch = chunk.match(/<li class="business">([\s\S]*?)<\/li>/i)
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    const locationMatch = chunk.match(/<li class="location">([\s\S]*?)<\/li>/i)
    const location = locationMatch ? clean(locationMatch[1]).replace(/^Location\s*/, "") || null : null

    const salaryMatch = chunk.match(/<li class="salary">([\s\S]*?)<\/li>/i)
    const salary = salaryMatch ? clean(salaryMatch[1]).replace(/^Salary\s*/, "") || null : null

    results.push({
      id,
      title,
      company,
      location,
      date,
      salary,
      url: `${DETAIL_URL}/${id}`,
    })
  }

  return results
}

/** Extract the total result count from the search page's "N results" header. */
export function parseResultCount(html: string): number {
  const m = html.match(/id="results-count">(\d+)</i)
  return m ? parseInt(m[1], 10) : 0
}

/** Parse the single-job detail page. */
export function parseJobDetail(html: string, id: string): JobDetail {
  const titleMatch = html.match(/<h1[^>]*property="name"[\s\S]*?<span property="title">([\s\S]*?)<\/span>/i)
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)"

  const dateMatch = html.match(/<span property="datePosted"[^>]*>([\s\S]*?)<\/span>/i)
  const date = dateMatch ? clean(dateMatch[1]).replace(/^Posted on\s*/, "") || null : null

  const companyMatch = html.match(/property="hiringOrganization"[\s\S]*?<span property="name">([\s\S]*?)<\/span>/i)
  const company = companyMatch ? clean(companyMatch[1]) || null : null

  const cityMatch = html.match(/property="addressLocality">([\s\S]*?)<\/span>/i)
  const regionMatch = html.match(/property="addressRegion">([\s\S]*?)<\/span>/i)
  const location = cityMatch ? `${clean(cityMatch[1])}${regionMatch ? `, ${clean(regionMatch[1])}` : ""}` : null

  const workplaceMatch = html.match(/Work location<\/span>\s*<span>([\s\S]*?)<\/span>/i)
  const workplaceType = workplaceMatch ? clean(workplaceMatch[1]) || null : null

  const employmentMatch = html.match(
    /property="employmentType"[^>]*>\s*<span[^>]*class="attribute-value"[^>]*>([\s\S]*?)<\/span>/i,
  )
  const employmentType = employmentMatch ? clean(employmentMatch[1]) || null : null

  const minVal = html.match(/property="minValue" content="([^"]+)"/i)?.[1]
  const maxVal = html.match(/property="maxValue" content="([^"]+)"/i)?.[1]
  const unitMatch = html.match(/property="unitText"[^>]*class="hidden">([^<]+)</i)
  const salary =
    minVal || maxVal
      ? `${minVal ?? "?"}${maxVal && maxVal !== minVal ? ` to ${maxVal}` : ""}${unitMatch ? ` per ${clean(unitMatch[1]).toLowerCase()}` : ""}`
      : null

  const descMatch = html.match(/<span class="hidden" property="description">([\s\S]*?)<\/span>/i)
  const description = descMatch ? cleanPreserveLines(descMatch[1]) || null : null

  const applyMatch = html.match(/id="externalJobLink"[^>]*href="([^"]+)"/i)
  const applyUrl = applyMatch ? decodeHtmlEntities(applyMatch[1]) : null

  return {
    id,
    title,
    company,
    location,
    date,
    salary,
    url: `${DETAIL_URL}/${id}`,
    description,
    employmentType,
    workplaceType,
    applyUrl,
  }
}

/**
 * Map a jobage-in-days filter to Job Bank's coarse `fage` tiers (2, 30, or no
 * filter — there is no continuous day-count parameter on this portal).
 */
export function jobageToFage(days: number | undefined): string | null {
  if (!days || days <= 0 || days >= 9999) return null
  if (days <= 2) return "2"
  if (days <= 30) return "30"
  return null
}
