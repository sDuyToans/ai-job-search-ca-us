---
name: dice-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for tech jobs on Dice
  (dice.com), a US-based tech job board with real Canada and remote coverage
  across software engineering, QA/test automation, and IT roles. Invoke for
  open positions, vacancies, and hiring in any country or remotely. Trigger
  phrases: dice, dice.com, tech job board, find a tech job, IT jobs, software
  jobs.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/dice-search/cli/src/cli.ts *)
---

# Dice Search Skill

Search live job listings from **Dice** (dice.com), a US-based tech job board
with real Canada and remote coverage. No authentication, no API key, and
**zero runtime dependencies** — it runs with just `bun`.

## ⚠️ robots.txt compliance — read before modifying this skill

Dice's `robots.txt` **explicitly disallows its own query-string search UI**
(`Disallow: /jobs?q*`, `/jobs/?q*`). This skill **never requests that form**.
It uses two paths robots.txt does *not* disallow instead: an SEO-friendly
path-based search (`/jobs/q-<keywords>-l-<location>-jobs`) and individual job
pages (`/job-detail/<guid>`, explicitly `Allow:`d). See `url-reference.md` for
the full investigation. **If you're extending this skill, re-check
`https://www.dice.com/robots.txt` before adding any new URL pattern** —
don't assume a new path is fine just because it looks similar to an allowed
one.

## ⚠️ Personal use only

Dice offers no public API; this reads its public, robots.txt-allowed job
pages by extracting the structured data they embed for React hydration (see
`url-reference.md` — not fragile CSS-class scraping, but still automated
access to a commercial site). **Keep volume low and don't use it commercially
or for bulk data collection.** Run it on your own responsibility.

## When to use this skill

- Search tech job openings by keyword and/or location, in the US, Canada, or
  remotely
- Dice's postings skew mid-to-senior on average, but genuine junior/entry
  postings and internships do appear (e.g. "Junior Software Engineer",
  "Python Developer - Jr") — this skill doesn't pre-filter by seniority; the
  downstream fit-assessment step is what catches a mismatch
- Get the full description of a specific job listing, including skills list

## Commands

### Search job listings

```bash
bun run .agents/skills/dice-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords (title, skill, role). Builds the
  allowed `/jobs/q-<keywords>-jobs` URL.
- `--location <text>` / `-l <text>` — place string, e.g. `"Toronto, ON"`,
  `"Remote"`. Appended to the same URL
  (`/jobs/q-<keywords>-l-<location>-jobs`); works alone too
  (`/jobs/l-<location>-jobs`, no keyword).
- `--jobage <days>` — posted within N days (client-side, from each posting's
  real `postedDate`).
- `--page <n>` — 1-indexed page (Dice's own pagination, ~20 results/page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/dice-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is a job's guid (UUID) — from a search result's `id`, or a full
`https://www.dice.com/job-detail/<guid>` URL. Returns the full description,
skills list, and posted date.

**Search results carry a description field, but it's a truncated preview**
(unlike `freehire-search`/`wellfound-search`, where search already carries
the full text) — call `detail` when you need the complete posting.

## Usage examples

```bash
# Junior software engineer roles in Toronto, last 7 days
bun run .agents/skills/dice-search/cli/src/cli.ts search -q "junior software engineer" -l "Toronto, ON" --jobage 7 --format table

# QA automation roles, no location filter
bun run .agents/skills/dice-search/cli/src/cli.ts search -q "QA automation Selenium" --format table

# Browse remote roles with no keyword
bun run .agents/skills/dice-search/cli/src/cli.ts search -l "Remote" --format table

# Full details for a specific job
bun run .agents/skills/dice-search/cli/src/cli.ts detail 194b8b96-cb07-4346-8b24-cd479c1a37b2 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **This skill's search mechanism is deliberately non-obvious** — Dice's own
  search UI (`/jobs?q=...`) is robots.txt-disallowed, so this uses an SEO
  path-based URL form instead (`/jobs/q-<keywords>-jobs`). See the warning at
  the top of this file and `url-reference.md` before changing any URL
  construction here.
- Data is extracted from React Server Component "flight data" — a stream of
  `self.__next_f.push([1, "..."])` script chunks that Next.js's App Router
  uses to hydrate the page. This is structured JSON once decoded (not
  `__NEXT_DATA__`, not schema.org JSON-LD — a third pattern, different from
  both `wellfound-search`'s data sources), but it required more parsing work
  to reach than either: see `url-reference.md` for the exact chunk format,
  the balanced-object extractor, and the text-chunk back-reference mechanism
  (`"description":"$49"` -> chunk `49:T<hexlen>,<text>`).
- **Detail page has no clean `location` field** — falls back to a best-effort
  parse of the page's `og:title` meta tag (`"<Title> - <Company> - <Location>"`,
  last segment). A title containing " - " can throw this off.
- **A single job's `detail` guid is exactly its search-result `id`** — no
  compound id/slug pairing needed here (unlike `wellfound-search`, where a
  wrong slug 403s). Dice's detail URL is just `/job-detail/<guid>`.
- All endpoint and parsing details are documented in `url-reference.md`.
