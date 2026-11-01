# Launch film (vertical 1080x1920, 30 seconds)

The phone in this film is the real client app (`site/app/`) running against the
browser-test stack with example client data, filmed frame by frame. Nothing in
the phone is drawn by hand.

- `seed.sql`, example client (Push day with a shoulder swap, macros, biryani and dal in the food log, 3 weeks of logs with sleep detail, health markers, two messages). Load it into the scratch e2e database only.
- `film.html`, the frame around the phone (Studio grey, Hanken Grotesk, Abhey's photo, captions, end card). `render(t)` draws one moment.
- `timeline.js`, captions and what the app does when (navigate, scroll, tap, type).
- `render.js`, renders the film.
- `voiceover.md`, the voiceover script that the captions follow.

## Run it

```sh
sh tests/e2e/setup.sh                       # scratch database (needs PostgreSQL 16 on the e2e socket)
for f in supabase/migrations/2026-10-29-client-calendar.sql supabase/migrations/2026-10-29-client-phases.sql \
         supabase/migrations/2026-10-30-client-dashboard.sql supabase/migrations/2026102*.sql supabase/migrations/2026103*.sql; do
  psql -h /var/lib/postgresql/rwtest -p 5499 -U postgres -d rw -q -f "$f"; done
psql -h /var/lib/postgresql/rwtest -p 5499 -U postgres -d rw -q -f docs/launch-video/seed.sql
NODE_PATH=<dir with pg> node tests/e2e/pgrst-lite.js &  # or real PostgREST via tests/e2e/start.sh
node tests/e2e/server.js &
node docs/launch-video/render.js rewired-launch.mp4 30                 # full film
node docs/launch-video/render.js --stills /tmp/frames 2,8,14           # check frames
```

Add music or a voiceover afterwards, for example
`ffmpeg -i rewired-launch.mp4 -i vo.wav -c:v copy -c:a aac -shortest out.mp4`.

Rules the copy follows: no prices, no testimonials or invented results, no colons,
"amber" not "orange", offer name "Rewired Premium Coaching with Abhey Pal", call to
action "Book a Strategy Call". All numbers in the phone are example data.
