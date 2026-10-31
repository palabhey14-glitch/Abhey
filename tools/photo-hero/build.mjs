// Builds preview copies of the Rewired site with Abhey's photo hero, in three
// versions (a, b, c). The live pages in site/ are not changed.
//
//   node tools/photo-hero/build.mjs <outDir> [--portable]
//
// Without --portable the pages keep root paths and expect site/ to be served
// at "/" with the previews under /<outDir relative to site>/a/ etc.
// With --portable every page and the files it needs are copied into outDir so
// the folder can be opened or hosted on its own (used for the preview page).

import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = join(ROOT, 'site');
const out = process.argv[2];
const portable = process.argv.includes('--portable');
if (!out) { console.error('usage: build.mjs <outDir> [--portable]'); process.exit(1); }

const PAGES = ['index', 'pricing', 'faq', 'resources', 'apply', 'entry-level', 'terms', 'privacy'];
const VERSIONS = ['a', 'b', 'c'];
const IMG = '/assets/abhey/abhey-hero.webp';
const PORTRAIT = '/assets/abhey/abhey-portrait.webp';
const BOOK = 'https://calendly.com/coaching-abheyrewired/30min';

/* ------------------------------------------------------------------ icons */
const I = {
  dumbbell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  plate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  flame: '<svg viewBox="0 0 26 32" aria-hidden="true"><path d="M13 1c1 6 9 9 9 18a9 9 0 0 1-18 0c0-4 2-7 4-8 0 3 1 5 3 6-1-6 1-12 2-16z" fill="#f4c77d"/><path d="M13 31a5 5 0 0 1-5-5c0-3 2-5 4-6 0 2 1 3 2 3 0-2 1-4 1-5 2 2 3 4 3 8a5 5 0 0 1-5 5z" fill="#e3a33b"/></svg>',
};

/* ------------------------------------------------------------------ app cards */
const C = {
  session: (cls = '', d = 0) => `<div class="fc fc-session ${cls}" style="--d:${d}" aria-hidden="true"><span class="fc-ic">${I.dumbbell}</span><div><small>Today’s session</small><b>Upper A · Hotel gym</b><em>45 min · 5 exercises</em></div></div>`,
  ring: (cls = '', d = 0) => `<div class="fc fc-ring ${cls}" style="--d:${d}" aria-hidden="true"><svg viewBox="0 0 48 48"><circle class="trk" cx="24" cy="24" r="20"/><circle class="val" cx="24" cy="24" r="20"/></svg><div><small>Protein today</small><b><span data-count="142">142</span> g</b><em>of 160 g</em></div></div>`,
  streak: (cls = '', d = 0) => `<div class="fc fc-streak ${cls}" style="--d:${d}" aria-hidden="true"><div class="row">${I.flame}<b data-count="7">7</b></div><small>Days on target</small><ol><li>M</li><li>T</li><li>W</li><li>T</li><li>F</li><li>S</li><li>S</li></ol></div>`,
  checkin: (cls = '', d = 0) => `<div class="fc fc-check ${cls}" style="--d:${d}" aria-hidden="true"><span class="fc-ic green">${I.check}</span><div><small>Week 4 check-in</small><b>−1.4 kg · waist −3 cm</b></div></div>`,
  habits: (cls = '', d = 0) => `<div class="fc fc-habits ${cls}" style="--d:${d}" aria-hidden="true"><small>Today’s habits</small><ul><li>Steps<span>8,400</span></li><li>Protein<span>142 g</span></li><li class="a">Water<span>2.1 L</span></li></ul></div>`,
  msg: (cls = '', d = 0, text = 'Great week. Carbs up 20 g on leg day.', who = 'Abhey · just now') => `<div class="fc fc-msg ${cls}" style="--d:${d}" aria-hidden="true"><span class="fc-r">R<i>.</i></span><div><small>${who}</small><p>${text}</p></div></div>`,
  trend: (cls = '', d = 0) => `<div class="fc fc-trend ${cls}" style="--d:${d}" aria-hidden="true"><div class="top"><div><small>Waist</small><b><span data-count="88.6" data-dec="1">88.6</span> cm</b></div><i>−3.4 cm</i></div><svg viewBox="0 0 160 40" preserveAspectRatio="none"><defs><linearGradient id="ph-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2444f9" stop-opacity=".25"/><stop offset="1" stop-color="#2444f9" stop-opacity="0"/></linearGradient></defs><path class="area" d="M2 6 L28 10 L54 9 L80 18 L106 22 L132 30 L158 34 L158 40 L2 40Z"/><path d="M2 6 L28 10 L54 9 L80 18 L106 22 L132 30 L158 34"/></svg></div>`,
  chip: (icon, tone, small, big, cls = '', d = 0) => `<div class="fc ${cls}" style="--d:${d}" aria-hidden="true"><span class="fc-ic ${tone}">${I[icon]}</span><div><small>${small}</small><b>${big}</b></div></div>`,
};

