# Landing page hero film

`film.html` is the landing page's hero video, written as an HTML animation
(Remotion style: every frame is drawn by `render(t)`), so the copy and colours
can be edited like a web page and re-rendered.

- Preview it live: open `film.html#play` in a browser.
- Re-render the two videos (needs Node, Playwright and ffmpeg):

  ```sh
  cd docs/hero-film
  node render.js land 1920 1080 ../../site/assets/hero-land.mp4 30
  node render.js port 1080 1920 ../../site/assets/hero-port.mp4 30
  ```

  Then refresh the poster images:

  ```sh
  ffmpeg -y -ss 2 -i ../../site/assets/hero-land.mp4 -frames:v 1 -vf scale=1280:-1 -q:v 4 ../../site/assets/hero-land.jpg
  ffmpeg -y -ss 2 -i ../../site/assets/hero-port.mp4 -frames:v 1 -vf scale=720:-1 -q:v 4 ../../site/assets/hero-port.jpg
  ```

The landscape version plays on desktop, the portrait one on phones.
