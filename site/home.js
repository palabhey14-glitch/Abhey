// Rewired home page: the hero "R engine" motion graphic and scroll reveals.
// What a client logs flows from the glowing input cubes, through a tile, into
// the R, and comes out as a line in the progress log. Example data only.
(function () {
  'use strict';

  const ICONS = {
    meal: '<path d="M4 11h16a8 8 0 0 1-16 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    train: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    habit: '<path d="M12 21a9 9 0 1 1 9-9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m8 12 3 3 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    supp: '<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    check: '<rect x="3" y="6" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 6l1.5-2h5L16 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    prog: '<path d="M4 18l5-5 4 3 7-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 8h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  // [icon, tile label, packet text, log line html, status class]
  const STEPS = [
    ['meal', 'Meals', 'Dal tadka + 2 roti', '<b>Dal tadka + 2 roti</b> → <em>+22 g protein</em> · 150 / 160 g', 'warn'],
    ['train', 'Training', 'DB press 24 kg × 8', '<b>Upper A, hotel gym</b> → <em>+2.5 kg</em> on last week', 'ok'],
    ['habit', 'Habits', 'Steps 11,240', '<b>Steps 11,240</b> → <em>target met</em> · 5 days in a row', 'ok'],
    ['supp', 'Supps', 'Creatine 5 g', '<b>Supplements</b> → <em>3 of 3</em> today', 'ok'],
    ['check', 'Check-in', '3 photos · 84.2 cm', '<b>Check-in sent</b> → <em>Abhey reviews it this week</em>', 'ok'],
    ['prog', 'Progress', 'Week 1 → 6', '<b>Waist since week 1</b> → <em>−4.2 cm</em>', 'ok'],
  ];
  const N = STEPS.length, STEP = 3.2, MAX_LINES = 6;

  const $ = (id) => document.getElementById(id);
  const engine = $('engine');
  if (engine) startEngine();
  startReveal();

  function startEngine() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const seg = (t, a, b) => clamp((t - a) / (b - a));
    const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

    $('tiles').innerHTML = STEPS.map((s) => `<div class="e-tile"><svg viewBox="0 0 24 24">${ICONS[s[0]]}</svg><span>${s[1]}</span></div>`).join('');
    const tiles = [...$('tiles').children];

    // Two layouts in stage units: a left-to-right line on wide screens, stacked on phones.
    const L = {
      wide: { w: 1100, h: 440, cubes: [70, 220], cols: 2, tile0: [230, 70], gap: [130, 140], hub: [640, 220], con: [760, 120] },
      tall: { w: 380, h: 900, cubes: [190, 70], cols: 3, tile0: [70, 200], gap: [120, 130], hub: [190, 520], con: [20, 660] },
    };
    let lay = L.wide, scale = 1;
    const tilePos = (i) => [lay.tile0[0] + (i % lay.cols) * lay.gap[0], lay.tile0[1] + Math.floor(i / lay.cols) * lay.gap[1]];

    function layout() {
      const w = engine.clientWidth;
      lay = w >= 760 ? L.wide : L.tall;
      // Stage width matches the console's 340px at phone sizes.
      scale = w / lay.w;
      const st = $('stage');
      st.style.width = lay.w + 'px'; st.style.height = lay.h + 'px'; st.style.transform = `scale(${scale})`;
      engine.style.height = lay.h * scale + 'px';
      const svg = $('pipes');
      svg.setAttribute('viewBox', `0 0 ${lay.w} ${lay.h}`); svg.style.width = lay.w + 'px'; svg.style.height = lay.h + 'px';
      place($('cubes'), lay.cubes); place($('hub'), lay.hub);
      tiles.forEach((el, i) => place(el, tilePos(i)));
      const con = $('console');
      con.style.left = lay.con[0] + 'px'; con.style.top = lay.con[1] + 'px';
      if (lay === L.tall) con.style.width = (lay.w - 2 * lay.con[0]) + 'px'; else con.style.width = '';
      const cw = con.offsetWidth, ch = con.offsetHeight;
      const [hx, hy] = lay.hub, [cx, cy] = lay.cubes;
      let d;
      if (lay === L.wide) {
        // cubes → each tile row → hub → console
        const rows = [0, 1, 2].map((r) => tilePos(r * 2)[1]);
        const colX = tilePos(1)[0];
        d = `M${cx + 50},${cy} L${tilePos(0)[0] - 70},${cy} ` +
          rows.map((y) => `M${tilePos(0)[0] - 70},${cy} C${tilePos(0)[0] - 40},${cy} ${tilePos(0)[0] - 70},${y} ${tilePos(0)[0] - 50},${y} L${colX + 50},${y}`).join(' ') +
          rows.map((y) => ` M${colX + 50},${y} C${colX + 110},${y} ${hx - 160},${hy} ${hx - 92},${hy}`).join('') +
          ` M${hx + 92},${hy} L${lay.con[0]},${hy}`;
        lay.inPath = (i) => { const [x, y] = tilePos(i); return [[cx + 40, cy], [tilePos(0)[0] - 60, y], [x, y]]; };
        lay.outFrom = [hx + 92, hy]; lay.outTo = [lay.con[0] + 10, hy];
      } else {
        const bottom = tilePos(N - 1)[1];
        d = `M${cx},${cy + 50} L${cx},${lay.tile0[1] - 60} M${cx},${bottom + 60} L${hx},${hy - 92} M${hx},${hy + 92} L${hx},${lay.con[1]}`;
        lay.inPath = (i) => { const [x, y] = tilePos(i); return [[cx, cy + 40], [x, lay.tile0[1] - 60], [x, y]]; };
        lay.outFrom = [hx, hy + 92]; lay.outTo = [hx, lay.con[1] + 10];
      }
      $('tube').setAttribute('d', d); $('core').setAttribute('d', d);
      // Pulses run straight segments: tile → hub, then hub → console.
      lay.pulseIn = (i) => { const [x, y] = tilePos(i); return `M${x},${y} L${hx},${hy}`; };
      $('pulse-out').setAttribute('d', `M${lay.outFrom[0]},${lay.outFrom[1]} L${lay.outTo[0]},${lay.outTo[1]}`);
      void cw; void ch;
    }
    function place(el, [x, y]) { el.style.left = x + 'px'; el.style.top = y + 'px'; }

    const log = $('log');
    let shown = -1;
    function addLine(k) {
      const s = STEPS[k];
      const li = document.createElement('li');
      li.innerHTML = `<span class="${s[4]}">${s[4] === 'ok' ? '✓' : '●'}</span><span>${s[3]}</span>`;
      log.appendChild(li);
      while (log.children.length > MAX_LINES) log.removeChild(log.firstChild);
    }

    let t0 = performance.now(), paused = reduce, pausedAt = 0, visible = true;
    const now = () => (paused ? pausedAt : (performance.now() - t0) / 1000);

    function render(time) {
      const total = N * STEP, T = ((time % total) + total) % total;
      const k = Math.floor(T / STEP), lt = T - k * STEP, s = STEPS[k];
      tiles.forEach((el, i) => el.classList.toggle('on', i === k && lt < 2.6));
      // packet: cubes → tile (0–0.9 s), then tile → hub (0.9–1.6 s)
      const pk = $('packet');
      const [a, b, c] = lay.inPath(k);
      let x, y;
      if (lt < 0.9) { const p = ease(seg(lt, 0, 0.9)); const q = p < .5 ? p * 2 : (p - .5) * 2; const [p0, p1] = p < .5 ? [a, b] : [b, c]; x = p0[0] + (p1[0] - p0[0]) * q; y = p0[1] + (p1[1] - p0[1]) * q; }
      else { const p = ease(seg(lt, 0.9, 1.6)); x = c[0] + (lay.hub[0] - c[0]) * p; y = c[1] + (lay.hub[1] - c[1]) * p; }
      pk.style.left = x + 'px'; pk.style.top = y + 'px';
      pk.style.opacity = lt < 1.6 ? String(Math.min(seg(lt, 0, 0.15), 1 - seg(lt, 1.45, 1.6))) : '0';
      if (pk.dataset.k !== String(k)) { pk.dataset.k = k; $('packet-ic').innerHTML = ICONS[s[0]]; $('packet-t').textContent = s[2]; $('pulse-in').setAttribute('d', lay.pulseIn(k)); }
      const pin = seg(lt, 0.9, 1.6);
      $('pulse-in').setAttribute('stroke-dasharray', pin > 0 && pin < 1 ? '140 1000' : '0 1000');
      $('pulse-in').setAttribute('stroke-dashoffset', (-pin * 860).toFixed(1));
      $('hub').classList.toggle('busy', lt > 1.5 && lt < 2.3);
      const pout = seg(lt, 2.1, 2.6);
      $('pulse-out').setAttribute('stroke-dasharray', pout > 0 && pout < 1 ? '160 1000' : '0 1000');
      $('pulse-out').setAttribute('stroke-dashoffset', (-pout * 840).toFixed(1));
      const step = Math.floor(time / STEP) + (lt >= 2.6 ? 1 : 0);
      if (step !== shown && lt >= 2.6) { shown = step; addLine(k); }
    }

    function frame() { if (!paused && visible) render(now()); if (!paused) requestAnimationFrame(frame); }
    const toggle = $('engine-toggle');
    toggle.onclick = () => {
      if (paused) { t0 = performance.now() - pausedAt * 1000; paused = false; requestAnimationFrame(frame); }
      else { pausedAt = now(); paused = true; }
      toggle.textContent = paused ? 'Play' : 'Pause';
    };
    toggle.textContent = paused ? 'Play' : 'Pause';
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(engine);
    addEventListener('resize', () => { layout(); render(now()); });
    layout();
    if (reduce) {
      // Still frame: a full log and the R mid-conversion.
      STEPS.forEach((_, i) => addLine(i)); shown = Infinity; pausedAt = 1.2; render(pausedAt);
    } else {
      addLine(N - 1); shown = 0;
      requestAnimationFrame(frame);
    }
    document.fonts && document.fonts.ready.then(() => { layout(); render(now()); });
  }

  function startReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
  }
})();
