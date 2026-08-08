# eluta-cli

CLI for searching jobs on **Eluta.ca**, a Canadian job search engine that indexes
employer career pages directly.

**Data source**: Eluta.ca's public search-results and job-detail HTML pages.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/eluta-search/cli
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
# Software engineer roles in Ontario
bun run src/cli.ts search -q "software engineer" -l "Ontario" --format table

# QA automation roles in Toronto
bun run src/cli.ts search -q "QA automation selenium" -l "Toronto, ON" --format table

# Full detail for one job
bun run src/cli.ts detail test-specialist-iii-50d82efaa08c83f4f6d15d940bd72ce9 --format plain
```

See `../SKILL.md` for the full flag reference and portal quirks.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (job title, skill, or role). |
| `--location` | `-l` | Place string, e.g. `"Ontario"`, `"Toronto, ON"`. |
| `--page` | | 1-indexed page (10 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
