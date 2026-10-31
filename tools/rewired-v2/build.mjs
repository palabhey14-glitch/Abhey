// Five landing-page directions for Rewired, inspired by the Merdian layout
// (photo hero, statement sections, dark rounded blocks, a data stream and a
// worked example card), plus matching inner pages without a photo.
// The live pages in site/ are not changed.
//
//   node tools/rewired-v2/build.mjs <outDir> [--portable]

import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = join(ROOT, 'site');
const out = process.argv[2];
const portable = process.argv.includes('--portable');
if (!out) { console.error('usage: build.mjs <outDir> [--portable]'); process.exit(1); }

const BOOK = 'https://calendly.com/coaching-abheyrewired/30min';
const NAME = 'Rewired Premium Coaching with Abhey Pal';
const INNER = ['pricing', 'faq', 'resources', 'apply', 'entry-level', 'terms', 'privacy'];

/* ------------------------------------------------------------------ versions */
const V = {
  v1: { label: 'Espresso', fonts: 'family=Geist:wght@300..700&family=Geist+Mono:wght@400;500', clip: 'espresso', photo: 'rw-smile-warm' },
  v2: { label: 'Navy Ledger', fonts: 'family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500', clip: 'navy', photo: 'rw-colour' },
  v3: { label: 'Studio Light', fonts: 'family=Hanken+Grotesk:wght@300..700&family=JetBrains+Mono:wght@400;500', clip: 'light', photo: 'rw-smile-colour' },
  v4: { label: 'Monochrome', fonts: 'family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400', clip: 'light', photo: 'rw-smile-mono' },
  v5: { label: 'Kinetic', fonts: 'family=Albert+Sans:wght@300..800&family=JetBrains+Mono:wght@400;500', clip: 'navy', photo: 'rw-colour' },
};

/* ------------------------------------------------------------------ bits */
const ic = {
  arrow: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  plate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  steps: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 16c-2 0-3-2-3-5s1-6 3-6 3 3 3 6-1 5-3 5zM17 20c-2 0-3-2-3-4s1-5 3-5 3 3 3 5-1 4-3 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
};
const pill = (t) => `<span class="pill"><i></i>${t}</span>`;
const btns = (dark = false) => `<div class="cta-row"><a class="b b-primary" data-book href="${BOOK}" target="_blank" rel="noopener noreferrer">Book a Strategy Call ${ic.arrow}</a><a class="b b-ghost" href="apply.html">Apply Now ${ic.arrow}</a></div>`;
const TAGS = ['Gym', 'Home', 'Hotel', 'Halal', 'Vegetarian', 'Vegan', 'Pescatarian'];
const strip = () => `<ul class="strip" aria-label="Built for">${TAGS.map((t) => `<li>${t}</li>`).join('')}</ul>`;
const snippet = (lines) => `<pre class="code" aria-hidden="true">${lines}</pre>`;
const LOGS = [
  '"session": "Upper A",\n"place": "Hotel gym",\n"sets": 15,\n"status": "Logged"',
  '"meal": "Protein oatmeal",\n"protein": "40 g",\n"kcal": 534,\n"slot": "Breakfast"',
  '"habit": "Steps",\n"value": 8400,\n"target": 8000,\n"status": "Met"',
  '"checkin": "Week 4",\n"waist": "-3 cm",\n"photos": 3,\n"reply": "Abhey"',
];
const card = {
  session: () => `<div class="ui ui-row"><span class="ui-ic">${ic.dumbbell}</span><div><small>Today’s session</small><b>Upper A · Hotel gym</b></div><em>45 min</em></div>`,
  protein: () => `<div class="ui ui-stat"><small>Protein today</small><b><span data-count="142">142</span> g</b><i class="bar" style="--w:89%"></i><em>of 160 g</em></div>`,
  streak: () => `<div class="ui ui-stat"><small>Days on target</small><b data-count="7">7</b><ol class="dots"><li></li><li></li><li></li><li></li><li></li><li></li><li></li></ol></div>`,
  msg: () => `<div class="ui ui-msg"><span class="r">R<i>.</i></span><div><small>Abhey</small><p>Great week. Carbs up 20 g on leg day.</p></div></div>`,
  checkin: () => `<div class="ui ui-row"><span class="ui-ic ok">${ic.check}</span><div><small>Week 4 check-in</small><b>Waist −3 cm</b></div><em>Sent</em></div>`,
};

