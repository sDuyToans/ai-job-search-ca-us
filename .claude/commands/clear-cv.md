# /clear-cv - Delete Working Files for Closed Applications

You are cleaning up `applications/` - deleting the working CV/cover-letter folder for applications that are closed with a negative outcome, so the folder only holds live or open candidates. This is a convenience cleanup, not a record-keeping action: the permanent submitted-materials archive at `documents/applications/<company>_<role>/` (maintained by `/outcome`, mined by `/setup` for fit-framework calibration) is never touched by this command, regardless of what gets cleared here.

**This command is destructive to `applications/` folders.** Nothing is deleted until the user explicitly confirms. Follow these steps exactly in order.

---

## Step 0: Parse Arguments

`$ARGUMENTS` may contain:

- Nothing → scan every tracked application for the default closed-negative statuses (Step 1)
- A company name, e.g. `/clear-cv acme` → target only that application's folder, regardless of its tracker status (Step 1 still runs to show its current status, but the confirmation step warns if the status is not closed-negative)
- `--status <list>`, e.g. `/clear-cv --status rejected,withdrawn` → override which statuses count as clearable for this run

**Default clearable statuses:** `rejected`, `no response`, `offer declined`, `withdrawn`. Deliberately excludes `hired` (never auto-delete the folder for the job the user got), and excludes every open status (`applied`, `interview`, `offer`) - those are live pipeline, not closed.

---

## Step 1: Identify Candidates

1. Read `job_search_tracker.csv`. If it does not exist or has no rows, say so and stop.
2. Read `applications/` (Glob `applications/*/*/`) to see which company folders actually exist on disk, nested one level under each date folder.
3. For each tracker row whose `status` matches the clearable set (default or `--status` override):
   - Derive the folder from the row's `cv_file` column, which already carries the date (e.g. `applications/2026-08-02/acme_swe/cv.tex` → folder `applications/2026-08-02/acme_swe/`). If `cv_file` is empty, skip the row with a note - there is nothing on disk to clear for it.
   - If the folder does not exist on disk, skip silently (already cleared in an earlier run).
4. **With a company argument:** narrow to tracker rows matching that company (case-insensitive). If the company has no tracker row at all, check for a matching company folder by globbing `applications/*/<slug>/` - the date is not known in advance for an untracked draft. If exactly one match is found, include it as an "untracked" candidate (the user may be clearing a draft they decided not to pursue, which never went through `/outcome`); if more than one date folder matches the same slug, list all matches in the preview and let the user pick. Flag untracked candidates clearly; they carry no status to validate against.
5. If no candidates remain, say so (e.g. "No closed applications with a working folder to clear - run `/outcome` first if a status needs recording.") and stop.

---

## Step 2: Present What Will Be Cleared

```
## /clear-cv - Folders to Delete

| Company | Role | Status | Folder | Resolved |
|---------|------|--------|--------|----------|
| Acme | SWE | rejected | applications/2026-07-05/acme_swe/ | 2026-07-20 |

[If any untracked candidates:]
### Untracked (no tracker row - matched by name only)
| Folder | Last modified |
|--------|---------------|
| applications/2026-08-01/foo_bar/ | 2026-08-01 |

Each folder's cv.pdf, cover_letter.pdf, and source files will be permanently deleted.
The permanent archive at documents/applications/<company>_<role>/ is NOT affected - it stays for fit-framework calibration regardless of outcome.

Reply "yes" / "clear all" to delete everything listed, or list which to keep (e.g. "keep 2").
```

If the list is empty after Step 1, this step is skipped (Step 1 already stopped).

---

## Step 3: Wait for Confirmation

Do not delete anything before an explicit reply.

- "yes" / "clear all" / equivalent → every row proceeds to Step 4.
- A partial reply, e.g. "keep 2" or "clear only acme" → only the specified rows proceed.
- "no" / decline → nothing is deleted; stop and confirm no changes were made.

---

## Step 4: Delete Confirmed Folders

For each confirmed folder:

```bash
rm -rf applications/<YYYY-MM-DD>/<company>_<role>/
```

Never use a wildcard or glob that could match more than the specific confirmed folder. Never touch `documents/applications/**`, `cv/main_example.tex`, `cover_letters/cover.cls`, or `cover_letters/OpenFonts/` - those are shared framework assets, not per-application working files.

---

## Step 5: Confirm What Was Done

```
## /clear-cv - Done

### Cleared
- applications/2026-07-05/acme_swe/ (rejected 2026-07-20)

### Kept
- applications/2026-07-10/globex_qa/ (interview - still open, not offered for clearing)

Permanent archives for cleared applications remain at documents/applications/<company>_<role>/ - unaffected.
```

If nothing was actually deleted (all skipped or declined), say so plainly instead of an empty "Cleared" section.

---

## Important Rules

1. **Never delete `documents/applications/**`.** That is the permanent record `/setup` calibrates from; a rejection is calibration signal, not clutter.
2. **Never delete without an explicit confirmation reply for that specific run.** A prior approval does not carry over to a later `/clear-cv` invocation.
3. **`hired` is never in the default clearable set.** If the user explicitly names a hired application with `--status`, still show it in the preview so they see exactly what they are about to remove before confirming.
4. **Read status from `job_search_tracker.csv`, never from a folder's own `README.md`.** The tracker is the live source of truth; a folder's README is a snapshot that can go stale.
5. **Untracked folders require a company argument.** Never sweep up folders with no tracker row during a no-argument run - only an explicit `/clear-cv <company>` may target one, and it must be flagged as untracked in the preview.
