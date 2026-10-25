// Rewired landing page: scroll-driven R mark, app peek, features and small reveals.
(() => {
  document.documentElement.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // ---------- R mark: extruded layers + orbiting inclusions ----------
  const INCL = [
    ['🗓️', '12-week plan', 'A 12-week plan written for you', 'Not a template. Your training, nutrition and habits are set from your call, your schedule and your starting point.'],
    ['🏋️', 'Gym · Home · Hotel', 'Training that travels', 'Every session has a gym, home and hotel version, so busy weeks and work trips never reset your progress.'],
    ['🍛', 'South Asian macros', 'Macros built on your food', 'Vegetarian, vegan, halal or pescatarian. Dal, roti, rice and curries are built into your numbers.'],
    ['✅', 'Habit tracker', 'Daily habits, colour-coded', 'Log steps, protein, water and sleep in the app. Each one turns green, orange or red against your targets.'],
    ['💬', 'Weekly check-ins', 'Weekly check-ins with Abhey', 'Photos, measurements and a written review every week. Your plan is adjusted from your real numbers.'],
    ['📈', 'Progress dashboard', 'See the recomposition', 'Waist, weekly weight averages and photos side by side, so you see change even when the scale stalls.'],
    ['8', 'Week 8 Promise', 'The Week 8 Progress Promise', "Notice the difference by week 8, or Abhey keeps coaching you at no additional coaching cost until you're happy with your progress."],
  ];
  const N = INCL.length;
  const INTRO = 0.2; // share of the pinned scroll spent zooming from hero to orbit

  const r3d = $('#r3d');
  let layers = '';
  for (let i = 22; i >= 1; i--) layers += `<span style="--i:${i}">R<i>.</i></span>`;
  r3d.innerHTML = layers + '<span class="face">R<i>.</i></span>';

  const orbit = $('#orbit');
  orbit.insertAdjacentHTML('beforeend', INCL.map(([ic, t], i) =>
    `<button class="chip" type="button" data-i="${i}" tabindex="-1" aria-hidden="true"><span class="ic">${ic}</span>${t}</button>`).join(''));
  const chips = $$('.chip', orbit);
  $('#incl-list').innerHTML = INCL.map(([, , h, d]) => `<li>${h}. ${d}</li>`).join('');

  const rPin = $('.r-pin');
  const heroCopy = $('.hero-copy');
  const tether = $('#tether-line');
  let lastStep = -1;

  function geometry() {
    const st = rPin.querySelector('.stage');
    const w = st.clientWidth, h = st.clientHeight, small = w < 640;
    return {
      small,
      rx: small ? w * 0.31 : Math.min(w * 0.38, 470),
      ry: small ? h * 0.2 : Math.min(h * 0.26, 210),
      drop: (small ? 0.3 : 0.26) * h,
      lift: (small ? 0.08 : 0.07) * h,
      r0: small ? 0.48 : 0.55,
    };
  }
  let geo = geometry();

  function drawR(p) {
    const intro = clamp(p / INTRO), s = clamp((p - INTRO) / (1 - INTRO));
    rPin.style.setProperty('--intro', intro.toFixed(4));
    rPin.style.setProperty('--s', s.toFixed(4));
    const ri = clamp((intro - 0.25) / 0.75);
    rPin.style.setProperty('--ri', (ri < .5 ? 2 * ri * ri : 1 - Math.pow(-2 * ri + 2, 2) / 2).toFixed(4));
    rPin.style.setProperty('--drop', geo.drop + 'px');
    rPin.style.setProperty('--lift', geo.lift + 'px');
    rPin.style.setProperty('--r0', geo.r0);
    heroCopy.classList.toggle('gone', intro > 0.7);

    const riv = +rPin.style.getPropertyValue('--ri');
    const spread = easeOut(intro), cy = (1 - riv) * geo.drop - riv * geo.lift;
    const show = clamp((intro - 0.45) / 0.55);
    const pos = s * N;
    const active = Math.min(N - 1, Math.floor(pos));
    chips.forEach((c, i) => {
      const a = (i + 0.5 - pos) * (Math.PI * 2 / N) + Math.PI / 2;
      const depth = (Math.sin(a) + 1) / 2;
      const x = Math.cos(a) * geo.rx * spread, y = cy + Math.sin(a) * geo.ry * spread;
      const sc = (0.7 + depth * 0.36) * (0.4 + spread * 0.6);
      c.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
      c.style.zIndex = depth > 0.5 ? 30 : 5;
      c.style.opacity = (show * (0.45 + depth * 0.55)).toFixed(2);
      c.style.pointerEvents = intro > 0.9 ? 'auto' : 'none';
      c.classList.toggle('hot', i === active && intro > 0.9);
      if (i === active) {
        tether.setAttribute('x1', 2000); tether.setAttribute('y1', 2000 + cy);
        tether.setAttribute('x2', (2000 + x).toFixed(1)); tether.setAttribute('y2', (2000 + y).toFixed(1));
      }
    });
    if (active !== lastStep) {
      lastStep = active;
      const [, , h, d] = INCL[active];
      $('#o-k').textContent = `Included · ${active + 1} of ${N}`;
      $('#o-h').textContent = h;
      $('#o-p').textContent = d;
    }
  }

  // Clicking a chip scrolls to its step
  chips.forEach((c) => c.addEventListener('click', () => {
    const i = +c.dataset.i;
    const top = rPin.getBoundingClientRect().top + scrollY;
    const run = rPin.offsetHeight - innerHeight;
    const p = INTRO + ((i + 0.5) / N) * (1 - INTRO);
    scrollTo({ top: top + run * p, behavior: 'smooth' });
  }));

  // ---------- App peek ----------
  const pPin = $('.p-pin');
  let lastScreen = -1;
  function drawPhone(p) {
    pPin.style.setProperty('--p', p.toFixed(4));
    const s = Math.min(2, Math.floor(p * 3));
    if (s === lastScreen) return;
    lastScreen = s;
    $$('.screen', pPin).forEach((el) => el.classList.toggle('on', +el.dataset.s === s));
    $$('.phone-steps li', pPin).forEach((el) => el.classList.toggle('on', +el.dataset.s === s));
  }

  // ---------- Word-by-word reveal ----------
  const reveal = $('#reveal');
  (function split(el) {
    [...el.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((t) => {
          if (!t) return;
          if (/^\s+$/.test(t)) frag.append(t);
          else { const w = document.createElement('span'); w.className = 'w'; w.textContent = t; frag.append(w); }
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) split(n);
    });
  })(reveal);
  const words = $$('.w', reveal);

  // ---------- Scroll engine ----------
  const progress = (el) => {
    const r = el.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - innerHeight));
  };
  function tick() {
    if (reduce) return;
    drawR(progress(rPin));
    drawPhone(progress(pPin));
    const rr = reveal.getBoundingClientRect();
    const lit = clamp((innerHeight * 0.85 - rr.top) / (rr.height + innerHeight * 0.35)) * words.length;
    words.forEach((w, i) => w.style.setProperty('--lit', clamp(lit - i).toFixed(2)));
  }
  if (reduce) {
    chips.forEach((c) => { c.tabIndex = -1; });
  } else {
    let queued = false;
    addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { tick(); queued = false; });
    }, { passive: true });
    addEventListener('resize', () => { geo = geometry(); tick(); });
    tick();
  }

  // ---------- Features 01-06 ----------
  const FEATS = [
    ['Training for gym, home and hotel', 'Your program is written for your equipment and schedule, with a swap for every session when you travel.', ['3 to 4 sessions a week, 45 to 60 minutes', 'Progressive overload tracked in the app', 'Hotel and home versions of every workout']],
    ['Macros built on South Asian food', 'Your targets are set from your body and goal, then filled with meals you already eat.', ['Vegetarian, vegan, halal or pescatarian', 'Dal, roti, rice and curries included', 'Eating-out and family-dinner guidance']],
    ['Daily habit tracker', 'Steps, protein, calories, fibre, water and sleep, plus your own habits, all in one list.', ['Green when you hit target', 'Orange when you are close', 'Red when you are well off']],
    ['Weekly check-ins', 'Send photos, measurements and how the week felt. Abhey reviews and replies in writing.', ['Plan adjusted from real numbers', 'Private photo storage', 'Clear actions for next week']],
    ['Progress dashboard', 'Weekly averages instead of daily noise, so you see the trend that matters.', ['Waist and bodyweight trends', 'Photos side by side', 'Adherence by habit']],
    ['15 years of experience in your corner', 'Coaching from someone who has done it himself for 15 years, not a generic program.', ['Direct messaging with Abhey', 'Built for busy men 25 to 40', 'The Week 8 Progress Promise']],
  ];
  const fl = $('#feat-list'), fp = $('#feat-panel');
  fl.innerHTML = FEATS.map(([t], i) =>
    `<button role="tab" id="ft${i}" aria-controls="feat-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="n">0${i + 1}</span>${t}<span class="arr" aria-hidden="true">→</span></button>`).join('');
  const tabs = $$('button', fl);
  function showFeat(i, focus) {
    tabs.forEach((b, j) => { b.setAttribute('aria-selected', i === j); b.tabIndex = i === j ? 0 : -1; });
    if (focus) tabs[i].focus();
    const [t, d, pts] = FEATS[i];
    fp.setAttribute('aria-labelledby', 'ft' + i);
    fp.innerHTML = `<div class="big" aria-hidden="true">0${i + 1}</div><h3>${t}</h3><p>${d}</p><ul>${pts.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => showFeat(i));
    b.addEventListener('mouseenter', () => showFeat(i));
    b.addEventListener('keydown', (e) => {
      const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (k) { e.preventDefault(); showFeat((i + k + tabs.length) % tabs.length, true); }
    });
  });
  showFeat(0);

  // ---------- Coach view: habits hit per day (7 habits) ----------
  const WEEK = [['Mon', 6, 1, 0], ['Tue', 5, 1, 1], ['Wed', 7, 0, 0], ['Thu', 6, 0, 1], ['Fri', 4, 2, 1], ['Sat', 5, 2, 0], ['Sun', 6, 1, 0]];
  $('#cols').innerHTML = WEEK.map(([d, g, o, r], i) =>
    `<div class="col"><div class="stack" style="--d:${i * 70}ms" role="img" aria-label="${d}: ${g} hit, ${o} close, ${r} behind">${'<i class="g"></i>'.repeat(g)}${'<i class="o"></i>'.repeat(o)}${'<i class="r"></i>'.repeat(r)}</div><span>${d}</span></div>`).join('');

  // ---------- Reveal on view + counters ----------
  const countUp = (el) => {
    if (reduce) return;
    const end = +el.dataset.count, dp = +(el.dataset.dp || 0), sep = el.hasAttribute('data-sep');
    const t0 = performance.now();
    const step = (t) => {
      const k = clamp((t - t0) / 1100), v = end * easeOut(k);
      el.textContent = sep ? Math.round(v).toLocaleString('en-AU') : v.toFixed(dp);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  // ---------- See it in action: demo video plays in view, steps follow it ----------
  const video = $('#demo-video');
  if (video) {
    const btns = $$('#demo-steps button'), play = $('#demo-play');
    const times = btns.map((b) => +b.dataset.at);
    const mark = () => {
      const t = video.currentTime;
      let on = -1;
      times.forEach((a, i) => { if (t >= a) on = i; });
      if (t >= 28.4) on = -1;
      btns.forEach((b, i) => b.classList.toggle('on', i === on));
    };
    video.addEventListener('timeupdate', mark);
    const start = () => { video.play().then(() => { play.hidden = true; }).catch(() => { play.hidden = false; }); };
    btns.forEach((b) => b.addEventListener('click', () => {
      if (video.preload === 'none') video.preload = 'auto';
      video.currentTime = +b.dataset.at + 0.05; mark(); start();
    }));
    play.addEventListener('click', start);
    if (reduce) {
      // no autoplay: show the poster with a play button
      play.hidden = false;
      video.addEventListener('pause', () => { play.hidden = false; });
    } else {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { video.preload = 'auto'; start(); } else video.pause();
      }, { threshold: 0.35 }).observe(video);
    }
  }

  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    io.unobserve(e.target);
    $$('[data-count]', e.target).forEach(countUp);
  }), { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  $$('.rv').forEach((el) => io.observe(el));
})();
