// Renders film.html frame by frame with the REAL client app inside the phone.
// Needs the e2e stack running (tests/e2e/server.js on :8830 + PostgREST or
// pgrst-lite on :3009) and docs/launch-video/seed.sql loaded.
//   node docs/launch-video/render.js out.mp4 [fps] [from] [to]
//   node docs/launch-video/render.js --stills dir 1,4.5,9   (PNG frames)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { jwt } = require('../../tests/e2e/server.js');
const { SHOTS, CAPS, PHONE_IN, END_AT, DURATION } = require('./timeline.js');

const A = '00000000-0000-0000-0000-0000000000a1';
const BASE = 'http://localhost:8830';
const stills = process.argv[2] === '--stills';
const outArg = stills ? process.argv[3] : process.argv[2] || 'launch.mp4';
const FPS = stills ? 30 : Number(process.argv[3]) || 30;
const FROM = stills ? 0 : Number(process.argv[4]) || 0;
const TO = stills ? DURATION : Number(process.argv[5]) || DURATION;
const STILL_TIMES = stills ? process.argv[4].split(',').map(Number) : null;

// iframe point -> composition point (phone at top 150, scale 1.12 from top centre)
const toComp = (x, y) => ({ x: 270 + (x - 195) * 1.12, y: 150 + y * 1.12 });

(async () => {
  // Start clean, no workout left running from an earlier render.
  require('child_process').execSync(`psql -h /var/lib/postgresql/rwtest -p 5499 -U postgres -d rw -tAq -c "delete from client_workout_sessions where user_id = '${A}'"`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const t = jwt({ sub: A, role: 'authenticated', email: 'arjun@example.com', aud: 'authenticated' });
  const v = JSON.stringify({ access_token: t, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: A, email: 'arjun@example.com', aud: 'authenticated', role: 'authenticated' } });
  await ctx.addInitScript((val) => { try { localStorage.setItem('sb-localhost-auth-token', val); } catch (e) {} }, v);
  await ctx.route(`${BASE}/__lv/**`, (route) => {
    const file = path.join(__dirname, new URL(route.request().url()).pathname.replace('/__lv/', ''));
    route.fulfill({ path: file });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error', String(e)));
  await page.goto(`${BASE}/__lv/film.html`);
  await page.evaluate(({ CAPS, PHONE_IN, END_AT }) => Object.assign(window, { CAPS, PHONE_IN, END_AT }), { CAPS, PHONE_IN, END_AT });
  const frame = () => page.frames().find((f) => f.url().includes('/app/'));
  await page.waitForTimeout(1500);
  await frame().waitForLoadState('networkidle');
  // Phone-sized app; hide scrollbars so the screen looks like the phone.
  await frame().addStyleTag({ content: '::-webkit-scrollbar{display:none} html{scrollbar-width:none}' });
  await page.evaluate(() => document.fonts.ready);

  const done = new Set();
  async function runActions(time) {
    for (const [i, s] of SHOTS.entries()) {
      if (s.at <= time && !done.has(i)) {
        done.add(i);
        const f = frame();
        if (s.go) {
          await f.evaluate((h) => { location.hash = h; }, s.go);
          await f.waitForLoadState('networkidle');
          await page.waitForTimeout(500);
          await f.evaluate(() => window.scrollTo(0, 0));
        }
        if (s.click) {
          await f.evaluate((q) => document.querySelector(q)?.click(), s.click).catch((e) => console.error('click failed', s.click, e.message));
          await page.waitForTimeout(s.wait || 900);
          await f.waitForLoadState('networkidle');
        }
        if (s.type) {
          for (const [sel, val] of s.type) await f.fill(sel, String(val)).catch((e) => console.error('type failed', sel, e.message));
        }
        if (s.eval) await f.evaluate(s.eval).catch((e) => console.error('eval failed', e.message));
      }
    }
  }
  async function scrollAt(time) {
    // The latest scroll move since the latest navigation; a new screen starts at the top.
    const s = SHOTS.filter((x) => (x.scroll || x.go) && time >= (x.scroll ? x.scroll[0] : x.at)).pop();
    if (!s || !s.scroll) return;
    const [a, b] = s.scroll;
    // from/to are pixels or a selector (scroll that element near the top).
    const resolve = async (v) => typeof v === 'number' ? v : frame().evaluate(([sel, off]) => {
      // "text:Chicken biryani" finds the smallest element holding that text.
      const el = sel.startsWith('text:')
        ? [...document.querySelectorAll('body *')].filter((e) => e.textContent.includes(sel.slice(5))).pop()
        : document.querySelector(sel);
      return el ? el.getBoundingClientRect().top + window.scrollY - off : 0;
    }, Array.isArray(v) ? v : [v, 90]);
    if (s.px === undefined) s.px = [await resolve(s.scroll[2]), await resolve(s.scroll[3])];
    const [from, to] = s.px;
    const k = Math.min(1, Math.max(0, (time - a) / (b - a)));
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    await frame().evaluate((y) => window.scrollTo(0, y), from + (to - from) * e);
  }
  async function tapAt(time) {
    const s = SHOTS.find((x) => x.tap && time >= x.at - 0.45 && time < x.at + 0.25);
    if (!s) return null;
    if (!s.tapPos) {
      const box = await frame().locator(s.tap).first().boundingBox({ timeout: 300 }).catch(() => null);
      if (!box) return null;
      s.tapPos = toComp(box.x + box.width / 2, box.y + box.height / 2);
    }
    const p = s.tapPos;
    const k = (time - (s.at - 0.45)) / 0.7;
    return { x: p.x, y: p.y, a: k < 0.75 ? Math.min(1, k * 4) : (1 - k) * 4, s: 1 - 0.15 * Math.sin(Math.min(1, k) * Math.PI) };
  }

  // Typing, a character at a time across a window: { typing: [a, b, selector, text] }
  async function typeAt(time) {
    for (const s of SHOTS.filter((x) => x.typing && time >= x.typing[0])) {
      const [a, b, sel, text] = s.typing;
      const n = Math.min(text.length, Math.ceil(((time - a) / (b - a)) * text.length));
      if (s.typed === n) continue;
      s.typed = n;
      await frame().evaluate(([q, v]) => { const el = document.querySelector(q); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }, [sel, text.slice(0, n)]);
    }
  }

  async function draw(time) {
    await runActions(time);
    await typeAt(time);
    await scrollAt(time);
    const tap = await tapAt(time);
    await page.evaluate(([tt, tp]) => window.render(tt, tp), [time, tap]);
  }

  if (stills) {
    fs.mkdirSync(outArg, { recursive: true });
    for (let time = 0, i = 0; i < STILL_TIMES.length; time += 1 / FPS) {
      await draw(time);
      if (time >= STILL_TIMES[i] - 1e-6) {
        await page.screenshot({ path: path.join(outArg, `t${STILL_TIMES[i]}.png`) });
        i += 1;
      }
    }
  } else {
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outArg], { stdio: ['pipe', 'inherit', 'inherit'] });
    const n = Math.round((TO - FROM) * FPS);
    for (let time = 0, i = 0; time < TO; time += 1 / FPS) {
      await draw(time);
      if (time >= FROM - 1e-6) {
        const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        if (++i % 60 === 0) console.log(`${i}/${n}`);
      }
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log('wrote', outArg);
  }
  await browser.close();
})();
