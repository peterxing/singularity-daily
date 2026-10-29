# The Singularity Daily

**The last 24 hours in superintelligence, in three minutes, every day** — with every story checked against the forecasts in
[*The Hitchhiker's Guide to the Singularity*](https://peterxing.com/#/guide), which lives on the same site.

**Watch:** [peterxing.com](https://peterxing.com) · [RSS](https://peterxing.github.io/singularity-daily/daily/feed.xml) · [the weekly by RSS](https://peterxing.github.io/singularity-daily/daily/weekly.xml) · [every episode as a release](https://github.com/peterxing/singularity-daily/releases)

The show's address is **peterxing.com**. This repository's GitHub Pages site
(peterxing.github.io/singularity-daily) hosts the files that peterxing.com serves; people who open it directly are
forwarded to peterxing.com (add `?stay` to the URL to view the copy itself).

## What's on the site

- **Start here** — one line on what the site is, then three ways in side by side: watch today's episode, start the book,
  and see whether the Guide is holding up.
- **Today** — the newest episode, its TL;DR, a clickable transcript, and the forecasts the day's news moved.
- **The stories** — every story in the episode, grouped by the show's chapters, with its source and a plain-language note on
  each forecast it touches.
- **The week in the forecasts** (`#/weekly`) — every Friday, the three developments from the week's episodes that changed
  the outlook for a forecast, and one practical implication. It has its own feed, `daily/weekly.xml`.
- **What it got right or wrong** (`#/scorecard`) — every forecast whose best-guess month has passed, judged against a test
  written before it fell due: **right**, **partly right**, **wrong**, or **not settled yet** while its window is open, with
  what happened and the sources; the forecasts falling due next with their tests; and **what changed in the forecasts**, a
  dated log of every revision to the Guide's odds, months and wording with Peter's reasons.
- **Predictions vs reality** (`#/forecasts`) — the Guide's live forecasts year by year (`#/forecasts/2027`) and the undated
  horizons beyond the timeline (`#/forecasts/beyond`). Each forecast shows its best-guess month and the Guide's ± band, its
  odds and their history, the test it will be judged against, why the Guide expects it then, and every story that is
  **evidence for** it, an **early sign**, or **evidence against** it. Filters by domain and signal, a "moving now" view, and
  "latest news" and "most news" orderings.
- **The Guide** — *The Hitchhiker's Guide to the Singularity* on the same page (`#/guide`): its chapters, read in place
  (`#/guide/chapter-N`), and the author. The chapters and author notes are read live from the Guide's published page and
  data on the same origin (`/guide` and `/author.json`), so they never go stale. The site no longer links to the legacy
  `/guide` page, but it is still the source of the chapter text, so it has to stay deployed. Elsewhere (the Pages copy)
  the section points readers to peterxing.com.
- **Every episode** — the archive. The page checks for a new episode, verdict or revision every ten minutes while it's open.

It tracks the news, not the odds: the Guide's probabilities are Peter's own and change only when he revises them. A story
that is "evidence for" a forecast shows part of its claim happening; only the test, once the forecast is due, says whether
it came true.

## How it's published

Each morning (Sydney time) the show's production pipeline renders the episode, then `engine/build/publish.py` in the
production project:

1. web-encodes the video (1080p H.264, about 65–70 MB) and uploads it as the release `ep-YYYY-MM-DD`;
2. writes the episode (`daily/data/episodes/<date>.json`), cover, thumbnail and captions (`daily/media/<date>/`);
3. regenerates `daily/data/index.json`, the forecast snapshot (`daily/data/predictions.json`, fetched from the Guide's live
   `predictions.json`), the tracker (`daily/data/tracker.json`), the revision log, the scorecard, the weekly digest and the
   feeds (`daily/feed.xml`, `daily/weekly.xml`);
4. commits and pushes; [`.github/workflows/pages.yml`](.github/workflows/pages.yml) then builds GitHub Pages with
   [`tools/assemble_pages.py`](tools/assemble_pages.py).

The tests and verdicts live in the production project's `scorecard.json`, and the weekly digests in its `weekly/` folder;
`publish.py` checks both against the forecasts and the published episodes before they reach the site. The show's mapping
rules (in `publish.py`'s docstring) say when a story counts as evidence for a forecast: only when it shows the forecast's
own claim happening, at its threshold and scope. A voluntary, single-company or single-country step toward something the
forecast says becomes standard is an early sign, not evidence for it.

Videos stay out of git. GitHub serves release assets as downloads (`application/octet-stream`), which Safari on iPhone
won't play inline, so the newest seven episodes' videos are copied into the Pages site, where they're served as `video/mp4`.
Older episodes stream from their release (or download).

peterxing.com is served by the [`post-agi-planning`](https://github.com/peterxing/post-agi-planning) Vercel project. Its
Routing Middleware (`middleware.ts`) serves this site at the bare domain, and `vercel.json` proxies `/daily` (an alias) and
`/daily/*` here. Links made for the Guide's old homepage are handled by `daily/route.js`, which opens the same place on
this page: `/#chapter-3` the chapter, `/#event-2027-1` the forecast (in What it got right or wrong once it's due),
`/#year-2030` that year of Predictions vs reality, `/#post-superintelligence` the horizons, `/?fd=economic` Predictions vs
reality.

A second daily automation ("Singularity Daily — site sync", early afternoon Sydney time) is the safety net: it publishes
any rendered episode the show's own run didn't, writes the verdict for any forecast that has just fallen due (and the
Friday digest), refreshes the forecast snapshot from the Guide and records any revision (`publish.py sync`), and checks
that peterxing.com serves the newest episode.

## Data

| File | What it holds |
| --- | --- |
| `daily/data/index.json` | every episode (newest first): hook, counts, cover, video location; `data` fingerprints the forecast files |
| `daily/data/episodes/<date>.json` | one episode: stories (title, summary, chapter, badge, date, sources, forecast links), transcript, ticker, notes, X post |
| `daily/data/predictions.json` | the Guide's forecasts, flattened: `id` (`YYYY-n` or `horizon-…`, as in the Guide's `#event-` links), `key` (hash of the wording), best-guess month `m`, band `band` and window `win`, why then (`why`), probability, domain, the latest revision note (`rev`); horizons with their dependencies and signs; `years` holds the Guide's note on each year |
| `daily/data/tracker.json` | per forecast: counts by signal and every linked story, newest first |
| `daily/data/scorecard.json` | every forecast's test; every due forecast with its verdict, finding and sources; the forecasts falling due next |
| `daily/data/revisions.json` | the dated log of revisions to the forecasts (odds, month, wording, added, retired) and the Guide's latest reassessment note |
| `daily/data/weekly.json` | every Friday digest, newest first |

Story links store the forecast's `id` and `key`, so if the Guide reorders or rewords its forecasts the tracker still
resolves them (and flags wording that changed after the link was made).

## Credits

Hosted by Claudia, an open character by [anabology](https://claudia.gallery). News belongs to the publishers linked on each
story; article screenshots in the videos belong to their publishers. Fonts: Anton, Inter and JetBrains Mono (SIL Open Font
License 1.1, see `daily/fonts/OFL.txt`).
