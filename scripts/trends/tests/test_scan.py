"""Run: python -m unittest discover -s scripts/trends/tests"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import analyze  # noqa: E402
import scan  # noqa: E402
import source_reddit  # noqa: E402
import source_youtube  # noqa: E402
from common import Post, SourceError, set_now  # noqa: E402
from datetime import datetime  # noqa: E402

FIXTURE = HERE / "fixtures" / "sample_posts.json"


def load():
    fx = json.loads(FIXTURE.read_text())
    set_now(datetime.fromisoformat(fx["generated"]))
    return [Post.from_json(d) for d in fx["posts"]]


class AnalyzeTests(unittest.TestCase):
    def tearDown(self):
        set_now(None)

    def test_percentiles_are_per_platform(self):
        scored = analyze.score(load())
        for platform in ("youtube", "reddit"):
            pcts = [s.pct for s in scored if s.post.platform == platform]
            self.assertLess(min(pcts), 10)
            self.assertGreater(max(pcts), 90)

    def test_velocity_formulas(self):
        p = Post("reddit", "x", "u", "t", "c", "r/x", datetime.fromisoformat("2026-11-01T20:00:00+00:00"),
                 "q", {"score": 100, "comments": 50})
        set_now(datetime.fromisoformat("2026-11-02T20:00:00+00:00"))
        self.assertAlmostEqual(analyze.velocity(p), 200.0)

    def test_hook_types(self):
        self.assertEqual(analyze.hook_types("Stop doing cardio for fat loss")[0], "Warning / mistake")
        self.assertEqual(analyze.hook_types("Is creatine worth it?")[0], "Question")
        self.assertEqual(analyze.hook_types("I lost 12kg without cardio")[0], "Personal story")
        self.assertEqual(analyze.hook_types("Beginner workout plan"), ["Statement"])

    def test_topics_skip_seed_keywords_and_need_multiple_creators(self):
        scored = analyze.score(load())
        tops = analyze.topics(scored, ["fat loss", "protein"])
        phrases = [t.phrase for t in tops]
        self.assertNotIn("protein", phrases)
        self.assertNotIn("fat loss", phrases)
        self.assertIn("creatine", phrases)
        for t in tops:
            self.assertGreaterEqual(t.creators, 2)

    def test_dedupe(self):
        posts = load()
        self.assertEqual(len(analyze.dedupe(posts + posts[:3])), len(posts))


class CollectorTests(unittest.TestCase):
    def tearDown(self):
        set_now(None)

    def test_youtube_without_key_fails_cleanly(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(SourceError):
                source_youtube.collect(["x"], 30)

    def test_youtube_parses_api_response(self):
        set_now(datetime.fromisoformat("2026-11-02T00:00:00+00:00"))
        search = {"items": [{"id": {"videoId": "abc"}}]}
        videos = {"items": [{"id": "abc", "snippet": {"title": "Protein myths", "channelTitle": "C",
                                                       "channelId": "UC1", "publishedAt": "2026-10-30T00:00:00Z"},
                             "statistics": {"viewCount": "1000", "likeCount": "50", "commentCount": "5"}}]}
        with mock.patch.dict("os.environ", {"YOUTUBE_API_KEY": "k"}), \
             mock.patch.object(source_youtube, "get_json", side_effect=[search, videos]) as g:
            posts = source_youtube.collect(["protein"], 30)
        self.assertEqual(posts[0].metrics["views"], 1000)
        self.assertEqual(posts[0].url, "https://www.youtube.com/watch?v=abc")
        self.assertEqual(g.call_args_list[0].args[1]["publishedAfter"], "2026-10-03T00:00:00Z")

    def test_reddit_filters_window_and_stickies(self):
        set_now(datetime.fromisoformat("2026-11-02T00:00:00+00:00"))
        listing = {"data": {"children": [
            {"data": {"id": "a", "permalink": "/r/x/comments/a/", "title": "Fresh?", "author": "u1",
                      "subreddit": "x", "created_utc": 1793491200, "score": 10, "num_comments": 2}},
            {"data": {"id": "b", "permalink": "/r/x/comments/b/", "title": "Old", "author": "u2",
                      "subreddit": "x", "created_utc": 1700000000, "score": 10, "num_comments": 2}},
            {"data": {"id": "c", "permalink": "/r/x/comments/c/", "title": "Mod post", "stickied": True,
                      "subreddit": "x", "created_utc": 1793491200}},
        ]}}
        with mock.patch.dict("os.environ", {}, clear=True), \
             mock.patch.object(source_reddit, "get_json", return_value=listing), \
             mock.patch.object(source_reddit.time, "sleep"):
            posts = source_reddit.collect([], ["x"], 30)
        self.assertEqual([p.id for p in posts], ["a"])


class EndToEnd(unittest.TestCase):
    def tearDown(self):
        set_now(None)

    def test_fixture_report(self):
        with tempfile.TemporaryDirectory() as d:
            rc = scan.main(["--fixture", str(FIXTURE), "--out", d])
            self.assertEqual(rc, 0)
            md = next(Path(d).glob("*-sample.md")).read_text()
        self.assertIn("SAMPLE ONLY", md)
        self.assertIn("## Top topics", md)
        self.assertIn("creatine", md)

    def test_all_sources_failing_returns_error(self):
        with tempfile.TemporaryDirectory() as d, \
             mock.patch.object(scan.source_youtube, "collect", side_effect=SourceError("no key")), \
             mock.patch.object(scan.source_reddit, "collect", side_effect=SourceError("blocked")):
            rc = scan.main(["--out", d])
            md = next(Path(d).glob("*.md")).read_text()
        self.assertEqual(rc, 1)
        self.assertIn("failed: no key", md)


if __name__ == "__main__":
    unittest.main()
