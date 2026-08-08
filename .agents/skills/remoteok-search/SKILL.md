---
name: remoteok-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for remote jobs, remote-first
  tech roles, or fully-remote positions worldwide via RemoteOK (remoteok.com).
  Invoke for open remote positions across software, QA, and adjacent tech roles.
  Trigger phrases include: remote ok, remoteok, remote job board, remote-first
  jobs, fully remote tech jobs, remote developer jobs, remote software engineer
  jobs, work from anywhere jobs.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/remoteok-search/cli/src/cli.ts *)
---

# RemoteOK Search Skill

Search live job listings from **RemoteOK** (remoteok.com), a remote-first tech jobs
board. No authentication, no API key, and **zero runtime dependencies** — it runs
with just `bun`.

## When to use this skill

- Search for fully-remote tech roles (every posting on this site is remote)
- Find recently posted software/QA/adjacent roles at remote-friendly companies
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search, matched **client-side** against title, company, tags, and description (see Notes — the API has no server-side search).
- `--location <text>` / `-l <text>` — location text, matched client-side against the posting's location field. `"remote"` matches everything, since every posting on this site is remote.
- `--page <n>` — 1-indexed page over the filtered results (25 per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results. You may also pass a full
`remoteok.com/remote-jobs/<slug>-<id>` URL. Returns the full description, salary
(when listed), tags, and apply link.

## Usage examples

```bash
# Full-stack developer roles (React/Spring Boot)
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "full stack developer react" --format table

# QA / test automation roles
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "QA automation" --format table

# Junior / entry-level software roles
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "junior software engineer" --format table

# Full details for a specific job
bun run .agents/skills/remoteok-search/cli/src/cli.ts detail 1136279 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **Data quality varies.** RemoteOK's free feed mixes real job postings with sponsored/content-marketing entries (founder blog posts, career-guide pages, generic "Join Our Team" filler) that carry sprawling, unrelated tag lists to maximize reach — confirmed live (2026-08-07). Multi-word AND queries (e.g. `"react spring boot"`) can return zero results against the small ~100-item snapshot; prefer a single distinctive keyword per search (`-q react`, `-q selenium`) and expect to skim past a few irrelevant results. A handful of source descriptions also carry mojibake (double-encoded UTF-8, e.g. a stray `â` where an apostrophe should be) — a source-data issue this CLI doesn't attempt to repair.
- **No server-side filtering or pagination.** Live-tested (2026-08-07): `?tags=`, `?tag=`, `?id=`, and `?page=` are all silently ignored — the API always returns the same snapshot of the ~100 most recently posted jobs, full stop. This CLI fetches that snapshot once per invocation and filters/paginates it client-side. This means `search` can only ever surface roles from the current ~100-posting snapshot — it will miss older postings even if they'd otherwise match your query.
- **`detail` looks up the id within the same ~100-job snapshot** — if a job has aged out of the snapshot since you last searched, `detail` returns `NOT_FOUND`.
- **Attribution requirement**: the API response itself carries a `legal` notice — RemoteOK asks that results link back to the job's RemoteOK URL and credit RemoteOK as the source. Not a personal-use restriction, just a linkback ask.
- Every posting on this site is remote by definition — there is no on-site filter to apply.
- All endpoint details are documented in `url-reference.md`.
