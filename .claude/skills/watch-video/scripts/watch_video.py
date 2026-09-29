#!/usr/bin/env python3
"""Send a video (local file or YouTube URL) to the Gemini API and get back
an answer about its contents.

Usage:
    python3 watch_video.py <video_path_or_youtube_url> ["<question>"]
        [--clip START-END] [--fps N]

    START-END is a clip range in M:SS or H:MM:SS format, e.g. 0:00-0:05.
    --fps sets the frames-per-second Gemini samples from the clip (default
    is Gemini's own default when omitted).

Requires the GEMINI_API_KEY environment variable. Get a free key at
https://aistudio.google.com/apikey and set it in your shell or Claude Code
settings — never paste it directly into chat.
"""

import argparse
import mimetypes
import os
import re
import sys
import time
import urllib.request
import json

API_BASE = "https://generativelanguage.googleapis.com"
# Tried in order; Gemini model availability shifts over time (models get
# deprecated or hit temporary capacity limits), so fall back down the list.
MODELS = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]

YOUTUBE_RE = re.compile(
    r"^https?://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)", re.IGNORECASE
)


def die(msg: str) -> None:
    print(f"Error: {msg}", file=sys.stderr)
    sys.exit(1)


def api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        die(
            "GEMINI_API_KEY is not set. Get a free key at "
            "https://aistudio.google.com/apikey and export it as "
            "GEMINI_API_KEY before running this script."
        )
    return key


def parse_timestamp(value: str) -> int:
    parts = value.strip().split(":")
    if not 1 <= len(parts) <= 3:
        die(f"Invalid timestamp: {value!r} (expected M:SS or H:MM:SS)")
    seconds = 0
    for part in parts:
        seconds = seconds * 60 + int(part)
    return seconds


def parse_clip(value: str):
    if "-" not in value:
        die(f"Invalid --clip range: {value!r} (expected START-END, e.g. 0:00-0:05)")
    start_str, end_str = value.split("-", 1)
    start = parse_timestamp(start_str)
    end = parse_timestamp(end_str)
    if end <= start:
        die(f"--clip end must be after start (got {value!r})")
    return start, end


def is_youtube_url(value: str) -> bool:
    return bool(YOUTUBE_RE.match(value))


def upload_file(path: str, key: str):
    size = os.path.getsize(path)
    mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"

    start_req = urllib.request.Request(
        f"{API_BASE}/upload/v1beta/files?key={key}",
        method="POST",
        headers={
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(size),
            "X-Goog-Upload-Header-Content-Type": mime_type,
            "Content-Type": "application/json",
        },
        data=json.dumps({"file": {"display_name": os.path.basename(path)}}).encode(),
    )
    with urllib.request.urlopen(start_req) as resp:
        upload_url = resp.headers.get("X-Goog-Upload-URL")
    if not upload_url:
        die("Gemini did not return an upload URL.")

    with open(path, "rb") as f:
        data = f.read()
    upload_req = urllib.request.Request(
        upload_url,
        method="POST",
        headers={
            "Content-Length": str(size),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
        },
        data=data,
    )
    with urllib.request.urlopen(upload_req) as resp:
        file_info = json.load(resp)["file"]

    file_uri = file_info["uri"]
    name = file_info["name"]

    state = file_info.get("state", "PROCESSING")
    while state == "PROCESSING":
        time.sleep(2)
        with urllib.request.urlopen(
            urllib.request.Request(f"{API_BASE}/v1beta/{name}?key={key}")
        ) as resp:
            file_info = json.load(resp)
        state = file_info.get("state", "ACTIVE")

    if state != "ACTIVE":
        die(f"Video upload ended in state {state}, expected ACTIVE.")

    return file_uri, mime_type


def ask_about_video(
    file_uri: str,
    mime_type: str,
    question: str,
    key: str,
    clip=None,
    fps=None,
):
    file_data = {"file_uri": file_uri}
    if mime_type:
        file_data["mime_type"] = mime_type

    part = {"file_data": file_data}

    video_metadata = {}
    if clip is not None:
        start, end = clip
        video_metadata["start_offset"] = f"{start}s"
        video_metadata["end_offset"] = f"{end}s"
    if fps is not None:
        video_metadata["fps"] = fps
    if video_metadata:
        part["video_metadata"] = video_metadata

    body = {"contents": [{"parts": [part, {"text": question}]}]}

    last_error = None
    for model in MODELS:
        req = urllib.request.Request(
            f"{API_BASE}/v1beta/models/{model}:generateContent?key={key}",
            method="POST",
            headers={"Content-Type": "application/json"},
            data=json.dumps(body).encode(),
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.load(resp)
        except urllib.error.HTTPError as e:
            # 404 (model retired) or 503 (overloaded): try the next model.
            if e.code in (404, 503):
                last_error = e.read().decode()[:500]
                continue
            raise

        try:
            return result["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            die(f"Unexpected response from Gemini: {json.dumps(result)[:500]}")

    die(f"All Gemini models unavailable. Last error: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("video", help="Local video path or YouTube URL")
    parser.add_argument("question", nargs="?", default=None)
    parser.add_argument(
        "--clip",
        metavar="START-END",
        help="Clip range as M:SS-M:SS or H:MM:SS-H:MM:SS, e.g. 0:00-0:05",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=None,
        help="Frames per second to sample from the clip",
    )
    args = parser.parse_args()

    question = args.question or (
        "Describe what happens in this video in detail, including any spoken "
        "dialogue, on-screen text, and notable visual events with approximate "
        "timestamps."
    )

    clip = parse_clip(args.clip) if args.clip else None

    key = api_key()

    if is_youtube_url(args.video):
        print(f"Using YouTube URL directly: {args.video}", file=sys.stderr)
        file_uri, mime_type = args.video, None
    else:
        if not os.path.isfile(args.video):
            die(f"No such file: {args.video}")
        print(f"Uploading {args.video} to Gemini...", file=sys.stderr)
        file_uri, mime_type = upload_file(args.video, key)

    print("Analyzing video...", file=sys.stderr)
    answer = ask_about_video(
        file_uri, mime_type, question, key, clip=clip, fps=args.fps
    )
    print(answer)


if __name__ == "__main__":
    main()
