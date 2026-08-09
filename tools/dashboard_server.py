#!/usr/bin/env python3
"""Local, read-only, live dashboard for job_search_tracker.csv.

Re-reads job_search_tracker.csv and documents/applications/*/outcome.md on
every page load (no caching, no generated files) so the page just needs a
browser refresh after /apply or /outcome update the data. Binds to
127.0.0.1 only. See .claude/commands/dashboard.md for the slash command
that starts/stops this, and .claude/commands/html-report.md for the
static-export sibling this intentionally duplicates the rendering spec of.
"""

import argparse
import csv
import html
import re
import socket
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = REPO_ROOT / "job_search_tracker.csv"
ARCHIVE_DIR = REPO_ROOT / "documents" / "applications"
ALLOWED_FILE_ROOTS = [
    (REPO_ROOT / "applications").resolve(),
    (REPO_ROOT / "documents" / "applications").resolve(),
]

STATUS_BUCKETS = {
    "applied": "Active",
    "interview": "Interview",
    "offer": "Offer",
    "hired": "Hired",
    "rejected": "Rejected/Closed",
    "no_response": "Rejected/Closed",
    "no response": "Rejected/Closed",
    "offer_declined": "Rejected/Closed",
    "interview_only": "Rejected/Closed",
    "withdrawn": "Rejected/Closed",
}
BUCKET_ORDER = ["Active", "Interview", "Offer", "Hired", "Rejected/Closed"]
INTERVIEW_STAGE_NAMES = [
    "Phone screen",
    "Technical interview",
    "Case interview",
    "Final round",
    "Offer received",
]


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


# ---------------------------------------------------------------------------
# Data loading (re-run on every request; this is what makes the page "live")
# ---------------------------------------------------------------------------

def load_rows():
    if not CSV_PATH.exists():
        return []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_archives():
    """Parse documents/applications/*/outcome.md into a lookup keyed by
    normalized (company, role), each holding status + checked interview
    stages, sourced from the '# Outcome: Company — Role' header line and
    the '- [x] Stage' checkboxes."""
    archives = {}
    if not ARCHIVE_DIR.is_dir():
        return archives
    header_re = re.compile(r"^#\s*Outcome:\s*(.+?)\s+[—-]\s+(.+?)\s*$")
    stage_re = re.compile(r"^- \[(x|X| )\]\s*(.+?)\s*$")
    for outcome_path in sorted(ARCHIVE_DIR.glob("*/outcome.md")):
        text = outcome_path.read_text(encoding="utf-8", errors="replace")
        company = role = None
        checked_stages = set()
        for line in text.splitlines():
            m = header_re.match(line)
            if m:
                company, role = m.group(1), m.group(2)
                continue
            m = stage_re.match(line)
            if m and m.group(1).lower() == "x":
                checked_stages.add(m.group(2))
        if company and role:
            archives[(norm(company), norm(role))] = {
                "folder": outcome_path.parent.name,
                "checked_stages": checked_stages,
            }
    return archives


def match_archive(row, archives):
    key = (norm(row.get("company")), norm(row.get("role")))
    if key in archives:
        return archives[key]
    # loose fallback: company matches and one role string contains the other
    for (a_company, a_role), info in archives.items():
        if a_company == key[0] and key[1] and (key[1] in a_role or a_role in key[1]):
            return info
    return None


def pdf_link(tracker_relpath):
    """cv_file/cover_letter_file point at .tex sources; the compiled .pdf
    lives alongside it in applications/<date>/<company>_<role>/."""
    if not tracker_relpath:
        return None
    pdf_rel = re.sub(r"\.tex$", ".pdf", tracker_relpath.strip())
    if (REPO_ROOT / pdf_rel).is_file():
        return pdf_rel
    return None


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def build_records():
    archives = load_archives()
    records = []
    for row in load_rows():
        raw_status = (row.get("status") or "").strip().lower()
        bucket = STATUS_BUCKETS.get(raw_status, "Rejected/Closed")
        archive = match_archive(row, archives)
        checked = archive["checked_stages"] if archive else set()
        reached_interview = bucket in ("Interview", "Offer", "Hired") or bool(
            checked & {"Phone screen", "Technical interview", "Case interview", "Final round"}
        ) or raw_status == "interview_only"
        reached_offer = bucket in ("Offer", "Hired") or "Offer received" in checked or raw_status == "offer_declined"
        reached_hired = bucket == "Hired"
        records.append({
            "row": row,
            "bucket": bucket,
            "archive": archive,
            "checked_stages": checked,
            "reached_interview": reached_interview,
            "reached_offer": reached_offer,
            "reached_hired": reached_hired,
            "cv_pdf": pdf_link(row.get("cv_file")),
            "cover_pdf": pdf_link(row.get("cover_letter_file")),
        })
    return records


