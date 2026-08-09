import { htmlFetch, parseSearchPage, inferRole, locationHaystack, writeError, type JobResult } from "../helpers.js"

export interface SearchOpts {
  query?: string
  role?: string // explicit Wellfound role-taxonomy slug override
  location?: string // client-side soft filter
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function withinJobage(dateIso: string | null, jobage: number): boolean {
  if (!dateIso || jobage >= 9999) return true
  const ageMs = Date.now() - new Date(dateIso).getTime()
  return ageMs <= jobage * 86400 * 1000
}

/** AND-match: every word in `query` must appear somewhere in title/description. */
function matchesQuery(job: JobResult, query: string): boolean {
  const haystack = `${job.title} ${job.description || ""}`.toLowerCase()
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => haystack.includes(w))
}

function renderTable(jobs: JobResult[]): string {
  if (jobs.length === 0) return "No results."
  const rows = jobs.map((j) => {
    const title = (j.title || "").slice(0, 40).padEnd(40)
    const company = (j.company || "—").slice(0, 24).padEnd(24)
    const loc = (j.location || "—").slice(0, 22).padEnd(22)
    const date = j.date ? j.date.slice(0, 10) : "—"
    return `${j.id.padEnd(28)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(28) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(22) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const role = opts.role || inferRole(opts.query)
    const url = `https://wellfound.com/role/r/${role}?page=${opts.page}`
    const html = await htmlFetch(url)
    const page = parseSearchPage(html)

    let jobs = page.results
    if (opts.query) jobs = jobs.filter((j) => matchesQuery(j, opts.query!))
    if (opts.location) {
      const needle = opts.location.toLowerCase()
      jobs = jobs.filter((j) => locationHaystack(j).includes(needle))
    }
    jobs = jobs.filter((j) => withinJobage(j.date, opts.jobage))
    if (opts.limit !== undefined && opts.limit >= 0) jobs = jobs.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(jobs) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        jobs
          .map(
            (j) =>
              `${j.title}\n  ${j.company || "—"} · ${j.location || "—"} · ${j.date ? j.date.slice(0, 10) : "—"}\n  id: ${j.id}\n  ${j.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: { count: jobs.length, page: opts.page, role, total: page.totalJobCount, pageCount: page.pageCount },
            results: jobs,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