/* ------------------------------------------------------------------ nav and footer */
const nav = () => `<header class="nav"><div class="w nav-in">
  <a class="brand" href="index.html" aria-label="Rewired Coaching with Abhey Pal, home"><img src="/assets/app-icon.png" alt="" width="32" height="32"><span><b>Rewired</b><small>with Abhey Pal</small></span></a>
  <nav class="links" aria-label="Main"><a href="index.html" aria-current="page">Home</a><a href="pricing.html">Pricing</a><a href="resources.html">Resources</a><a href="faq.html">FAQ</a></nav>
  <div class="nav-act"><a class="b b-line b-sm" href="/app/">Client login</a><a class="b b-primary b-sm" data-book href="${BOOK}" target="_blank" rel="noopener noreferrer">Book a call</a></div>
</div></header>`;
const footer = () => `<footer class="foot"><div class="w foot-in">
  <div class="foot-brand"><img src="/assets/app-icon.png" alt="" width="40" height="40"><p>${NAME}</p></div>
  <div class="foot-contact"><a href="mailto:coaching@abheyrewired.com">${ic.mail}coaching@abheyrewired.com</a><a href="https://www.instagram.com/abhey.rewired/" target="_blank" rel="noopener noreferrer">${ic.ig}@abhey.rewired</a></div>
  <nav class="foot-nav" aria-label="Footer"><a href="resources.html">Resources</a><a href="faq.html">FAQ</a><a href="privacy.html">Privacy Policy</a><a href="terms.html">Terms &amp; Conditions</a><a href="/app/?coach">Coach login</a></nav>
  <p class="legal">© Rewired Coaching with Abhey Pal · ABN 73 322 472 368</p>
</div></footer>`;

/* ------------------------------------------------------------------ heroes */
const H1 = '<h1 id="hero-title">Your next chapter, <em>rewired.</em></h1>';
const LEAD = '<p class="lead">I coach busy men who are tired of starting over. Training and nutrition built around your job, your travel and the food you grew up on. I’ve been doing this for 15 years.</p>';
const img = (v, cls = 'person') => `<img class="${cls}" src="/assets/abhey/${V[v].photo}.webp" alt="Abhey Pal, your coach" fetchpriority="high">`;

