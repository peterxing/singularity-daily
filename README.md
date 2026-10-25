# The Singularity Daily

**The last 24 hours in AI, in three minutes, every day** — with every story checked against the forecasts in
[*The Hitchhiker's Guide to the Singularity*](https://peterxing.com/guide).

**Watch:** [peterxing.com](https://peterxing.com) (opens on the Daily) · [peterxing.github.io/singularity-daily](https://peterxing.github.io/singularity-daily/) · [RSS](https://peterxing.github.io/singularity-daily/daily/feed.xml) · [every episode as a release](https://github.com/peterxing/singularity-daily/releases)

## What's on the site

- **Today** — the newest episode, its TL;DR, a clickable transcript, and the forecasts the day's news moved.
- **The stories** — every story in the episode, grouped by the show's chapters, with its source and a plain-language note on
  each forecast it touches.
- **Predictions vs reality** — all of the Guide's forecasts (dated 2026–2040, plus the undated post-superintelligence
  horizon) with the running tally of news that **supports** them, shows an **early sign**, or **challenges** them; filters by
  domain and signal, a "moving now" view, and a link back to each forecast in the Guide.
- **Every episode** — the archive. The page checks for a new episode every ten minutes while it's open.

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

peterxing.com is served by the [`post-agi-planning`](https://github.com/peterxing/post-agi-planning) Vercel project, which
redirects `/` to `/daily`, proxies `/daily` and `/daily/*` to this site, and keeps the Guide at `/guide`. Old links to the
Guide's homepage (`/#chapter-3`, `/#event-2027-1`, `/?fd=economic` …) are forwarded to `/guide` by `daily/route.js`.

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
