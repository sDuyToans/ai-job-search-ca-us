# Wellfound (wellfound.com) reference

The endpoints, parsing anchors, and quirks this skill depends on, from live
investigation on 2026-08-09. This is the file to update if Wellfound changes
its markup. No public API exists; everything below is a public HTML page.

## Access

No authentication. `robots.txt` (`https://wellfound.com/robots.txt`) disallows
`/_jobs/`, `/auth/`, `/onboarding`, and — notably — query-string job-detail
patterns (`/*?jobId=*`, `/*?jobSlug=*`, `/*?role=*`, `/*?preview=*`). It does
**not** disallow the path-based patterns this skill uses (`/role/r/<slug>` or
`/jobs/<id>-<slug>`), so both are robots.txt-compliant.

A prior investigation of this repo (recorded in
`.claude/skills/job-scraper/search-queries.md`) had marked Wellfound as
"actively bot-block[ing] plain HTTP requests (403/Cloudflare challenge)". That
finding did not reproduce on 2026-08-09 with a standard browser User-Agent —
plain `fetch`/`curl` GETs to both page types below return 200 with full
server-rendered data; the Cloudflare Turnstile script embedded in the page is
gated to sign-in/apply actions, not the initial page load. **One access rule
was confirmed live**, though: a `/jobs/<id>-<slug>` request with a numeric ID
paired with a slug that doesn't match it returns **403**, not 404 — see
"Detail page" below. Treat 403 there as a caller bug (wrong slug), not a block.

Wellfound offers no official API and its ToS restricts automated access;
`SKILL.md` carries a personal-use-only warning per repo convention.

## Search: `/role/r/<role-slug>?page=<n>`

Example verified live: `https://wellfound.com/role/r/quality-assurance?page=1`
→ 200, `totalJobCount: 286`, `pageCount: 8`.