const HERO = {
  // Espresso. An inset rounded hero, warm photograph, app logs as faint texture.
  v1: () => `<section class="hero" aria-labelledby="hero-title"><div class="w"><div class="hero-card">
    ${snippet(LOGS.join('\n\n'))}
    <div class="hero-copy">${pill(NAME)}${H1}${LEAD}${btns()}</div>
    ${img('v1')}
    <div class="float f1">${card.checkin()}</div>
    <div class="hero-foot">${strip()}</div>
  </div></div></section>`,

  // Navy Ledger. Serif headline, ledger grid, callouts pinned to the photo.
  v2: () => `<section class="hero" aria-labelledby="hero-title"><div class="ledger" aria-hidden="true"></div><div class="w hero-grid">
    <div class="hero-copy">${pill(NAME)}${H1}${LEAD}${btns()}${strip()}</div>
    <figure class="hero-fig">${img('v2')}
      <span class="tag t1" aria-hidden="true"><i></i>Training <b>4 sessions a week</b></span>
      <span class="tag t2" aria-hidden="true"><i></i>Protein <b>160 g target</b></span>
      <span class="tag t3" aria-hidden="true"><i></i>Check-in <b>Sunday</b></span>
    </figure>
  </div></section>`,

  // Studio Light. His own grey studio wall, thin black type, floating white cards.
  v3: () => `<section class="hero" aria-labelledby="hero-title"><div class="w hero-grid">
    <div class="hero-copy">${pill(NAME)}${H1}${LEAD}${btns()}</div>
    <div class="hero-stage">${img('v3')}<div class="float f1">${card.protein()}</div><div class="float f2">${card.msg()}</div><div class="float f3">${card.streak()}</div></div>
  </div><div class="w">${strip()}</div></section>`,

  // Monochrome. Black and white photograph, condensed type, one electric blue.
  v4: () => `<section class="hero" aria-labelledby="hero-title"><div class="w hero-grid">
    <div class="hero-copy"><p class="kicker">${NAME}</p>${H1}<div class="hero-sub">${LEAD}${btns()}</div></div>
    <div class="hero-stage">${img('v4')}<span class="stamp" aria-hidden="true">R<i>.</i></span></div>
  </div><div class="w">${strip()}</div></section>`,

  // Kinetic. Dark stage, the Rewired week playing on a phone beside him.
  v5: () => `<section class="hero" aria-labelledby="hero-title"><div class="glow" aria-hidden="true"></div><div class="w hero-grid">
    <div class="hero-copy">${pill(NAME)}${H1}${LEAD}${btns()}</div>
    <div class="hero-stage"><span class="ring" aria-hidden="true"></span>${img('v5')}
      <div class="phone" aria-hidden="true"><video src="/v2/media/week-navy.mp4" poster="/v2/media/week-navy.jpg" autoplay muted loop playsinline></video></div>
    </div>
  </div><div class="w">${strip()}</div></section>`,
};

