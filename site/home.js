// Rewired home page: the hero "R engine" motion graphic and scroll reveals.
// What a client logs flows from the week-1 "before" body, through a tile, into
// the R, and comes out as change on the body: waist in, muscle definition up.
// Example data only.
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
    ['meal', 'Meals', '3-egg omelette', '<b>3-egg omelette</b> → <em>+19 g protein</em> · 150 / 160 g', 'warn'],
    ['train', 'Training', 'DB press 24 kg × 8', '<b>Upper A, hotel gym</b> → <em>+2.5 kg</em> on last week', 'ok'],
    ['habit', 'Habits', 'Steps 11,240', '<b>Steps 11,240</b> → <em>target met</em> · 5 days in a row', 'ok'],
    ['supp', 'Supps', 'Creatine 5 g', '<b>Supplements</b> → <em>3 of 3</em> today', 'ok'],
    ['check', 'Check-in', '3 photos · 84.2 cm', '<b>Check-in sent</b> → <em>Abhey reviews it this week</em>', 'ok'],
    ['prog', 'Progress', 'Week 1 → 6', '<b>Waist since week 1</b> → <em>−9.6 cm</em>', 'ok'],
  ];
  const N = STEPS.length, STEP = 3.2;

  const $ = (id) => document.getElementById(id);
  const engine = $('engine');
  if (engine) startEngine();
  startReveal();
  startPhone();
  startFilm();

  function startEngine() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const seg = (t, a, b) => clamp((t - a) / (b - a));
    const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

    $('tiles').innerHTML = STEPS.map((s) => `<div class="e-tile"><svg viewBox="0 0 24 24">${ICONS[s[0]]}</svg><span>${s[1]}</span></div>`).join('');
    const tiles = [...$('tiles').children];

    // Two layouts in stage units: a left-to-right line on wide screens, stacked on phones.
    const L = {
      wide: { w: 1100, h: 510, cubes: [70, 240], cols: 2, tile0: [230, 90], gap: [130, 140], hub: [640, 240], con: [760, 30] },
      tall: { w: 380, h: 1280, cubes: [190, 160], cols: 3, tile0: [70, 350], gap: [120, 130], hub: [190, 670], con: [20, 810] },
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
        // before body → each tile row → hub → body panel
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
        d = `M${cx},${cy + 150} L${cx},${lay.tile0[1] - 60} M${cx},${bottom + 60} L${hx},${hy - 92} M${hx},${hy + 92} L${hx},${lay.con[1]}`;
        lay.inPath = (i) => { const [x, y] = tilePos(i); return [[cx, cy + 140], [x, lay.tile0[1] - 60], [x, y]]; };
        lay.outFrom = [hx, hy + 92]; lay.outTo = [hx, lay.con[1] + 10];
      }
      $('tube').setAttribute('d', d); $('core').setAttribute('d', d);
      // Pulses run straight segments: tile → hub, then hub → body panel.
      lay.pulseIn = (i) => { const [x, y] = tilePos(i); return `M${x},${y} L${hx},${hy}`; };
      $('pulse-out').setAttribute('d', `M${lay.outFrom[0]},${lay.outFrom[1]} L${lay.outTo[0]},${lay.outTo[1]}`);
      void cw; void ch;
    }
    function place(el, [x, y]) { el.style.left = x + 'px'; el.style.top = y + 'px'; }

    // ---- body figure: "week 1" (soft) to "week 12" (lean, defined) ----
    // Left-half outline points [soft, toned]; the right half mirrors them.
    const OUT = [
      [[-15, 70], [-16, 70]],    // neck
      [[-20, 82], [-24, 80]],    // neck base
      [[-46, 90], [-54, 86]],    // trapezius
      [[-58, 104], [-72, 100]],  // shoulder
      [[-50, 128], [-54, 124]],  // armpit
      [[-50, 152], [-52, 148]],  // chest side
      [[-56, 190], [-42, 188]],  // lower ribs
      [[-64, 222], [-37, 218]],  // waist
      [[-58, 248], [-42, 246]],  // hip
      [[-52, 280], [-46, 280]],  // upper thigh
      [[-44, 330], [-40, 330]],  // lower thigh
      [[-32, 362], [-30, 362]],  // knee
      [[-34, 398], [-34, 392]],  // calf
      [[-22, 436], [-21, 436]],  // ankle
      [[-10, 440], [-10, 440]],  // foot inside
      [[-12, 400], [-12, 398]],  // inner calf
      [[-12, 362], [-12, 362]],  // inner knee
      [[-8, 300], [-6, 300]],    // inner thigh
      [[0, 276], [0, 276]],      // crotch
    ];
    // Left arm: from the shoulder, down the outside and back up the inside.
    const ARM = [
      [[-58, 104], [-72, 100]],
      [[-68, 122], [-86, 120]],  // deltoid
      [[-70, 160], [-86, 160]],  // biceps outer
      [[-68, 196], [-80, 196]],  // elbow
      [[-66, 236], [-76, 234]],  // forearm
      [[-62, 268], [-68, 268]],  // wrist
      [[-58, 286], [-64, 286]],  // hand
      [[-50, 272], [-56, 270]],
      [[-52, 236], [-60, 234]],
      [[-54, 196], [-62, 196]],
      [[-54, 156], [-62, 156]],
      [[-50, 128], [-54, 124]],
    ];
    const lerp = (a, b, t) => a + (b - a) * t;
    const pts = (list, t) => list.map(([a, b]) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    // Closed Catmull-Rom spline through the points, as cubic Beziers.
    function smooth(p) {
      const n = p.length; let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
      for (let i = 0; i < n; i++) {
        const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d + 'Z';
    }
    const mirror = (p) => p.map(([x, y]) => [-x, y]);
    function bodyPath(t) {
      const left = pts(OUT, t);
      const right = mirror(left.slice(0, -1)).reverse();
      return smooth([...left, ...right]);
    }
    // Muscle definition lines, drawn on the left and mirrored; they fade in as t rises.
    function defLines(t) {
      const sx = lerp(1, 1.12, t);
      const L = [
        `M-3,104 Q-26,100 ${-46 * sx},120`,                       // collarbone to delt
        `M${-46 * sx},126 Q-26,146 -3,140`,                        // lower pec
        `M${-60 * sx},106 Q${-62 * sx},118 ${-56 * sx},130`,      // deltoid split
        'M-14,156 Q-8,158 -2,156', 'M-14,178 Q-8,180 -2,178', 'M-13,200 Q-8,202 -2,200', // abs
        'M-34,206 Q-24,236 -8,262',                                // oblique / V line
        'M-36,292 Q-26,320 -24,352',                               // quad sweep
        `M${-64 * sx},150 Q${-60 * sx},166 ${-62 * sx},182`,      // biceps
      ];
      const one = L.join(' ');
      const flip = one.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (m, x, y) => `${-x},${y}`);
      return `${one} ${flip} M0,140 L0,236`;
    }
    const fig = $('figure');
    fig.innerHTML = `<defs>
        <linearGradient id="bodyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a4c86"/><stop offset="1" stop-color="#132c55"/></linearGradient>
        <linearGradient id="scanFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(244,199,125,0)"/><stop offset=".5" stop-color="rgba(244,199,125,.35)"/><stop offset="1" stop-color="rgba(244,199,125,0)"/></linearGradient>
        <clipPath id="bodyClip"><path id="clip-body"/><path id="clip-arm-l"/><path id="clip-arm-r"/><ellipse cx="0" cy="38" rx="21" ry="26"/></clipPath>
      </defs>
      <path class="skin" id="arm-l"/><path class="skin" id="arm-r"/>
      <path class="skin" id="torso"/>
      <ellipse class="head" cx="0" cy="38" rx="21" ry="26"/>
      <path class="def" id="defs"/>
      <rect class="scan" id="scan" x="-110" y="-40" width="220" height="40" clip-path="url(#bodyClip)"/>`;
    // The "before" body on the left is the week-1 shape, drawn once.
    $('figure-before').innerHTML = `<path class="skin" d="${smooth(pts(ARM, 0))}"/><path class="skin" d="${smooth(mirror(pts(ARM, 0)))}"/><path class="skin" d="${bodyPath(0)}"/><ellipse class="head" cx="0" cy="38" rx="21" ry="26"/>`;
    let lastT = -1;
    function drawBody(t, scanY) {
      if (Math.abs(t - lastT) > 0.002) {
        lastT = t;
        const b = bodyPath(t), al = smooth(pts(ARM, t)), ar = smooth(mirror(pts(ARM, t)));
        $('torso').setAttribute('d', b); $('clip-body').setAttribute('d', b);
        $('arm-l').setAttribute('d', al); $('clip-arm-l').setAttribute('d', al);
        $('arm-r').setAttribute('d', ar); $('clip-arm-r').setAttribute('d', ar);
        $('defs').setAttribute('d', defLines(t));
        $('defs').style.opacity = (0.15 + 0.85 * t).toFixed(2);
        $('bp-week').textContent = 'Week ' + Math.round(1 + 11 * t);
        $('bp-waist').textContent = (92 - 9.6 * t).toFixed(1) + ' cm';
        $('bp-fat').textContent = Math.round(24 - 9 * t) + '%';
        $('bp-muscle').textContent = '+' + (2.4 * t).toFixed(1) + ' kg';
        ['bp-waist', 'bp-fat', 'bp-muscle'].forEach((id) => $(id).classList.toggle('down', t > 0.02));
      }
      $('scan').setAttribute('y', scanY == null ? -60 : (scanY * 490 - 40).toFixed(1));
    }
    let shown = -1;
    function showLast(k) {
      const el = $('bp-last');
      el.textContent = '✓ ' + STEPS[k][3].replace(/<[^>]+>/g, '');
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }

    let t0 = performance.now(), paused = reduce, pausedAt = 0, visible = true;
    const now = () => (paused ? pausedAt : (performance.now() - t0) / 1000);

    function render(time) {
      const total = N * STEP, T = ((time % total) + total) % total;
      const k = Math.floor(T / STEP), lt = T - k * STEP, s = STEPS[k];
      tiles.forEach((el, i) => el.classList.toggle('on', i === k && lt < 2.6));
      // packet: before body → tile (0–0.9 s), then tile → hub (0.9–1.6 s)
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
      // Each log moves the body one step from week 1 towards week 12; the loop resets after the last.
      const grow = ease(seg(lt, 2.6, 3.1));
      const reset = k === 0 ? 1 - ease(seg(lt, 0, 0.6)) : 0;
      const tBody = k === 0 && lt < 0.6 ? reset : (k + grow) / N;
      drawBody(Math.min(1, tBody), lt >= 2.4 && lt < 3.2 ? seg(lt, 2.4, 3.2) : null);
      const step = Math.floor(time / STEP);
      if (step !== shown && lt >= 2.6) { shown = step; showLast(k); }
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
      // Still frame: the finished week-12 body and the R mid-conversion.
      pausedAt = (N - 1) * STEP + 3.15; render(pausedAt); showLast(N - 1);
    } else {
      requestAnimationFrame(frame);
    }
    document.fonts && document.fonts.ready.then(() => { layout(); render(now()); });
  }

  // App preview: rotate the three phone screens; a still first screen with reduced motion.
  function startPhone() {
    const screens = document.querySelectorAll('.ph-screen'), dots = document.querySelectorAll('.ph-dots i');
    if (!screens.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let i = 0;
    setInterval(() => {
      screens[i].classList.remove('on'); dots[i].classList.remove('on');
      i = (i + 1) % screens.length;
      screens[i].classList.add('on'); dots[i].classList.add('on');
    }, 3600);
  }

  // "What that looks like": a looping walkthrough built from the app's UI.
  // Plays only while on screen; reduced motion shows each step still, chosen
  // from the list beside it.
  function startFilm() {
    const film = document.getElementById('film');
    if (!film) return;
    const frame = film.querySelector('.film-frame');
    const scenes = [...film.querySelectorAll('.fs')];
    const bars = [...film.querySelectorAll('.film-progress i')];
    const steps = [...document.querySelectorAll('#film-steps [data-scene]')];
    const top = film.querySelector('.fs-top'), tag = film.querySelector('.fs-tag');
    const toggle = document.getElementById('film-toggle');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const LENGTH = [3200, 3600, 3400, 3200, 3200, 4200, 2600];
    let i = 0, start = 0, elapsed = 0, playing = !reduce, visible = false, timers = [];

    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const clear = () => { timers.forEach(clearTimeout); timers = []; };

    // The little things that happen inside a scene: typing, counting.
    function play(scene) {
      clear();
      scene.querySelectorAll('[data-count]').forEach((el, k) => {
        const to = Number(el.dataset.count);
        if (reduce) { el.textContent = to.toLocaleString(); return; }
        el.textContent = '0';
        const t0 = performance.now() + 500 + k * 160, dur = 900;
        const tick = (t) => {
          const p = Math.min(Math.max((t - t0) / dur, 0), 1);
          el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString();
          if (p < 1 && scene.classList.contains('on')) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const inputs = [...scene.querySelectorAll('[data-type]')];
      inputs.forEach((el, k) => {
        if (reduce) { el.textContent = el.dataset.type; return; }
        el.textContent = '';
        later(() => {
          el.classList.add('typing');
          [...el.dataset.type].forEach((ch, c) => later(() => { el.textContent += ch; }, c * 70));
          later(() => el.classList.remove('typing'), el.dataset.type.length * 70 + 120);
        }, 450 + k * 230);
      });
      const typed = scene.querySelector('[data-typed]');
      if (typed) {
        const text = typed.dataset.typed;
        if (reduce) { typed.textContent = text; return; }
        typed.textContent = '';
        typed.classList.add('typing');
        [...text].forEach((ch, c) => later(() => { typed.textContent += ch; }, 600 + c * 22));
        later(() => typed.classList.remove('typing'), 600 + text.length * 22 + 300);
      }
    }

    function show(n) {
      i = (n + scenes.length) % scenes.length;
      const s = scenes[i];
      scenes.forEach((x) => x.classList.toggle('on', x === s));
      frame.classList.add('swap');
      setTimeout(() => {
        top.querySelector('.fs-n').textContent = s.dataset.n;
        top.querySelector('.fs-title').textContent = s.dataset.title;
        tag.textContent = s.dataset.tag;
        tag.classList.toggle('alert', s.hasAttribute('data-alert'));
        frame.classList.toggle('at-end', !s.dataset.n);
        frame.classList.remove('swap');
      }, reduce ? 0 : 200);
      steps.forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.scene) === i)));
      bars.forEach((b, k) => b.style.setProperty('--p', k < i ? 1 : 0));
      start = performance.now();
      elapsed = 0;
      play(s);
    }

    function frameLoop(t) {
      if (playing && visible) {
        elapsed = t - start;
        if (bars[i]) bars[i].style.setProperty('--p', Math.min(elapsed / LENGTH[i], 1));
        if (elapsed >= LENGTH[i]) show(i + 1);
      } else start = t - elapsed;
      requestAnimationFrame(frameLoop);
    }

    steps.forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.scene))));
    toggle.addEventListener('click', () => {
      playing = !playing;
      toggle.textContent = playing ? 'Pause' : 'Play';
    });
    if (reduce) toggle.textContent = 'Play';
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: .35 }).observe(frame);
    else visible = true;
    show(0);
    requestAnimationFrame(frameLoop);
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