/* ------------------------------------------------------------------ shared hero copy */
const EYEBROW = '<p class="eyebrow">The 12 Week Rewired Premium Designer Coaching, with Abhey Pal</p>';
const H1 = '<h1 id="hero-title"><span>Your next chapter,</span> <em>rewired.</em></h1>';
const LEAD = '<p class="lead">I coach busy men who are tired of starting over. Twelve weeks of training and nutrition built around your job, your travel and the food you grew up on. I’ve been doing this for 15 years.</p>';
const ACTIONS = (light = true) => `<div class="actions"><a class="btn ${light ? 'btn-light' : 'btn-dark'}" data-book href="${BOOK}" target="_blank" rel="noopener noreferrer">Book a free 30-minute call</a><a class="text-link${light ? ' light' : ''}" href="apply.html">Apply Now</a></div>`;
const PERSON = `<img class="ph-img ph-person" src="${IMG}" alt="Abhey Pal, your coach" width="685" height="921" fetchpriority="high">`;
const NOTE = '<p class="ph-note">App screens with example numbers.</p>';

/* ------------------------------------------------------------------ version heroes */
const HERO = {
  // A. Spotlight. Centred photo on navy, headline above, the app floating around him.
  a: `<section class="hero ph-hero" aria-labelledby="hero-title">
      <div class="ph-glow" aria-hidden="true"></div>
      <div class="ph-orbits" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="wrap ph-grid">
        <div class="hero-copy">${EYEBROW}${H1}</div>
        <div class="ph-stage">
          <div class="ph-word" aria-hidden="true">REWIRED</div>
          ${PERSON}
          ${C.session('p1', 0)}${C.ring('p2', 2)}${C.habits('p3', 4)}
          ${C.msg('p4', 1)}${C.streak('p5', 3)}${C.trend('p6', 5)}
        </div>
        <div class="ph-foot">${LEAD}<div>${ACTIONS(true)}${NOTE}</div></div>
      </div>
    </section>`,

  // B. Bright editorial split. Abhey steps out of a navy arch, the app phone beside him.
  b: `<section class="hero ph-hero" aria-labelledby="hero-title">
      <div class="wrap ph-grid">
        <div class="hero-copy">${EYEBROW}${H1}${LEAD}${ACTIONS(false)}
          <ul class="ph-tags" aria-label="Built for"><li>Gym</li><li>Home</li><li>Hotel</li><li>Halal</li><li>Vegetarian</li><li>Vegan</li></ul>
        </div>
        <div class="ph-stage">
          <div class="ph-arch" aria-hidden="true"><span class="ph-arch-r">R<i>.</i></span></div>
          ${PERSON}
          <div class="ph-phone" aria-hidden="true"><div class="ph-screen">
            <div class="ph-status"><b>6:00</b><span></span></div>
            <div class="ph-scr on" data-s="home">
              <div class="s-hero"><small>Monday · Week 1 of 12</small><b>Good morning</b></div>
              <div class="s-card"><span class="fc-ic">${I.dumbbell}</span><div><small>Today’s session</small><b>Upper A</b></div></div>
              <div class="s-pills"><div><small>Steps</small><b>8,400</b><i style="--w:84%"></i></div><div><small>Protein</small><b>142 g</b><i style="--w:88%"></i></div></div>
              <div class="s-note"><span class="fc-r">R<i>.</i></span><p>Biggest lever this week, 160 g protein a day.</p></div>
            </div>
            <div class="ph-scr" data-s="log">
              <div class="s-head"><small>Log your workout</small><b>Bench press</b><em>3 × 6–8 · 2 RIR</em></div>
              <div class="s-set"><span>Set 1</span><b>60 kg</b><b>8</b></div>
              <div class="s-set"><span>Set 2</span><b>62.5 kg</b><b>7</b></div>
              <div class="s-set"><span>Set 3</span><b>65 kg</b><b>6</b></div>
              <div class="s-btn">Save workout</div>
            </div>
            <div class="ph-scr" data-s="food">
              <div class="s-head"><small>Add to breakfast</small><b>Protein oatmeal with berries</b></div>
              <div class="s-grid"><div><small>Protein</small><b>40 g</b></div><div><small>Carbs</small><b>62 g</b></div><div><small>Fat</small><b>12 g</b></div><div><small>Fibre</small><b>9 g</b></div></div>
              <div class="s-btn">Add</div>
            </div>
            <div class="ph-scr" data-s="check">
              <div class="s-alert"><b>Your check-in is due today</b><small>Photos, measurements and your week</small></div>
              <div class="s-photos"><span>Front</span><span>Side</span><span>Back</span></div>
              <div class="s-btn">Send check-in</div>
            </div>
          </div></div>
          ${C.checkin('p1', 1)}${C.msg('p2', 3)}${C.streak('p3', 5)}
        </div>
      </div>
      <div class="ph-marquee" aria-hidden="true"><div class="ph-track">${Array(2).fill('<span>The food you grew up on</span><span>Gym, home or hotel</span><span>Weekly check-ins with me</span><span>Halal</span><span>Vegetarian</span><span>Vegan</span><span>Pescatarian</span><span>15 years coaching</span>').join('')}</div></div>
    </section>`,

  // C. Cinematic pulse. Rim-lit photo, a signal runs from his watch into each app card.
  c: `<section class="hero ph-hero" aria-labelledby="hero-title">
      <div class="ph-lines" aria-hidden="true"></div>
      <div class="wrap ph-grid">
        <div class="hero-copy">${EYEBROW}${H1}${LEAD}${ACTIONS(true)}${NOTE}</div>
        <div class="ph-stage">
          <div class="ph-rim" aria-hidden="true"></div>
          ${PERSON}
          <svg class="ph-wire" aria-hidden="true"></svg>
          <span class="ph-watch" aria-hidden="true"></span>
          ${C.session('p1 w', 0)}${C.ring('p2 w', 1)}${C.habits('p3 w', 2)}${C.checkin('p4 w', 3)}
          <div class="ph-ontrack" aria-hidden="true"><span>${I.check}</span><b>On track.</b></div>
        </div>
      </div>
    </section>`,
};

