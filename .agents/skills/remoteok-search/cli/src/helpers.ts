// Data source: RemoteOK's public JSON API (https://remoteok.com/api). No
// authentication required. The API always returns the same snapshot of the
// ~100 most recently posted jobs — it does not support server-side keyword
// filtering or pagination (confirmed live: ?tags=, ?tag=, ?id=, and ?page=
// are all silently ignored). This CLI fetches that snapshot and filters it
// client-side.
//
// API Terms of Service (from the response payload itself): link back to the
// job's RemoteOK URL and credit RemoteOK as the source when displaying results.

export const API_URL = "https://remoteok.com/api"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

interface RawJob {
  id?: string
  slug?: string
  position?: string
  company?: string
  location?: string
  date?: string
  url?: string
  apply_url?: string
  tags?: string[]
  description?: string
  salary_min?: number
  salary_max?: number
  legal?: string // present only on the first, non-job element of the response
}

/** Fetch JSON with exponential backoff on 429/5xx. */
export async function jsonFetch(url: string): Promise<RawJob[]> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
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
    if (response.status === 404) return []
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as RawJob[]
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
  tags: string[]
  salary: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
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

/**
 * Descriptions ship as HTML with a Windows carriage-return artifact
 * (`_x000D_`) sprinkled throughout. Convert block-level breaks to newlines,
 * strip the rest of the tags, and clean up the artifact before decoding.
 */
export function cleanDescription(html: string): string {
  const withBreaks = html
    .replace(/_x000D_/g, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
  return decodeHtmlEntities(withBreaks).replace(/\n{3,}/g, "\n\n").trim()
}

function formatSalary(min?: number, max?: number): string | null {
  if (!min && !max) return null
  if (min && max && min !== max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`
  return `$${(min || max)!.toLocaleString()}`
}

/** Decode entities and collapse embedded newlines/whitespace for single-line fields (title, company, location). */
function cleanField(text: string): string {
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim()
}

/** Drop the leading legal-notice element and map the rest to JobCard. */
export function parseJobs(raw: RawJob[]): JobCard[] {
  return raw
    .filter((j): j is RawJob & { id: string; position: string } => !!j.id && !!j.position)
    .map((j) => ({
      id: j.id,
      title: cleanField(j.position),
      company: j.company ? cleanField(j.company) : null,
      location: j.location && j.location.trim() ? cleanField(j.location).replace(/,\s*$/, "") : null,
      date: j.date || null,
      url: j.url || `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`,
      tags: j.tags || [],
      salary: formatSalary(j.salary_min, j.salary_max),
    }))
}

export interface FilterOpts {
  query?: string
  location?: string
}

/** Client-side keyword/location filtering — the API supports neither server-side. */
export function filterJobs(jobs: JobCard[], opts: FilterOpts, rawById: Map<string, RawJob>): JobCard[] {
  let results = jobs
  if (opts.query) {
    const terms = opts.query.toLowerCase().split(/\s+/).filter(Boolean)
    results = results.filter((j) => {
      const raw = rawById.get(j.id)
      const haystack = [j.title, j.company, ...j.tags, raw?.description ?? ""].join(" ").toLowerCase()
      return terms.every((t) => haystack.includes(t))
    })
  }
  if (opts.location) {
    const loc = opts.location.toLowerCase()
    results = results.filter((j) => {
      if (loc === "remote") return true // every RemoteOK posting is remote by definition
      return (j.location || "").toLowerCase().includes(loc)
    })
  }
  return results
}
