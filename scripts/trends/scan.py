#!/usr/bin/env python3
"""Daily trending content scanner for YouTube and Reddit.

Usage:
  python scripts/trends/scan.py                       # live scan, uses config.json
  python scripts/trends/scan.py --keywords "fat loss,protein"
  python scripts/trends/scan.py --fixture scripts/trends/tests/fixtures/sample_posts.json

Writes reports/trends/YYYY-MM-DD.md and a raw snapshot in reports/trends/data/.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import analyze  # noqa: E402
import report  # noqa: E402
import source_reddit  # noqa: E402
import source_youtube  # noqa: E402
from common import Post, SourceError, load_dotenv, now_utc, set_now  # noqa: E402

REPO = HERE.parent.parent


def previous_ranks(data_dir: Path, today: str) -> dict[str, int] | None:
    snaps = sorted(p for p in data_dir.glob("*.json") if p.stem < today)
    if not snaps:
        return None
    topics = json.loads(snaps[-1].read_text()).get("topics", [])
    return {t: i for i, t in enumerate(topics, 1)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=str(HERE / "config.json"))
    ap.add_argument("--keywords", help="comma-separated, overrides config")
    ap.add_argument("--subreddits", help="comma-separated, overrides config")
    ap.add_argument("--days", type=int)
    ap.add_argument("--sources", default="youtube,reddit")
    ap.add_argument("--out", default=str(REPO / "reports" / "trends"))
    ap.add_argument("--fixture", help="load posts from a JSON file instead of calling the APIs")
    args = ap.parse_args(argv)

    load_dotenv(REPO / ".env")
    load_dotenv(HERE / ".env")
    cfg = json.loads(Path(args.config).read_text())
    keywords = [k.strip() for k in (args.keywords.split(",") if args.keywords else cfg["keywords"]) if k.strip()]
    subs = [s.strip().removeprefix("r/") for s in (args.subreddits.split(",") if args.subreddits else cfg["subreddits"]) if s.strip()]
    days = args.days or cfg.get("days", 30)
    wanted = {s.strip() for s in args.sources.split(",")}

    posts: list[Post] = []
    status: dict[str, str] = {}
    note = ""
    if args.fixture:
        fx = json.loads(Path(args.fixture).read_text())
        set_now(datetime.fromisoformat(fx["generated"]))
        posts = [Post.from_json(d) for d in fx["posts"]]
        note = fx.get("note", "Fixture data, not a live scan.")
        for p in ("youtube", "reddit"):
            status[p] = f"fixture ({sum(1 for x in posts if x.platform == p)} posts)"
    else:
        if "youtube" in wanted:
            try:
                got = source_youtube.collect(keywords, days, cfg.get("youtube_results_per_keyword", 25),
                                             cfg.get("region", "AU"), cfg.get("language", "en"))
                posts += got
                status["youtube"] = f"ok ({len(got)} videos)"
            except SourceError as e:
                status["youtube"] = f"failed: {e}"
        if "reddit" in wanted:
            try:
                got = source_reddit.collect(keywords, subs, days, cfg.get("reddit_results_per_query", 50))
                posts += got
                status["reddit"] = f"ok ({len(got)} posts)"
            except SourceError as e:
                status["reddit"] = f"failed: {e}"
    for name, s in status.items():
        print(f"{name}: {s}", file=sys.stderr)

    generated = now_utc()
    today = generated.astimezone(ZoneInfo("Australia/Sydney")).strftime("%Y-%m-%d")
    out = Path(args.out)
    data_dir = out / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    scored = analyze.score(analyze.dedupe(posts))
    tops = analyze.topics(scored, keywords, cfg.get("top_topics", 12))
    md = report.render(scored, tops, keywords=keywords, subreddits=subs, days=days, status=status,
                       generated=generated, previous=previous_ranks(data_dir, today), source_note=note)

    stem = f"{today}-sample" if args.fixture else today
    (out / f"{stem}.md").write_text(md)
    if not args.fixture:
        (data_dir / f"{today}.json").write_text(json.dumps({
            "generated": generated.isoformat(), "status": status,
            "topics": [t.phrase for t in tops],
            "posts": [p.to_json() for p in posts],
        }, indent=1))
    print(out / f"{stem}.md")
    # Fail the run (so GitHub emails you) only when every source failed.
    return 0 if posts else 1


if __name__ == "__main__":
    sys.exit(main())
