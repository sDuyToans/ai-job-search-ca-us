# /dashboard - Start or Stop the Live Job Search Dashboard

Start (or stop) a small local, read-only web server that serves a live view of `job_search_tracker.csv` and the `documents/applications/*/outcome.md` archives — the same stats, charts, and filterable table as `/html-report`, but served from `tools/dashboard_server.py` and recomputed on every page load instead of written to a static file. Leave it open in a browser tab and just refresh after `/apply` or `/outcome` change the data; no need to re-run a command. It also links directly to each application's compiled CV/cover letter PDF and shows recorded interview stages inline. `/html-report`'s static export is untouched and still useful for a one-off offline snapshot to share or archive.

## Step 0: Parse Arguments

- No argument → **start** the server on the default port (`8420`, or the next free port up to `8429` if that's taken).
- `--port N` → start on port `N` specifically (still auto-advances to find a free port from there).
- `stop` → **stop** a running server. If a port was previously reported to the user in this session, stop that one; otherwise default to `8420`. `stop --port N` stops a specific port.

---

## Step 1a: Start

Run in the background so the conversation can continue while the server keeps serving:

```bash
python3 tools/dashboard_server.py --port 8420
```

Use the Bash tool with `run_in_background: true`. The script prints the bound URL (e.g. `http://127.0.0.1:8420`) to stdout as its first line once it's listening — read that from the background task's output to confirm the actual port (it may differ from what was requested if that port was busy).

Then present:

> **Dashboard running:** `<url>`
>
> Open it in any browser — it's live, just refresh after `/apply` or `/outcome` update the data. Click through to view a compiled CV/cover letter PDF, or expand a row to see recorded interview stages.
>
> Local only — bound to `127.0.0.1`, not reachable from other devices on your network.
>
> Run `/dashboard stop` when you're done to free the port.

## Step 1b: Stop

```bash
lsof -ti tcp:<port> | xargs kill
```

Then confirm:

> **Dashboard stopped.** Port `<port>` is free.

If `lsof` finds nothing listening on that port, say so plainly rather than reporting success.

---

## Design Principles

- **Local only.** The server binds to `127.0.0.1`. Never suggest binding to `0.0.0.0` or exposing this beyond the local machine — `job_search_tracker.csv` and the application notes contain personal data.
- **Read-only.** The server never writes to the tracker, the archive, or any application folder. It only reads and renders.
- **Live, not cached.** Every page load re-reads the CSV and outcome files from disk — that is the entire point of this command over `/html-report`.
- **Coexists with `/html-report`.** That command's static, self-contained HTML export is unchanged and still the right tool for an offline snapshot to share or archive; this command is for day-to-day local viewing.
- **No fabrication.** Every number and link on the page comes directly from the CSV or an outcome file. If a CV/cover letter PDF hasn't been compiled yet, the row shows `—` instead of a broken link.
