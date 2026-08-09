# wellfound-cli

CLI for searching jobs on **Wellfound** (wellfound.com), a global startup job
board with strong remote and early-career coverage.

**Data source**: two public HTML page types, each carrying structured JSON
Wellfound already embeds for SEO/hydration — no scraping of rendered markup.
See `../url-reference.md` for the full investigation notes.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Wellfound offers no public API; this reads public job
> pages. Keep volume low, don't use it commercially or for bulk data
> collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/wellfound-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search a Wellfound role category, filtered client-side by keyword/location/age |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Full-stack roles, last 7 days
bun run src/cli.ts search -q "full-stack developer" --jobage 7 --format table

# QA/automation roles, filtered to Canada-friendly postings
bun run src/cli.ts search -q "QA automation" -l "Canada" --format table

# Bypass keyword inference with an exact role slug
bun run src/cli.ts search --role software-engineer -q intern --format table

# Full detail for one job (id is "<numericId>-<slug>", from a search result)
bun run src/cli.ts detail 3317746-software-engineer --format plain
```

See `../SKILL.md` for the full flag reference, role taxonomy, and known limitations.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords — inferred against Wellfound's role taxonomy to pick a page, then reused as a client-side filter. |
| `--role` | | Exact Wellfound role slug, bypassing inference (see `ROLE_SLUGS` in `src/helpers.ts`). |
| `--location` | `-l` | Client-side soft filter against location text. Not a server-side filter. |
| `--jobage` | | Posted within N days (client-side). |
| `--page` | | 1-indexed page (Wellfound's own pagination). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Known limitations

- **Fixed role taxonomy, not free-text search.** Wellfound's `/role/r/<slug>`
  pages cover ~40 broad categories (see `ROLE_SLUGS`); `--query` picks the
  closest one via keyword inference, then filters within it. A query with no
  matching category falls back to `software-engineer`.
- **Remote-focused.** The `/role/r/<slug>` pages this CLI reads returned
  `remote: true` results regardless of any `?remote=` param tested during
  investigation (2026-08-09) — a working onsite/hybrid-only query pattern
  was not found. Many results still carry a real HQ city in `location`.
- **`--location` is a client-side soft filter**, not a server parameter — same
  caveat as `jobbank-ca-search`/`eluta-search` elsewhere in this repo.
