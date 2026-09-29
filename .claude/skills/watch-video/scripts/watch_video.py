#!/usr/bin/env python3
"""Send a video file to the Gemini API and get back an answer about its contents.

Usage:
    python3 watch_video.py <video_path> "<question or instruction>"

Requires the GEMINI_API_KEY environment variable. Get a free key at
https://aistudio.google.com/apikey and set it in your shell or Claude Code
settings — never paste it directly into chat.
"""

import mimetypes
import os
import sys
import time
import urllib.request
import json

API_BASE = "https://generativelanguage.googleapis.com"
MODEL = "gemini-2.5-flash"


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


def upload_file(path: str, key: str) -> str:
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


def ask_about_video(file_uri: str, mime_type: str, question: str, key: str) -> str:
    body = {
        "contents": [
            {
                "parts": [
                    {"file_data": {"file_uri": file_uri, "mime_type": mime_type}},
                    {"text": question},
                ]
            }
        ]
    }
    req = urllib.request.Request(
        f"{API_BASE}/v1beta/models/{MODEL}:generateContent?key={key}",
        method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(body).encode(),
    )
    with urllib.request.urlopen(req) as resp:
        result = json.load(resp)

    try:
        return result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        die(f"Unexpected response from Gemini: {json.dumps(result)[:500]}")


def main() -> None:
    if len(sys.argv) < 2:
        die("usage: watch_video.py <video_path> [\"question\"]")

    video_path = sys.argv[1]
    question = sys.argv[2] if len(sys.argv) > 2 else (
        "Describe what happens in this video in detail, including any spoken "
        "dialogue, on-screen text, and notable visual events with approximate "
        "timestamps."
    )

    if not os.path.isfile(video_path):
        die(f"No such file: {video_path}")

    key = api_key()
    print(f"Uploading {video_path} to Gemini...", file=sys.stderr)
    file_uri, mime_type = upload_file(video_path, key)
    print("Analyzing video...", file=sys.stderr)
    answer = ask_about_video(file_uri, mime_type, question, key)
    print(answer)


if __name__ == "__main__":
    main()
