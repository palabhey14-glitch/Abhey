// Rewired v2 previews: gentle reveals, counters, hero parallax and video
// handling. Everything is visible without this file; with reduced motion
// it only pauses the videos.
(() => {
  const body = document.body;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const videos = [...document.querySelectorAll('video')];

  if (still) {
    videos.forEach((v) => { v.removeAttribute('autoplay'); v.pause(); v.controls = true; });
    return;
  }

  // Videos play only while on screen.
  const vio = new IntersectionObserver((es) => es.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
  }), { threshold: 0.15 });
  videos.forEach((v) => vio.observe(v));

  body.classList.add('rw-motion');

  // Reveal blocks as they arrive. Anything already on screen shows at once.
  const groups = [
    '.sec .eyebrow', '.sec .statement', '.why-stage', '.block .tile', '.app-copy', '.app-film',
    '.stream-stage', '.film-frame', '.check-card', '.quotes figure', '.letter h2', '.letter-body',
    '.incl-in > div', '.incl-list > div', '.promise-card', '.final-in > *',
  ];
  const items = [];
  groups.forEach((sel) => document.querySelectorAll(sel).forEach((el, i) => {
    if (el.closest('[data-rv]')) return;
    el.setAttribute('data-rv', '');
    if (/tile|figure|incl-list/.test(sel)) el.style.setProperty('--d', `${(i % 6) * 0.08}s`);
    items.push(el);
  }));
  const rio = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  requestAnimationFrame(() => items.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.95) el.classList.add('in'); else rio.observe(el);
  }));
  document.querySelectorAll('.float').forEach((el, i) => el.style.setProperty('--bob', el.style.getPropertyValue('--bob') || `${-i * 1.7}s`));

  // Count up numbers the first time they show.
  const cio = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    cio.unobserve(e.target);
    const el = e.target; const to = +el.dataset.count; const t0 = performance.now(); const dur = 1400;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur); const ease = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * ease).toLocaleString('en-AU');
      if (k < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0'; requestAnimationFrame(tick);
  }), { threshold: 0.6 });
  document.querySelectorAll('[data-count]').forEach((el) => cio.observe(el));

  // A little depth in the hero: the photograph drifts slower than the page.
  const person = document.querySelector('.hero .person');
  const floats = [...document.querySelectorAll('.hero .float, .hero .tag, .hero .phone')];
  if (person) {
    let raf = 0;
    const move = () => {
      raf = 0;
      const y = Math.min(scrollY, innerHeight);
      person.style.transform = `translate3d(0, ${y * 0.08}px, 0)`;
      floats.forEach((f, i) => { f.style.transform = `translate3d(0, ${y * (-0.04 - i * 0.02)}px, 0)`; });
    };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(move); }, { passive: true });
  }
})();
