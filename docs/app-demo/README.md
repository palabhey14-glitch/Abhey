# Client app demo video

`demo.html` is a 30-second portrait (9:16) walkthrough of the Rewired client app:
sign in, today's numbers, meals and macros, training, habits, supplements, the
weekly check-in and progress. Every frame is drawn by `render(t)`, so the video is
rendered frame by frame rather than screen-recorded.

- Watch it live: open `demo.html#play` in a browser.
- Preview frames: `node render.js 540 960 /tmp/f 30 3.5,7.5,12.8` (writes PNGs).
- Full render: `node render.js 1080 1920 app-demo-1080.mp4 30` (needs Playwright and ffmpeg).
- Web copy used on the home page:
  `ffmpeg -i app-demo-1080.mp4 -vf scale=720:1280 -c:v libx264 -crf 27 -pix_fmt yuv420p -movflags +faststart -an site/assets/app-demo.mp4`
  and the poster `site/assets/app-demo-poster.jpg` (frame at 12.9 s).

Scene times live in `SCENES` in `demo.html`. If you change them, update the
`data-at` times on the "See it in action" steps in `site/index.html` too.
All numbers shown are example client data.
