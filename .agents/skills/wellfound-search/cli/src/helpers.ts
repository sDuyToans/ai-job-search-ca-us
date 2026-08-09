// Data source: Wellfound (wellfound.com), a global startup job board. No public
// API; we read two public HTML page types and extract the structured JSON each
// one already embeds for SEO/hydration, rather than scraping rendered markup:
//
//   - Search ("role" landing pages, /role/r/<role-slug>?page=<n>): Next.js
//     "pages router" — the page embeds a full Apollo GraphQL cache snapshot in
//     a <script id="__NEXT_DATA__"> tag. Results are grouped by startup
//     (company), each with one or more `highlightedJobListings`.
//   - Detail (/jobs/<id>-<slug>): a different render path (no __NEXT_DATA__),
//     but the page carries a standard schema.org JobPosting in a
//     <script type="application/ld+json"> block — the same SEO markup Google
//     Jobs relies on, so it is stable and well-structured.
//
// Wellfound's role taxonomy is a fixed set of ~40 categories (see ROLE_SLUGS
// below), not free-text search — `search --query` is matched against that
// taxonomy to pick a role page, then results are filtered client-side by
// keyword/location. See url-reference.md for the full investigation notes.

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404.
 *
 * Wellfound's WAF returns 403 (not 404) for a well-formed detail URL whose
 * slug doesn't match the ID — that's a caller bug (see normalizeDetailId), not
 * a transient condition, so 403 is NOT retried here; it surfaces as an error.
 */
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
// Role taxonomy
// ---------------------------------------------------------------------------

/** Confirmed-live role slugs (wellfound.com/role/r/<slug>) as of 2026-08-09. */
export const ROLE_SLUGS = [
  "software-engineer",
  "full-stack-developer",
  "app-developer",
  "devops-engineer",
  "site-reliability-engineer",
  "quality-assurance",
  "ai-engineer",
  "big-data-engineer",
  "cloud-product-manager",
  "gcp-developer",
  "mulesoft-developer",
  "blockchain",
  "data-analyst",
  "financial-analyst",
  "product-manager",
  "product-designer",
  "ui-ux-designer",
  "graphic-designer",
  "growth-marketer",
  "digital-marketing-director",
  "marketing-assistant",
  "ppc-manager",
  "sales",
  "sales-manager",
  "account-manager",
  "hr-manager",
  "operations-manager",
  "it-manager",
  "it-consultant",
  "technical-lead",
  "computer-support-technician",
] as const

/** Ordered keyword -> role-slug rules; first match wins. */
const ROLE_INFERENCE: Array<{ pattern: RegExp; slug: string }> = [
  { pattern: /\bqa\b|quality\s*assurance|\btest(er|ing)?\b|\bsdet\b/i, slug: "quality-assurance" },
  { pattern: /full[\s-]?stack/i, slug: "full-stack-developer" },
  { pattern: /site\s*reliability|\bsre\b/i, slug: "site-reliability-engineer" },
  { pattern: /devops/i, slug: "devops-engineer" },
  { pattern: /\b(ios|android|mobile)\b/i, slug: "app-developer" },
  { pattern: /product\s*manager/i, slug: "product-manager" },
  { pattern: /data\s*(analyst|scientist|engineer)/i, slug: "data-analyst" },
  { pattern: /\b(ux|ui)\b/i, slug: "ui-ux-designer" },
  { pattern: /designer/i, slug: "product-designer" },
]

/** Best-effort mapping from a free-text query to one of Wellfound's role slugs. */
export function inferRole(query: string | undefined): string {
  if (!query) return "software-engineer"
  for (const { pattern, slug } of ROLE_INFERENCE) {
    if (pattern.test(query)) return slug
  }
  return "software-engineer"
}

// ---------------------------------------------------------------------------
// Search-page (__NEXT_DATA__ / Apollo cache) parsing
// ---------------------------------------------------------------------------

interface ApolloRef {
  __ref: string
}
function isRef(v: unknown): v is ApolloRef {
  return typeof v === "object" && v !== null && typeof (v as ApolloRef).__ref === "string"
}

