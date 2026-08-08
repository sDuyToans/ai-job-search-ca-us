// Data source: Eluta.ca's public search results and job-detail HTML pages. No
// authentication required. Eluta indexes external employer career pages
// directly (job titles/employer links use onclick JS navigation on the
// search page, but the underlying /spl/<id> detail URL is a plain,
// fetchable page — confirmed live).

export const BASE_URL = "https://www.eluta.ca"

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
    const body = await response.text()
    // Eluta's bot-detection redirects both /search and /spl/<id> to
    // /sandbox?destination=... ("User Verification") after a burst of
    // requests. fetch() follows the redirect transparently, so this only
    // shows up in the final body — confirmed live (2026-08-07): silently
    // parsing this page yields empty/"(untitled)" results instead of a
    // clear signal, so it's surfaced as its own error instead.
    if (/<title>\s*User Verification/i.test(body)) {
      throw new Error(
        "Eluta's bot-verification challenge was triggered (redirected to /sandbox). This is rate-based, not permanent — wait a while before retrying and keep request volume low.",
      )
    }
    return body
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null // relative text on search results (e.g. "1 hour ago") — see Notes
  url: string
  snippet: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  datePosted: string | null // absolute ISO date, only available on the detail page
  applyUrl: string | null
}

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

/**
 * Extract the inner HTML of a <div> identified by a CSS class name, correctly
 * handling nested <div> elements by tracking tag depth.
 */
export function extractDivContent(html: string, className: string): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const openRe = new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1

  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)

    if (nextClose === -1) return null

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }

  return html.slice(open.index + open[0].length, i - 6)
}

/**
 * Same depth-tracking extraction as extractDivContent, but for <span> — the
 * search-results snippet is a <span class="description"> that contains a
 * nested <span class="highlight">...</span> around matched query terms, so a
 * naive non-greedy match up to the first </span> truncates at that nested tag.
 */
function extractSpanContent(html: string, className: string): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const openRe = new RegExp(`<span[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1

  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<span", i)
    const nextClose = html.indexOf("</span>", i)

    if (nextClose === -1) return null

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 5
    } else {
      depth--
      i = nextClose + 7
    }
  }

  return html.slice(open.index + open[0].length, i - 7)
}

/** Convert description HTML (real tags, from extractDivContent) into readable plain text. */
function cleanDescription(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
  return decodeHtmlEntities(withBreaks).replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * Parse the search results page: a flat list of
 * <div data-url="spl/<id>?imo=N" class="organic-job ..."> blocks. Split on
 * that marker and parse each chunk independently so one malformed card
 * cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<div data-url="spl\//).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^([^"?]+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    const titleMatch = chunk.match(/class="lk-job-title"[\s\S]*?title="([^"]*)"[\s\S]*?>([\s\S]*?)<\/a>/i)
    const title = titleMatch ? clean(titleMatch[2]) || clean(titleMatch[1]) : null
    if (!title) continue

    const companyMatch = chunk.match(/class="employer lk-employer"[\s\S]*?>([\s\S]*?)<\/a>/i)
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    const locationMatch = chunk.match(/class="location">([\s\S]*?)<\/span>\s*<\/span>/i)
    const location = locationMatch ? clean(locationMatch[1]) || null : null

    const dateMatch = chunk.match(/class="lk lastseen"[\s\S]*?>([\s\S]*?)<\/a>/i)
    const date = dateMatch ? clean(dateMatch[1]) || null : null

    const snippetHtml = extractSpanContent(chunk, "description")
    const snippet = snippetHtml ? clean(snippetHtml) || null : null

    results.push({
      id,
      title,
      company,
      location,
      date,
      snippet,
      url: `${BASE_URL}/spl/${id}`,
    })
  }

  return results
}

/** Parse the single-job detail page (/spl/<id>). */
export function parseJobDetail(html: string, id: string): JobDetail {
  const titleMatch = html.match(/itemprop="title"[\s\S]*?<span>([\s\S]*?)<\/span>/i)
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)"

  const companyMatch = html.match(/itemprop="hiringOrganization"[\s\S]*?itemprop="name">([\s\S]*?)<\/span>/i)
  const company = companyMatch ? clean(companyMatch[1]) || null : null

  // Scoped to the jobLocation block specifically — the page also carries a
  // separate itemprop="location" block for the employer's registered address
  // further down, which must not be confused with where the job itself is.
  const jobLocationBlock = html.match(/itemprop="jobLocation"([\s\S]{0,800})/i)?.[1] ?? ""
  const cityMatch = jobLocationBlock.match(/addressLocality"\s*content="([^"]+)"/i)
  const regionMatch = jobLocationBlock.match(/addressRegion"\s*content="([^"]+)"/i)
  const location = cityMatch ? `${clean(cityMatch[1])}${regionMatch ? `, ${clean(regionMatch[1])}` : ""}` : null

  const datePosted = html.match(/itemprop="datePosted"[\s\S]*?content="([^"]+)"/i)?.[1] ?? null
  const employmentType = html.match(/itemprop="employmentType"[\s\S]*?content="([^"]+)"/i)?.[1] ?? null

  const descHtml = extractDivContent(html, "doc-source-html")
  const description = descHtml ? cleanDescription(descHtml) || null : null

  const applyMatch = html.match(/class="apply-btn"[\s\S]*?onclick="enavOpenNew\('([^']+)'\)/i)
  const applyUrl = applyMatch ? `${BASE_URL}${decodeHtmlEntities(applyMatch[1])}` : null

  return {
    id,
    title,
    company,
    location,
    date: null,
    snippet: null,
    url: `${BASE_URL}/spl/${id}`,
    description,
    employmentType,
    datePosted,
    applyUrl,
  }
}
