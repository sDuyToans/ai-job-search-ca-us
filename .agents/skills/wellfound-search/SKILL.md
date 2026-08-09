---
name: wellfound-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs at startups on
  Wellfound (wellfound.com, formerly AngelList Talent) — a global job board
  with strong remote and early-career/internship coverage across software
  engineering, QA, product, design, marketing, and operations roles. Invoke
  for open positions, vacancies, and hiring at startups in any country or
  remotely. Trigger phrases: wellfound, angellist, angellist talent, startup
  jobs, startup job board, remote startup jobs, find a startup job.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/wellfound-search/cli/src/cli.ts *)
---

# Wellfound Search Skill

Search live job listings from **Wellfound** (wellfound.com), a global startup
job board (formerly AngelList Talent) with a strong remote-jobs and
early-career/internship footprint. No authentication, no API key, and **zero
runtime dependencies** — it runs with just `bun`.

> This is a country-agnostic worked example, like `linkedin-search` and
> `freehire-search`: no location is hard-coded, so the same skill works for a
> forker in any market. Wellfound's own geography model is different from
> either of those, though — see "Location" below.

## ⚠️ Personal use only

Wellfound offers no public API; this reads its public job pages by extracting
the structured JSON they already embed (see `url-reference.md` — not markup
scraping in the fragile sense, but still automated access to a commercial
site with no API terms covering it). **Keep volume low and don't use it
commercially or for bulk data collection.** Run it on your own responsibility.

## When to use this skill

- Search startup job openings by keyword, worldwide or remote
- Find early-career, new-grad, and internship-friendly roles — Wellfound's
  `yearsExperienceMin`/`yearsExperienceMax` fields make this checkable per
  posting, and several role categories (software engineer, QA, full-stack)
  carry meaningful internship/junior volume
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/wellfound-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords. **Not free-text search** — see
  "Role taxonomy" below. Also reused as a client-side filter over each
  result's title/description within the chosen role page.
- `--role <slug>` — skip keyword inference and use an exact Wellfound role
  slug directly (e.g. `quality-assurance`, `full-stack-developer`). Run
  `search --help` for the full confirmed-live slug list.
- `--location <text>` / `-l <text>` — **client-side soft filter** against
  each posting's location text and accepted-remote-location text. Not a
  server-side parameter — see "Location" below.
- `--jobage <days>` — posted within N days (client-side, computed from each
  posting's actual `liveStartAt` date — Wellfound has no server-side
  recency parameter on this page).
- `--page <n>` — 1-indexed page (Wellfound's own pagination, ~20 companies
  and ~20-40 job listings per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/wellfound-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` **must be the exact `"<numericId>-<slug>"` pair** — from a search
result's `id` field, or a full `https://wellfound.com/jobs/<id>-<slug>` URL.
A bare numeric ID is rejected (`BAD_ID`) rather than guessed — see "Detail ID"
below for why. Returns the full description, employment type, salary,
location type (remote/onsite), and applicant location requirements.

**Search results already carry the full description** (like
`freehire-search`) — don't loop `detail` over search hits just to read their
text; reach for `detail` only to look a specific posting up directly (e.g.
from a tracked application's saved URL).

## Usage examples

```bash
# Full-stack developer roles, last 7 days
bun run .agents/skills/wellfound-search/cli/src/cli.ts search -q "full-stack developer" --jobage 7 --format table

# QA/automation roles, soft-filtered toward Canada-friendly postings
bun run .agents/skills/wellfound-search/cli/src/cli.ts search -q "QA automation Selenium" -l "Canada" --format table

# Explicit role slug (bypasses keyword inference)
bun run .agents/skills/wellfound-search/cli/src/cli.ts search --role quality-assurance -q intern --format table

# Full details for a specific job
bun run .agents/skills/wellfound-search/cli/src/cli.ts detail 3317746-software-engineer --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use; the only format carrying each hit's description |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **Role taxonomy, not free-text search.** Wellfound's search pages are
  organized around ~40 fixed role categories (`ROLE_SLUGS` in
  `cli/src/helpers.ts`), not an open keyword index. `--query` is matched
  against a curated keyword→slug table (`inferRole`) to pick the closest
  category — e.g. "QA", "test", "SDET" → `quality-assurance`;
  "full-stack"/"fullstack" → `full-stack-developer`; anything unrecognized
  defaults to `software-engineer`. Use `--role` directly if the inferred
  category is wrong for your query.
- **Location is a client-side soft filter, not a server parameter** — same
  caveat as `jobbank-ca-search`/`eluta-search` elsewhere in this repo.
  Wellfound's own `/role/r/<slug>` pages returned `remote: true` results
  regardless of any `?remote=` param tested during investigation
  (2026-08-09); a working onsite/hybrid-only query pattern wasn't found. Many
  results still list a real HQ city in `location` even when remote-tagged, so
  `--location` filtering against that plus `acceptedRemoteLocationNames` is
  still useful, just not a hard guarantee of eligibility.
- **`--query` matches anywhere in the full description, not just the title**
  (confirmed live: a `-q junior` search surfaced a "Senior Full Stack
  Developer" posting whose body merely mentioned "mentor... junior
  engineers"). This is the same full-text-match tradeoff other portals in
  this repo make (`freehire-search`, `remoteok-search`); it isn't filtered
  further here because the downstream fit-assessment step
  (`job-scraper/SKILL.md` Step 3) already reads the actual posting text and
  caps fit based on any explicit years-of-experience statement, regardless of
  what search matched on.
- **Occasional 403s under bursty use.** Live testing (2026-08-09) saw
  intermittent 403s on both `search` and `detail` — not a fixed
  slug-mismatch case, but an apparent rate-limit/WAF condition that recovered
  within a few seconds on a plain retry. `htmlFetch` does not auto-retry 403
  (it's the deliberate signal for a mismatched detail slug — see above), so a
  403 here means: wait a few seconds and retry once, same guidance as
  `eluta-search`'s bot-verification note. Keep volume low.
- **A prior "actively bot-blocked" finding for this portal did not
  reproduce** on 2026-08-09 with a standard browser User-Agent (see
  `url-reference.md` for the full re-investigation). One real access rule
  *was* confirmed: a `/jobs/<id>-<slug>` request with a mismatched slug
  returns 403. That's why `detail`'s `id` must be the exact pair from a
  search result — see "Detail ID" above.
- Data is extracted from two structured-JSON sources Wellfound already embeds
  for SEO/hydration purposes (a Next.js `__NEXT_DATA__` Apollo cache for
  search, a schema.org `JobPosting` JSON-LD block for detail) — not fragile
  CSS-class scraping. See `url-reference.md` for both shapes and the exact
  parsing anchors to update if either changes.
- `search` returns up to ~20-40 job listings per page (grouped by ~20
  startups, each contributing 1+ highlighted listings) — not the portal's
  full result count for a role (`meta.total` reports that count; pagination
  via `--page` is required to see more of it).
- All endpoint details are documented in `url-reference.md`.
