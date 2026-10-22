---
name: youtube-research
description: Analyze a YouTube video or channel with Gemini and turn it into key takeaways, business ideas, trend signals, tools mentioned and an unbiased pros/cons view. Use whenever Abhey shares a YouTube link, asks to summarize or break down a video or channel, wants takeaways from a creator, or wants AI tools from a video logged to Notion.
---

# YouTube Research

Turns a YouTube video or channel into research Abhey can act on. Gemini watches
the actual video (visuals and audio, not just the transcript), so it catches
on-screen tools, prices and demos.

## When the request is vague, sharpen it first

If Abhey only pastes a link, ask one short question before running, then run:

> "What do you want out of this one: business ideas for Rewired Coaching, AI
> tools to log, a trend read, or just the takeaways?"

Pass the answer as `--focus`. If Abhey says "just do it", run with no focus.
Then show Abhey a stronger version of their request they can reuse, e.g.
`analyze <url> --focus "AI tools a solo fitness coach could use to save 5 hours a week"`.

## How to run it

1. Check the key exists without printing it: `test -n "$GEMINI_API_KEY" && echo set`.
   If it is not set, walk Abhey through **Setup** below and stop.
2. Run the script from the repo root:

   ```bash
   # One video
   python3 .claude/skills/youtube-research/scripts/analyze.py "https://www.youtube.com/watch?v=VIDEO_ID" --focus "..."

   # A channel (analyzes the newest N videos, then writes a channel brief)
   python3 .claude/skills/youtube-research/scripts/analyze.py "https://www.youtube.com/@handle" --videos 3 --focus "..."
   ```

   Optional: `--model gemini-2.5-pro` (or set `GEMINI_MODEL`) for deeper but
   slower and pricier analysis. The default is `gemini-2.5-flash`.
3. Read the output yourself before passing it on. Gemini can be wrong too.

## What to give Abhey

Lead with the 3 most useful lines, then the full report. The report has these
sections: Key takeaways (with timestamps), Business ideas (who pays, cheapest
test, biggest risk), Trend signals (marked Evidence or Speculation), Tools and
resources mentioned, Balanced view (pros, cons, incentives, strongest
counter-argument), and Questions to dig deeper.

Then add your own layer, following the `honest-advisor` skill:
- Where you disagree with Gemini or the creator, say so and why.
- Verify any trend claim you repeat with a dated source (web search or
  Firecrawl). Mark anything unverified as such.
- Connect the best idea to Abhey's current projects in `CLAUDE.md` if it fits,
  and say plainly if it does not.

## Logging tools to Notion (optional)

If Abhey asks to log the tools, or has asked before, use the Notion connector:
search for an existing "AI Tools" database first and add one row per tool
(Name, What it does, Pricing, Link, Source video, Date added). If no database
exists, ask once where to create it. Never create duplicate rows for a tool
already in the database; update the existing row instead.

## Limits to know

- Works on **public** (and unlisted) videos only. Private videos fail.
- Channel mode uses YouTube's public RSS feed, which lists the newest ~15
  uploads. For older videos, pass their URLs one by one.
- Very long videos (over ~1 hour on Flash) can hit token limits; split the
  question or use `--model gemini-2.5-pro`.
- Free-tier Gemini keys have daily limits on video input. If you see a 429
  error, wait or switch to a paid key.

## Setup (plain language, one time)

1. Go to https://aistudio.google.com/apikey and sign in with Google.
2. Click **Create API key** and copy it. Treat it like a password.
3. Make it available to Claude, without putting it in any file in this repo:
   - **Claude Code on the web / app:** open your environment settings and add
     an environment variable named `GEMINI_API_KEY` with the key as its value.
   - **Your own computer (Mac/Linux):** run
     `echo 'export GEMINI_API_KEY="paste-key-here"' >> ~/.zshrc` and open a new
     terminal (use `~/.bashrc` if you use bash).
4. Test it: ask Claude "analyze this video" with any public YouTube link.

**Never** paste the key into a chat, commit it, or put it in `CLAUDE.md`. If it
ever leaks, delete it in AI Studio and create a new one. `.env` files are
already ignored by git in this repo.
