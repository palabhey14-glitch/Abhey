/* Motion for the photo hero: cards fade in, numbers count up, the cards drift
   with the pointer and scroll, version B cycles the phone screens and version C
   runs a signal from Abhey's watch into each app card. Respects reduced motion. */
(function () {
  const doc = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const v = document.body.dataset.ph;
  const hero = document.querySelector('.ph-hero');

  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => doc.classList.add('ph-ready')));
  const img = document.querySelector('.ph-person, .ph-side img');
  if (img && !img.complete) { img.addEventListener('load', ready, { once: true }); setTimeout(ready, 1200); } else ready();

  // Count numbers up once the cards are in.
  document.querySelectorAll('.fc [data-count]').forEach((el) => {
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
    const fmt = (n) => n.toLocaleString('en-AU', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (reduce) { el.textContent = fmt(to); return; }
    const from = dec ? to * 1.04 : 0;
    el.textContent = fmt(from);
    setTimeout(() => {
      const t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, 900);
  });

  if (reduce) return;
  const host = hero || document.querySelector('.hero-short');

  // Pointer and scroll depth.
  if (host && matchMedia('(pointer: fine)').matches) {
    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      host.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      host.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    });
    host.addEventListener('pointerleave', () => { host.style.setProperty('--mx', 0); host.style.setProperty('--my', 0); });
  }
  if (hero) {
    let raf = 0;
    const onScroll = () => { raf = 0; const k = Math.min(1, Math.max(0, scrollY / hero.offsetHeight)); hero.style.setProperty('--sy', k.toFixed(3)); };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });
    onScroll();
  }

  // B: phone screens take turns.
  if (v === 'b') {
    const screens = [...document.querySelectorAll('.ph-scr')];
    let i = 0;
    if (screens.length) setInterval(() => { screens[i].classList.remove('on'); i = (i + 1) % screens.length; screens[i].classList.add('on'); }, 3000);
  }

  // C: a signal leaves the watch and lights up each card in turn.
  if (v === 'c' && hero) {
    const stage = hero.querySelector('.ph-stage');
    const svg = hero.querySelector('.ph-wire');
    const watch = hero.querySelector('.ph-watch');
    const person = hero.querySelector('.ph-person');
    const cards = [...hero.querySelectorAll('.fc.w')];
    const badge = hero.querySelector('.ph-ontrack');
    const NS = 'http://www.w3.org/2000/svg';
    let paths = [], vis = [];

    const layout = () => {
      const s = stage.getBoundingClientRect(), p = person.getBoundingClientRect();
      const wx = p.left - s.left + p.width * 0.555, wy = p.top - s.top + p.height * 0.868;
      watch.style.left = wx + 'px'; watch.style.top = wy + 'px';
      svg.setAttribute('viewBox', `0 0 ${s.width} ${s.height}`);
      svg.innerHTML = '';
      vis = cards.filter((c) => c.offsetParent !== null);
      paths = vis.map((c) => {
        const r = c.getBoundingClientRect();
        const left = r.left + r.width / 2 < p.left + p.width * 0.4;
        const tx = (left ? r.right : r.left) - s.left, ty = r.top - s.top + r.height / 2;
        const midX = (wx + tx) / 2;
        const d = `M${wx},${wy} C${midX},${wy} ${midX},${ty} ${tx},${ty}`;
        const base = document.createElementNS(NS, 'path'); base.setAttribute('d', d); base.setAttribute('class', 'base');
        const live = document.createElementNS(NS, 'path'); live.setAttribute('d', d); live.setAttribute('class', 'live'); live.setAttribute('pathLength', '100');
        svg.append(base, live);
        return live;
      });
    };
    layout();
    addEventListener('resize', layout);
    person.addEventListener('load', layout);

    let k = 0;
    const tick = () => {
      if (k >= vis.length) {
        badge.classList.add('on'); cards.forEach((c) => c.classList.remove('hit'));
        setTimeout(() => badge.classList.remove('on'), 2200);
        k = 0; setTimeout(tick, 2800); return;
      }
      const live = paths[k], card = vis[k];
      watch.classList.remove('beat'); void watch.offsetWidth; watch.classList.add('beat');
      if (live) { live.classList.remove('go'); void live.getBBox(); live.classList.add('go'); }
      setTimeout(() => card.classList.add('hit'), 650);
      k++; setTimeout(tick, 1300);
    };
    setTimeout(tick, 1800);
  }
})();