/* ------------------------------------------------------------------ inner page photo + cards */
const SIDE_CARDS = {
  pricing: [C.msg('q1', 1, 'My personal WhatsApp, replies within 12 hours.', 'Abhey')],
  faq: [C.msg('q1', 0, 'Not sure about something? Ask me on the call.', 'Abhey'), C.chip('cal', 'sand', 'Strategy Call', 'Free · 30 minutes', 'q2', 2)],
  resources: [C.chip('plate', 'sand', 'Coming soon', 'Guides and recipes', 'q1', 0), C.trend('q2', 2)],
  apply: [C.chip('cal', '', 'Next step', 'Apply, then we talk', 'q1', 0), C.streak('q2', 2)],
  'entry-level': [C.chip('check', 'green', 'Every week', 'Check-in with me', 'q1', 0), C.ring('q2', 2)],
  terms: [C.chip('lock', 'dark', 'Your data', 'Seen only by you and me', 'q1', 0)],
  privacy: [C.chip('lock', 'dark', 'Your photos', 'Seen only by you and me', 'q1', 0)],
};
const side = (page) => `<div class="ph-side"><div class="ph-side-frame"><img class="ph-img" src="${PORTRAIT}" alt="Abhey Pal" width="923" height="928" loading="eager"></div>${(SIDE_CARDS[page] || []).join('')}</div>`;

/* ------------------------------------------------------------------ build */
function transform(html, page, v) {
  const css = `<link rel="stylesheet" href="/photo-hero/cards.css?v=1">\n  <link rel="stylesheet" href="/photo-hero/${v}.css?v=1">`;
  html = html.replace(/(<link rel="stylesheet" href="\/home\.css[^"]*">)/, `$1\n  ${css}`);
  html = html.replace(/<body([^>]*)>/, (m, attrs) => `<body${attrs} data-ph="${v}">`);
  html = html.replace('</body>', `  <script src="/photo-hero/ph.js?v=1" defer></script>\n</body>`);
  if (page === 'index') {
    html = html.replace(/<section class="hero" aria-labelledby="hero-title">[\s\S]*?\n    <\/section>/, HERO[v]);
  } else {
    if (page === 'pricing') html = html.replace('<div class="price-card">', `<div class="price-card">\n          ${side(page).replace('ph-side', 'ph-side ph-price')}`);
    else html = html.replace(/(<section class="hero hero-short"[^>]*>\s*<div class="wrap">)/, `$1\n        ${side(page)}`);
  }
  return html;
}

function portablePaths(html) {
  return html
    .replace(/(href|src)="\/app\/([^"]*)"/g, (m, a, p) => p.startsWith('icons/') ? `${a}="../app-icons/${p.slice(6)}"` : `${a}="https://rewiredbyabhey.com/app/${p}"`)
    .replace(/href="\/"/g, 'href="index.html"')
    .replace(/href="\/terms#/g, 'href="terms.html#')
    .replace(/(href|src)="\/(?!\/)/g, '$1="../');
}

for (const v of VERSIONS) {
  const dir = join(out, v);
  mkdirSync(dir, { recursive: true });
  for (const page of PAGES) {
    let html = transform(readFileSync(join(SITE, `${page}.html`), 'utf8'), page, v);
    if (portable) html = portablePaths(html);
    writeFileSync(join(dir, `${page}.html`), html);
  }
}

if (portable) {
  for (const f of ['home.css', 'plans.css', 'legal-pages.css', 'home.js', 'booking.js']) cpSync(join(SITE, f), join(out, f));
  cpSync(join(SITE, 'photo-hero'), join(out, 'photo-hero'), { recursive: true });
  for (const f of ['assets/app-icon.png', 'assets/fonts/montserrat-latin.woff2', 'assets/abhey/abhey-hero.webp', 'assets/abhey/abhey-portrait.webp']) {
    mkdirSync(dirname(join(out, f)), { recursive: true }); cpSync(join(SITE, f), join(out, f));
  }
  mkdirSync(join(out, 'app-icons'), { recursive: true });
  for (const f of ['favicon-32.png', 'apple-touch-icon.png']) cpSync(join(SITE, 'app/icons', f), join(out, 'app-icons', f));
}
console.log(`built ${VERSIONS.length} versions × ${PAGES.length} pages into ${out}${portable ? ' (portable)' : ''}`);
