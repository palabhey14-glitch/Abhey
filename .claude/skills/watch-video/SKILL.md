---
name: watch-video
description: Analyze the contents of a video file — describe scenes, transcribe dialogue, find a moment, answer questions about what happens. Use when the user attaches or references a video file and asks what's in it, to summarize it, transcribe it, or find something specific in it.
---

# Watch Video

Claude cannot natively watch a video file, but Gemini can. This skill sends
the video to the Gemini API and returns a detailed answer, which you then use
to answer the user directly.

## Prerequisites

Requires a `GEMINI_API_KEY` environment variable. If it is not set:

1. Tell the user to get a free key at https://aistudio.google.com/apikey
2. Have them set it as `GEMINI_API_KEY` in their environment or Claude Code
   settings.
3. Never ask the user to paste the key into chat, and never write it to a
   file, memory, or a commit yourself.

## Usage

Run the helper script with the video path (or a YouTube URL) and what you
want to know:

```bash
python3 .claude/skills/watch-video/scripts/watch_video.py <path-to-video-or-youtube-url> "<question>" [--clip START-END] [--fps N]
```

Examples:
- `"Summarize what happens in this video."`
- `"Transcribe all spoken dialogue with timestamps."`
- `"At what point does the person in the red shirt appear?"`
- `"Describe the on-screen text and any charts shown."`
- `python3 .claude/skills/watch-video/scripts/watch_video.py https://www.youtube.com/watch?v=XXXX "List every cut with timestamps" --clip 0:00-0:05 --fps 10`

If no question is given, the script defaults to a general scene-by-scene
description with dialogue and on-screen text.

`--clip START-END` restricts analysis to a portion of the video, given as
`M:SS-M:SS` or `H:MM:SS-H:MM:SS` (e.g. `0:00-0:05`). `--fps N` sets how many
frames per second Gemini samples in that range — raise it (e.g. `10`) when
the question is about fast cuts or precise per-frame timing.

A YouTube URL (`youtube.com/watch?v=...` or `youtu.be/...`) is passed
directly to Gemini — no download or upload step. A local file path is
uploaded via the Gemini Files API first, then the script waits for it to
finish processing before asking the question.

The script then calls `gemini-2.5-flash` with the video (or clip) and your
question. It prints the model's answer to stdout — read that output and use
it to compose your reply to the user; don't just paste it verbatim if the
user asked a narrower question than what came back.

## Limits

- Works with common video formats (mp4, mov, webm, etc.) — whatever
  `mimetypes` can identify from the file extension — and with YouTube URLs.
- Large local videos take longer to upload and process; the script polls
  until Gemini reports the file `ACTIVE`.
- Gemini samples video at a fixed rate by default; use `--fps` for a denser
  sample when you need every individual cut in a short clip.
- If `GEMINI_API_KEY` is missing or invalid, the script exits with a clear
  error — relay that error to the user rather than retrying blindly.
- Gemini's response is the ground truth for what it could see/hear — if it
  reports uncertainty about a cut, caption, or word, say so rather than
  guessing on its behalf.
