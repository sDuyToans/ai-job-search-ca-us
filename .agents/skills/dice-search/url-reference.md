# Dice (dice.com) reference

The endpoints, parsing anchors, and quirks this skill depends on, from live
investigation on 2026-08-09. This is the file to update if Dice changes its
markup or its React Server Component (RSC) streaming format.

## Access

No authentication. `robots.txt` (`https://www.dice.com/robots.txt`, checked
live) **explicitly disallows Dice's query-string search UI**:

```
Disallow: /jobs?q*
Disallow: /jobs/?q*
Disallow: /jobs/dc-*
Disallow: /jobs/djt-*
Allow: /jobs
Allow: /job-detail
```

This skill **never requests the disallowed `?q=` form**. Instead it uses two
paths robots.txt does *not* disallow, both confirmed live:

1. **SEO-friendly path-based search**: `/jobs/q-<keywords>-jobs`,
   `/jobs/l-<location>-jobs`, or combined `/jobs/q-<keywords>-l-<location>-jobs`
   — these are a *different* URL shape from `/jobs?q=...` (the disallowed
   pattern requires a literal `?q` right after `/jobs`; the path segment
   `/jobs/q-...-jobs` doesn't match it). Verified with real searches
   returning 20 job cards each: `q-QA+Automation+Engineer-jobs`,
   `q-junior+software+engineer-l-Toronto,+ON-jobs`, `l-Toronto,+ON-jobs`
   (location only), bare `/jobs` (browse, no keyword). Standard
   percent-encoding (`encodeURIComponent`) works for both segments.
   Pagination is a normal `?page=N` query param appended after the path
   (tested `page=2` — different results, same total).
2. **Individual job pages**: `/job-detail/<guid>` — explicitly `Allow:`d, no
   slug or mismatch concerns (unlike `wellfound-search`'s `/jobs/<id>-<slug>`,
   Dice's detail URL is just the bare UUID).

A prior candidate for this skill (a fully compliant Indeed-style
WebSearch-discovery fallback) was superseded once this SEO path was found —
no fallback is needed; the CLI covers real search.

## Response structure: React Server Component "flight data"

Both page types are Next.js **App Router** pages. Unlike `wellfound-search`'s
search page (`__NEXT_DATA__` + Apollo cache) or its detail page (schema.org
JSON-LD), **neither exists here** — Dice's pages carry no `__NEXT_DATA__`
script and no `application/ld+json` block. Instead, real data is streamed as
RSC "flight data": a sequence of

```html
<script>self.__next_f.push([1,"<escaped-chunk>"])</script>
```

tags. Each `<escaped-chunk>` is a JS string literal (standard `\"`, `\\`,
`\n`, `\uXXXX` escapes) that, once decoded and concatenated in document
order, forms one continuous stream of newline-separated entries like
`<hexId>:<payload>`. Two payload shapes matter here:

- **Plain JSON** (most entries): `<hexId>:{"some":"json"}` — this is where
  job-card objects and metadata objects live, found by scanning for known
  anchors (`{"id":"..."` for search cards, `{"jobGuid":"..."` for a detail
  page's own job) and extracting the complete balanced `{...}` object
  (`extractBalancedJsonObjects` in `helpers.ts` — brace-depth-aware and
  string-quote-aware, so a description containing literal `{`/`}` can't
  corrupt extraction).
- **Text chunk**: `<hexId>:T<hexLength>,<raw text>` — RSC's mechanism for
  streaming a large string (e.g. an HTML description) once and referencing it
  elsewhere by id (`"description":"$<hexId>"`). `buildRscTextRefs` finds every
  `T`-chunk and slices out exactly `hexLength` characters as that id's value;
  the caller resolves a `"$<id>"` reference through the resulting map.

### Search page (`/jobs/q-...-jobs` etc.)

Confirmed live job-card shape (search for `{"id":"` to find one):

```jsonc
{
  "id": "ff14334347137a618a2fc3795646051c",       // internal id, not used
  "guid": "0e51617d-b505-42dd-b4c1-7bcb636e0eff",  // -> result.id, /job-detail/<guid>
  "detailsPageUrl": "https://www.dice.com/job-detail/0e51617d-...",
  "clientBrandId": "10115299",
  "companyName": "Cox Communications",
  "companyLogoUrl": "https://...",
  "employmentType": "Full-time",
  "employerType": "Direct Hire",
  "jobLocation": { "city": "Atlanta", "state": "Georgia", "country": "USA", "region": "GA", "displayName": "Atlanta, Georgia, USA" },
  "postedDate": "2026-08-06T20:57:53Z",             // -> result.date
  "modifiedDate": "2026-08-08T20:56:35Z",
  "salary": "USD 74,000.00 - 111,000.00 per year",  // absent on many postings
  "summary": "Company Cox Automotive - USA ...",     // TRUNCATED preview, not full text
  "title": "Software Engineer I",
  "score": 4727.5083,
  "easyApply": false,
  "isRemote": true,
  "workFromHomeAvailability": "FALSE",
  "workplaceTypes": ["Remote"],
  "companyProfileId": "36e098ab-..."
}
```

**`summary` is a truncated preview**, not the full posting text (confirmed:
it visibly cuts off mid-sentence) — unlike `freehire-search`/`wellfound-search`,
where search already carries the complete description. `search`'s `description`
field passes this preview through as-is (documented, not hidden); call
`detail` for the full text.

A `postedDate` facet exists server-side (`facetName":"postedDate"` with
values `ONE`/`THREE`/`SEVEN` day tiers, and a `?filters.postedDate=SEVEN`
query param appears to be accepted), but this skill does **not** rely on it —
`postedDate` is already a real per-result ISO date, so `--jobage` filters
client-side from that, the same "post-fetch check is what actually
guarantees the window" philosophy the rest of this repo already follows for
coarse-tiered portals (`jobbank-ca-search`).

### Detail page (`/job-detail/<guid>`)

The page's own job data is a `jobsData` object (anchor: `{"jobGuid":"`):

```jsonc
{
  "jobGuid": "194b8b96-cb07-4346-8b24-cd479c1a37b2",
  "legacyJobId": "0eab77165ee4195ce9fa4e30ba4e8a22",
  "jobTitle": "Lead Software Engineer, Full Stack (...)",
  "companyName": "Capital One",
  "isFeatured": false,
  "isAuthedCandidate": false,
  "applyType": "External",
  "correlationId": "408bbc1b-998d-4cc3-9d2f-1a6f96d2fd31"
}
```

**No `location` field exists in `jobsData`** (confirmed live — checked the
full object). This skill falls back to the page's `<meta property="og:title">`
tag, formatted `"<Title> - <Company> - <Location>"`, taking the last
`" - "`-separated segment. Best-effort: a title that itself contains " - " can
throw this off; documented as a known limitation rather than silently trusted.

The description and a few more fields live in a separate object, found via a
targeted regex (field order confirmed stable across two different postings
during investigation, but this is the most order-dependent part of the
parser — if Dice reorders these fields, this is the pattern to update):

```
"description":"$49","companyId":"10225989","positionId":"R248567","postedDate":"2026-08-07T20:47:25.000Z"
```

`$49` resolves through the RSC text-ref map (see above) to the full
HTML description, e.g.:

```
49:T1bb8,Lead Software Engineer, Full Stack (...)<br /><br /><b> Do you love building...
```

`cleanHtml` (shared pattern with `wellfound-search`/`freehire-search`) strips
this into readable prose.

Skills are a flat string array found via `"skills":[...]` (simple,
non-nested — a plain non-greedy regex up to the closing `]` is safe).

**Content note (not a parsing concern, worth knowing about):** one
description fetched during investigation (Capital One, "Developer
Experience team") contained oddly specific text about "Claude Code
integrations, skills marketplaces, and AI-powered workflows" — plausibly
genuine (many companies do build internal AI/dev-tooling platforms) but
worth a raised eyebrow given the self-referential subject matter. No
injection attempt was present (no instructions directed at a reader), just
unusual phrasing — flagging here in case a future maintainer sees the same
posting and wonders whether the parser mangled something. It didn't; that's
verbatim source text.

## Fetching

Browser User-Agent (`Mozilla/5.0 ... Chrome/120.0.0.0 Safari/537.36`),
exponential backoff with jitter on 429/5xx (max 6 retries), empty string on
404. No portal-specific 403 behavior was observed for Dice during
investigation (unlike Wellfound's slug-mismatch 403) — a 403 here has no
known benign cause and is treated as a plain error.