def compute_stats(records):
    total = len(records)
    by_bucket = {b: 0 for b in BUCKET_ORDER}
    by_sector = {}
    by_channel = {}
    for rec in records:
        by_bucket[rec["bucket"]] += 1
        sector = (rec["row"].get("sector") or "").strip() or "Unspecified"
        channel = (rec["row"].get("channel") or "").strip() or "Unspecified"
        by_sector[sector] = by_sector.get(sector, 0) + 1
        by_channel[channel] = by_channel.get(channel, 0) + 1

    funnel = {
        "Applied": total,
        "Interview": sum(1 for r in records if r["reached_interview"]),
        "Offer": sum(1 for r in records if r["reached_offer"]),
        "Hired": sum(1 for r in records if r["reached_hired"]),
    }
    resolved = total - by_bucket["Active"]
    rejection_rate = (by_bucket["Rejected/Closed"] / resolved * 100) if resolved else 0.0
    funnel_rate = (funnel["Interview"] / total * 100) if total else 0.0

    return {
        "total": total,
        "by_bucket": by_bucket,
        "by_sector": dict(sorted(by_sector.items(), key=lambda kv: -kv[1])),
        "by_channel": dict(sorted(by_channel.items(), key=lambda kv: -kv[1])),
        "funnel": funnel,
        "rejection_rate": rejection_rate,
        "funnel_rate": funnel_rate,
    }


# ---------------------------------------------------------------------------
# Color — see the dataviz skill (references/color-formula.md, palette.md).
# Pipeline stage (Active/Interview/Offer/Hired/Rejected-Closed) is identity
# (nominal categorical: which state, not a severity scale), so it takes the
# documented categorical slots 1-5 in their fixed order rather than the
# reserved good/warning/serious/critical status tokens. Sector/channel bars
# are pure magnitude, so they take the single sequential hue. Funnel stage
# is ordinal (reordering it changes its meaning), so it takes one hue's
# monotone lightness ramp. All validated:
#   node scripts/validate_palette.js "<8 hex>" --mode light   (and --mode dark)
# → ALL CHECKS PASS both modes (worst adjacent CVD 9.1 light / 8.4 dark).
# Every hex below is expressed as a CSS custom property (PAGE_CSS) so a
# reader's OS dark-mode setting swaps the whole palette without a re-render.
# ---------------------------------------------------------------------------

STATUS_CSS_VAR = {
    "Active": "--status-active",
    "Interview": "--status-interview",
    "Offer": "--status-offer",
    "Hired": "--status-hired",
    "Rejected/Closed": "--status-rejected",
}
FUNNEL_CSS_VARS = ["--ordinal-1", "--ordinal-2", "--ordinal-3", "--ordinal-4"]


# ---------------------------------------------------------------------------
# Inline SVG charts (no external libraries, matches /html-report's spec)
# ---------------------------------------------------------------------------

def esc(value):
    return html.escape(str(value) if value is not None else "", quote=True)


def _bar_path(x, y, w, h, r=4):
    """A horizontal bar: 4px rounded corners at the data-end (right), square
    at the baseline (left) — the mark spec's 'grows from a single baseline'."""
    r = max(min(r, w, h / 2), 0)
    return (
        f"M{x},{y} H{x + w - r} "
        f"A{r},{r} 0 0 1 {x + w},{y + r} "
        f"V{y + h - r} "
        f"A{r},{r} 0 0 1 {x + w - r},{y + h} "
        f"H{x} Z"
    )


