import { htmlFetch, parseDetailPage, normalizeGuid, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const guid = normalizeGuid(opts.id)
  if (!guid) {
    writeError(
      `Could not parse a job guid from "${opts.id}" — detail requires a search result's id (a UUID), or a full dice.com/job-detail/<guid> URL`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const html = await htmlFetch(`https://www.dice.com/job-detail/${guid}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseDetailPage(html, guid)
    if (!job) {
      writeError("Could not find job data on the page (it may have been taken down)", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.date ? `Posted: ${job.date.slice(0, 10)}` : "",
        job.skills.length ? `Skills: ${job.skills.join(", ")}` : "",
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
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
