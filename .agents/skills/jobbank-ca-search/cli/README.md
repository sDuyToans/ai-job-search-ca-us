# jobbank-ca-cli

CLI for searching jobs on the **Government of Canada Job Bank** (jobbank.gc.ca),
across any sector and region in Canada.

**Data source**: Job Bank's public `jobsearch` HTML pages.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/jobbank-ca-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Software engineer intern roles in Ontario
bun run src/cli.ts search -q "software engineer intern" -l "Ontario" --format table

# QA automation roles, posted in the last 30 days
bun run src/cli.ts search -q "QA automation" --jobage 30 --format table

# Full detail for one job
bun run src/cli.ts detail 49974739 --format plain
```

See `../SKILL.md` for the full flag reference and portal quirks.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). |
| `--location` | `-l` | Place string, e.g. `"Toronto, ON"` or `"Ontario"`. Best-effort match, not a strict filter. |
| `--jobage` | | Posted within N days. Coarse tiers only: `<=2` -> last 2 days, `<=30` -> last 30 days, otherwise no filter. |
| `--page` | | 1-indexed page (25 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