def svg_bar_rows(data, fills, width=460):
    """data: list of (label, count), horizontal bars in the given order.
    fills: one 'var(--x)' string applied to every bar, or a list of one per
    row. Each bar carries a native <title> as a lightweight hover tooltip —
    not a substitute for the crosshair/tooltip layer a denser chart would
    need, but every value here is already direct-labeled at the bar's tip,
    so nothing is gated behind hover."""
    row_h, gap, label_w, pad = 20, 14, 170, 10
    max_count = max((c for _, c in data), default=0) or 1
    bar_area = max(width - label_w - 60, 40)
    height = (len(data) * (row_h + gap) + pad) if data else 40
    parts = []
    aria_parts = []
    for i, (label, count) in enumerate(data):
        y = pad + i * (row_h + gap)
        mid = y + row_h / 2 + 4
        bar_w = (count / max_count) * bar_area if max_count else 0
        fill = fills if isinstance(fills, str) else fills[i % len(fills)]
        label_display = label if len(label) <= 24 else label[:23] + "…"
        parts.append(
            f'<g class="bar-mark">'
            f'<title>{esc(label)}: {count}</title>'
            f'<text x="0" y="{mid:.1f}" font-size="12" fill="var(--text-secondary)">{esc(label_display)}</text>'
            f'<path d="{_bar_path(label_w, y, bar_w, row_h)}" fill="{fill}" />'
            f'<text x="{label_w + bar_w + 8:.1f}" y="{mid:.1f}" font-size="12" font-weight="700" fill="var(--text-primary)">{count}</text>'
            f'</g>'
        )
        aria_parts.append(f"{count} {label}")
    aria = esc(", ".join(aria_parts)) if aria_parts else "No data"
    return (
        f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{aria}" width="100%">'
        f'{"".join(parts)}'
        f'</svg>'
    )


# ---------------------------------------------------------------------------
# Page rendering
# ---------------------------------------------------------------------------

PAGE_CSS = """
:root {
  color-scheme: light;
  --page: #f9f9f7;
  --surface: #fcfcfb;
  --surface-alt: #f4f3f0;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #898781;
  --border: rgba(11,11,11,0.10);
  --magnitude: #2a78d6;
  --ordinal-1: #86b6ef;
  --ordinal-2: #5598e7;
  --ordinal-3: #2a78d6;
  --ordinal-4: #1c5cab;
  --status-active: #2a78d6;
  --status-interview: #eb6834;
  --status-offer: #1baf7a;
  --status-hired: #eda100;
  --status-rejected: #e87ba4;
  --banner-bg: #eaf2fc;
  --banner-border: #cfe0f7;
  --banner-text: #184f95;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface: #1a1a19;
    --surface-alt: #232322;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --border: rgba(255,255,255,0.10);
    --magnitude: #3987e5;
    --ordinal-1: #6da7ec;
    --ordinal-2: #3987e5;
    --ordinal-3: #256abf;
    --ordinal-4: #184f95;
    --status-active: #3987e5;
    --status-interview: #d95926;
    --status-offer: #199e70;
    --status-hired: #c98500;
    --status-rejected: #d55181;
    --banner-bg: #16223a;
    --banner-border: #234876;
    --banner-text: #9ec5f4;
  }
}
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--page); color: var(--text-primary); }
header { padding: 20px 24px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
header h1 { margin: 0; font-size: 1.25rem; font-weight: 650; }
header .meta { color: var(--text-muted); font-size: 0.82rem; }
main { padding: 24px; max-width: 1200px; margin: 0 auto; }
.banner { background: var(--banner-bg); border: 1px solid var(--banner-border); color: var(--banner-text); padding: 9px 14px; border-radius: 8px; font-size: 0.8rem; margin-bottom: 20px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--c, var(--text-muted)); border-radius: 10px; padding: 14px 16px; }
.stat-card .n { font-size: 1.7rem; font-weight: 650; line-height: 1.2; }
.stat-card .l { color: var(--text-secondary); font-size: 0.8rem; margin-top: 2px; }
.charts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px; }
.chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; overflow-x: auto; }
.chart-card h3 { margin: 0 0 12px; font-size: 0.9rem; font-weight: 600; }
.chart-card .sub { color: var(--text-muted); font-weight: 400; }
.bar-mark { cursor: default; }
.bar-mark path { transition: opacity .1s ease; }
.bar-mark:hover path { opacity: 0.82; }
table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
th, td { text-align: left; padding: 9px 10px; font-size: 0.83rem; border-bottom: 1px solid var(--border); vertical-align: top; }
tbody tr:hover { background: var(--surface-alt); }
th { background: var(--surface-alt); color: var(--text-secondary); font-weight: 600; position: sticky; top: 0; }
.pill { display: inline-block; padding: 2px 9px; border-radius: 999px; color: #0b0b0b; font-size: 0.74rem; font-weight: 650; }
.filters { display: flex; gap: 10px; margin: 4px 0 14px; flex-wrap: wrap; }
.filters input, .filters select { padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.83rem; background: var(--surface); color: var(--text-primary); }
.docs a { margin-right: 8px; color: var(--magnitude); }
details summary { cursor: pointer; color: var(--text-secondary); }
details div { color: var(--text-secondary); font-size: 0.82rem; padding: 2px 0; }
footer { text-align: center; color: var(--text-muted); font-size: 0.78rem; padding: 28px; }
@media (max-width: 900px) { .charts { grid-template-columns: 1fr; } }
"""

