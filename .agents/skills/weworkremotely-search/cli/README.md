# weworkremotely-cli

CLI for searching jobs on **We Work Remotely**, a remote-jobs board.

**Data source**: We Work Remotely's public per-category RSS feeds.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/weworkremotely-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (client-side keyword/location filtering) |
| `detail` | Fetch full detail for a single job listing (re-queries the RSS feed — HTML job pages are Cloudflare-protected) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# React roles in the default "programming" category
bun run src/cli.ts search -q react --format table

# Selenium/QA-flavored roles in the full-stack category
bun run src/cli.ts search -q selenium -c full-stack --format table

# Full detail for one job
bun run src/cli.ts detail some-company-senior-engineer --format plain
```

See `../SKILL.md` for the full flag reference and available categories.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords, matched client-side against title, company, category, description. |
| `--location` | `-l` | Region text, matched client-side. |
| `--category` | `-c` | `programming` (default) \| `full-stack` \| `backend` \| `frontend` \| `devops` \| `all`. |
| `--page` | | 1-indexed page over the filtered results (25/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
