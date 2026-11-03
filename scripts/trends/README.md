# Trend scanner

Pulls the last 30 days of top YouTube videos and Reddit posts for your keywords,
ranks topics by how fast they are gathering attention, and writes a dated
markdown report with example posts, the questions people are asking, hook styles
that are working, and angles to rewrite in your own voice.

Python 3.10+ standard library only. Nothing to install.

## Run it

```bash
cp scripts/trends/.env.example .env      # then add your keys
python scripts/trends/scan.py            # writes reports/trends/YYYY-MM-DD.md
```

Options:

| Flag | What it does |
|---|---|
| `--keywords "fat loss,protein"` | Override the keywords in `config.json` |
| `--subreddits "loseit,Fitness"` | Override the subreddits |
| `--days 14` | Shorter window (Reddit is filtered client-side from its "month" list) |
| `--sources youtube` | Run one source only |
| `--fixture path.json` | Build a report from saved posts, no API calls |

Defaults live in [`config.json`](config.json). They are set for Rewired
Coaching (fitness coaching, fat loss, beginner strength, gut health) and the
fitness subreddits. Edit that file to change the daily scan.

Each live run also saves the raw posts to `reports/trends/data/YYYY-MM-DD.json`.
The next run compares against it, so the topic table shows `new`, `up 3`, and so on.

See [`reports/trends/2026-11-03-sample.md`](../../reports/trends/2026-11-03-sample.md)
for the format. That sample is built from invented fixture posts and says so at the top.

## How ranking works

1. **Velocity per post**, within its own platform:
   - YouTube: views ÷ days since published
   - Reddit: (upvotes + 2 × comments) ÷ days since posted
2. **Percentile rank (0 to 100)** against other posts on the same platform.
   Raw YouTube views and Reddit upvotes are never compared directly.
3. **Topics** are words and two-word phrases shared by at least 3 posts from at
   least 2 creators. A topic's score adds up the percentile ranks of its posts,
   so a topic wins by being both common and strong. Your seed keywords are
   excluded because every result contains them.
4. **Confidence**: High needs 8+ posts, 5+ creators and both platforms. Medium
   needs 4+ posts and 3+ creators. Anything else is Low.
5. **Hook style** is a simple pattern match on the title (warning, myth, personal
   story, timeframe, list, how-to, question).

Angles are templates filled with the topic name. They are prompts for your take,
not finished scripts.

## Daily schedule

[`.github/workflows/trend-scan.yml`](../../.github/workflows/trend-scan.yml) runs
every day at 20:00 UTC (7am Sydney in summer, 6am in winter) and on demand from
the Actions tab, where you can also pass one-off keywords.

Setup: add `YOUTUBE_API_KEY`, `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` under
**Settings > Secrets and variables > Actions**.

Reports are committed to a separate `trend-reports` branch, so the daily commit
does not redeploy the Netlify site from `main`. Each run also shows the report on
the run's summary page and keeps it as a downloadable artifact for 30 days. The
run fails (and GitHub emails you) only if every source failed.

## Limits and costs

- **YouTube quota**: 10,000 free units a day. Each keyword costs about 101 units,
  so 5 keywords is about 505 a day.
- **Reddit**: logged-out JSON is limited to about 10 requests a minute and often
  blocked from cloud servers, so set up the free app credentials. Reddit's terms
  allow read-only use of public data at this volume; do not resell the data.
- YouTube search favours the most-viewed results, which skews toward large
  channels. Reddit is the better source for audience problems.

## Later: Instagram and TikTok

Neither offers a public API for searching other creators' posts.

- **Instagram**: the official Graph API only covers accounts you own or manage
  (plus limited hashtag search for a Business account you own). Searching niche
  creators needs a paid provider such as Apify, Bright Data or EnsembleData.
- **TikTok**: the Research API is for approved academic researchers. Commercial
  options are the same paid scrapers, or TikTok Creative Center for trending
  hashtags and sounds (browse only).

A paid collector would be a new `source_instagram.py` / `source_tiktok.py`
returning the same `Post` records, with its own velocity formula in
`analyze.py`. Expect roughly US$30 to US$100 a month at daily volume. Check the
provider's terms before turning it on.

## Tests

```bash
python -m unittest discover -s scripts/trends/tests
```
