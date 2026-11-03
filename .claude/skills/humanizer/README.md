# Humanizer (Abhey's version)

A text-only Claude skill that rewrites AI-sounding copy so it reads like Abhey
wrote it. It has no scripts, no hooks, no plugin manifest and makes no network
calls. It is one instruction file, `SKILL.md`.

## Where it came from

Written from scratch for this repo on 2026-11-03 after reading the public
blader/humanizer skill (MIT licence, v3.1.0) on GitHub. Nothing was installed
or downloaded into Claude from that repo.

Safety check of the original, done before writing this version:

- `SKILL.md` and `README.md` are plain Markdown instructions. No hidden HTML
  comments, no odd invisible characters, no commands to run.
- `.claude-plugin/plugin.json` and `marketplace.json` only hold the name,
  version, author and licence. No hooks folder, no scripts, no tool
  permissions requested.
- The only install risk in the original is its suggested `npx skills add`
  command, which pulls the latest version from the internet every time. This
  copy avoids that because it is fixed in your own repo.

## How to switch it on

Pick one.

**Claude Code (any project).** Copy the `humanizer` folder into
`~/.claude/skills/` on your computer, so the file sits at
`~/.claude/skills/humanizer/SKILL.md`. Restart Claude Code. Type `/humanizer`
or just ask "humanize this".

**Claude Code (this repo only).** Nothing to do. Any session opened on this
repo already sees `.claude/skills/humanizer/`.

**Claude.ai or the desktop app.** Zip the `humanizer` folder (the zip should
contain the folder, with `SKILL.md` inside it). Go to Settings, then
Capabilities, then Skills, and upload the zip.

## How to use it

```
/humanizer

[paste the copy]
```

Or: "Humanize the hero copy in site/index.html". To match your own voice more
closely, paste two or three paragraphs you wrote yourself first.

## Updating your rules

The "Abhey's voice" and "Hard rules" sections near the top are the bits to edit
when a rule changes. Keep the hard rules short so they always get followed.
