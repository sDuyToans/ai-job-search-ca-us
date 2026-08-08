---
name: jobbank-ca-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs, positions, or career
  opportunities anywhere in Canada via the Government of Canada Job Bank
  (jobbank.gc.ca) — a strong source for co-op, student, new-grad, and entry-level
  postings. Invoke for open positions, vacancies, and hiring across any sector or
  role, filtered by keyword, location, or posting date. Trigger phrases include:
  job bank, jobbank.gc.ca, government of canada job bank, canada job search,
  find a job canada, co-op jobs canada, student jobs canada, new grad jobs canada,
  entry level jobs canada, emplois canada, banque d'emplois, recherche d'emploi
  canada.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts *)
---

# Job Bank Canada Search Skill

Search live job listings from the **Government of Canada Job Bank** (jobbank.gc.ca) —
Canada's federal job board, aggregating postings from employers and partner sites
(including many from Indeed, company career pages, and direct employer submissions).
No authentication, no API key, and **zero runtime dependencies** — it runs with just `bun`.

> This is a Canada-specific portal skill. Per repo policy it lives in this fork rather
> than being merged upstream (see `linkedin-search` for the country-agnostic worked
> example this was scaffolded from).

## When to use this skill

- Search for job openings anywhere in Canada, by keyword and/or location
- Filter by recency (posted within 2 days / 30 days)
- Find co-op, student, new-grad, and entry-level postings — Job Bank surfaces these well
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, or role). Recommended.
- `--location <text>` / `-l <text>` — place string, e.g. `"Toronto, ON"`, `"Ontario"`, `"Mississauga"`. **Best-effort match** — see Notes.
- `--jobage <days>` — posted within N days. Job Bank only supports coarse tiers: `<=2` maps to the last 2 days, `<=30` maps to the last 30 days, anything larger applies no date filter (see Notes).
- `--page <n>` — page number (1-indexed, 25 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `49974739`). You may also pass a
full `jobsearch/jobposting/<id>` URL. Returns the full description, employment type,
workplace type (on-site/hybrid/remote), salary, and — when the posting originated from
an external site — the external apply link.

## Usage examples

```bash
# Software engineer intern roles in Ontario
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search -q "software engineer intern" -l "Ontario" --format table

# Full-stack developer co-op, any location, last 30 days
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search -q "full-stack developer co-op" --jobage 30 --format table

# QA automation roles in the Greater Toronto Area
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search -q "QA automation Selenium" -l "Greater Toronto Area" --format table

# Full details for a specific job
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts detail 49974739 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from Job Bank's public `jobsearch` HTML pages — no credentials required.
- Page size is fixed at 25 results per page. The JSON `meta.total` field gives the true result count across all pages.
- `--location` does **soft/fuzzy matching**, not a strict filter — Job Bank's own search page shows the same behavior (a location like "Ontario" biases results toward Ontario but can still include other provinces). Treat it as a ranking hint, not a hard filter, and sanity-check the `location` field on results.
- `--jobage` only has two real tiers on this portal (last 2 days, last 30 days) — there is no continuous day-count parameter like LinkedIn's. Values above 30 apply no date filter at all rather than erroring.
- Job Bank's `robots.txt` sets `Crawl-delay: 5`; the CLI does not enforce this internally (each invocation issues at most two requests), but avoid scripting rapid back-to-back invocations.
- Not every posting has an external `applyUrl` — some are submitted directly to Job Bank without a source site, in which case `applyUrl` is `null` and applying happens through a Job Bank account (out of scope for this CLI).
- All filter/field details are documented in `url-reference.md`.
