---
name: weworkremotely-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for remote jobs via We Work
  Remotely (weworkremotely.com). Invoke for open remote positions across
  programming, full-stack, back-end, front-end, and DevOps/sysadmin roles.
  Trigger phrases include: we work remotely, weworkremotely, WWR jobs, remote
  programming jobs, remote full-stack jobs, remote back-end jobs, remote
  front-end jobs, remote devops jobs.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/weworkremotely-search/cli/src/cli.ts *)
---

# We Work Remotely Search Skill

Search live job listings from **We Work Remotely** (weworkremotely.com), a
long-running remote-jobs board. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`.

## When to use this skill

- Search for remote programming/full-stack/back-end/front-end/DevOps roles
- Browse the site-wide feed for adjacent remote roles outside programming
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search, matched **client-side** against title, company, category, and description (the RSS feeds have no query parameter — see Notes).
- `--location <text>` / `-l <text>` — region text, matched client-side. Most postings are `"Anywhere in the World"`; some restrict to a specific country.
- `--category <name>` / `-c <name>` — which category feed to search: `programming` (default), `full-stack`, `backend`, `frontend`, `devops`, or `all` (site-wide, every category — much noisier, includes sales/marketing/design/finance roles).
- `--page <n>` — 1-indexed page over the filtered results (25 per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the URL slug from `search` results (e.g. `some-company-senior-engineer`).
You may also pass a full `weworkremotely.com/remote-jobs/<slug>` URL. Returns the
full description and category. **Re-queries the RSS feed rather than fetching the
job's HTML page** — see Notes.

## Usage examples

```bash
# React roles
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search -q react --format table

# Full-stack roles mentioning Spring Boot
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search -q "spring boot" -c full-stack --format table

# QA/testing-flavored roles (no dedicated QA category — search within programming)
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search -q selenium --format table

# Full details for a specific job
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts detail some-company-senior-engineer --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **Individual job-detail HTML pages are Cloudflare-protected.** Live-tested (2026-08-07): fetching a job's `weworkremotely.com/remote-jobs/<slug>` page directly returns a 403 "Just a moment..." JS challenge page for a plain HTTP client. The RSS feeds themselves are unprotected and already carry the full HTML description, so `detail` re-fetches the relevant feed and looks the job up by its URL slug instead of touching the blocked HTML path.
- **No server-side search, filtering, or pagination.** Each category RSS feed always returns that category's ~100 most recent postings, full stop — confirmed live (2026-08-07). `search` and `detail` both filter/look up client-side against that snapshot.
- **`detail` checks the `programming` feed first, then the site-wide `all` feed** as a fallback, since a job could be from a category outside programming. If a job has aged out of both snapshots, `detail` returns `NOT_FOUND`.
- **There is no dedicated QA/testing category** — `remote-quality-assurance-jobs` 404s/redirects. QA roles on this site are typically tagged under `Full-Stack Programming` or appear in the `all` feed; search by keyword (e.g. `-q selenium`) within `programming` or `all` instead.
- Data quality is notably cleaner than some other free aggregators — live testing turned up real companies (Reddit, Airbnb, Coinbase, Toptal, Descript) with no obvious spam/content-marketing entries in the sampled feed.
- All endpoint details are documented in `url-reference.md`.
