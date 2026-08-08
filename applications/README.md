# Applications Folder

This folder holds every tailored CV and cover letter `/apply` has generated, organized one folder per application so you always know exactly where to go to submit.

---

## Folder Structure

```
applications/
└── <company>_<role>/
    ├── README.md          # job title, company, apply link, status, fit score
    ├── cv.tex              # tailored CV source
    ├── cv.pdf               # compiled CV — attach this
    ├── cover_letter.tex     # tailored cover letter source
    ├── cover_letter.pdf     # compiled cover letter — attach this
    ├── cover.cls             # symlink to ../../cover_letters/cover.cls (shared template class)
    └── OpenFonts              # symlink to ../../cover_letters/OpenFonts (shared fonts)
```

Each `README.md` inside a company folder is your launchpad for that application: it names the job, links to the posting so you know exactly where to click apply, and records the status as of when it was last touched. The tracker (`job_search_tracker.csv`) is the live source of truth for status — a folder's README is a snapshot, not a live feed.

The `cover.cls`/`OpenFonts` symlinks exist because the cover letter template's fonts are bundled once in `cover_letters/` and shared across every application rather than duplicated per folder. Don't delete them; recompiling a cover letter from inside its folder depends on them.

---

## Master templates

The blank starting-point templates live outside this folder and are never company-specific:

- `cv/main_example.tex` — master CV, the most complete version of your professional record
- `cover_letters/cover_example.tex` — cover letter template
- `cover_letters/cover.cls`, `cover_letters/OpenFonts/` — shared cover letter class and fonts

`/apply` reads these as structural references when drafting a new application, then writes the tailored output into a new `applications/<company>_<role>/` folder.

---

## Clearing out closed applications

Once an application is resolved with a negative outcome (rejected, no response, withdrawn, offer declined), run `/clear-cv` to delete its working folder here. This never touches `documents/applications/<company>_<role>/` — that folder is the permanent submitted-materials archive `/outcome` and `/setup` use to calibrate the fit framework, and it is kept regardless of outcome.
