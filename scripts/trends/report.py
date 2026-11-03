"""Render the dated markdown report."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import analyze
from analyze import Scored, Topic

SYDNEY = ZoneInfo("Australia/Sydney")


def _cell(text: str, n: int = 90) -> str:
    text = " ".join(text.split()).replace("|", "/")
    return text if len(text) <= n else text[: n - 1] + "…"


def _metric(s: Scored) -> str:
    m = s.post.metrics
    if s.post.platform == "youtube":
        return f"{m.get('views', 0):,} views, {m.get('comments', 0):,} comments"
    return f"{m.get('score', 0):,} upvotes, {m.get('comments', 0):,} comments"


def _link(s: Scored) -> str:
    return f"[{_cell(s.post.title, 80)}]({s.post.url})"


def render(scored: list[Scored], topics: list[Topic], *, keywords: list[str],
           subreddits: list[str], days: int, status: dict[str, str],
           generated: datetime, previous: dict[str, int] | None = None,
           source_note: str = "") -> str:
    local = generated.astimezone(SYDNEY)
    counts = {p: sum(1 for s in scored if s.post.platform == p) for p in ("youtube", "reddit")}
    L: list[str] = []
    add = L.append

    add(f"# Trend report: {local:%d %B %Y}")
    add("")
    add(f"Scanned {local:%d %b %Y, %I:%M %p} Sydney time. Window: last {days} days.")
    if source_note:
        add("")
        add(f"> **{source_note}**")
    add("")
    add("| Source | Status | Posts |")
    add("|---|---|---|")
    for p, label in (("youtube", "YouTube"), ("reddit", "Reddit")):
        add(f"| {label} | {_cell(status.get(p, 'not run'), 120)} | {counts[p]} |")
    add("| Instagram / TikTok | Not collected. Needs a paid, terms-compliant data provider (see README). | 0 |")
    add("")
    add(f"Keywords: {', '.join(keywords)}. Subreddits: {', '.join('r/' + s for s in subreddits)}.")
    add("")

    if not scored:
        add("No posts were collected, so there is nothing to rank. Check the source status above.")
        return "\n".join(L) + "\n"

    add("## Top topics")
    add("")
    add("Ranked by summed velocity percentile: each post is ranked against posts on the same "
        "platform (0 to 100), and a topic's score adds up the ranks of every post that mentions it. "
        "Confidence reflects sample size, creator count and whether more than one platform agrees.")
    add("")
    add("| # | Topic | Score | Posts | Creators | Platforms | Median rank | Confidence | Change |")
    add("|---|---|---|---|---|---|---|---|---|")
    for i, t in enumerate(topics, 1):
        change = ""
        if previous is not None:
            was = previous.get(t.phrase)
            change = "new" if was is None else ("same" if was == i else (f"up {was - i}" if was > i else f"down {i - was}"))
        add(f"| {i} | **{t.phrase}** | {t.score} | {len(t.posts)} | {t.creators} | "
            f"{', '.join(t.platforms)} | {t.median_pct:.0f} | {t.confidence} | {change} |")
    add("")

    add("## Topic briefs")
    add("")
    for i, t in enumerate(topics, 1):
        add(f"### {i}. {t.phrase}")
        add("")
        add(f"Most used hook styles here: {', '.join(t.lead_hooks[:3])}.")
        add("")
        add("Strongest examples:")
        for s in sorted(t.posts, key=lambda s: -s.pct)[:3]:
            add(f"- {_link(s)} ({s.post.platform}, {s.post.creator}, {_metric(s)}, rank {s.pct:.0f})")
        qs = t.questions[:2]
        if qs:
            add("")
            add("Questions people are asking:")
            for s in qs:
                add(f"- \"{_cell(s.post.title, 140)}\" ([{s.post.community}]({s.post.url}))")
        add("")
        add("Angles to rewrite in your own words:")
        for a in analyze.angles(t):
            add(f"- {a}")
        add("")

    add("## Hook styles that are working")
    add("")
    add("Median velocity rank of posts by their primary hook style (50 is average for the platform). "
        "Treat small samples as hints, not rules.")
    add("")
    add("| Hook style | Posts | Median rank |")
    add("|---|---|---|")
    for h, n, med in analyze.hook_table(scored):
        add(f"| {h} | {n} | {med} |")
    add("")

    for p, label in (("youtube", "YouTube"), ("reddit", "Reddit")):
        rows = [s for s in scored if s.post.platform == p][:10]
        if not rows:
            continue
        add(f"## Fastest-moving on {label}")
        add("")
        add(f"Velocity = {analyze.FORMULAS[p]}.")
        add("")
        add("| Post | Creator | Published | Metrics | Velocity/day | Hook |")
        add("|---|---|---|---|---|---|")
        for s in rows:
            add(f"| {_link(s)} | {_cell(s.post.creator, 30)} | {s.post.published:%d %b} | "
                f"{_metric(s)} | {s.velocity:,.0f} | {s.hooks[0]} |")
        add("")

    add("## Limits of this report")
    add("")
    add("- YouTube search returns the most-viewed matches, not every video, and view counts favour big channels. "
        "A topic ranking high here means it is getting attention, not that it suits your audience.")
    add("- Reddit shows what people ask and argue about. It is the better signal for audience problems; "
        "YouTube is the better signal for what packaging gets clicks.")
    add("- Angles are templates filled with the topic. They are prompts for your own take, not finished hooks.")
    add("- No Instagram or TikTok data is included.")
    return "\n".join(L) + "\n"
