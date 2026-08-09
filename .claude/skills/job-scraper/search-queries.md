# Search Queries for Job Scraper

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`. You do **not** need a matching `site:` line below for those CLIs to run.

Installed dedicated CLIs, evaluated and built via `/add-portal` (2026-08-07):
- `jobbank-ca-search` — Government of Canada Job Bank
- `remoteok-search` — RemoteOK (fully remote tech jobs; free API has no server-side filtering, so results are a client-filtered snapshot of the latest ~100 postings and quality varies — see the skill's own Notes)
- `weworkremotely-search` — We Work Remotely (fully remote; programming/full-stack/backend/frontend/devops categories)
- `eluta-search` — Eluta.ca (Canada-wide; has adaptive bot-detection under heavy request volume — see the skill's "Keep volume low" warning)

Installed dedicated CLIs, evaluated and built via `/add-portal` (2026-08-09):
- `wellfound-search` — Wellfound (global startup job board, strong remote/early-career coverage). **Previously listed below as "genuinely blocked" — that finding did not reproduce on 2026-08-09 re-investigation** with a standard browser User-Agent; the earlier test likely used a naive request that tripped a WAF rule. Live-verified working (search + detail, including a real QA internship posting). Has its own intermittent-403-under-bursty-use quirk, similar to `eluta-search`'s bot-detection — see the skill's Notes. Take any future "genuinely blocked" finding in this file as a snapshot in time, not permanent — worth an occasional re-check rather than a standing exclusion.
- `dice-search` — Dice (US tech job board, real Canada/remote coverage). Dice's own query-string search UI (`/jobs?q=...`) is explicitly `robots.txt`-disallowed, but a separate SEO path-based search (`/jobs/q-<keywords>-l-<location>-jobs`) is not, and works cleanly — the skill only ever uses that allowed form. Live-verified working (search + detail); first live test surfaced a real "Python Developer - Jr" posting in Mississauga, ON. Postings skew mid-to-senior on average but genuine junior/entry/internship listings do appear.

No dedicated CLI (`robots.txt` blocks a single crawler identity from getting both search and detail), but **not a dead end** — see "Indeed: how the fallback actually works" below:
- **Indeed Canada** — WebSearch + WebFetch on individual `/viewjob?jk=...` pages works (confirmed 2026-08-08); a dedicated CLI is still blocked because Indeed's own search-results pages aren't crawlable, only individual posting pages that a search engine has already indexed.

Evaluated but genuinely blocked, no fallback available:
- **Himalayas, Monster** — both actively bot-block plain HTTP requests (403/Cloudflare challenge on the real content pages) regardless of `robots.txt`
- **Glassdoor** — `robots.txt` explicitly disallows the real job-search/detail URL patterns; also login-walled for full listings
- **ZipRecruiter Canada** — no distinct Canadian domain (redirects to `ziprecruiter.com?country=ca`); known aggressive anti-bot protection

The `site:` query templates in this file are the **WebSearch fallback** — for the portals above with no working CLI, company career pages, or when a CLI fails.

### Indeed: how the fallback actually works

Indeed's own search-results pages (`indeed.ca/jobs?q=...`) are not indexed usefully by WebSearch — a plain `site:indeed.ca "<query>"` search (no path restriction) returns only Indeed's own category/aggregator pages ("Discover 373 Software Intern Jobs in Ontario"), not individual postings, which is a dead end for extracting anything. Individual posting pages at `ca.indeed.com/viewjob?jk=<id>` **are** indexed and **do** WebFetch cleanly, even though they're not reachable by starting from Indeed's own search UI. So the query pattern below targets `site:ca.indeed.com/viewjob` specifically, not bare `site:indeed.ca` — that's the difference between getting real postings and getting nothing.

Two things to check when using this path:
1. **Check for expiry on every fetch.** Indeed keeps expired postings indexed and search-engine-discoverable long after the employer stopped accepting applications — the fetched page usually says so explicitly ("This job posting has expired" / "no longer accepting applications"). Drop these; do not present them.
2. **Date filtering still applies but is best-effort.** The search snippet rarely carries a reliable post date, and the fetched page doesn't always state one either — when the page does show a "Posted X days ago" or similar, apply the same 7-day rule as every other portal; when it doesn't, fall back to the expiry check above as the primary open/closed signal and flag the entry "date unknown" per the Date Filter section.

**Expected yield (observed 2026-08-08):** 6 of 8 detail-fetched candidates came back expired in the first real run of this path — budget for a high dud rate, not a bug. Fetch generously (title/snippet alone can't predict which ones survived), but don't be surprised when only 1 in 4-ish is actually open.

## Search Sites

Primary:
- **linkedin.com/jobs** — LinkedIn job listings (filter: Canada / GTA, and remote-anywhere); also covered by `linkedin-search` CLI
- **indeed.ca** — largest general job board in Canada; no dedicated CLI possible (search-results pages aren't crawlable), covered instead via the WebSearch+WebFetch fallback documented above
- **jobbank.gc.ca** — Government of Canada Job Bank, useful for co-op/student and entry-level postings

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for known target companies

## Query Categories

Queries are grouped by priority. Toan's search is scoped to Canada for now, matching his current study/co-op work permit (see the work-authorization gate in `04-job-evaluation.md`): most queries should be run both with a GTA/Canada location filter and with "remote" (remote roles are only eligible once a start date falls after the 12/2027 graduation — see Location Filter below). EUR-market queries and a EUR-specific portal skill are a planned future addition once Toan is ready to widen the search — not in scope yet.

### Priority 1: Full-Stack Developer / Software Engineer (co-op & new grad)

Strongest and most desired career direction.

```
site:linkedin.com/jobs "software engineer co-op" OR "full-stack developer co-op" OR "software engineer intern" OR "full-stack developer intern" Toronto OR Mississauga OR "Greater Toronto Area"
site:linkedin.com/jobs "junior full-stack developer" OR "entry level full-stack developer" OR "full-stack developer new grad" React "Spring Boot" remote -senior -intermediate -"2+ years" -"3+ years" -"5+ years"
site:ca.indeed.com/viewjob "software developer intern" OR "software engineer intern" Ontario
site:jobbank.gc.ca "software developer" co-op OR intern Ontario
```

### Priority 2: QA / Test Automation / SDET

Matches current co-op role and hands-on Selenium/test-automation experience.

```
site:linkedin.com/jobs "junior QA automation" OR "entry level SDET" OR "test automation engineer co-op" Selenium Canada OR remote -senior -intermediate -"2+ years" -"3+ years" -"5+ years"
site:ca.indeed.com/viewjob "automation tester" OR "junior QA engineer" OR "entry level QA engineer" Selenium Java Ontario -senior -intermediate -"2+ years" -"3+ years"
```

### Priority 3: Backend Developer / Frontend Developer

Adjacent roles matching individual layers of the stack.

```
site:linkedin.com/jobs "junior backend developer" OR "entry level backend developer" OR "backend developer new grad" "Spring Boot" Java remote OR Canada -senior -intermediate -"2+ years" -"3+ years" -"5+ years"
site:linkedin.com/jobs "junior frontend developer" OR "entry level frontend developer" OR "frontend developer new grad" React TypeScript remote OR Canada -senior -intermediate -"2+ years" -"3+ years" -"5+ years"
```

### Priority 4: Broader Technical Roles (wider net, remote-friendly)

```
site:linkedin.com/jobs "junior software engineer" OR "associate software engineer" OR "entry level software engineer" remote -senior -intermediate -"2+ years" -"3+ years"
site:ca.indeed.com/viewjob "web developer" OR "application developer" OR "entry level developer" Ontario -senior -intermediate -"2+ years"
```

## Location Filter

When evaluating results, apply these tiers. Cross-check every non-Canada or full-time result against the work-authorization gate in `04-job-evaluation.md` before treating it as eligible.

- **Ideal:** Mississauga and the Greater Toronto Area (commutable for any in-person Sheridan co-op term)
- **Acceptable:** Remote roles based anywhere in Canada, or anywhere worldwide with a start date after the 12/2027 graduation
- **Borderline:** On-site roles elsewhere in Canada requiring relocation before graduation (flag — conflicts with the Sheridan academic calendar)
- **Too far (for now):** On-site-only roles outside Canada with no remote option and a start date before 12/2027 — legally unworkable given the current study/co-op work permit

## Date Filter

Only include jobs posted within the **last 7 days**, or with a stated application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

This window is enforced **twice**, and the second check is the one that actually guarantees it:

1. **Query time** — via each portal's recency flag where one exists. `linkedin-search` supports an exact `--jobage 7`; `freehire-search`'s `--jobage` is continuous and also takes `7` exactly.
2. **Post-fetch (mandatory)** — `job-scraper/SKILL.md` Step 2 re-checks every result's actual `date` field against today, regardless of what was requested at query time. This is required because several portals can't honor a precise 7-day request: `jobbank-ca-search`'s `--jobage` only has coarse `<=2`/`<=30`-day tiers, so asking for 7 silently returns up to 30 days of results; `eluta-search`, `remoteok-search`, and `weworkremotely-search` have no recency flag at all. Relying on the query-time flag alone is exactly how month-old postings were slipping through before this was tightened.

## Experience Filter

Target role types are **internship, entry-level, and co-op** — Toan's target experience band is **0-1 year** of professional experience (current Canadian co-op + two short prior placements land him at the low end of that band; see the CV in `CLAUDE.md`). The `-senior -intermediate -"2+ years" -"3+ years" -"5+ years"` exclusion terms in the query templates above are a first pass, not a guarantee — job boards don't reliably honor negative keyword matching, so this is backstopped by the fit check in `job-scraper/SKILL.md` Step 3, which reads the actual posting text and downgrades anything with a stated minimum above 1 year regardless of what the search query caught. Postings silent on experience, or stating "0-1 years"/"1+ years"/"new grad welcome," are in scope and should not be excluded — the cutoff is a stated minimum **above** 1 year. When adapting or writing new queries, carry the same exclusion terms forward and prefer "internship"/"entry level"/"co-op"/"junior"/"new grad" qualifiers over unqualified role titles — an unqualified title (e.g. "backend developer" with no level) defaults to mid-level results on most boards.

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape QA" -> Priority 2 queries + custom QA-specific queries
- "/scrape remote" -> drop the location filter from all categories and add "remote" explicitly