TABLE_FILTER_JS = """
function filterTable() {
  const q = document.getElementById('q').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const sector = document.getElementById('sectorFilter').value;
  document.querySelectorAll('#appTable tbody tr').forEach(tr => {
    const text = tr.dataset.search;
    const rowStatus = tr.dataset.status;
    const rowSector = tr.dataset.sector;
    const match = (!q || text.includes(q))
      && (!status || rowStatus === status)
      && (!sector || rowSector === sector);
    tr.style.display = match ? '' : 'none';
  });
}
"""


def render_stat_cards(stats):
    cards = [("Total", stats["total"], None)]
    for bucket in BUCKET_ORDER:
        cards.append((bucket, stats["by_bucket"][bucket], STATUS_CSS_VAR[bucket]))
    parts = []
    for label, n, var_name in cards:
        style = f' style="--c:var({var_name})"' if var_name else ""
        parts.append(f'<div class="stat-card"{style}><div class="n">{n}</div><div class="l">{esc(label)}</div></div>')
    return "".join(parts)


def render_charts(stats):
    status_data = [(b, stats["by_bucket"][b]) for b in BUCKET_ORDER]
    status_fills = [f"var({STATUS_CSS_VAR[b]})" for b in BUCKET_ORDER]
    sector_data = list(stats["by_sector"].items())
    channel_data = list(stats["by_channel"].items())
    funnel_data = list(stats["funnel"].items())
    funnel_fills = [f"var({v})" for v in FUNNEL_CSS_VARS]
    return f"""
    <div class="charts">
      <div class="chart-card">
        <h3>Status breakdown</h3>
        {svg_bar_rows(status_data, status_fills)}
      </div>
      <div class="chart-card">
        <h3>By sector</h3>
        {svg_bar_rows(sector_data, "var(--magnitude)")}
      </div>
      <div class="chart-card">
        <h3>By channel</h3>
        {svg_bar_rows(channel_data, "var(--magnitude)")}
      </div>
      <div class="chart-card">
        <h3>Application funnel <span class="sub">({stats["funnel_rate"]:.0f}% past resume screen)</span></h3>
        {svg_bar_rows(funnel_data, funnel_fills)}
      </div>
    </div>
    """


def render_row(rec):
    row = rec["row"]
    date = row.get("date", "")
    company = row.get("company", "")
    role = row.get("role", "")
    sector = row.get("sector", "") or "—"
    channel = row.get("channel", "") or "—"
    bucket = rec["bucket"]
    notes = (row.get("notes") or "").strip()
    notes_short = notes[:80] + ("…" if len(notes) > 80 else "")
    source = (row.get("source") or "").strip()
    source_html = f'<a href="{esc(source)}" target="_blank" rel="noopener">link</a>' if source.startswith("http") else "—"

    docs = []
    if rec["cv_pdf"]:
        docs.append(f'<a href="/file?path={quote(rec["cv_pdf"])}" target="_blank">CV</a>')
    if rec["cover_pdf"]:
        docs.append(f'<a href="/file?path={quote(rec["cover_pdf"])}" target="_blank">Cover Letter</a>')
    docs_html = "".join(docs) or "—"

    if rec["checked_stages"]:
        stages_html = (
            "<details><summary>" + esc(f'{len(rec["checked_stages"])} stage(s)') + "</summary>"
            + "".join(f'<div>✓ {esc(s)}</div>' for s in INTERVIEW_STAGE_NAMES if s in rec["checked_stages"])
            + "</details>"
        )
    else:
        stages_html = "—"

    search_blob = esc(f'{company} {role} {sector}'.lower())
    return f"""
    <tr data-search="{search_blob}" data-status="{esc(bucket)}" data-sector="{esc(sector)}">
      <td>{esc(date)}</td>
      <td>{esc(company)}</td>
      <td>{esc(role)}</td>
      <td>{esc(sector)}</td>
      <td>{esc(channel)}</td>
      <td><span class="pill" style="background:var({STATUS_CSS_VAR[bucket]})">{esc(bucket)}</span></td>
      <td title="{esc(notes)}">{esc(notes_short) or '—'}</td>
      <td class="docs">{docs_html}</td>
      <td>{stages_html}</td>
      <td>{source_html}</td>
    </tr>
    """


