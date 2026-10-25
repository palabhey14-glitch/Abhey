// Renders demo.html frame by frame into an MP4 (deterministic, no screen recording).
// node render.js <width> <height> <out.mp4> <fps> [preview times, comma separated]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const [w, h, out, fps, preview] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: +w / 1080 });
  await p.goto('file://' + __dirname + '/demo.html');
  await p.evaluate(() => document.fonts.ready);
  if (preview) {
    for (const t of preview.split(',')) { await p.evaluate((t) => render(t), +t); await p.screenshot({ path: `${out}-${t}.png` }); }
    await b.close(); return;
  }
  const total = Math.round(await p.evaluate(() => window.DURATION) * +fps);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', fps, '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  for (let i = 0; i < total; i++) {
    await p.evaluate((t) => render(t), i / +fps);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await b.close();
})();