/** Depth-first search for the first object key starting with `prefix`. */
function findByKeyPrefix(node: unknown, prefix: string, depth = 0): unknown {
  if (depth > 12 || node === null || typeof node !== "object") return undefined
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith(prefix)) return value
    const nested = findByKeyPrefix(value, prefix, depth + 1)
    if (nested !== undefined) return nested
  }
  return undefined
}

export interface JobResult {
  id: string // "<numericId>-<slug>" — matches Wellfound's own /jobs/<id>-<slug> path
  title: string
  company: string | null
  companySlug: string | null
  location: string | null
  date: string | null // ISO 8601, from liveStartAt (epoch seconds)
  url: string
  remote: boolean | null
  jobType: string | null
  compensation: string | null
  yearsExperienceMin: number | null
  yearsExperienceMax: number | null
  acceptedRemoteLocationNames: string[]
  description: string | null
}

export interface SearchPageResult {
  totalJobCount: number | null
  pageCount: number | null
  results: JobResult[]
}

/**
 * Parse a /role/r/<slug> search page: pull the Apollo cache out of
 * __NEXT_DATA__, find the seoLandingPageJobSearchResults query result
 * (wherever Apollo nested it — not always at a fixed path), and join each
 * startup's highlighted job listings into flat contract-shaped results.
 */
export function parseSearchPage(html: string): SearchPageResult {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return { totalJobCount: null, pageCount: null, results: [] }

  let data: unknown
  try {
    data = JSON.parse(m[1])
  } catch {
    return { totalJobCount: null, pageCount: null, results: [] }
  }

  const apollo = (data as any)?.props?.pageProps?.apolloState?.data
  if (!apollo || typeof apollo !== "object") return { totalJobCount: null, pageCount: null, results: [] }

  const resolve = (ref: ApolloRef): any => apollo[ref.__ref]

  const searchResults = findByKeyPrefix(apollo, "seoLandingPageJobSearchResults(") as
    | { totalJobCount?: number; pageCount?: number; startups?: ApolloRef[] }
    | undefined
  if (!searchResults || !Array.isArray(searchResults.startups)) {
    return { totalJobCount: null, pageCount: null, results: [] }
  }

  const results: JobResult[] = []
  for (const startupRef of searchResults.startups) {
    if (!isRef(startupRef)) continue
    const startup = resolve(startupRef)
    if (!startup) continue
    const listingRefs: ApolloRef[] = Array.isArray(startup.highlightedJobListings)
      ? startup.highlightedJobListings
      : []
    for (const listingRef of listingRefs) {
      if (!isRef(listingRef)) continue
      const job = resolve(listingRef)
      if (!job || !job.id || !job.slug) continue
      const id = `${job.id}-${job.slug}`
      results.push({
        id,
        title: job.title || "(untitled)",
        company: startup.name || null,
        companySlug: startup.slug || null,
        location: Array.isArray(job.locationNames) && job.locationNames.length ? job.locationNames.join(", ") : null,
        date: typeof job.liveStartAt === "number" ? new Date(job.liveStartAt * 1000).toISOString() : null,
        url: `https://wellfound.com/jobs/${id}`,
        remote: typeof job.remote === "boolean" ? job.remote : null,
        jobType: job.jobType || null,
        compensation: job.compensation || null,
        yearsExperienceMin: typeof job.yearsExperienceMin === "number" ? job.yearsExperienceMin : null,
        yearsExperienceMax: typeof job.yearsExperienceMax === "number" ? job.yearsExperienceMax : null,
        acceptedRemoteLocationNames: Array.isArray(job.acceptedRemoteLocationNames) ? job.acceptedRemoteLocationNames : [],
        description: job.description || null,
      })
    }
  }

  return {
    totalJobCount: typeof searchResults.totalJobCount === "number" ? searchResults.totalJobCount : null,
    pageCount: typeof searchResults.pageCount === "number" ? searchResults.pageCount : null,
    results,
  }
}

/** Locations a result matches against for client-side `--location` filtering. */
export function locationHaystack(job: JobResult): string {
  return [job.location, ...job.acceptedRemoteLocationNames].filter(Boolean).join(" ").toLowerCase()
}

