---
name: eluta-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs anywhere in Canada
  via Eluta.ca, a Canadian job search engine that indexes employer career pages
  directly. Invoke for open positions, vacancies, and hiring across any sector
  or role, filtered by keyword and location. Trigger phrases include: eluta,
  eluta.ca, canadian job search engine, canada job search, find a job canada.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/eluta-search/cli/src/cli.ts *)
---

# Eluta.ca Search Skill

Search live job listings from **Eluta.ca**, a Canadian job search engine that
indexes employer career pages directly (many results ultimately come from
company ATS platforms — e.g. Workday — that Eluta has crawled). No
authentication, no API key, and **zero runtime dependencies** — it runs with
just `bun`.

## ⚠️ Keep volume low

Eluta has adaptive bot-detection that redirects requests to a `/sandbox`
"User Verification" challenge page after a burst of automated requests —
confirmed live (2026-08-07) during this skill's own testing, on *both*
`search` and `detail`. It is not permanent and not IP-banning — normal,
spaced-out personal job-search usage (a handful of searches, not a scripted
loop) works fine. If a command fails with a "bot-verification challenge"
error, wait a while before retrying rather than immediately re-running it.

## When to use this skill

- Search for job openings anywhere in Canada, by keyword and/or location
- Get the full description of a specific job listing, including employer,
  employment type, posted date, and an apply link

## Commands

### Search job listings

```bash
bun run .agents/skills/eluta-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, or role). Recommended.
- `--location <text>` / `-l <text>` — place string, e.g. `"Ontario"`, `"Toronto, ON"`.
- `--page <n>` — page number (1-indexed, 10 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/eluta-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the slug-hash string from `search` results (e.g.
`test-specialist-iii-50d82efaa08c83f4f6d15d940bd72ce9`). You may also pass a
full `eluta.ca/spl/<id>` URL. Returns the full description, employment type,
absolute posted date, and — when Eluta's own redirect endpoint is present —
an apply link.

## Usage examples

```bash
# Software engineer roles in Ontario
bun run .agents/skills/eluta-search/cli/src/cli.ts search -q "software engineer" -l "Ontario" --format table

# QA automation roles in Toronto
bun run .agents/skills/eluta-search/cli/src/cli.ts search -q "QA automation selenium" -l "Toronto, ON" --format table

# Full-stack developer, remote-friendly
bun run .agents/skills/eluta-search/cli/src/cli.ts search -q "full-stack developer React" --format table

# Full details for a specific job
bun run .agents/skills/eluta-search/cli/src/cli.ts detail test-specialist-iii-50d82efaa08c83f4f6d15d940bd72ce9 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from Eluta.ca's public search-results and job-detail HTML pages — no credentials required.
- **On the search-results page, job title/employer links use JS `onclick` navigation** (`href="#!"`) rather than plain `<a href>` links — this skill instead uses the `data-url="spl/<id>"` attribute on each result card to construct a directly-fetchable `/spl/<id>` detail URL, confirmed live to work without needing the `?imo=` tracking parameter the site itself appends.
- Page size is fixed at 10 results per page.
- The search-results `date` field is **relative text** (e.g. `"1 hour ago"`) — the detail page's `datePosted` field is the absolute ISO date instead.
- **Location filtering is Eluta's own relevance-weighted matching**, not necessarily a hard filter — treat it the same as the other soft-location-match portals in this repo (sanity-check the `location` field on results).
- `applyUrl` on `detail` points to Eluta's own `/direct/i?...` redirect endpoint (which forwards to the actual employer/ATS apply page when opened in a browser), not the final external URL directly — this skill does not follow that redirect server-side.
- **Bot-verification challenge:** both `htmlFetch` targets (`/search` and `/spl/<id>`) can redirect to a `/sandbox?destination=...` "User Verification" page under request bursts (see the warning above). The CLI detects this by checking the final response body's `<title>` and raises a clear error (`code: "SEARCH_FAILED"` / `"DETAIL_FAILED"`) instead of silently returning an empty/`"(untitled)"` result.
- All endpoint details are documented in `url-reference.md`.
