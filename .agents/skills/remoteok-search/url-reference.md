# RemoteOK URL Reference

Public, unauthenticated JSON API used by this skill.

> `robots.txt` (`https://remoteok.com/robots.txt`) declares, for the default `*`
> user-agent group: `Content-Signal: search=yes,ai-train=no,use=reference` and
> `Allow: /`, plus `Crawl-delay: 1`. A handful of AJAX/spam paths are disallowed
> (`/*?action=get_jobs`, `/track-ad`, `/l/`, etc.) but `/api` itself is not listed.
> Investigated 2026-08-07. (Note: a later section of the same file names specific
> AI-crawler user-agents like `ClaudeBot`/`GPTBot` with different Allow/Disallow
> rules — irrelevant here since this CLI identifies with a generic browser UA and
> therefore matches the `*` group.)

## Search / list

```
GET https://remoteok.com/api
```

No query parameters affect the response — confirmed live (2026-08-07) that `?tags=`,
`?tag=`, `?id=`, and `?page=` are all silently ignored. The endpoint always returns a
JSON array: the **first element** is a `legal` notice object (no `id`/`position`
fields — filtered out by `parseJobs`), and the remaining ~100 elements are the most
recently posted jobs site-wide, newest first.

Per-job fields used by this skill:

| Field | Meaning |
|-------|---------|
| `id` | Numeric job ID |
| `slug` | URL slug (job ID is also embedded at the end) |
| `position` | Job title |
| `company` | Employer name |
| `location` | Free-text location (often blank — remote jobs frequently omit it) |
| `date` | ISO 8601 posting date |
| `url` | Canonical RemoteOK job page URL |
| `apply_url` | External apply URL (falls back to `url` when absent) |
| `tags` | Array of category/skill tags |
| `description` | Full HTML job description (contains `<br>`, `_x000D_` artifacts, HTML entities) |
| `salary_min` / `salary_max` | Numeric salary range, `0` when not listed |

**No server-side search or pagination.** Since there is nothing to query against,
`search` fetches the full snapshot once and does client-side substring matching
(all query terms must appear across title + company + tags + description) and
client-side location substring matching, then paginates the filtered result set
itself (25/page).

## Detail

There is no separate single-job endpoint — `?id=<id>` is ignored just like every
other filter param (confirmed live). `detail` re-fetches the same `/api` snapshot
and looks the id up client-side. This means `detail` only works for jobs still
present in the current ~100-job snapshot.

## Description cleanup

The `description` field is HTML, not plain text, and contains a recurring
`_x000D_` artifact (a mis-encoded Windows carriage return) sprinkled through the
markup. `cleanDescription()` in `helpers.ts` strips `_x000D_`, converts `<br>` and
block-level closing tags to newlines, strips remaining tags, and decodes entities.

## Notes

- No authentication required.
- `robots.txt` sets `Crawl-delay: 1` for the `*` group — the CLI's retry/backoff
  already spaces out retries well beyond that on error, but avoid scripting rapid
  back-to-back invocations regardless.
- The API's `legal` field (returned as the first array element) asks for a linkback
  to the job's RemoteOK URL and credit to RemoteOK as the source — an attribution
  request, not an access restriction.