/* ------------------------------------------------------------------ shared sections */
const sections = (v) => {
  const clip = V[v].clip;
  const kinetic = v === 'v5' || v === 'v2';
  return `
  <section class="sec why" aria-labelledby="why-title"><div class="w">
    <p class="eyebrow">Why Rewired</p>
    <h2 id="why-title" class="statement">Skinny fat at 30 isn’t a life sentence. <span class="soft">Build muscle and lose fat at the same time, with a coach who’s done it for 15 years.</span></h2>
    <div class="why-stage">
      ${snippet(LOGS[0])}${snippet(LOGS[1])}${snippet(LOGS[2])}${snippet(LOGS[3])}
      <div class="mark" aria-hidden="true"><img src="/assets/app-icon.png" alt=""></div>
      <div class="float w1">${card.protein()}</div><div class="float w2">${card.streak()}</div>
    </div>
  </div></section>

  <section class="sec" aria-labelledby="block-title"><div class="w"><div class="block">
    <div class="tile tile-lead">${pill('The method')}<h2 id="block-title">Your plan starts with <span class="soft">your actual week.</span></h2><div class="big"><b>12 h</b><small>Most replies on my personal WhatsApp, 7 days a week</small></div></div>
    <div class="tile"><span class="tile-ic">${ic.dumbbell}</span><h3>Train anywhere</h3><p>Sessions fit into 45 to 60 minutes, with gym, home and hotel versions ready for the weeks that fall apart.</p></div>
    <div class="tile"><span class="tile-ic">${ic.plate}</span><h3>Eat your food</h3><p>Your plan starts from the food you grew up on. Vegetarian, vegan, halal or pescatarian, it stays on your plate.</p></div>
  </div></div></section>

  <section class="sec app" aria-labelledby="app-title"><div class="w app-grid">
    <div class="app-copy">${pill('Your Rewired app')}<h2 id="app-title">Everything runs through <span class="soft">your own Rewired app.</span></h2><p>Log meals, training, weight and steps. Weekly check-ins, measurements and private progress photos, all in one place.</p><a class="b b-line" href="pricing.html#included">See what’s included ${ic.arrow}</a></div>
    <figure class="app-film"><video src="/v2/media/week-${clip}.mp4" poster="/v2/media/week-${clip}.jpg" autoplay muted loop playsinline aria-label="A week in the Rewired app, with example numbers"></video><figcaption>Rendered from the app’s own screens, example numbers.</figcaption></figure>
  </div></section>

  <section class="sec stream" aria-labelledby="stream-title"><div class="w">
    <p class="eyebrow center">How it works</p>
    <h2 id="stream-title" class="statement center">Every log reaches me. <span class="soft">I adjust your plan every week.</span></h2>
    <div class="stream-stage">
      <div class="stream-head"><i></i><div><b>Your week</b><small>Logged in the app</small></div></div>
      <div class="stream-rows">
        <div class="entry"><div><b>Upper A · Hotel gym</b><small>Training · 15 sets</small></div><strong>45 min</strong></div>
        <div class="entry"><div><b>Protein oatmeal with berries</b><small>Breakfast · 40 g protein</small></div><strong>534 kcal</strong></div>
        <div class="entry"><div><b>Steps</b><small>Habit · target 8,000</small></div><strong>8,400</strong></div>
      </div>
      <div class="stream-bar">${ic.chat}<p>Your check-in comes to me personally. It’s me on the other end, not a chatbot or an assistant.</p></div>
    </div>
  </div></section>

  ${kinetic ? `<section class="sec film" aria-label="Rewired in twelve seconds"><div class="w"><figure class="film-frame"><video src="/v2/media/kinetic.mp4" poster="/v2/media/kinetic.jpg" autoplay muted loop playsinline aria-label="Gym, home, hotel. The food you grew up on. Reviewed by me every week."></video></figure></div></section>` : ''}

  <section class="sec dark" aria-labelledby="check-title"><div class="w dark-in">
    <p class="eyebrow center">Weekly check-ins</p>
    <h2 id="check-title" class="statement center">Check-ins that change your plan, <span class="soft">not just record it.</span></h2>
    <div class="check-card">
      <div class="check-top"><b>Week 4 check-in</b><span class="ok-pill">${ic.check} Reviewed</span></div>
      <dl class="check-list">
        <div><dt>Weight</dt><dd>−1.4 kg</dd></div>
        <div><dt>Waist</dt><dd>−3 cm</dd></div>
        <div><dt>Photos</dt><dd>Front, side, back</dd></div>
        <div><dt>Habits</dt><dd>6 of 7 days green</dd></div>
      </dl>
      <div class="check-reply"><span class="r">R<i>.</i></span><p>Great week. Carbs up 20 g on leg day, everything else stays.</p></div>
      <p class="check-note">An example with made-up numbers.</p>
    </div>
  </div></section>

  <section class="sec pains" aria-labelledby="pain-title"><div class="w">
    <h2 id="pain-title" class="statement">You might recognise <span class="soft">some of this.</span></h2>
    <div class="quotes">
      <figure><blockquote>“Slim in a shirt. Soft without it.”</blockquote><figcaption>That’s usually too little muscle rather than too much fat. We build muscle and lose fat at the same time, so the shape changes, not just the scale.</figcaption></figure>
      <figure><blockquote>“I start every Monday and I’m done by Thursday.”</blockquote><figcaption>No crash plans. Targets you can hit on a work week, adjusted each week from what you actually logged.</figcaption></figure>
      <figure><blockquote>“I can’t give up my cultural food.”</blockquote><figcaption>You don’t have to. Your plan starts from the food you grew up on.</figcaption></figure>
      <figure><blockquote>“Between work and travel, I can’t keep a routine.”</blockquote><figcaption>Sessions fit into 45 to 60 minutes, and the hotel and home versions are ready for the weeks that fall apart.</figcaption></figure>
    </div>
  </div></section>

  <section class="sec letter" aria-labelledby="letter-title"><div class="w letter-in">
    <h2 id="letter-title">A note from me</h2>
    <div class="letter-body">
      <p>This is a complete body recomposition. Lose the softness, build real shape, and become unrecognisable to the man who started.</p>
      <p>If it hasn’t worked before, it’s not because you lack discipline. Usually the plan was written for someone with an empty calendar and a different kitchen.</p>
      <p>So I start with your actual week. The hours you work, the trips you take and the food you grew up on all shape the plan, and that food stays on your plate. Then we set targets you can hit on a normal week, not a perfect one.</p>
      <p>You won’t be handed a template and left to work it out. Every week you check in with me personally, and you can message me directly whenever you need to. It’s me on the other end, not a chatbot or an assistant.</p>
      <p>Each week you log your meals, training and habits in the app. I review it with you and adjust your plan, so you always know exactly what to do next.</p>
      <p class="sign">Abhey</p>
    </div>
  </div></section>

  <section class="sec incl" aria-labelledby="incl-title"><div class="w incl-in">
    <div><h2 id="incl-title" class="statement">What’s included. <span class="soft">One to one, built around you.</span></h2><a class="b b-line" href="pricing.html">Full details on the pricing page ${ic.arrow}</a></div>
    <dl class="incl-list">
      <div><dt>Training</dt><dd>A programme for your goal and schedule, updated every week, with a fallback plan for busy weeks.</dd></div>
      <div><dt>Nutrition</dt><dd>Targets and meal plans built around your preferred food choices, so you can still eat with your family.</dd></div>
      <div><dt>The app</dt><dd>Log food, training, weight and steps. Weekly check-ins, measurements and private progress photos.</dd></div>
      <div><dt>Feedback</dt><dd>Fortnightly video check-ins and a weekly voice note from me.</dd></div>
      <div><dt>Support</dt><dd>My personal WhatsApp, 7 days a week, with replies within 12 hours.</dd></div>
      <div><dt>Afterwards</dt><dd>A plan to keep the results, so you don’t slide back.</dd></div>
    </dl>
  </div></section>

  <section class="sec promise" aria-labelledby="promise-title"><div class="w"><div class="promise-card">
    <p class="eyebrow">The Week 8 Progress Promise</p>
    <h2 id="promise-title">Notice the difference by week 8. <span class="soft">Or I keep coaching you.</span></h2>
    <p>If you haven’t noticed a difference in your physique by the end of week 8, I’ll keep coaching you for free. At week 8 we’ll talk about what your coaching looks like next, and if you want to carry on, I’ll offer you reduced-price loyalty coaching.</p>
    <small>This is a guarantee of extra coaching, not a refund. The details are in the <a href="terms.html#promise">Terms &amp; Conditions</a>.</small>
  </div></div></section>

  <section class="sec final" aria-labelledby="final-title"><div class="w final-in">
    <h2 id="final-title" class="statement center">Start with a <span class="soft">free 30-minute call.</span></h2>
    ${btns()}
  </div></section>`;
};

