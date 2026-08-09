// Data source: Dice (dice.com), a US-based tech job board with real Canada
// and remote coverage. No public API; robots.txt (checked live 2026-08-09)
// explicitly disallows Dice's query-string search UI (`/jobs?q*`, `/jobs/?q*`)
// but does NOT disallow its SEO-friendly path-based search pages
// (`/jobs/q-<keywords>-l-<location>-jobs`) or individual job pages
// (`/job-detail/<guid>`, explicitly `Allow:`d) — this skill only ever
// requests the allowed forms. See url-reference.md for the full
// investigation, including why the disallowed pattern is avoided entirely.
//
// Both page types are Next.js **App Router** pages: no __NEXT_DATA__ blob
// (unlike wellfound-search's pages-router search page), no schema.org JSON-LD
// either — instead, real job data is embedded as React Server Component
// "flight data" in `self.__next_f.push([1, "..."])` script chunks. This file
// parses that stream directly: job cards are plain JSON objects within it;
// a detail page's full description is a separate "text" chunk referenced by
// id (`"description":"$49"` -> chunk `49:T<hexlen>,<text>`).

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
        "Accept-Language": "en-US,en;q=0.9",
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

// ---------------------------------------------------------------------------
// URL construction (allowed paths only — see the file header)
// ---------------------------------------------------------------------------

/** Build an allowed /jobs/... SEO search URL. Never touches /jobs?q= (disallowed). */
export function buildSearchUrl(query: string | undefined, location: string | undefined, page: number): string {
  const qSlug = query?.trim() ? `q-${encodeURIComponent(query.trim())}` : ""
  const lSlug = location?.trim() ? `l-${encodeURIComponent(location.trim())}` : ""
  let path: string
  if (qSlug && lSlug) path = `/jobs/${qSlug}-${lSlug}-jobs`
  else if (qSlug) path = `/jobs/${qSlug}-jobs`
  else if (lSlug) path = `/jobs/${lSlug}-jobs`
  else path = `/jobs`
  const qs = page > 1 ? `?page=${page}` : ""
  return `https://www.dice.com${path}${qs}`
}

// ---------------------------------------------------------------------------
// React Server Component "flight data" stream parsing
// ---------------------------------------------------------------------------

/** Decode a single JS string-literal escape sequence (matches the RSC push payload's encoding). */
function unescapeJsString(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|n|r|t|"|'|\\|\/)/g, (_, esc: string) => {
    if (esc[0] === "u") return String.fromCharCode(parseInt(esc.slice(1), 16))
    switch (esc) {
      case "n":
        return "\n"
      case "r":
        return "\r"
      case "t":
        return "\t"
      case "\\":
        return "\\"
      default:
        return esc // '"', "'", "/"
    }
  })
}

/** Concatenate every self.__next_f.push([1, "..."]) chunk's decoded content, in order. */
export function extractRscStream(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g
  let out = ""
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    out += unescapeJsString(m[1])
  }
  return out
}

/**
 * RSC "text" chunks (`<id>:T<hexlen>,<text>`) are how a large string (e.g. a
 * job description) is streamed and referenced elsewhere as `"$<id>"`. Build a
 * ref-id -> text map from the full decoded stream.
 */
export function buildRscTextRefs(stream: string): Map<string, string> {
  const refs = new Map<string, string>()
  const re = /(?:^|\n)([0-9a-f]+):T([0-9a-f]+),/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stream)) !== null) {
    const id = m[1]!
    const len = parseInt(m[2]!, 16)
    const start = m.index + m[0].length
    refs.set(id, stream.slice(start, start + len))
  }
  return refs
}

/**
 * Depth-aware scan for complete `{...}` JSON objects starting at each
 * occurrence of `anchor`, correctly skipping braces inside quoted strings
 * (a job description can legitimately contain `{`/`}`). One malformed object
 * is skipped rather than corrupting the whole extraction (JSON.parse in the
 * caller filters those out).
 */
export function extractBalancedJsonObjects(text: string, anchor: string): string[] {
  const results: string[] = []
  let searchFrom = 0
  for (;;) {
    const start = text.indexOf(anchor, searchFrom)
    if (start === -1) break
    let i = start
    let depth = 0
    let inString = false
    let escaped = false
    for (; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === "\\") escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) {
          i++
          break
        }
      }
    }
    results.push(text.slice(start, i))
    searchFrom = Math.max(i, start + anchor.length)
  }
  return results
}

// ---------------------------------------------------------------------------
// Job shape
// ---------------------------------------------------------------------------

