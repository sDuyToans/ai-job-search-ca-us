// Data source: We Work Remotely's public per-category RSS feeds. No
// authentication required. Individual job-detail HTML pages return a
// Cloudflare JS challenge (403 "Just a moment...") for a plain fetch, but the
// RSS feeds themselves are unprotected and already carry the full HTML
// description — so `detail` re-queries the feed instead of fetching HTML.

export const BASE_URL = "https://weworkremotely.com"

/** Category RSS feeds confirmed live (2026-08-07). "programming" is the default. */
export const CATEGORIES = {
  programming: "remote-programming-jobs",
  "full-stack": "remote-full-stack-programming-jobs",
  backend: "remote-back-end-programming-jobs",
  frontend: "remote-front-end-programming-jobs",
  devops: "remote-devops-sysadmin-jobs",
  all: "remote-jobs", // site-wide, all categories (not just programming)
} as const

export type CategoryKey = keyof typeof CATEGORIES

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch the RSS XML for a category with exponential backoff on 429/5xx. */
export async function fetchFeed(category: CategoryKey): Promise<string> {
  const slug = CATEGORIES[category] ?? CATEGORIES.programming
  // The site-wide feed lives at /remote-jobs.rss, not /categories/remote-jobs.rss
  // (the latter 403s — confirmed live). Every per-category feed uses /categories/.
  const url = category === "all" ? `${BASE_URL}/${slug}.rss` : `${BASE_URL}/categories/${slug}.rss`
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
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
  category: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
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

function stripCdata(text: string): string {
  const m = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return m ? m[1] : text
}

/** Extract the URL slug (used as this portal's job id) from a weworkremotely.com job URL. */
function slugFromUrl(url: string): string {
  const m = url.match(/\/remote-jobs\/([^/?#]+)/)
  return m ? m[1] : url
}

/**
 * WWR RSS titles follow "Company: Position" — split on the first ": ".
 * Falls back to treating the whole string as the title if no colon is present.
 */
function splitCompanyTitle(raw: string): { company: string | null; title: string } {
  const idx = raw.indexOf(": ")
  if (idx === -1) return { company: null, title: raw }
  return { company: raw.slice(0, idx).trim(), title: raw.slice(idx + 2).trim() }
}

function extractTag(item: string, tag: string): string | null {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))
  if (!m) return null
  return decodeHtmlEntities(stripCdata(m[1])).trim() || null
}

/** Parse an RSS feed's <item> elements into JobCard[]. */
export function parseFeed(xml: string): JobCard[] {
  const results: JobCard[] = []
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []

  for (const item of items) {
    const rawTitle = extractTag(item, "title")
    const link = extractTag(item, "link")
    if (!rawTitle || !link) continue

    const { company, title } = splitCompanyTitle(rawTitle)

    results.push({
      id: slugFromUrl(link),
      title,
      company,
      location: extractTag(item, "region"),
      date: extractTag(item, "pubDate"),
      url: link,
      category: extractTag(item, "category"),
    })
  }

  return results
}

/** Full item map keyed by job id (slug), used by `detail` to recover the description. */
export function parseFeedRaw(xml: string): Map<string, { description: string | null }> {
  const map = new Map<string, { description: string | null }>()
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
  for (const item of items) {
    const link = extractTag(item, "link")
    if (!link) continue
    map.set(slugFromUrl(link), { description: extractTag(item, "description") })
  }
  return map
}

export interface FilterOpts {
  query?: string
  location?: string
}

/** Client-side keyword/location filtering — the RSS feeds have no query parameters. */
export function filterJobs(
  jobs: JobCard[],
  opts: FilterOpts,
  descriptionsById: Map<string, { description: string | null }>,
): JobCard[] {
  let results = jobs
  if (opts.query) {
    const terms = opts.query.toLowerCase().split(/\s+/).filter(Boolean)
    results = results.filter((j) => {
      const desc = descriptionsById.get(j.id)?.description ?? ""
      const haystack = [j.title, j.company, j.category, desc].join(" ").toLowerCase()
      return terms.every((t) => haystack.includes(t))
    })
  }
  if (opts.location) {
    const loc = opts.location.toLowerCase()
    results = results.filter((j) => (j.location || "").toLowerCase().includes(loc))
  }
  return results
}

/** Convert the HTML-escaped RSS description into readable plain text with line breaks preserved. */
export function cleanDescription(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
  return decodeHtmlEntities(withBreaks).replace(/\n{3,}/g, "\n\n").trim()
}
