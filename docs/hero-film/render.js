const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const [mode, w, h, out, fps, preview] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  await p.goto('file://' + __dirname + '/film.html');
  await p.evaluate((m) => window.setMode(m), mode);
  await p.evaluate(() => document.fonts.ready);
  if (preview) {
    for (const t of preview.split(',')) { await p.evaluate((t) => render(t), +t); await p.screenshot({ path: `${out}-${t}.png` }); }
    await b.close(); return;
  }
  const total = 14 * +fps;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', fps, '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  for (let i = 0; i < total; i++) {
    await p.evaluate((t) => render(t), i / +fps);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await b.close();
})();
