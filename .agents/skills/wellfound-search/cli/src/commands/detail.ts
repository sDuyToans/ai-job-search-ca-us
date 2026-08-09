import { htmlFetch, parseDetailPage, normalizeDetailId, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeDetailId(opts.id)
  if (!id) {
    writeError(
      `Could not parse a job ID from "${opts.id}" — detail requires the exact "<numericId>-<slug>" pair from a search result's id, or a full wellfound.com/jobs/<id>-<slug> URL`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const html = await htmlFetch(`https://wellfound.com/jobs/${id}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseDetailPage(html, id)
    if (!job) {
      writeError("Could not find JobPosting data on the page (it may have been taken down)", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.jobLocationType ? `Location type: ${job.jobLocationType}` : "",
        job.applicantLocationRequirement ? `Open to applicants in: ${job.applicantLocationRequirement}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.experienceRequirements ? `Experience: ${job.experienceRequirements}` : "",
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