// ---------------------------------------------------------------------------
// Detail-page (schema.org JobPosting JSON-LD) parsing
// ---------------------------------------------------------------------------

export interface JobDetailResult extends JobResult {
  employmentType: string | null
  jobLocationType: string | null
  applicantLocationRequirement: string | null
  experienceRequirements: string | null
  salary: string | null
  descriptionHtml: string | null // raw HTML, in case the caller wants it unstripped
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

/** Strip a JobPosting's HTML description into readable prose, preserving paragraph breaks. */
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
 * schema.org allows `experienceRequirements` as free text OR a structured
 * OccupationalExperienceRequirements object ({ monthsOfExperience, ... }) —
 * confirmed live (2026-08-09): Wellfound emits both shapes depending on the
 * posting. Render whichever is present as readable text; unknown shapes fall
 * back to null rather than "[object Object]".
 */
function formatExperienceRequirements(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === "string") return raw
  if (typeof raw === "object") {
    const months = (raw as { monthsOfExperience?: number }).monthsOfExperience
    if (typeof months === "number") return `${months} months of experience`
  }
  return null
}

function formatSalary(baseSalary: any): string | null {
  if (!baseSalary || typeof baseSalary !== "object") return null
  const v = baseSalary.value
  if (!v) return null
  const cur = baseSalary.currency ? `${baseSalary.currency} ` : ""
  if (v.minValue != null && v.maxValue != null) return `${cur}${v.minValue}–${v.maxValue}`
  if (v.minValue != null || v.maxValue != null) return `${cur}${v.minValue ?? v.maxValue}`
  return null
}

/** Parse a /jobs/<id>-<slug> detail page from its embedded schema.org JobPosting JSON-LD. */
export function parseDetailPage(html: string, id: string): JobDetailResult | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  for (const block of blocks) {
    let parsed: any
    try {
      parsed = JSON.parse(block[1])
    } catch {
      continue
    }
    if (parsed?.["@type"] !== "JobPosting") continue

    const org = parsed.hiringOrganization
    const loc = parsed.jobLocation?.[0]?.address
    const locationParts = [loc?.addressLocality, loc?.addressRegion, loc?.addressCountry].filter(Boolean)

    return {
      id,
      title: parsed.title || "(untitled)",
      company: org?.name || null,
      companySlug: null,
      location: locationParts.length ? locationParts.join(", ") : null,
      date: parsed.datePosted || null,
      url: `https://wellfound.com/jobs/${id}`,
      remote: parsed.jobLocationType === "TELECOMMUTE" ? true : null,
      jobType: parsed.employmentType ? String(parsed.employmentType).toLowerCase() : null,
      compensation: formatSalary(parsed.baseSalary),
      yearsExperienceMin: null,
      yearsExperienceMax: null,
      acceptedRemoteLocationNames: parsed.applicantLocationRequirements?.name
        ? [parsed.applicantLocationRequirements.name]
        : [],
      description: cleanHtml(parsed.description),
      employmentType: parsed.employmentType || null,
      jobLocationType: parsed.jobLocationType || null,
      applicantLocationRequirement: parsed.applicantLocationRequirements?.name || null,
      experienceRequirements: formatExperienceRequirements(parsed.experienceRequirements),
      salary: formatSalary(parsed.baseSalary),
      descriptionHtml: parsed.description || null,
    }
  }
  return null
}

/**
 * A detail `id` MUST be the exact "<numericId>-<slug>" pair (from a search
 * result's `id`, or a /jobs/<id>-<slug> URL) — Wellfound's WAF returns 403 for
 * a numeric ID paired with any other slug, so a bare numeric ID cannot be
 * safely guessed into a working URL.
 */
export function normalizeDetailId(input: string): string | null {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/wellfound\.com\/jobs\/(\d+-[a-z0-9-]+)/i)
  if (urlMatch) return urlMatch[1]
  if (/^\d+-[a-z0-9-]+$/i.test(trimmed)) return trimmed
  return null
}
