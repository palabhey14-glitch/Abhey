# Abhey

Claude Code workspace for Abhey's business ideas, research and projects.
Persistent context lives in [CLAUDE.md](CLAUDE.md).

## Skills

Project skills live in `.claude/skills/`. Claude picks them up automatically.

| Skill | Use it for |
| --- | --- |
| [honest-advisor](.claude/skills/honest-advisor/SKILL.md) | Brainstorming, idea validation, decisions and conflicts, with no flattery |
| [youtube-research](.claude/skills/youtube-research/SKILL.md) | Breaking down a YouTube video or channel into takeaways, business ideas, trend signals, tools and a pros/cons view |

## YouTube research

Paste a YouTube video or channel link and ask Claude to analyze it, for example:

> Analyze https://www.youtube.com/watch?v=VIDEO_ID, focus on AI tools a solo
> fitness coach could use.

Claude sends the video to Google's Gemini (which watches the video itself, not
just the captions) and returns:

- **Key takeaways** with timestamps
- **Business ideas**: who pays, the cheapest test this week, the biggest risk
- **Trend signals**, each marked as evidence or speculation
- **Tools and resources** mentioned in the video (can be logged to Notion)
- **A balanced view**: pros, cons, sponsor incentives and the strongest counter-argument

For a channel link it analyzes the newest few videos (3 by default) and writes a
channel-level brief on top.

### Setup (one time, about 2 minutes)

1. Get a free key at https://aistudio.google.com/apikey (sign in, click
   **Create API key**, copy it).
2. Store it as an environment variable called `GEMINI_API_KEY`:
   - In Claude Code on the web or the app, add it in your environment's
     settings as an environment variable.
   - On your own Mac or Linux machine, run
     `echo 'export GEMINI_API_KEY="paste-key-here"' >> ~/.zshrc` and open a new
     terminal.
3. That's it. No installs: the script uses plain Python 3.

Never commit the key or paste it into a chat or `CLAUDE.md`. `.env` files are
ignored by git. If a key leaks, delete it in AI Studio and make a new one.

You can also run it directly:

```bash
python3 .claude/skills/youtube-research/scripts/analyze.py "<video-or-channel-url>" --focus "what you care about"
```

Limits: public or unlisted videos only; channel mode only sees the newest ~15
uploads; free-tier keys have daily video limits.
