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

Run the helper script with the video path and what you want to know:

```bash
python3 .claude/skills/watch-video/scripts/watch_video.py <path-to-video> "<question>"
```

Examples:
- `"Summarize what happens in this video."`
- `"Transcribe all spoken dialogue with timestamps."`
- `"At what point does the person in the red shirt appear?"`
- `"Describe the on-screen text and any charts shown."`

If no question is given, the script defaults to a general scene-by-scene
description with dialogue and on-screen text.

The script uploads the video via the Gemini Files API, waits for it to finish
processing, then calls `gemini-2.5-flash` with the video and your question.
It prints the model's answer to stdout — read that output and use it to
compose your reply to the user; don't just paste it verbatim if the user
asked a narrower question than what came back.

## Limits

- Works with common video formats (mp4, mov, webm, etc.) — whatever
  `mimetypes` can identify from the file extension.
- Large videos take longer to upload and process; the script polls until
  Gemini reports the file `ACTIVE`.
- If `GEMINI_API_KEY` is missing or invalid, the script exits with a clear
  error — relay that error to the user rather than retrying blindly.
