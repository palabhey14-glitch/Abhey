#!/usr/bin/env python3
"""Analyze a YouTube video or channel with the Gemini API.

Usage:
    python3 analyze.py <youtube-video-or-channel-url> [--videos N] [--focus "..."]

Needs the GEMINI_API_KEY environment variable. Uses only the Python standard
library, so there is nothing to pip install.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_MODEL = "gemini-2.5-flash"
UA = {"User-Agent": "Mozilla/5.0 (youtube-research skill)"}

VIDEO_PROMPT = """You are a sharp, unbiased business analyst and teacher. Watch this
YouTube video and report on it for an entrepreneur who wants ideas they can act on.
{focus}
Rules:
- Separate what the video shows or proves from what the creator merely claims.
- Do not flatter the creator. If a claim is weak, unsupported or self-promotional, say so.
- Use timestamps (mm:ss) for important points.
- If something is not in the video, do not invent it.

Return Markdown with exactly these sections:

## Video
Title, creator, length, and a one-sentence summary.

## Key takeaways
5 to 10 bullets, most important first, each with a timestamp.

## Business ideas
3 to 5 concrete ideas inspired by the video. For each: who pays, what they pay for,
the fastest cheap way to test it this week, and the biggest risk.

## Trend signals
What this video suggests is rising or fading (tools, platforms, behaviours, niches).
Mark each as Evidence (shown/cited in the video) or Speculation (creator's opinion or your inference).

## Tools and resources mentioned
A table: Name | What it does | Pricing if stated | Link if stated. Write "None" if none.

## Balanced view
- Strongest points (pros)
- Weak points, blind spots or bias (cons), including any sponsorship or affiliate incentive
- The strongest counter-argument to the video's main thesis

## Questions to dig deeper
3 sharp follow-up questions worth researching before acting on this.
"""

CHANNEL_PROMPT = """Below are analyses of the most recent videos from one YouTube channel.
Write a channel-level brief in Markdown with these sections:

## Channel in one paragraph
## Recurring themes
## Business ideas worth testing (ranked, with the cheapest test for each)
## Trend signals across videos (Evidence vs Speculation)
## All tools and resources mentioned (deduplicated table: Name | What it does | Video)
## Balanced view of the channel (credibility, incentives, blind spots)

Be unbiased: call out hype, repetition and self-promotion.

{analyses}
"""


def gemini(parts, model, api_key):
    body = json.dumps({"contents": [{"parts": parts}]}).encode()
    req = urllib.request.Request(
        API_URL.format(model=model),
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        sys.exit(f"Gemini API error {e.code}: {detail}")
    try:
        return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError):
        sys.exit(f"Gemini returned no text: {json.dumps(data)[:1000]}")


def is_video_url(url):
    return bool(re.search(r"(youtube\.com/(watch\?|shorts/|live/)|youtu\.be/)", url))


def channel_video_urls(url, limit):
    """Return the newest video URLs for a channel URL, via the public RSS feed."""
    m = re.search(r"/channel/(UC[\w-]{22})", url)
    if m:
        channel_id = m.group(1)
    else:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode(errors="replace")
        m = re.search(r'"(?:channelId|externalId)":"(UC[\w-]{22})"', html) or re.search(
            r'itemprop="identifier" content="(UC[\w-]{22})"', html
        )
        if not m:
            sys.exit("Could not find the channel ID on that page. Paste individual video URLs instead.")
        channel_id = m.group(1)

    feed = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    with urllib.request.urlopen(urllib.request.Request(feed, headers=UA), timeout=30) as resp:
        root = ET.fromstring(resp.read())
    ns = {"a": "http://www.w3.org/2005/Atom"}
    links = [e.find("a:link", ns).get("href") for e in root.findall("a:entry", ns)]
    return links[:limit]


def analyze_video(url, model, api_key, focus):
    focus_line = f"\nThe viewer especially cares about: {focus}\n" if focus else ""
    parts = [{"fileData": {"fileUri": url}}, {"text": VIDEO_PROMPT.format(focus=focus_line)}]
    return gemini(parts, model, api_key)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", help="YouTube video URL or channel URL")
    ap.add_argument("--videos", type=int, default=3, help="Recent videos to analyze for a channel (default 3)")
    ap.add_argument("--focus", default="", help="What you care about, e.g. 'AI tools for coaches'")
    ap.add_argument("--model", default=os.environ.get("GEMINI_MODEL", DEFAULT_MODEL))
    args = ap.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("GEMINI_API_KEY is not set. See the Setup section in the skill's SKILL.md.")

    if is_video_url(args.url):
        print(analyze_video(args.url, args.model, api_key, args.focus))
        return

    urls = channel_video_urls(args.url, args.videos)
    if not urls:
        sys.exit("No videos found for that channel.")
    analyses = []
    for i, u in enumerate(urls, 1):
        print(f"Analyzing video {i}/{len(urls)}: {u}", file=sys.stderr)
        analyses.append(f"# Video {i}: {u}\n\n{analyze_video(u, args.model, api_key, args.focus)}")
    summary = gemini([{"text": CHANNEL_PROMPT.format(analyses="\n\n---\n\n".join(analyses))}], args.model, api_key)
    print(summary + "\n\n---\n\n# Per-video analyses\n\n" + "\n\n---\n\n".join(analyses))


if __name__ == "__main__":
    main()
