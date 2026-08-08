import { API_URL, jsonFetch, parseJobs, cleanDescription, writeError, type JobDetail } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a raw job ID or a remoteok.com/remote-jobs/<slug-id> URL. */
function normalizeId(input: string): string | null {
  const url = input.match(/remote-jobs\/[^/]*-(\d+)(?:$|[/?#])/)
  if (url) return url[1]
  const bare = input.match(/^\d+$/)
  if (bare) return input
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const raw = await jsonFetch(API_URL)
    const match = raw.find((j) => j.id === id)
    if (!match) {
      writeError(
        "Job not found — RemoteOK's API only serves the current ~100 most recent postings, so this id may have aged out",
        "NOT_FOUND",
      )
      return 1
    }
    const [card] = parseJobs([match])
    const job: JobDetail = {
      ...card,
      description: match.description ? cleanDescription(match.description) : null,
      applyUrl: match.apply_url || match.url || null,
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "Remote"}`,
        job.salary ? `Salary: ${job.salary}` : "",
        job.tags.length ? `Tags: ${job.tags.join(", ")}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl && job.applyUrl !== job.url ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