def render_table(records):
    def sort_key(rec):
        return (rec["row"].get("date") or "", rec["row"].get("company") or "")

    rows_sorted = sorted(records, key=sort_key, reverse=True)
    sectors = sorted({(r["row"].get("sector") or "").strip() or "Unspecified" for r in records})
    rows_html = "".join(render_row(r) for r in rows_sorted)
    sector_options = "".join(f'<option value="{esc(s)}">{esc(s)}</option>' for s in sectors)
    status_options = "".join(f'<option value="{esc(b)}">{esc(b)}</option>' for b in BUCKET_ORDER)
    return f"""
    <div class="filters">
      <input id="q" type="text" placeholder="Search company / role / sector" oninput="filterTable()" />
      <select id="statusFilter" onchange="filterTable()"><option value="">All statuses</option>{status_options}</select>
      <select id="sectorFilter" onchange="filterTable()"><option value="">All sectors</option>{sector_options}</select>
    </div>
    <div style="overflow-x:auto">
    <table id="appTable">
      <thead><tr>
        <th>Date</th><th>Company</th><th>Role</th><th>Sector</th><th>Channel</th>
        <th>Status</th><th>Notes</th><th>Documents</th><th>Interview stages</th><th>Source</th>
      </tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
    </div>
    """


def render_page():
    records = build_records()
    stats = compute_stats(records)
    generated = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M %Z")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Job Search Dashboard</title>
<style>{PAGE_CSS}</style>
</head>
<body>
<header>
  <h1>🔍 Job Search Dashboard</h1>
  <span class="meta">Live · recomputed each load · {esc(generated)}</span>
</header>
<main>
  <div class="banner">Served locally from job_search_tracker.csv + documents/applications/*/outcome.md — refresh this page any time after /apply or /outcome, no regeneration needed.</div>
  <div class="stats">{render_stat_cards(stats)}</div>
  {render_charts(stats)}
  {render_table(records)}
</main>
<footer>Served by tools/dashboard_server.py · ai-job-search · read-only, local only (127.0.0.1) · follows system light/dark mode</footer>
<script>{TABLE_FILTER_JS}</script>
</body>
</html>"""


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------

class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "JobSearchDashboard/1.0"

    def _send_html(self, body, status=200):
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _resolve_file(self, raw_path):
        if not raw_path or ".." in raw_path:
            return None
        candidate = (REPO_ROOT / raw_path).resolve()
        if candidate.suffix.lower() != ".pdf" or not candidate.is_file():
            return None
        for allowed_root in ALLOWED_FILE_ROOTS:
            try:
                candidate.relative_to(allowed_root)
                return candidate
            except ValueError:
                continue
        return None

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._send_html(render_page())
            return
        if parsed.path == "/file":
            raw_path = parse_qs(parsed.query).get("path", [""])[0]
            resolved = self._resolve_file(raw_path)
            if resolved is None:
                self._send_html("<h1>403 Forbidden</h1>", status=403)
                return
            data = resolved.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", "inline")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._send_html("<h1>404 Not Found</h1>", status=404)

    def log_message(self, fmt, *args):
        pass


def find_free_port(preferred):
    for port in range(preferred, preferred + 10):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit(f"No free port found in range {preferred}-{preferred + 9}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8420)
    args = parser.parse_args()

    port = find_free_port(args.port)
    server = ThreadingHTTPServer(("127.0.0.1", port), DashboardHandler)
    print(f"http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
