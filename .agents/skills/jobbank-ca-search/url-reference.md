# Job Bank Canada URL Reference

Public, unauthenticated `jobsearch` HTML endpoints used by this skill.

> `robots.txt` (`https://www.jobbank.gc.ca/robots.txt`) sets no `Disallow` rules — only
> `Crawl-delay: 5`. Investigated 2026-08-07.

## Search

```
GET https://www.jobbank.gc.ca/jobsearch/jobsearch
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `searchstring` | Free-text query | `software engineer intern` |
| `locationstring` | Place string (soft match — see below) | `Ontario`, `Toronto, ON` |
| `fage` | Posting-age tier | `2` (last 2 days) · `30` (last 30 days) · `+30` (older than 30 days) |
| `page` | 1-indexed page | `1`, `2`, … (25 results/page) |
| `sort` | Sort order | `M` (best match, default) · `D` (date posted) |

Returns an HTML page with one `<article id="article-<id>" class="action-buttons">` per
result. Confirmed via live fetch (2026-08-07, query `software engineer intern`, 84 total
results, page=1 and page=2 returned disjoint ID sets — pagination is clean).

Within each `<article>` chunk:
- Title: `<span class="noctitle">...</span>` inside `<h3 class="title">`
- Date: `<li class="date">...</li>`
- Company: `<li class="business">...</li>`
- Location: `<li class="location">...</li>` (includes an icon span to strip)
- Salary (optional): `<li class="salary">...</li>`
- Total result count: `<span id="results-count">N</span>` near the top of the page

**Location quirk:** the site internally resolves `locationstring` into region/facet
codes (`fcid`, `fn21`) server-side — the raw text param still works and biases results,
but it is not a strict filter (a search for "Ontario" also surfaced BC/NS results in
testing). Treat as best-effort.

**Note on the RSS feed:** the page also links an Atom feed at
`/jobsearch/feed/jobSearchRSSfeed?...&rows=100`, similar to the pattern used by the
Danish `jobbank-search` skill. **Do not use it for keyword search** — live testing
(2026-08-07) showed the feed ignores `term`/`searchstring` entirely and always returns
the newest ~100 postings site-wide regardless of query. The HTML search page above is
the only endpoint that actually filters by keyword.

## Detail

```
GET https://www.jobbank.gc.ca/jobsearch/jobposting/<id>
```

Returns a single job's HTML with Schema.org `JobPosting` fields expressed as RDFa
microdata attributes (`property="..."`), not a JSON-LD block. Confirmed via live fetch
(2026-08-07, job ID `49974739`):

- Title: `<h1 property="name">...<span property="title">...</span></h1>`
- Posted date: `<span property="datePosted">Posted on <date></span>`
- Employer: `property="hiringOrganization"` -> nested `property="name"`
- Location: `property="joblocation"` -> `property="addressLocality"` + `property="addressRegion"`
- Workplace type (on-site/hybrid/remote): plain text following a "Work location" label span
- Employment type: `property="employmentType"` -> nested `.attribute-value` span
- Salary: `property="baseSalary"` -> `property="minValue"`/`maxValue"`/`unitText"` (content attributes)
- Description: `<span class="hidden" property="description">...</span>` — **plain text**
  with literal newlines already, no nested markup. Confirmed no nested `<span>` inside
  this block on the tested posting, so a non-greedy regex is sufficient (no depth
  tracking needed, unlike LinkedIn's nested `<div>` description).
- External apply link (when present): `<a id="externalJobLink" href="...">` — points to
  the source site (e.g. `ca.indeed.com/viewjob?...`) for aggregated postings. Absent for
  postings submitted directly to Job Bank (applying then requires a Job Bank account,
  out of scope for this CLI).

## Notes

- No authentication required for either endpoint.
- Respect the 5-second crawl delay from `robots.txt` — avoid rapid scripted loops.
- `fage=+30` means *older than* 30 days, which is the opposite of a "posted within"
  filter — the CLI never sends this value; `jobageToFage()` in `helpers.ts` only emits
  `2` or `30`, or omits the param entirely.
