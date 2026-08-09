# dice-cli

CLI for searching jobs on **Dice** (dice.com), a US-based tech job board with
real Canada and remote coverage.

**Data source**: Dice's public, robots.txt-*allowed* pages only — an
SEO-friendly path-based search (`/jobs/q-<keywords>-l-<location>-jobs`) and
individual job pages (`/job-detail/<guid>`). Dice's own query-string search UI
(`/jobs?q=...`) is explicitly robots.txt-disallowed and this CLI never
requests it. See `../url-reference.md` for the full investigation.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Dice offers no public API; this reads public,
> allowed job pages. Keep volume low, don't use it commercially or for bulk
> data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/dice-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search Dice's SEO path-based results, filtered client-side by posting age |
| `detail` | Fetch full detail (description, skills) for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Junior software engineer roles in Toronto, last 7 days
bun run src/cli.ts search -q "junior software engineer" -l "Toronto, ON" --jobage 7 --format table

# QA automation roles, no location filter
bun run src/cli.ts search -q "QA automation Selenium" --format table

# Full detail for one job (id is the guid from a search result)
bun run src/cli.ts detail 194b8b96-cb07-4346-8b24-cd479c1a37b2 --format plain
```

See `../SKILL.md` for the full flag reference and the robots.txt-compliance note.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Keywords — built into the allowed `/jobs/q-<keywords>-jobs` URL. |
| `--location` | `-l` | Place string, e.g. `"Toronto, ON"`, `"Remote"`. Works alone or combined with `--query`. |
| `--jobage` | | Posted within N days (client-side, from each posting's real date). |
| `--page` | | 1-indexed page (Dice's own pagination). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Known limitations

- **`search`'s `description` field is a truncated preview**, not the full
  text (unlike `freehire-search`/`wellfound-search`) — call `detail` for the
  complete posting.
- **`detail`'s `location` field is best-effort**, parsed from the page's
  `og:title` meta tag (no clean structured field exists for it on this page).
- Parses React Server Component "flight data" rather than a clean JSON API or
  `__NEXT_DATA__`/JSON-LD block — more involved than `wellfound-search`'s
  parsing, and the description-lookup regex is somewhat field-order-dependent.
  See `../url-reference.md` for exactly what to fix if Dice's markup changes.
