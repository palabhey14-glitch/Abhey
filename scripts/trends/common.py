"""Shared helpers: the Post record, HTTP, and .env loading. Standard library only."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

USER_AGENT = "rewired-trend-scanner/0.1 (+https://github.com/palabhey14-glitch/abhey)"


@dataclass
class Post:
    """One observed piece of content, normalised across platforms.

    Metrics are platform-specific and never compared raw across platforms:
    YouTube has views/likes/comments, Reddit has score/comments.
    """

    platform: str          # "youtube" | "reddit"
    id: str
    url: str
    title: str
    creator: str           # channel title or u/author
    community: str         # YouTube channel id or r/subreddit
    published: datetime    # UTC
    query: str             # keyword or subreddit that surfaced it
    metrics: dict = field(default_factory=dict)
    text: str = ""         # description or self-text, truncated

    @property
    def age_days(self) -> float:
        return max((now_utc() - self.published).total_seconds() / 86400, 0.5)

    def to_json(self) -> dict:
        d = asdict(self)
        d["published"] = self.published.isoformat()
        return d

    @classmethod
    def from_json(cls, d: dict) -> "Post":
        d = dict(d)
        d["published"] = datetime.fromisoformat(d["published"])
        return cls(**d)


_NOW: datetime | None = None


def now_utc() -> datetime:
    """Current time; tests pin it with set_now() so fixtures stay stable."""
    return _NOW or datetime.now(timezone.utc)


def set_now(dt: datetime | None) -> None:
    global _NOW
    _NOW = dt


class SourceError(Exception):
    """A collector could not run (missing key, blocked, quota). The scan continues."""


def get_json(url: str, params: dict | None = None, headers: dict | None = None,
             data: bytes | None = None, retries: int = 2) -> dict:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params, doseq=True)}"
    hdrs = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    hdrs.update(headers or {})
    last: Exception | None = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers=hdrs, data=data)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            # 429 / 5xx: back off and retry. Anything else is final.
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(int(e.headers.get("Retry-After", 0) or 2 ** (attempt + 1)))
                last = e
                continue
            raise SourceError(f"HTTP {e.code} from {urllib.parse.urlsplit(url).netloc}: {body}") from e
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            if attempt < retries:
                time.sleep(2 ** (attempt + 1))
                continue
    raise SourceError(f"Network error: {last}")


def load_dotenv(path: Path) -> None:
    """Minimal .env reader: KEY=value lines, existing env vars win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
