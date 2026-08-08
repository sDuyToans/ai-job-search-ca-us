# Eluta.ca URL Reference

Public, unauthenticated search and detail HTML pages used by this skill.

> `robots.txt` (`https://www.eluta.ca/robots.txt`) disallows `/asp/`, `/cache?`,
> `/cache/`, `/notification_search`, `/notify?`, `/rss?`, `/sandbox?`, `/search/`
> (note the **trailing slash**), `/static/`, `/system/` for the default `*`
> user-agent. The endpoint this skill uses is `/search?q=...` (no trailing
> slash before the query string), which is a distinct path from the disallowed
> `/search/` prefix. Investigated 2026-08-07.

## Search

```
GET https://www.eluta.ca/search?q=<query>&l=<location>&pg=<page>
```

Confirmed live (2026-08-07, query `software engineer`, location `Ontario`):
returns a real results page with real job cards, not an empty shell. `pg` is
1-indexed; omit for page 1. 10 results per page.

Each result is a `<div data-url="spl/<id>?imo=N" class="organic-job ...">`
block. Fields extracted:

| Field | Markup |
|-------|--------|
| id | The `data-url="spl/<id>?imo=N"` attribute — id is everything before the `?` |
| title | `<a class="lk-job-title" ... title="...">...</a>` (inner text preferred, `title` attribute as fallback) |
| company | `<a class="employer lk-employer" ...>...</a>` |
| location | `<span class="location"><span>...</span></span>` |
| date (relative) | `<a class="lk lastseen" ...>1 hour ago</a>` — relative text only; see Detail for the absolute date |
| snippet | `<span class="description">...<span class="highlight">term</span>...</span>` — a truncated preview with matched query terms wrapped in a nested `<span class="highlight">`, which is why extracting it needs depth-tracking (see below), not a naive first-`</span>` match |

**Job title/employer links use `onclick` JS navigation** (`href="#!"`) on the
search page itself — there is no plain `<a href>` to follow. This skill instead
builds the detail URL directly from the `data-url` attribute.

## Detail

```
GET https://www.eluta.ca/spl/<id>
```

Confirmed live (2026-08-07): this resolves to a real, complete job-detail page
**without** needing the `?imo=N` parameter the search page appends (tested both
with and without — identical 200 response). The page uses Schema.org `JobPosting`
microdata (`itemprop="..."` attributes, not a JSON-LD block):

| Field | Markup |
|-------|--------|
| title | `<h1 class="job-title" itemprop="title">...<span>Title</span>...</h1>` |
| company | `itemprop="hiringOrganization"` → nested `itemprop="name"` |
| **job location** | `itemprop="jobLocation"` → nested `addressLocality`/`addressRegion` meta tags |
| datePosted | `<meta itemprop="datePosted" content="2026-08-07T19:18:42" />` |
| employmentType | `<meta itemprop="employmentType" content="FULL_TIME" />` |
| description | `<div class="short-text" itemprop="description"><div class="doc-source-html">...</div></div>` — real nested HTML (`<p>`, lists), needs the depth-tracking `extractDivContent` helper |
| apply link | `<a class="apply-btn" ... onclick="enavOpenNew('/direct/i?i=<hash>&imo=N')">Apply Now</a>` — Eluta's own redirect endpoint, not the final external URL |

**Location gotcha:** the page carries a *second*, separate `itemprop="location"`
block further down, nested under `hiringOrganization` — this is the **employer's
registered/HQ address** (confirmed live: a job physically located in Waterloo,
ON showed the employer's address as Burlington, ON in this second block). Field
extraction is scoped specifically to the `itemprop="jobLocation"` block, which
appears first in document order, to avoid picking up the wrong address.

## Bot-verification challenge (confirmed live, 2026-08-07)

After a burst of requests during this skill's own build/testing, **both**
`/search?q=...` and `/spl/<id>` started returning an HTTP 200 that's actually
a transparent redirect (followed automatically by `fetch()`'s `redirect:
"follow"`) to:

```
GET https://www.eluta.ca/sandbox?destination=<original-url-encoded>
```

...a page titled "User Verification". This is not in `robots.txt` — it's
adaptive rate/velocity-based bot detection, separate from the static policy
file. It is *not* a permanent block: an id that had worked earlier in the
same session (`test-specialist-iii-50d82efaa08c83f4f6d15d940bd72ce9`, fetched
early during investigation) continued to resolve correctly even after other,
newer requests started getting challenged — so this reads as an
escalating-under-load response, not a blanket ban. A 20-second wait was not
long enough to clear it in testing; the exact cool-down window wasn't
determined.

`htmlFetch()` in `helpers.ts` detects this by checking the final response
body for `<title>User Verification` and throws a clear error instead of
letting the challenge page get silently mis-parsed as an empty/`"(untitled)"`
result — see the "Keep volume low" warning in `SKILL.md`.

## Notes

- No authentication required for either endpoint (outside of the
  bot-verification challenge above).
- The `/direct/i?i=...` apply-redirect endpoint is not disallowed by
  `robots.txt`, but this skill does not fetch/follow it — `applyUrl` is
  returned as a link for the user to open, not resolved server-side.
- `/cache?u=...` (Eluta's "see how this page looked when indexed" snapshot,
  referenced by the search-result's relative-date link) is explicitly
  disallowed by `robots.txt` and is never fetched by this skill.
