#!/usr/bin/env bun
// Self-contained CLI for searching Wellfound (wellfound.com), a global startup
// job board. No external CLI framework, zero runtime dependencies, so it runs
// anywhere `bun` is available with nothing installed beyond the repo clone.
//
// Personal use only. This reads Wellfound's public job pages; no API is
// offered, so this is HTML scraping (of embedded JSON, not rendered markup —
// see helpers.ts). Keep volume low and do not use it commercially or for bulk
// data collection. Run it on your own responsibility.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { ROLE_SLUGS } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `wellfound-cli — search jobs on Wellfound (global startup job board, remote-focused)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, role). Matched against
                          Wellfound's fixed role taxonomy to pick a results
                          page (best-effort inference), then used again as a
                          client-side keyword filter within that page.
  --role <slug>           Skip inference; use an exact Wellfound role slug
                          directly (e.g. "quality-assurance"). See ROLE SLUGS.
  --location, -l <text>   Client-side soft filter against each posting's
                          location / accepted-remote-location text. Not a
                          server-side filter — see Notes in SKILL.md.
  --jobage <days>         Posted within N days (client-side, from each
                          posting's actual date). Default: all.
  --page <n>              1-indexed page (Wellfound's own pagination). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

ROLE SLUGS (confirmed live; --role accepts any of these)
  ${ROLE_SLUGS.join(", ")}

EXAMPLES
  bun run src/cli.ts search -q "full-stack developer" --jobage 7 --format table
  bun run src/cli.ts search -q "QA automation" -l "Canada" --format table
  bun run src/cli.ts search --role software-engineer -q intern --format table
  bun run src/cli.ts detail 3317746-software-engineer --format plain

Personal use only — Wellfound offers no public API; keep volume low and do not
use this commercially or for bulk data collection.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
        return null
      }
      return val
    }

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const role = typeof flags.role === "string" ? flags.role : undefined
    if (role && !(ROLE_SLUGS as readonly string[]).includes(role)) {
      process.stderr.write(
        JSON.stringify({
          error: `--role "${role}" is not a confirmed Wellfound role slug. Known slugs: ${ROLE_SLUGS.join(", ")}`,
          code: "BAD_ARG",
        }) + "\n",
      )
      return 1
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      role,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
