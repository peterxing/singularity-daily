# The Singularity Daily

**The last 24 hours in AI, in three minutes, every day** — with every story checked against the forecasts in
[*The Hitchhiker's Guide to the Singularity*](https://peterxing.com/#/guide), which lives on the same site.

**Watch:** [peterxing.com](https://peterxing.com) · [RSS](https://peterxing.github.io/singularity-daily/daily/feed.xml) · [every episode as a release](https://github.com/peterxing/singularity-daily/releases)

The show's address is **peterxing.com**. This repository's GitHub Pages site
(peterxing.github.io/singularity-daily) hosts the files that peterxing.com serves; people who open it directly are
forwarded to peterxing.com (add `?stay` to the URL to view the copy itself).

## What's on the site

- **Today** — the newest episode, its TL;DR, a clickable transcript, and the forecasts the day's news moved.
- **The stories** — every story in the episode, grouped by the show's chapters, with its source and a plain-language note on
  each forecast it touches.
- **Predictions vs reality** — all of the Guide's forecasts (dated 2026–2040, plus the undated post-superintelligence
  horizon) with the running tally of news that **supports** them, shows an **early sign**, or **challenges** them; filters by
  domain and signal, a "moving now" view, and a link to each forecast's year on the Guide's timeline.
- **Every episode** — the archive. The page checks for a new episode every ten minutes while it's open.
- **The Guide** — *The Hitchhiker's Guide to the Singularity* on the same page (`#/guide`): its chapters, read in place
  (`#/guide/chapter-N`); the timeline year by year (`#/guide/2027`), each dated forecast with the Guide's odds, the year's
  summary and the show's latest news against it; the undated horizons beyond the timeline with their prerequisites; and the
  author. The chapters, year summaries,
  prerequisites and author notes are read live from the Guide's published page and data on the same origin
  (`/guide`, `/predictions.json` and `/author.json`), so they never go stale. The site no longer links to the legacy
  `/guide` page, but it is still the source of the chapter text, so it has to stay deployed. Elsewhere (the Pages copy)
  the section points readers to peterxing.com.

It tracks the news, not the odds: the Guide's probabilities are Peter's own and change only when he revises them.

## How it's published

Each morning (Sydney time) the show's production pipeline renders the episode, then `engine/build/publish.py` in the
production project:

1. web-encodes the video (1080p H.264, about 65–70 MB) and uploads it as the release `ep-YYYY-MM-DD`;
2. writes the episode (`daily/data/episodes/<date>.json`), cover, thumbnail and captions (`daily/media/<date>/`);
3. regenerates `daily/data/index.json`, the forecast snapshot (`daily/data/predictions.json`, fetched from the Guide's live
   `predictions.json`), the tracker (`daily/data/tracker.json`) and the feed (`daily/feed.xml`);
4. commits and pushes; [`.github/workflows/pages.yml`](.github/workflows/pages.yml) then builds GitHub Pages with
   [`tools/assemble_pages.py`](tools/assemble_pages.py).

Videos stay out of git. GitHub serves release assets as downloads (`application/octet-stream`), which Safari on iPhone
won't play inline, so the newest seven episodes' videos are copied into the Pages site, where they're served as `video/mp4`.
Older episodes stream from their release (or download).

peterxing.com is served by the [`post-agi-planning`](https://github.com/peterxing/post-agi-planning) Vercel project. Its
Routing Middleware (`middleware.ts`) serves this site at the bare domain, and `vercel.json` proxies `/daily` (an alias) and
`/daily/*` here. Links made for the Guide's old homepage are handled by `daily/route.js`, which opens the same place on
this page: `/#chapter-3` the chapter, `/#event-2027-1` the forecast in Predictions vs reality, `/#year-2030` that year of
the timeline, `/#post-superintelligence` the horizons, `/?fd=economic` Predictions vs reality.

A second daily automation ("Singularity Daily — site sync", early afternoon Sydney time) is the safety net: it publishes
any rendered episode the show's own run didn't, refreshes the forecast snapshot from the Guide (`publish.py sync`), and
checks that peterxing.com serves the newest episode.

## Data

| File | What it holds |
| --- | --- |
| `daily/data/index.json` | every episode (newest first): hook, counts, cover, video location |
| `daily/data/episodes/<date>.json` | one episode: stories (title, summary, chapter, badge, date, sources, forecast links), transcript, ticker, notes, X post |
| `daily/data/predictions.json` | the Guide's forecasts, flattened: `id` (`YYYY-n` or `horizon-…`, as in the Guide's `#event-` links), `key` (hash of the wording), timing, probability, domain |
| `daily/data/tracker.json` | per forecast: counts by signal and every linked story, newest first |

Story links store the forecast's `id` and `key`, so if the Guide reorders or rewords its forecasts the tracker still
resolves them (and flags wording that changed after the link was made).

## Credits

Hosted by Claudia, an open character by [anabology](https://claudia.gallery). News belongs to the publishers linked on each
story; article screenshots in the videos belong to their publishers. Fonts: Anton, Inter and JetBrains Mono (SIL Open Font
License 1.1, see `daily/fonts/OFL.txt`).
