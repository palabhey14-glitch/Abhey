"""Reddit collector.

Two modes:
- Authorised (recommended, and needed on GitHub Actions because Reddit often
  blocks cloud IPs): set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET from a
  "script" app at https://www.reddit.com/prefs/apps. Uses app-only OAuth on
  oauth.reddit.com (read-only, about 100 requests/minute).
- Public JSON fallback: www.reddit.com/*.json with no login. Rate limited to
  roughly 10 requests/minute, so this module pauses between calls.
"""

from __future__ import annotations

import base64
import os
import time
from datetime import datetime, timedelta, timezone

from common import Post, SourceError, get_json, now_utc


def _token() -> str | None:
    cid, secret = os.environ.get("REDDIT_CLIENT_ID"), os.environ.get("REDDIT_CLIENT_SECRET")
    if not (cid and secret):
        return None
    auth = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    data = get_json("https://www.reddit.com/api/v1/access_token",
                    headers={"Authorization": f"Basic {auth}",
                             "Content-Type": "application/x-www-form-urlencoded"},
                    data=b"grant_type=client_credentials")
    tok = data.get("access_token")
    if not tok:
        raise SourceError(f"Reddit OAuth failed: {data}")
    return tok


def collect(keywords: list[str], subreddits: list[str], days: int,
            per_query: int = 50) -> list[Post]:
    token = _token()
    if token:
        base, headers, pause = "https://oauth.reddit.com", {"Authorization": f"bearer {token}"}, 0.7
    else:
        base, headers, pause = "https://www.reddit.com", {}, 6.5

    # Reddit's "t=month" is the closest built-in window; we filter to `days` exactly.
    queries = [(f"{base}/r/{s}/top{'' if token else '.json'}",
                {"t": "month", "limit": per_query}, f"r/{s}") for s in subreddits]
    queries += [(f"{base}/search{'' if token else '.json'}",
                 {"q": kw, "t": "month", "sort": "top", "limit": per_query, "type": "link"}, kw)
                for kw in keywords]

    cutoff = now_utc() - timedelta(days=days)
    seen: dict[str, Post] = {}
    errors: list[str] = []
    for i, (url, params, label) in enumerate(queries):
        if i:
            time.sleep(pause)
        try:
            data = get_json(url, {**params, "raw_json": 1}, headers=headers)
        except SourceError as e:
            errors.append(f"{label}: {e}")
            continue
        for child in data.get("data", {}).get("children", []):
            p = child.get("data", {})
            if p.get("stickied") or p.get("over_18"):
                continue
            published = datetime.fromtimestamp(p["created_utc"], tz=timezone.utc)
            if published < cutoff or p["id"] in seen:
                continue
            seen[p["id"]] = Post(
                platform="reddit",
                id=p["id"],
                url=f"https://www.reddit.com{p['permalink']}",
                title=p.get("title", ""),
                creator=f"u/{p.get('author', '[deleted]')}",
                community=f"r/{p.get('subreddit', '')}",
                published=published,
                query=label,
                metrics={
                    "score": int(p.get("score", 0)),
                    "comments": int(p.get("num_comments", 0)),
                    "upvote_ratio": float(p.get("upvote_ratio", 0) or 0),
                },
                text=(p.get("selftext") or "")[:500],
            )
    if not seen and errors:
        raise SourceError("; ".join(errors[:3]))
    return list(seen.values())