**Role taxonomy, not free-text search.** Wellfound has ~40 fixed role
categories (collected by grepping `role/r/[a-z0-9-]+` hrefs across the jobs
landing page and several role pages — the full set observed is in
`cli/src/helpers.ts`'s `ROLE_SLUGS`). There is no keyword query parameter on
this page; `search --query` picks the closest taxonomy slug via
best-effort keyword inference (`inferRole` in `helpers.ts`), then the CLI
re-uses the same query text as a client-side filter over the page's
title/description text. An invalid/unknown slug redirects (303) to a page
with no results key, which this skill treats as zero results, not an error.

**Confirmed working slugs relevant to this repo's search categories:**
`software-engineer` (1825 jobs), `full-stack-developer` (375),
`quality-assurance` (286), `devops-engineer`, `site-reliability-engineer`,
`app-developer`.

**Pagination**: `?page=N` works as expected (tested page 1 vs 2 — different
`StartupResult` refs returned, same `totalJobCount`/`pageCount`).

**`?remote=false` has no effect** — tested explicitly; the query key inside
`__NEXT_DATA__` still reports `"remote":true` regardless. These SEO landing
pages appear to be hard-scoped to remote-tagged postings. A working
onsite/hybrid-only URL pattern was not found (`/location/<city>/role/r/<slug>`
returned 403 on the one city tested — not investigated further). This is a
known limitation, documented in the CLI's README.

### Response structure

The page is server-rendered by Next.js's **pages router**: a
`<script id="__NEXT_DATA__" type="application/json">` block holds the full
page payload, including an Apollo GraphQL normalized cache at
`props.pageProps.apolloState.data`.

The cache is a flat dict keyed by `"<Typename>:<id>"` (or `ROOT_QUERY` for the
root), with cross-references as `{"__ref": "<key>"}`. The query result this
skill reads is **not** at a fixed top-level key — it's nested inside an
embedded (unreferenced, no own cache key) object under
`ROOT_QUERY.talent.viewer`, as a field literally named with its GraphQL
call signature, e.g.:

```
"seoLandingPageJobSearchResults({\"page\":1,\"remote\":true,\"role\":\"quality-assurance\"})"
```

Because the exact nesting depth is Apollo-cache-internal and not guaranteed
stable, `helpers.ts`'s `findByKeyPrefix` does a bounded depth-first search for
any object key starting with `"seoLandingPageJobSearchResults("` instead of
hard-coding a path. If Wellfound's GraphQL schema renames this query, this is
the function to update (and this file is where the old name should be noted).

```jsonc
// the resolved seoLandingPageJobSearchResults(...) value
{
  "totalJobCount": 286,
  "totalStartupCount": 159,
  "perPage": 20,
  "pageCount": 8,
  "startups": [{ "__ref": "StartupResult:6809417" }, /* ~20 per page */]
}

// StartupResult:<id>
{
  "name": "Keeper",
  "slug": "keeper-tax",
  "highlightedJobListings": [{ "__ref": "JobListingSearchResult:3317746" }]
  // 1+ per startup — NOT capped at 1; a page of 20 startups yielded 36
  // job listings in the sample fetched during investigation.
}

// JobListingSearchResult:<id>
{
  "id": "3317746",
  "slug": "software-engineer",             // -> detail URL /jobs/<id>-<slug>
  "title": "Software Engineer",
  "description": "### Mission\n\n...",     // full text, already present in search
  "jobType": "full-time",
  "remote": true,
  "liveStartAt": 1785272337,               // Unix epoch SECONDS
  "locationNames": ["San Francisco"],
  "acceptedRemoteLocationNames": ["United States"],
  "compensation": "$135k – $175k • 0.05% – 0.25%",
  "yearsExperienceMin": 0,
  "yearsExperienceMax": null
}
```

**Search results already carry the full `description`** (confirmed:
multi-paragraph Markdown-ish text, not a truncated preview) — same pattern as
`freehire-search`. `search`'s JSON output passes it through; `detail` is for
looking a specific posting up directly (e.g. from a tracked application URL),
not for hydrating search hits.

## Detail: `/jobs/<id>-<slug>`

Example verified live: `https://wellfound.com/jobs/3317746-software-engineer`
→ 200, `<title>Software Engineer at Keeper • San Francisco • Remote (Work
from Home) | Wellfound</title>`.

**This page does NOT have a `__NEXT_DATA__` block** — it renders via a
different path than the search pages (no Apollo cache dump). It does embed a
standard **schema.org `JobPosting`** in a
`<script type="application/ld+json">` block — the same structured-data markup
Google for Jobs relies on, so it's stable, unambiguous, and doesn't need
markup-anchor parsing.

```jsonc
{
  "@type": "JobPosting",
  "title": "Software Engineer",
  "identifier": { "name": "Keeper", "value": "3317746-software-engineer" },
  "employmentType": "FULL_TIME",
  "hiringOrganization": { "name": "Keeper", "sameAs": "https://...", "location": [...] },
  "datePosted": "2026-07-28T20:58:57Z",
  "jobLocation": [{ "address": { "addressLocality": "San Francisco", "addressRegion": "California", "addressCountry": "United States" } }],
  "jobLocationType": "TELECOMMUTE",
  "applicantLocationRequirements": { "@type": "Country", "name": "United States" },
  "experienceRequirements": "no requirements",
  "baseSalary": { "currency": "USD", "value": { "minValue": 135000, "maxValue": 175000 } },
  "description": "<h3>Mission</h3>\n<p>...</p>"  // HTML — cleanHtml() strips it
}
```

**Slug mismatch → 403, not 404.** Tested live: `/jobs/3317746-xyz-wrong-slug`
returned HTTP 403 with a generic `<title>wellfound.com</title>` (looks like a
WAF rule treating an ID/slug mismatch as bot-like), while
`/jobs/3317746` (no slug at all) returned a normal 404. **A bare numeric ID
cannot be safely turned into a working detail URL** — the exact slug is
required. Because of this, this skill's contract `id` is the combined
`"<numericId>-<slug>"` pair (matching Wellfound's own URL segment), sourced
from a search result's `id` field or a full `/jobs/<id>-<slug>` URL.
`normalizeDetailId` in `helpers.ts` rejects a bare numeric ID with `BAD_ID`
rather than guessing a slug and risking a 403.

## Fetching

Browser User-Agent (`Mozilla/5.0 ... Chrome/120.0.0.0 Safari/537.36`),
exponential backoff with jitter on 429/5xx (max 6 retries), empty string on
404. A 403 is **not** retried — on this site it means a caller-side mismatch
(see above), not a transient block.
