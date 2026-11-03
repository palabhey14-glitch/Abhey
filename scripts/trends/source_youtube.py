"""YouTube Data API v3 collector.

Quota (default 10,000 units/day): search.list costs 100 units per call and
videos.list costs 1 unit per 50 videos. Five keywords is about 505 units a day.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta

from common import Post, SourceError, get_json, now_utc

API = "https://www.googleapis.com/youtube/v3"


def collect(keywords: list[str], days: int, per_keyword: int = 25,
            region: str = "AU", language: str = "en") -> list[Post]:
    key = os.environ.get("YOUTUBE_API_KEY")
    if not key:
        raise SourceError("YOUTUBE_API_KEY is not set (see scripts/trends/.env.example)")

    since = (now_utc() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    found: dict[str, str] = {}  # video id -> keyword that surfaced it first
    for kw in keywords:
        data = get_json(f"{API}/search", {
            "key": key, "part": "id", "type": "video", "q": kw,
            "publishedAfter": since, "order": "viewCount",
            "maxResults": min(per_keyword, 50),
            "regionCode": region, "relevanceLanguage": language,
        })
        for item in data.get("items", []):
            vid = item.get("id", {}).get("videoId")
            if vid:
                found.setdefault(vid, kw)

    posts: list[Post] = []
    ids = list(found)
    for i in range(0, len(ids), 50):
        data = get_json(f"{API}/videos", {
            "key": key, "part": "snippet,statistics,contentDetails",
            "id": ",".join(ids[i:i + 50]),
        })
        for v in data.get("items", []):
            sn, st = v["snippet"], v.get("statistics", {})
            posts.append(Post(
                platform="youtube",
                id=v["id"],
                url=f"https://www.youtube.com/watch?v={v['id']}",
                title=sn.get("title", ""),
                creator=sn.get("channelTitle", ""),
                community=sn.get("channelId", ""),
                published=datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00")),
                query=found[v["id"]],
                metrics={
                    "views": int(st.get("viewCount", 0)),
                    "likes": int(st.get("likeCount", 0)),  # hidden on some videos
                    "comments": int(st.get("commentCount", 0)),
                    "duration": v.get("contentDetails", {}).get("duration", ""),
                },
                text=(sn.get("description") or "")[:500],
            ))
    return posts
