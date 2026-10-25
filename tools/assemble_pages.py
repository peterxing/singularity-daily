"""Assemble the GitHub Pages artifact: the site files plus, for the newest episodes, their video from the GitHub release.

Videos live in releases (one per episode, tag ep-YYYY-MM-DD) so the git history stays small. GitHub serves release assets
as application/octet-stream downloads, which Safari on iPhone won't play inline, so the newest `videosOnPages` episodes are
copied into the Pages site, where they're served as video/mp4 with range requests. Older episodes stream from the release.
"""
import argparse
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_FILES = ["index.html", "404.html", "robots.txt"]


def download(url, dest, tries=4):
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "singularity-daily-pages"})
            with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
                shutil.copyfileobj(r, f, 1 << 20)
            tmp.replace(dest)
            return dest.stat().st_size
        except Exception as e:  # transient network errors: retry
            print(f"  attempt {attempt} failed for {url}: {e}", flush=True)
            time.sleep(5 * attempt)
    raise SystemExit(f"could not download {url}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_site")
    a = ap.parse_args()
    out = (ROOT / a.out).resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for f in SITE_FILES:
        if (ROOT / f).exists():
            shutil.copy2(ROOT / f, out / f)
    shutil.copytree(ROOT / "daily", out / "daily")
    (out / ".nojekyll").write_text("", encoding="utf-8")
    index = json.loads((ROOT / "daily" / "data" / "index.json").read_text(encoding="utf-8"))
    total = 0
    for ep in index.get("episodes", []):
        v = ep.get("video") or {}
        if v.get("pages") and v.get("release") and v.get("file"):
            dest = out / v["file"]
            size = download(v["release"], dest)
            if v.get("bytes") and size != v["bytes"]:
                raise SystemExit(f"{v['file']}: got {size} bytes, expected {v['bytes']}")
            total += size
            print(f"video {ep['date']}: {size / 1e6:.1f} MB", flush=True)
    print(f"site assembled in {out} ({total / 1e6:.0f} MB of video)", flush=True)
    if total > 900e6:
        sys.exit("site would exceed GitHub Pages' 1 GB limit: lower videosOnPages in publish.json")


if __name__ == "__main__":
    main()
