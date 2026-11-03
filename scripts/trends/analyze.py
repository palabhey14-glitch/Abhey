"""Turn raw posts into ranked topics, hook patterns and angles.

Everything here is deterministic and explainable, so the report can show its
working. Numbers are never compared raw across platforms: each post gets a
velocity within its own platform, then a percentile rank (0-100) within that
platform, and only percentiles are combined.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from statistics import median

from common import Post

STOPWORDS = set("""
a about after again all am an and any are as at be because been before being
but by can could did do does doing don't down during each few for from get got
had has have having he her here hers him his how i i'm i've if in into is it it's
its just like me more most my no nor not now of off on once only or other our out
over own really same she should so some such than that that's the their them then
there these they this those through to too under until up very was we were what
when where which while who whom why will with would you your you're yours yourself
vs via new one also much even still way make made let thing things want im ive dont
youre its thats doesnt cant isnt amp best video full guide tips day days week weeks
""".split())

TOKEN = re.compile(r"[a-z][a-z0-9'+-]*")

# Ordered: the first match is a title's primary hook type.
HOOKS: list[tuple[str, re.Pattern]] = [
    ("Warning / mistake", re.compile(r"\b(stop|mistakes?|never|worst|avoid|wrong|don'?t|ruin|killing|sabotag)", re.I)),
    ("Myth / contrarian", re.compile(r"\b(myths?|truth|actually|lie|lies|nobody|overrated|unpopular|scam|honest)", re.I)),
    ("Personal story", re.compile(r"(^|\s)(i|i'm|i've|my|me)\b", re.I)),
    ("Transformation / timeframe", re.compile(r"\b(\d+\s*(days?|weeks?|months?|kg|lbs?|pounds))\b|before and after|transform", re.I)),
    ("Number / list", re.compile(r"(^|\s)\d+\s+[a-z]", re.I)),
    ("How-to", re.compile(r"\bhow (to|i)\b", re.I)),
    ("Question", re.compile(r"\?\s*$|^(why|what|is|are|can|should|do|does|how)\b", re.I)),
]

FORMULAS = {
    "youtube": "views / days since published",
    "reddit": "(upvotes + 2 x comments) / days since posted",
}


def velocity(p: Post) -> float:
    m = p.metrics
    if p.platform == "youtube":
        return m.get("views", 0) / p.age_days
    if p.platform == "reddit":
        return (m.get("score", 0) + 2 * m.get("comments", 0)) / p.age_days
    return 0.0


def hook_types(title: str) -> list[str]:
    return [name for name, rx in HOOKS if rx.search(title)] or ["Statement"]


def tokens(text: str) -> list[str]:
    return [t.strip("'-") for t in TOKEN.findall(text.lower()) if len(t) > 2 and t not in STOPWORDS]


def phrases(title: str) -> set[str]:
    toks = tokens(title)
    out = set(toks)
    out.update(f"{a} {b}" for a, b in zip(toks, toks[1:]))
    return out


@dataclass
class Scored:
    post: Post
    velocity: float
    pct: float              # percentile within its platform, 0-100
    hooks: list[str]


@dataclass
class Topic:
    phrase: str
    score: float
    posts: list[Scored] = field(default_factory=list)

    @property
    def creators(self) -> int:
        return len({s.post.creator for s in self.posts})

    @property
    def platforms(self) -> list[str]:
        return sorted({s.post.platform for s in self.posts})

    @property
    def median_pct(self) -> float:
        return median(s.pct for s in self.posts)

    @property
    def confidence(self) -> str:
        n, c = len(self.posts), self.creators
        if n >= 8 and c >= 5 and len(self.platforms) > 1:
            return "High"
        if n >= 4 and c >= 3:
            return "Medium"
        return "Low"

    @property
    def lead_hooks(self) -> list[str]:
        counts: dict[str, int] = defaultdict(int)
        for s in self.posts:
            counts[s.hooks[0]] += 1
        return [h for h, _ in sorted(counts.items(), key=lambda kv: -kv[1])]

    @property
    def questions(self) -> list[Scored]:
        return [s for s in self.posts if s.post.platform == "reddit" and "?" in s.post.title]


def dedupe(posts: list[Post]) -> list[Post]:
    seen: dict[tuple[str, str], Post] = {}
    for p in posts:
        seen.setdefault((p.platform, p.id), p)
    return list(seen.values())


def score(posts: list[Post]) -> list[Scored]:
    by_platform: dict[str, list[Post]] = defaultdict(list)
    for p in posts:
        by_platform[p.platform].append(p)
    out: list[Scored] = []
    for plist in by_platform.values():
        vels = sorted(velocity(p) for p in plist)
        n = len(vels)
        for p in plist:
            v = velocity(p)
            below = sum(1 for x in vels if x < v)
            equal = sum(1 for x in vels if x == v)
            pct = 100 * (below + 0.5 * equal) / n
            out.append(Scored(p, v, pct, hook_types(p.title)))
    return sorted(out, key=lambda s: -s.pct)


def topics(scored: list[Scored], keywords: list[str], limit: int = 12,
           min_posts: int = 3, min_creators: int = 2) -> list[Topic]:
    """Group posts by shared title phrases and rank by summed percentile.

    Summing rewards topics that are both widespread and strong. Phrases that
    match a seed keyword, or appear in over 40% of posts, are dropped because
    they describe the whole search rather than a trend inside it.
    """
    seeds = {k.lower() for k in keywords} | {t for k in keywords for t in tokens(k)}
    index: dict[str, list[Scored]] = defaultdict(list)
    for s in scored:
        for ph in phrases(s.post.title):
            index[ph].append(s)

    total = max(len(scored), 1)
    cands: list[Topic] = []
    for ph, items in index.items():
        if ph in seeds or len(items) < min_posts or len(items) / total > 0.4:
            continue
        if len({s.post.creator for s in items}) < min_creators:
            continue
        cands.append(Topic(ph, round(sum(s.pct for s in items) / 100, 2), items))

    cands.sort(key=lambda t: (-t.score, -len(t.phrase)))
    chosen: list[Topic] = []
    for t in cands:
        ids = {id(s) for s in t.posts}
        # Skip a phrase whose posts mostly repeat a stronger topic already chosen.
        if any(len(ids & {id(s) for s in c.posts}) / len(ids) > 0.6 for c in chosen):
            continue
        chosen.append(t)
        if len(chosen) == limit:
            break
    return chosen


def hook_table(scored: list[Scored]) -> list[tuple[str, int, float]]:
    groups: dict[str, list[float]] = defaultdict(list)
    for s in scored:
        groups[s.hooks[0]].append(s.pct)
    rows = [(h, len(v), round(median(v), 1)) for h, v in groups.items()]
    return sorted(rows, key=lambda r: -r[2])


ANGLE_TEMPLATES = {
    "Warning / mistake": "The {t} mistake I see most often, and what to do instead",
    "Myth / contrarian": "What everyone gets wrong about {t}, explained with one real example",
    "Personal story": "My honest take on {t} as a coach: what I would do first, and why",
    "Transformation / timeframe": "What a realistic 4 weeks of {t} looks like, week by week",
    "Number / list": "3 {t} changes that matter more than the ones people argue about",
    "How-to": "How to start with {t} when you have 30 minutes and no gym experience",
    "Question": "Is {t} worth it? The honest answer depends on these 2 things",
    "Statement": "Everything I'd tell a friend about {t}, in under 60 seconds",
}


def angles(topic: Topic, n: int = 3) -> list[str]:
    order = topic.lead_hooks + [h for h in ANGLE_TEMPLATES if h not in topic.lead_hooks]
    return [ANGLE_TEMPLATES[h].format(t=topic.phrase) for h in order[:n]]
