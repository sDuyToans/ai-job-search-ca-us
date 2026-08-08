# We Work Remotely URL Reference

Public, unauthenticated RSS endpoints used by this skill.

> `robots.txt` (`https://weworkremotely.com/robots.txt`) sets `Allow: /` with only
> account/admin paths disallowed (`/admin/`, `/account/`, `/job-seekers/account/`,
> `/job-seekers/profile/`, `/manage-company/`, edit/cancel token URLs). RSS and
> individual job pages are not disallowed by robots.txt. Investigated 2026-08-07.

## Search (RSS feeds)

```
GET https://weworkremotely.com/categories/<slug>.rss
```

Confirmed-live category slugs (2026-08-07), each returning ~100 items:

| CLI `--category` value | Feed slug |
|---|---|
| `programming` (default) | `remote-programming-jobs` |
| `full-stack` | `remote-full-stack-programming-jobs` |
| `backend` | `remote-back-end-programming-jobs` |
| `frontend` | `remote-front-end-programming-jobs` |
| `devops` | `remote-devops-sysadmin-jobs` |
| `all` | `remote-jobs` (site-wide, not category-scoped) |

`remote-quality-assurance-jobs` returned a 301 redirect (not a working feed) — there
is no dedicated QA category on this site.

No query parameters affect these feeds — they are static per-URL. `search` fetches
the selected feed and does client-side substring matching.

### RSS item structure

Each `<item>` contains:

| Tag | Meaning |
|-----|---------|
| `<title>` | `"Company: Position"` — always this exact `": "` separator, confirmed across 100 sampled items |
| `<link>` / `<guid>` | Canonical job URL, `https://weworkremotely.com/remote-jobs/<slug>` — the slug is used as this skill's job id |
| `<region>` | Location text, almost always `"Anywhere in the World"`; some postings restrict to a country |
| `<category>` | e.g. `Full-Stack Programming`, `Product`, `Sales and Marketing`, `All Other Remote` |
| `<pubDate>` | RFC 822 date |
| `<description>` | Full job description as XML-entity-escaped HTML (e.g. `&lt;p&gt;...&lt;/p&gt;`, with `&amp;nbsp;` etc inside) |

## Detail

There is **no working unauthenticated HTML detail endpoint**. Confirmed live
(2026-08-07): `GET https://weworkremotely.com/remote-jobs/<slug>` returns
**HTTP 403** with a Cloudflare "Just a moment..." challenge page for a plain
`fetch()`/`curl` request — this is an active bot-protection block, not a
robots.txt policy signal, and there's no zero-dependency way around a live
Cloudflare challenge.

Since the RSS `<description>` field already carries the full job description,
`detail` works around this entirely by re-fetching the `programming` feed (then
falling back to `all`) and looking the job up by its slug, reusing the same
parsing path as `search`. No HTML page is ever fetched.

## Description decoding

RSS descriptions are XML-entity-escaped HTML. `extractTag()` in `helpers.ts`
resolves the escaping with a single `decodeHtmlEntities()` pass — because the
entity chain `&amp;nbsp;` → `&nbsp;` → `" "` fully resolves within that function's
own sequential `.replace()` steps, one call is sufficient to reach real HTML markup
(`<p>`, `<strong>`, resolved spaces). `cleanDescription()` (used only by `detail`)
then strips the now-real tags and converts block-level closers/`<br>` to newlines.

## Notes

- No authentication required for the RSS feeds.
- No `Crawl-delay` specified in `robots.txt` — the CLI's retry/backoff still spaces
  out retries on error; avoid scripting rapid back-to-back invocations regardless.
- Each feed is capped at ~100 items with no pagination parameter — same class of
  limitation as RemoteOK's API.
