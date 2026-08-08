# remoteok-cli

CLI for searching jobs on **RemoteOK**, a remote-first tech jobs board.

**Data source**: RemoteOK's public `/api` endpoint.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Attribution requirement** (from the API's own `legal` field): when displaying
> results, link back to the job's RemoteOK URL and credit RemoteOK as the source.

## Installation

```bash
cd .agents/skills/remoteok-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (client-side keyword/location filtering) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Full-stack developer roles
bun run src/cli.ts search -q "full stack developer react" --format table

# QA automation roles
bun run src/cli.ts search -q "QA automation" --format table

# Full detail for one job
bun run src/cli.ts detail 1136279 --format plain
```

See `../SKILL.md` for the full flag reference and the API's real behavior (no
server-side filtering, no pagination, ~100-job snapshot).

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords, matched client-side against title, company, tags, description. |
| `--location` | `-l` | Location text, matched client-side. `"remote"` matches everything. |
| `--page` | | 1-indexed page over the filtered results (25/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
