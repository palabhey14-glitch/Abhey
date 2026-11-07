# Caveman (Abhey's version)

A text-only Claude skill that makes Claude answer in a terse, stripped-down
style so replies use fewer output tokens. It has no scripts, no hooks, no
plugin manifest and makes no network calls. It is one instruction file,
`SKILL.md`.

Written from scratch for this repo on 2026-11-07, inspired by the public
"caveman" prompting idea. No third-party text was copied and nothing was
installed from the internet.

## How to switch it on

Claude can't install skills into your account. You do it once, then it works
everywhere that account is used.

**Claude.ai, the desktop app and Cowork.** Download `caveman-skill.zip` (it
holds the `caveman` folder with `SKILL.md` inside). Go to Settings, then
Capabilities, then Skills, and upload the zip. Make sure its toggle is on.

**Claude Code on your computer (every project).** Copy the `caveman` folder
into `~/.claude/skills/` so the file sits at `~/.claude/skills/caveman/SKILL.md`.
Restart Claude Code.

**Claude Code on this repo.** Nothing to do once this is merged. Sessions on
this repo see `.claude/skills/caveman/`.

## How to use it

Say "caveman mode" (or "be terse", "save tokens"). Say "normal mode" to stop.

## What it won't do

It is never used for client-facing copy (site, Instagram, emails, DMs, offers,
welcome packs). Those still go through the humanizer skill and your voice
rules.