export interface JobResult {
  id: string // the job's guid — also the /job-detail/<guid> path segment
  title: string
  company: string | null
  location: string | null
  date: string | null // ISO 8601, from postedDate
  url: string
  remote: boolean | null
  employmentType: string | null
  salary: string | null
  description: string | null // search: a truncated preview (see SKILL.md); detail: full text
}

interface RawSearchJob {
  id?: string
  guid?: string
  title?: string
  companyName?: string
  jobLocation?: { displayName?: string }
  postedDate?: string
  detailsPageUrl?: string
  isRemote?: boolean
  employmentType?: string
  salary?: string
  summary?: string
}

/** Parse a /jobs/... search page: extract every embedded job card from the RSC stream. */
export function parseSearchPage(html: string): JobResult[] {
  const stream = extractRscStream(html)
  const candidates = extractBalancedJsonObjects(stream, '{"id":"')
  const seen = new Set<string>()
  const results: JobResult[] = []

  for (const candidate of candidates) {
    let raw: RawSearchJob
    try {
      raw = JSON.parse(candidate)
    } catch {
      continue
    }
    // Distinguish a job card from unrelated `{"id":...}` objects in the stream.
    if (!raw.guid || !raw.title) continue
    if (seen.has(raw.guid)) continue
    seen.add(raw.guid)

    results.push({
      id: raw.guid,
      title: raw.title || "(untitled)",
      company: raw.companyName || null,
      location: raw.jobLocation?.displayName || null,
      date: raw.postedDate || null,
      url: raw.detailsPageUrl || `https://www.dice.com/job-detail/${raw.guid}`,
      remote: typeof raw.isRemote === "boolean" ? raw.isRemote : null,
      employmentType: raw.employmentType || null,
      salary: raw.salary || null,
      description: raw.summary || null,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Detail page parsing
// ---------------------------------------------------------------------------

export interface JobDetailResult extends JobResult {
  skills: string[]
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

/** Strip a description's HTML into readable prose, preserving paragraph/line breaks. */
export function cleanHtml(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/**
 * Parse a /job-detail/<guid> page. Company/title come from the page's own
 * `jobsData` RSC object; the full description is resolved through the
 * `"description":"$<ref>"` back-reference into the RSC text-chunk map;
 * location is not present as a clean field on this page (confirmed live
 * 2026-08-09) and falls back to a best-effort parse of the last
 * `" - "`-separated segment of `og:title`.
 */
export function parseDetailPage(html: string, guid: string): JobDetailResult | null {
  const stream = extractRscStream(html)

  const jobsDataMatch = extractBalancedJsonObjects(stream, '{"jobGuid":"')[0]
  if (!jobsDataMatch) return null
  let jobsData: { jobGuid?: string; jobTitle?: string; companyName?: string }
  try {
    jobsData = JSON.parse(jobsDataMatch)
  } catch {
    return null
  }
  if (!jobsData.jobTitle) return null

  // "description":"$49","companyId":"...","positionId":"...","postedDate":"..."
  const metaMatch = stream.match(
    /"description":"\$([0-9a-f]+)","companyId":"([^"]*)","positionId":"([^"]*)","postedDate":"([^"]*)"/,
  )
  const refs = buildRscTextRefs(stream)
  const descriptionHtml = metaMatch ? refs.get(metaMatch[1]!) ?? null : null
  const postedDate = metaMatch?.[4] || null

  const skillsMatch = stream.match(/"skills":\[([^\]]*)\]/)
  let skills: string[] = []
  if (skillsMatch) {
    try {
      skills = JSON.parse(`[${skillsMatch[1]}]`)
    } catch {
      skills = []
    }
  }

  // Location has no clean field here; best-effort from og:title's trailing
  // " - <location>" segment (format: "<Title> - <Company> - <Location>").
  const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]
  let location: string | null = null
  if (ogTitle) {
    const parts = decodeHtmlEntities(ogTitle).split(" - ")
    if (parts.length >= 3) location = parts[parts.length - 1]!.trim()
  }

  return {
    id: guid,
    title: jobsData.jobTitle,
    company: jobsData.companyName || null,
    location,
    date: postedDate,
    url: `https://www.dice.com/job-detail/${guid}`,
    remote: null,
    employmentType: null,
    salary: null,
    description: cleanHtml(descriptionHtml),
    skills,
  }
}

/** Accept a bare guid (uuid) or a full /job-detail/<guid> URL. No slug involved (unlike wellfound-search). */
export function normalizeGuid(input: string): string | null {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/dice\.com\/job-detail\/([0-9a-f-]{36})/i)
  if (urlMatch) return urlMatch[1]!
  if (/^[0-9a-f-]{36}$/i.test(trimmed)) return trimmed
  return null
}