function landing(v) {
  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${NAME}</title>
  <meta name="description" content="One-to-one training and nutrition coaching for busy men, built around your week and the food you grew up on.">
  <link rel="icon" href="/app/icons/favicon-32.png" sizes="32x32">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?${V[v].fonts}&display=swap">
  <link rel="stylesheet" href="/v2/base.css?v=1">
  <link rel="stylesheet" href="/v2/${v}.css?v=1">
</head>
<body class="rw" data-rw="${v}">
  ${nav()}
  <main id="top">
    ${HERO[v]()}
    ${sections(v)}
  </main>
  ${footer()}
  <script src="/booking.js"></script>
  <script src="/v2/rw.js?v=1" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ inner pages */
const RENAME = [
  [/The 12 Week Rewired Premium Designer Coaching/g, 'Rewired Premium Coaching'],
  [/the 12 Week Rewired Premium Designer Coaching/g, 'Rewired Premium Coaching'],
  [/12 Week Rewired Premium Designer Coaching/g, 'Rewired Premium Coaching'],
  [/Twelve weeks of training, nutrition and one-to-one coaching with me\./g, 'Training, nutrition and one-to-one coaching with me.'],
  [/ of one-to-one coaching, the full 12-week programme\./g, ' of one-to-one coaching.'],
  [/during and after your 12 weeks/g, 'during and after your coaching'],
  [/Why now\? What will be different in 12 weeks\?/g, 'Why now? What do you want to be different?'],
  [/Three months, the full 12-week programme, with a plan to keep the results after week 12\./g, 'Three months of one-to-one coaching, with a plan to keep the results afterwards.'],
  [/ for the full 12 weeks\. If we’re a fit/g, '. If we’re a fit'],
  [/>After week 12</g, '>Afterwards<'],
  [/what your coaching beyond week 12 looks like/g, 'what your coaching looks like next'],
  [/a plan to keep your results after week 12/g, 'a plan to keep your results afterwards'],
];
function inner(page, v) {
  let html = readFileSync(join(SITE, `${page}.html`), 'utf8');
  for (const [a, b] of RENAME) html = html.replace(a, b);
  html = html.replace(/(<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?)[^"]*"/, `$1${V[v].fonts}&display=swap"`);
  html = html.replace(/(<link rel="stylesheet" href="\/home\.css[^"]*">)/, `$1\n  <link rel="stylesheet" href="/v2/inner.css?v=1">\n  <link rel="stylesheet" href="/v2/${v}.css?v=1">`);
  html = html.replace(/<body([^>]*)>/, (m, a) => /class="/.test(a) ? `<body${a.replace('class="', 'class="rw-inner ')} data-rw="${v}">` : `<body${a} class="rw-inner" data-rw="${v}">`);
  html = html.replace(/<a([^>]*)href="\/"/g, '<a$1href="index.html"');
  return html;
}

function portablePaths(html) {
  return html
    .replace(/(href|src)="\/app\/icons\/([^"]*)"/g, '$1="../app-icons/$2"')
    .replace(/(href|src)="\/app\/([^"]*)"/g, '$1="https://rewiredbyabhey.com/app/$2"')
    .replace(/href="\/terms#/g, 'href="terms.html#')
    .replace(/href="\/(pricing|terms|privacy)\.html/g, 'href="$1.html')
    .replace(/(href|src|poster)="\/(?!\/)/g, '$1="../');
}

for (const v of Object.keys(V)) {
  const dir = join(out, v);
  mkdirSync(dir, { recursive: true });
  const pages = { index: landing(v) };
  for (const p of INNER) pages[p] = inner(p, v);
  for (const [p, html] of Object.entries(pages)) writeFileSync(join(dir, `${p}.html`), portable ? portablePaths(html) : html);
}
if (portable) {
  for (const f of ['home.css', 'plans.css', 'legal-pages.css', 'home.js', 'booking.js']) cpSync(join(SITE, f), join(out, f));
  cpSync(join(SITE, 'v2'), join(out, 'v2'), { recursive: true });
  for (const f of ['assets/app-icon.png', 'assets/fonts/montserrat-latin.woff2', ...Object.values(V).map((x) => `assets/abhey/${x.photo}.webp`)]) {
    mkdirSync(dirname(join(out, f)), { recursive: true }); cpSync(join(SITE, f), join(out, f));
  }
  mkdirSync(join(out, 'app-icons'), { recursive: true });
  for (const f of ['favicon-32.png', 'apple-touch-icon.png']) cpSync(join(SITE, 'app/icons', f), join(out, 'app-icons', f));
}
console.log(`built ${Object.keys(V).length} versions into ${out}${portable ? ' (portable)' : ''}`);
