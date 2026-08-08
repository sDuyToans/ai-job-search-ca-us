import { fetchFeed, parseFeed, parseFeedRaw, cleanDescription, writeError, type JobDetail } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a raw job slug or a weworkremotely.com/remote-jobs/<slug> URL. */
function normalizeId(input: string): string {
  const m = input.match(/\/remote-jobs\/([^/?#]+)/)
  return m ? m[1] : input
}

// Try the default search category first (most detail lookups follow a search
// in this category), then the site-wide feed as a fallback for jobs from
// other categories. Both are single lightweight RSS fetches.
const LOOKUP_ORDER = ["programming", "all"] as const

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  try {
    for (const category of LOOKUP_ORDER) {
      let xml: string
      try {
        xml = await fetchFeed(category)
      } catch {
        continue // one feed being unreachable shouldn't block trying the rest
      }
      const cards = parseFeed(xml)
      const card = cards.find((c) => c.id === id)
      if (!card) continue

      const descriptionsById = parseFeedRaw(xml)
      const rawDescription = descriptionsById.get(id)?.description
      const job: JobDetail = {
        ...card,
        description: rawDescription ? cleanDescription(rawDescription) : null,
      }

      if (opts.format === "plain") {
        const lines = [
          job.title,
          `${job.company || "—"} · ${job.location || "—"}`,
          job.category ? `Category: ${job.category}` : "",
          "",
          job.description || "(no description)",
          "",
          `URL: ${job.url}`,
        ].filter((l) => l !== "")
        process.stdout.write(lines.join("\n") + "\n")
      } else {
        process.stdout.write(JSON.stringify(job, null, 2) + "\n")
      }
      return 0
    }

    writeError(
      "Job not found — checked the programming and site-wide feeds; We Work Remotely's RSS only serves each feed's current ~100 most recent postings, so this id may have aged out",
      "NOT_FOUND",
    )
    return 1
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
