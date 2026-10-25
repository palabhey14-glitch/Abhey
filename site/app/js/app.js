// Rewired Coaching client app.
// One page, hash routes (#today, #checkin/3, #client/<id>/photos ...), plain
// JavaScript with no build step so it can be hosted as static files on Netlify.
(function () {
  'use strict';

  const S = window.RewiredStats;
  const cfg = window.REWIRED_CONFIG || {};
  const root = document.getElementById('root');
  const configured =
    Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey) && !/YOUR-/.test(cfg.supabaseUrl + cfg.supabaseAnonKey);
  const sb = configured
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;
  const COACH = cfg.coachName || 'your coach';
  const BUCKET = 'progress-photos';
  const POSES = ['front', 'side', 'back'];
  // General guide transcribed from the client workbook's Supplements sheet.
  // These are informational options, not supplements assigned to a client.
  const SUPPLEMENTS = [
    { name: 'Creatine monohydrate', dose: '3–5 g daily', when: 'Any time, every day', why: 'Strength, muscle gain and training performance', evidence: 'Strong', priority: 'Core' },
    { name: 'Protein powder (whey or plant)', dose: '1–2 scoops as needed', when: "Whenever you’re short of your protein target", why: 'Convenient way to hit daily protein', evidence: 'Strong (as food)', priority: 'Core if short' },
    { name: 'Vitamin D3', dose: 'Per blood test / GP', when: 'With a meal that contains fat', why: 'Deficiency is common with darker skin and indoor office work', evidence: 'Strong if deficient', priority: 'Test first' },
    { name: 'Caffeine', dose: '3–6 mg per kg bodyweight', when: '30–60 min pre-training. None within 8 h of bed', why: 'Training performance and focus. Start at the low end', evidence: 'Strong', priority: 'Optional' },
    { name: 'Omega-3 (fish or algae oil)', dose: '1–2 g EPA + DHA daily', when: 'With meals', why: 'General health if you rarely eat oily fish', evidence: 'Moderate', priority: 'Optional' },
    { name: 'Magnesium (glycinate)', dose: '200–350 mg', when: 'Evening', why: 'Only if dietary intake is low. May help sleep quality', evidence: 'Limited', priority: 'Optional' },
  ];

  const state = { session: null, me: null, ctx: {}, renderId: 0 };

  // ---------------------------------------------------------------- helpers

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmt(v, dp) {
    if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '–';
    return Number(v).toLocaleString('en-AU', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
  }

  function signed(v, dp) {
    if (v === null || v === undefined) return '–';
    return (v > 0 ? '+' : '') + fmt(v, dp);
  }

  function pct(v) {
    return v === null || v === undefined ? '–' : `${Math.round(v * 100)}%`;
  }

  function niceDate(iso, opts) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-AU', opts || { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function weekLabel(n) {
    return n === 0 ? 'Start' : `Week ${n}`;
  }

  function toast(message, isError) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 6000 : 2500);
  }

  function friendlyError(err) {
    const msg = (err && (err.message || err.error_description)) || String(err);
    if (/signups not allowed|user not found/i.test(msg)) {
      return `That email isn't set up yet. Message ${COACH} to get access.`;
    }
    if (/expired|invalid.*(otp|token)/i.test(msg)) return 'That code has expired or is wrong. Ask for a new one.';
    if (/rate limit|too many/i.test(msg)) return 'Too many tries. Wait a minute and try again.';
    if (/violates check constraint/i.test(msg)) return 'One of the numbers looks wrong. Check it and try again.';
    if (/failed to fetch|network/i.test(msg)) return "You're offline. Try again when you have signal.";
    return msg;
  }

  // Reads a form into an object. Empty fields become null; number fields
  // become numbers.
  function readForm(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) {
        if (!(el.name in out)) out[el.name] = null;
        continue;
      }
      let v = el.value.trim();
      if (v === '') v = null;
      else if (el.type === 'number' || el.dataset.number !== undefined) v = Number(v);
      out[el.name] = v;
    }
    return out;
  }

  async function withBusy(button, fn) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      await fn();
    } catch (err) {
      toast(friendlyError(err), true);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  function must(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  // Shrinks a phone photo to 1600px JPEG before upload. Faster on mobile
  // data, and re-encoding drops hidden location data from the original.
  async function prepareImage(file) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob) return { blob, ext: 'jpg', type: 'image/jpeg' };
    } catch (_) {
      // Browser can't decode this format (e.g. HEIC outside Safari): upload as is.
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    return { blob: file, ext, type: file.type || 'image/jpeg' };
  }

  const ICONS = {
    home:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    habits:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16 10"/></svg>',
    hub:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    today:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M8 15l2.5 2.5L16 13"/></svg>',
    checkin:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 4h6M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M8 12h8M8 16h5"/></svg>',
    photos:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/></svg>',
    progress:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 20h18M5 16l5-5 4 3 6-7"/></svg>',
    profile:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    training:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9v6m3-9v12m12-12v12m3-9v6M6 12h12"/></svg>',
    supps:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 4a5 5 0 0 1 7 0l6 6a5 5 0 0 1-7 7l-6-6a5 5 0 0 1 0-7Z"/><path d="m9 13 6-6"/></svg>',
  };

  // ------------------------------------------------------------------ data

  async function loadMe() {
    const uid = state.session.user.id;
    state.me = must(await sb.from('profiles').select('*').eq('id', uid).single());
  }

  // Everything about one client: the workbook, as rows.
  async function loadCtx(id, force) {
    if (!force && state.ctx[id]) return state.ctx[id];
    const [profile, targets, macros, training, supplements, logs, checkins, measurements, photos] = await Promise.all([
      sb.from('profiles').select('*').eq('id', id).single(),
      sb.from('targets').select('*').eq('client_id', id).maybeSingle(),
      sb.from('macro_targets').select('*').eq('client_id', id).order('week_number'),
      sb.from('training_plan').select('*').eq('client_id', id).order('program_start_date', { ascending: false }).order('cycle_day'),
      sb.from('supplement_plan').select('*').eq('client_id', id).order('sort_order').order('name'),
      sb.from('daily_logs').select('*').eq('user_id', id).order('day'),
      sb.from('weekly_checkins').select('*').eq('user_id', id).order('week_number'),
      sb.from('measurements').select('*').eq('user_id', id).order('week_number'),
      sb.from('progress_photos').select('*').eq('user_id', id).order('week_number'),
    ]).then((rs) => rs.map(must));
    // Habit tables arrive with migrations/2026-10-25-habits.sql. Until that
    // has been run, the rest of the app keeps working without them.
    const [habits, habitEntries] = await Promise.all([
      sb.from('client_habits').select('*').eq('user_id', id).order('sort_order').order('created_at'),
      sb.from('habit_entries').select('*').eq('user_id', id).order('day'),
    ]);
    const habitsReady = !habits.error && !habitEntries.error;
    const ctx = {
      profile, targets: targets || {}, macros, training, supplements, logs, checkins, measurements, photos,
      habits: habitsReady ? habits.data : [], habitEntries: habitsReady ? habitEntries.data : [], habitsReady,
    };
    state.ctx[id] = ctx;
    return ctx;
  }

  function invalidate(id) {
    delete state.ctx[id];
  }

  async function signedUrls(paths) {
    if (!paths.length) return {};
    const data = must(await sb.storage.from(BUCKET).createSignedUrls(paths, 3600));
    const out = {};
    for (const row of data) if (row.signedUrl) out[row.path] = row.signedUrl;
    return out;
  }

  // --------------------------------------------------------------- layout

  const CLIENT_TABS = [
    ['home', 'Home'],
    ['habits', 'Habits'],
    ['training', 'Training'],
    ['progress', 'Progress'],
    ['hub', 'Coach hub'],
  ];
  // Screens reached from the Coach hub keep that tab lit.
  const TAB_OF = { checkin: 'hub', photos: 'hub', supps: 'hub', profile: 'hub', log: 'home' };

  const COACH_SECTIONS = [
    ['overview', 'Overview'],
    ['physique', 'Physique'],
    ['nutrition', 'Nutrition'],
    ['activity', 'Activity'],
    ['recovery', 'Recovery'],
    ['habits', 'Habits'],
    ['training', 'Training'],
    ['supps', 'Supplements'],
    ['logs', 'Daily logs'],
    ['photos', 'Gallery'],
    ['checkins', 'Check-ins'],
  ];

  function shell(title, sub, body, tab) {
    const isCoach = state.me && state.me.role === 'coach';
    if (isCoach) return coachShell(title, sub, body);
    const active = TAB_OF[tab] || tab;
    const initial = ((state.me && state.me.full_name) || '?').trim()[0].toUpperCase();
    root.innerHTML = `
      <header class="topbar">
        <img src="icons/icon-192.png" alt="">
        <div class="title">${esc(title)}${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
        <a class="avatar" href="#profile" aria-label="Profile">${esc(initial)}</a>
      </header>
      <main class="screen">${body}</main>
      <nav class="tabs" aria-label="Main">${CLIENT_TABS.map(
        ([id, label]) => `<a href="#${id}"${active === id ? ' aria-current="page"' : ''}>${ICONS[id]}<span>${label}</span></a>`,
      ).join('')}</nav>`;
    window.scrollTo(0, 0);
  }

  // Coach CRM: app rail, the client's section menu, then the main pane.
  function coachShell(title, sub, body) {
    const v = state.coachView || {};
    document.body.classList.add('crm-body');
    const rail = `<aside class="crm-rail">
        <a class="crm-brand" href="#clients"><img src="icons/icon-192.png" alt=""><span>Rewired<small>Coach</small></span></a>
        <a href="#clients"${v.section !== 'inbox' ? ' aria-current="page"' : ''}>${ICONS.profile}<span>Clients</span></a>
        <a href="#inbox"${v.section === 'inbox' ? ' aria-current="page"' : ''}>${ICONS.checkin}<span>Check-ins</span></a>
        <button type="button" class="crm-signout" data-signout>Sign out</button>
      </aside>`;
    const sections = v.clientId
      ? `<nav class="crm-sections" aria-label="Client sections">
          <a class="crm-back" href="#clients">‹ ${esc(v.clientName)}</a>
          ${COACH_SECTIONS.map(([id, label]) => `<a href="#client/${v.clientId}/${id}"${v.section === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
          <a class="crm-settings" href="#client/${v.clientId}/settings"${v.section === 'settings' ? ' aria-current="page"' : ''}>⚙ Client settings</a>
        </nav>`
      : '';
    root.innerHTML = `<div class="crm${v.clientId ? ' with-sections' : ''}">${rail}${sections}
      <main class="crm-main"><header class="crm-head"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</header>${body}</main></div>`;
    root.querySelector('[data-signout]').addEventListener('click', signOut);
    const current = root.querySelector('.crm-sections [aria-current]');
    if (current) current.scrollIntoView({ block: 'nearest', inline: 'center' });
    window.scrollTo(0, 0);
  }

  function bare(body) {
    root.innerHTML = `<main class="screen center">${body}</main>`;
  }

  // ---------------------------------------------------------------- charts

  // Small dependency-free SVG line chart. series: [{name, color, dash, values}]
  // where values line up with labels and may contain nulls.
  function lineChart(labels, series, opts) {
    const W = 360;
    const H = 200;
    const pad = { l: 46, r: 10, t: 12, b: 26 };
    const all = series.flatMap((s) => s.values).filter((v) => v !== null && v !== undefined);
    if (!all.length) return '<p class="hint">Nothing to chart yet. It fills in as you log.</p>';
    let min = Math.min(...all);
    let max = Math.max(...all);
    if (opts && opts.fixed) [min, max] = opts.fixed;
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    min -= span * 0.08;
    max += span * 0.08;
    const x = (i) => pad.l + (labels.length === 1 ? 0 : (i * (W - pad.l - pad.r)) / (labels.length - 1));
    const y = (v) => pad.t + ((max - v) * (H - pad.t - pad.b)) / (max - min);
    const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
    const grid = ticks
      .map(
        (t) =>
          `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="#c9d8f0"/>` +
          `<text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t, opts && opts.dp)}</text>`,
      )
      .join('');
    const xl = labels
      .map((l, i) => (labels.length > 8 && i % 2 ? '' : `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`))
      .join('');
    const lines = series
      .map((s) => {
        let d = '';
        let pen = false;
        const dots = [];
        s.values.forEach((v, i) => {
          if (v === null || v === undefined) {
            pen = false;
            return;
          }
          d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          pen = true;
          if (!s.dash) dots.push(`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.color}"/>`);
        });
        return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5"${s.dash ? ' stroke-dasharray="6 5"' : ''}/>${dots.join('')}`;
      })
      .join('');
    const legend = series
      .map((s) => `<span><svg width="18" height="6" aria-hidden="true"><line x1="0" x2="18" y1="3" y2="3" stroke="${s.color}" stroke-width="3"${s.dash ? ' stroke-dasharray="4 3"' : ''}/></svg> ${esc(s.name)}</span>`)
      .join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts && opts.label)}">${grid}${xl}${lines}</svg>
      <div class="targets" style="margin-top:6px">${legend}</div>`;
  }

  // ---------------------------------------------------------------- shared views

  function statusClass(s) {
    return s === 'On track' || s === 'Goal reached' ? 'good' : s === 'Over' || s === 'Behind' ? 'bad' : s ? 'warn' : '';
  }

  // The workbook's Dashboard tab, used by clients and by the coach.
  function dashboardHTML(ctx) {
    const { profile, targets } = ctx;
    const d = S.dashboard(ctx);
    if (!d) return '<div class="card"><p>Add a start date on the Profile tab to see your dashboard.</p></div>';
    const lw = d.latestWeek;
    const macro = lw && lw.macro;
    const rows = [];
    const ratio = (a, b) => (a !== null && a !== undefined && b ? a / b : null);
    // One row per metric, stacked so it reads on a phone without side-scrolling.
    const addRow = (name, actual, target, kind, dp, ratioOverride) => {
      const r = ratioOverride !== undefined ? ratioOverride : ratio(actual, target);
      const st = S.status(kind, r, d.expectedProgress);
      rows.push(`<li class="metric">
        <div class="metric-top"><b>${name}</b><span class="status ${statusClass(st)}">${st}</span></div>
        <div class="metric-nums">${fmt(actual, dp)} <span>of</span> ${fmt(target, dp)}${r !== null ? ` · ${pct(r)}` : ''}</div>
        ${r !== null ? `<div class="bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(1, r)) * 100}%"></span></div>` : ''}
      </li>`);
    };
    addRow('Calories', lw && lw.avgCalories, macro && macro.calories, 'calories');
    addRow('Protein (g)', lw && lw.avgProtein, macro && macro.protein_g, 'protein');
    addRow('Steps', lw && lw.avgSteps, targets.steps_target, 'steps');
    addRow('Training sessions', lw && lw.sessions, profile.training_days_per_week, 'sessions');
    if (profile.nutrition_tracking === 'Assigned meal plan') {
      addRow('Meal plan followed', lw && lw.mealPlanScore !== null ? Math.round(lw.mealPlanScore * 100) : null, 100, 'food');
    } else {
      addRow('Food days logged', lw && lw.foodDays, 7, 'food');
    }
    addRow('Progress to goal weight', d.latestAvgWeight, targets.goal_weight_kg, 'goal', 1, d.goalWeightProgress);
    addRow('Progress to goal waist', d.latestWaist, targets.goal_waist_cm, 'goal', 1, d.goalWaistProgress);

    const labels = d.weeks.map((w) => `W${w.week}`);
    const checkin = (n) => ctx.checkins.find((c) => c.week_number === n) || {};
    const goalLine = targets.goal_weight_kg ? d.weeks.map(() => Number(targets.goal_weight_kg)) : null;
    const weightSeries = [{ name: 'Weekly average', color: '#2444f9', values: d.weeks.map((w) => w.avgWeight) }];
    if (goalLine) weightSeries.push({ name: 'Goal', color: '#0b2545', dash: true, values: goalLine });
    const stepSeries = [{ name: 'Average steps', color: '#2444f9', values: d.weeks.map((w) => w.avgSteps) }];
    if (targets.steps_target) stepSeries.push({ name: 'Target', color: '#0b2545', dash: true, values: d.weeks.map(() => targets.steps_target) });

    const weekRows = d.weeks
      .filter((w) => w.week <= Math.max(d.thisWeek, 1))
      .map((w, i, arr) => {
        const prev = i > 0 ? arr[i - 1].avgWeight : d.startWeight;
        const c = checkin(w.week);
        return `<tr><th scope="row">${w.week}</th><td>${fmt(w.avgWeight, 1)}</td><td>${w.avgWeight !== null && prev !== null ? signed(w.avgWeight - prev, 1) : '–'}</td><td>${fmt(w.avgSteps)}</td><td>${fmt(w.avgCalories)}</td><td>${fmt(w.macro && w.macro.calories)}</td><td>${fmt(w.avgProtein)}</td><td>${w.foodDays}</td><td>${w.sessions}</td><td>${pct(w.adherence)}</td><td>${fmt(c.sleep_hours, 1)}</td><td>${fmt(c.stress)}</td><td>${fmt(c.energy)}</td></tr>`;
      })
      .join('');

    return `
      <div class="tiles">
        <div class="tile"><div class="k">Start weight</div><div class="v">${fmt(d.startWeight, 1)}</div></div>
        <div class="tile"><div class="k">Latest weekly avg</div><div class="v">${fmt(d.latestAvgWeight, 1)}</div></div>
        <div class="tile"><div class="k">Total change</div><div class="v">${signed(d.totalChange, 1)}</div></div>
        <div class="tile"><div class="k">Weeks logged</div><div class="v">${d.weeksLogged} / 12</div></div>
        <div class="tile"><div class="k">Latest avg steps</div><div class="v">${fmt(d.latestAvgSteps)}</div></div>
        <div class="tile"><div class="k">Avg adherence</div><div class="v">${pct(d.avgAdherence)}</div></div>
      </div>
      ${targets.coach_note ? `<div class="card"><p class="kicker">Coach note: biggest lever this week</p><div class="feedback">${esc(targets.coach_note)}</div></div>` : ''}
      <section class="card">
        <p class="kicker">${lw ? `Week ${lw.week}` : 'Latest week'} vs target</p>
        <ul class="metrics">${rows.join('')}</ul>
      </section>
      <section class="card">
        <p class="kicker">Bodyweight · weekly average (kg)</p>
        ${lineChart(labels, weightSeries, { dp: 1, label: 'Weekly average bodyweight' })}
      </section>
      <section class="card">
        <p class="kicker">Steps · weekly average</p>
        ${lineChart(labels, stepSeries, { label: 'Weekly average steps' })}
      </section>
      <section class="card">
        <p class="kicker">Sleep and energy</p>
        ${lineChart(
          labels,
          [
            { name: 'Sleep (hrs)', color: '#2444f9', values: d.weeks.map((w) => numOrNull(checkin(w.week).sleep_hours)) },
            { name: 'Energy (1-10)', color: '#0b2545', values: d.weeks.map((w) => numOrNull(checkin(w.week).energy)) },
          ],
          { fixed: [0, 10], label: 'Sleep and energy by week' },
        )}
      </section>
      <section class="card">
        <p class="kicker">Week by week</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Wk</th><th>Avg kg</th><th>Change</th><th>Steps</th><th>Kcal</th><th>Kcal target</th><th>Protein</th><th>Food days</th><th>Sessions</th><th>Adherence</th><th>Sleep</th><th>Stress</th><th>Energy</th></tr></thead>
          <tbody>${weekRows || '<tr><td colspan="13">No weeks yet.</td></tr>'}</tbody>
        </table></div>
      </section>
      ${measurementsTable(ctx)}`;
  }

  function numOrNull(v) {
    return v === null || v === undefined ? null : Number(v);
  }

  const MEASURES = [
    ['chest', 'Chest'],
    ['waist', 'Waist (navel)'],
    ['hips', 'Hips'],
    ['arm', 'Arm (flexed)'],
    ['thigh', 'Thigh (mid)'],
  ];

  function measurementsTable(ctx) {
    const rows = ctx.measurements;
    if (!rows.length) return '';
    // Change per column runs from the first to the latest row that has a value.
    const change1 = (k) => {
      const vals = rows.filter((m) => m[k] !== null && m[k] !== undefined).map((m) => Number(m[k]));
      return vals.length > 1 ? signed(vals[vals.length - 1] - vals[0], 1) : '–';
    };
    const body = rows
      .map((m) => `<tr><th scope="row">${weekLabel(m.week_number)}</th>${MEASURES.map(([k]) => `<td>${fmt(m[k], 1)}</td>`).join('')}</tr>`)
      .join('');
    const change =
      rows.length > 1
        ? `<tr><th scope="row">Change</th>${MEASURES.map(([k]) => `<td>${change1(k)}</td>`).join('')}</tr>`
        : '';
    return `<section class="card">
      <p class="kicker">Body measurements (cm)</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Week</th>${MEASURES.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
        <tbody>${body}${change}</tbody>
      </table></div>
    </section>`;
  }

  async function photoCompareHTML(ctx, weekA, weekB) {
    const pick = (w, pose) => ctx.photos.find((p) => p.week_number === w && p.pose === pose);
    const paths = [];
    for (const pose of POSES) for (const w of [weekA, weekB]) if (pick(w, pose)) paths.push(pick(w, pose).storage_path);
    const urls = await signedUrls(paths);
    return POSES.map(
      (pose) => `<div class="card">
        <p class="kicker">${pose}</p>
        <div class="grid-2">${[weekA, weekB]
          .map((w) => {
            const p = pick(w, pose);
            const url = p && urls[p.storage_path];
            return `<figure class="photo-slot" style="margin:0"><div class="frame">${url ? `<img src="${esc(url)}" alt="${esc(weekLabel(w))} ${pose} photo">` : 'No photo'}</div><figcaption>${esc(weekLabel(w))}</figcaption></figure>`;
          })
          .join('')}</div>
      </div>`,
    ).join('');
  }

  function weeksWithPhotos(ctx) {
    return [...new Set(ctx.photos.map((p) => p.week_number))].sort((a, b) => a - b);
  }

  // ---------------------------------------------------------------- auth

  function renderSetupNeeded() {
    bare(`<div class="card">
      <h1>Almost there</h1>
      <p>This app isn't connected to its database yet. Add your Supabase address and public key to <code>site/app/config.js</code>. The steps are in <code>docs/client-app-setup.md</code>.</p>
    </div>`);
  }

  function renderLogin(email) {
    bare(`
      <img class="login-logo" src="icons/icon-192.png" alt="Rewired">
      <h1>Rewired Coaching</h1>
      <p>Sign in with the email you gave ${esc(COACH)}. We'll email you a code, no password needed.</p>
      <form id="email-form" class="card" novalidate>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" inputmode="email" required value="${esc(email || '')}">
        </div>
        <button class="btn" type="submit" style="width:100%">Email me a code</button>
      </form>`);
    const form = document.getElementById('email-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = form.email.value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(value)) return toast('Enter a valid email address.', true);
      withBusy(form.querySelector('button'), async () => {
        must(
          await sb.auth.signInWithOtp({
            email: value,
            options: { shouldCreateUser: false, emailRedirectTo: location.origin + '/app/' },
          })
        );
        renderCode(value);
      });
    });
  }

  function renderCode(email) {
    bare(`
      <img class="login-logo" src="icons/icon-192.png" alt="Rewired">
      <h1>Check your email</h1>
      <p>We sent a code to <b>${esc(email)}</b>. It can take a minute, and check your junk folder.</p>
      <form id="code-form" class="card" novalidate>
        <div class="field">
          <label for="code">Code</label>
          <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" required>
        </div>
        <button class="btn" type="submit" style="width:100%">Sign in</button>
        <p class="hint"><a href="#" data-back>Use a different email or send a new code</a></p>
      </form>`);
    const form = document.getElementById('code-form');
    form.code.focus();
    form.querySelector('[data-back]').addEventListener('click', (e) => {
      e.preventDefault();
      renderLogin(email);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const token = form.code.value.replace(/\D/g, '');
      if (token.length < 6) return toast('Enter the code from the email.', true);
      withBusy(form.querySelector('button'), async () => {
        must(await sb.auth.verifyOtp({ email, token, type: 'email' }));
        // onAuthStateChange takes it from here.
      });
    });
  }

  async function signOut() {
    await sb.auth.signOut();
    state.me = null;
    state.ctx = {};
    location.hash = '';
  }

  function renderConsent() {
    bare(`
      <div class="card">
        <p class="kicker">Before you start</p>
        <h1>Your privacy</h1>
        <p>To coach you, Rewired stores what you log here: your profile, daily numbers (weight, steps, food, training), weekly check-ins, body measurements and progress photos. Some of this is health information.</p>
        <ul>
          <li>Only you and ${esc(COACH)} can see it. Photos are private and never public.</li>
          <li>It's used only to run your coaching, never sold or shared for marketing.</li>
          <li>It's stored with Supabase, our database provider, which may store it outside Australia.</li>
          <li>You can ask to see, correct or delete your data at any time by messaging ${esc(COACH)}.</li>
          <li>Coaching isn't medical advice. Tell ${esc(COACH)} about any injury or condition, and check with your GP before big changes.</li>
        </ul>
        <p><a href="/privacy.html" target="_blank" rel="noopener">Read the full privacy policy</a></p>
        <form id="consent-form">
          <div class="field" style="display:flex;gap:10px;align-items:flex-start">
            <input id="agree" name="agree" type="checkbox" required style="width:24px;min-height:24px;margin-top:2px">
            <label for="agree" style="font-weight:500">I agree to Rewired collecting and using this information, including health information and photos, to coach me.</label>
          </div>
          <button class="btn" type="submit" style="width:100%">Agree and continue</button>
        </form>
        <p class="hint"><a href="#" data-signout>Sign out</a></p>
      </div>`);
    root.querySelector('[data-signout]').addEventListener('click', (e) => {
      e.preventDefault();
      signOut();
    });
    const form = document.getElementById('consent-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.agree.checked) return toast('Tick the box to continue.', true);
      withBusy(form.querySelector('button'), async () => {
        const consent_at = new Date().toISOString();
        must(await sb.from('profiles').update({ consent_at }).eq('id', state.me.id));
        state.me.consent_at = consent_at;
        route();
      });
    });
  }

  // ---------------------------------------------------------------- client: today

  function numberField(name, label, value, opts) {
    const o = opts || {};
    return `<div class="field">
      <label for="f-${name}">${label}</label>
      <input id="f-${name}" name="${name}" type="number" inputmode="${o.decimal ? 'decimal' : 'numeric'}" step="${o.decimal ? '0.1' : '1'}" min="0" ${o.max ? `max="${o.max}"` : ''} value="${esc(value === null || value === undefined ? '' : value)}">
      ${o.hint ? `<p class="hint">${o.hint}</p>` : ''}
    </div>`;
  }

  function choiceField(name, label, options, value, extraClass) {
    return `<fieldset class="field" style="border:0;padding:0;margin:0 0 14px">
      <legend style="font-weight:600;font-size:14px;margin-bottom:6px">${label}</legend>
      <div class="choices ${extraClass || ''}">
        ${options
          .map((o, i) => {
            const id = `c-${name}-${i}`;
            return `<input type="radio" id="${id}" name="${name}" value="${esc(o)}"${String(value) === String(o) ? ' checked' : ''}${
              typeof o === 'number' ? ' data-number' : ''
            }><label for="${id}">${esc(o)}</label>`;
          })
          .join('')}
      </div>
    </fieldset>`;
  }

  function targetsLine(ctx, week) {
    const m = week ? S.macrosForWeek(ctx.macros, week) : null;
    const t = ctx.targets;
    const bits = [];
    if (m) {
      bits.push(`<span><b>${fmt(m.calories)}</b> kcal</span>`, `<span><b>${m.protein_g}</b>g protein</span>`, `<span><b>${m.carbs_g}</b>g carbs</span>`, `<span><b>${m.fats_g}</b>g fats</span>`);
      if (m.fibre_g) bits.push(`<span><b>${m.fibre_g}</b>g fibre</span>`);
    }
    if (t.steps_target) bits.push(`<span><b>${fmt(t.steps_target)}</b> steps</span>`);
    if (t.sleep_target_h) bits.push(`<span><b>${fmt(t.sleep_target_h, 0)}h+</b> sleep</span>`);
    if (t.water_target) bits.push(`<span><b>${esc(t.water_target)}</b> water</span>`);
    return bits.length ? `<div class="targets">${bits.join('')}</div>` : `<p class="hint">${esc(COACH)} will add your targets after your kickoff call.</p>`;
  }

  async function renderLog(day) {
    const now = S.today();
    if (!day || day > now) day = now;
    const ctx = await loadCtx(state.me.id);
    const p = ctx.profile;
    const log = ctx.logs.find((l) => l.day === day) || {};
    const week = S.weekOf(p.start_date, day);
    const loggedDays = new Set(ctx.logs.map((l) => l.day));

    let strip = '';
    if (week) {
      strip = `<div class="week-strip">${S.weekDates(p.start_date, week)
        .map(
          (d) =>
            `<a href="#log/${d}" class="${loggedDays.has(d) ? 'done' : ''}${d > now ? ' future' : ''}"${d === day ? ' aria-current="date"' : ''}>${niceDate(d, { weekday: 'narrow' })}<span>${niceDate(d, { day: 'numeric' })}</span><span class="dot" aria-label="${loggedDays.has(d) ? 'logged' : 'not logged'}"></span></a>`,
        )
        .join('')}</div>`;
    }

    const mealPlan = p.nutrition_tracking === 'Assigned meal plan';
    const title = day === now ? 'Today' : day === S.addDays(now, -1) ? 'Yesterday' : niceDate(day);
    shell(
      'Daily check-in',
      week ? `Week ${week} of 12` : p.start_date && day < p.start_date ? `Starts ${niceDate(p.start_date)}` : '',
      `
      <div class="daybar">
        <a class="btn btn-ghost" href="#log/${S.addDays(day, -1)}" aria-label="Previous day">‹</a>
        <h2>${esc(title)}<div class="hint">${niceDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</div></h2>
        ${day < now ? `<a class="btn btn-ghost" href="#log/${S.addDays(day, 1)}" aria-label="Next day">›</a>` : '<span style="width:48px"></span>'}
      </div>
      ${strip}
      <div class="card"><p class="kicker">This week's targets</p>${targetsLine(ctx, week)}</div>
      <form id="log-form" class="card" novalidate>
        <p class="kicker">Activity</p>
        <div class="grid-2">
          ${numberField('weight_kg', 'Weight (kg)', log.weight_kg, { decimal: true, max: 300 })}
          ${numberField('steps', 'Steps', log.steps, { max: 100000 })}
        </div>
        <p class="hint" style="margin-top:-6px;margin-bottom:12px">Weigh in every morning after the toilet, before food.</p>
        ${numberField('cardio_min', 'Cardio (minutes)', log.cardio_min, { max: 600 })}
        ${choiceField('trained', 'Trained today?', ['Yes', 'Rest day', 'Missed'], log.trained)}
        ${ctx.habitsReady ? `<p class="kicker" style="margin-top:8px">Recovery</p><div class="grid-2">
          ${numberField('sleep_h', 'Sleep last night (hrs)', log.sleep_h, { decimal: true, max: 16 })}
          ${numberField('water_l', 'Water (litres)', log.water_l, { decimal: true, max: 15 })}
        </div>` : ''}
        <p class="kicker" style="margin-top:8px">Food</p>
        <p class="hint" style="margin:-4px 0 12px">Copy your daily totals from MyFitnessPal. Logging yesterday's food? Tap ‹ to go back a day.</p>
        <div class="grid-2">
          ${numberField('calories', 'Calories', log.calories, { max: 10000 })}
          ${numberField('protein_g', 'Protein (g)', log.protein_g, { max: 600 })}
          ${numberField('carbs_g', 'Carbs (g)', log.carbs_g, { max: 1000 })}
          ${numberField('fats_g', 'Fats (g)', log.fats_g, { max: 400 })}
          ${numberField('fibre_g', 'Fibre (g)', log.fibre_g, { max: 150 })}
        </div>
        ${mealPlan ? choiceField('meal_plan', 'Followed the meal plan?', ['Yes', 'Partly', 'No'], log.meal_plan) : ''}
        <div class="field">
          <label for="f-notes">How did today go?</label>
          <textarea id="f-notes" name="notes" maxlength="1000">${esc(log.notes || '')}</textarea>
        </div>
        <button class="btn" type="submit" style="width:100%">${log.id ? 'Update' : 'Save'} ${esc(title.toLowerCase())}</button>
      </form>`,
      'today',
    );

    const form = document.getElementById('log-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readForm(form);
      if (!Object.values(data).some((v) => v !== null)) return toast('Fill in at least one number.', true);
      withBusy(form.querySelector('button'), async () => {
        must(await sb.from('daily_logs').upsert({ ...data, user_id: state.me.id, day }, { onConflict: 'user_id,day' }));
        invalidate(state.me.id);
        toast('Saved. Nice work.');
        location.hash = `#home/${day}`;
      });
    });
  }

  // ---------------------------------------------------------------- habits

  const HABIT_CATEGORIES = {
    Activity: '👟',
    Nutrition: '🥗',
    Hydration: '💧',
    Recovery: '😴',
    Mindset: '🧠',
    Lifestyle: '☀️',
  };

  const STATE_ICONS = {
    good: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 12h9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    bad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 8.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  };

  function stateBadge(st) {
    return `<span class="state ${st.level || 'empty'}" role="img" aria-label="${esc(st.label || 'Not logged')}">${STATE_ICONS[st.level] || ''}</span>`;
  }

  function trainedStatus(v) {
    if (!v) return { level: '', label: 'Not logged' };
    return v === 'Missed' ? { level: 'bad', label: 'Missed' } : { level: 'good', label: v === 'Yes' ? 'Trained' : 'Planned rest' };
  }

  // Every row on the habit tracker for one day: the targets the coach set
  // (stored on daily_logs) followed by the client's own habits.
  function habitRows(ctx, day) {
    const t = ctx.targets;
    const week = S.weekOf(ctx.profile.start_date, day) || Math.max(S.currentWeek(ctx.profile.start_date), 1);
    const m = S.macrosForWeek(ctx.macros, week);
    const log = ctx.logs.find((l) => l.day === day) || {};
    const builtIn = [
      { key: 'steps', field: 'steps', name: 'Daily steps', cat: 'Activity', icon: '👟', unit: 'steps', target: t.steps_target },
      { key: 'training', field: 'trained', name: 'Training session', cat: 'Activity', icon: '🏋️', choice: ['Yes', 'Rest day', 'Missed'] },
      { key: 'protein', field: 'protein_g', name: 'Protein', cat: 'Nutrition', icon: '🍗', unit: 'g', target: m && m.protein_g },
      { key: 'calories', field: 'calories', name: 'Calories', cat: 'Nutrition', icon: '🔥', unit: 'kcal', target: m && m.calories },
      { key: 'fibre', field: 'fibre_g', name: 'Fibre', cat: 'Nutrition', icon: '🥦', unit: 'g', target: (m && m.fibre_g) || t.fibre_target_g },
    ];
    if (ctx.habitsReady) {
      builtIn.push(
        { key: 'water', field: 'water_l', name: 'Water', cat: 'Hydration', icon: '💧', unit: 'L', target: S.parseLitres(t.water_target), decimal: true },
        { key: 'sleep', field: 'sleep_h', name: 'Sleep', cat: 'Recovery', icon: '😴', unit: 'hrs', target: t.sleep_target_h, decimal: true },
      );
    }
    const rows = builtIn
      .filter((r) => r.choice || r.target)
      .map((r) => ({ ...r, value: log[r.field], status: r.choice ? trainedStatus(log.trained) : S.habitStatus(r.key, log[r.field], r.target) }));
    for (const h of ctx.habits) {
      const entry = ctx.habitEntries.find((e) => e.habit_id === h.id && e.day === day);
      const value = entry ? Number(entry.value) : null;
      rows.push({
        key: `h-${h.id}`, id: h.id, custom: true, name: h.name, cat: h.category, icon: h.icon || HABIT_CATEGORIES[h.category],
        unit: h.unit, target: Number(h.target), decimal: true, value, status: S.habitStatus('default', value, h.target),
      });
    }
    return rows;
  }

  function unitLabel(r) {
    return r.unit === 'times' && Number(r.target) === 1 ? 'time' : r.unit;
  }

  function habitValueText(r) {
    if (r.choice) return r.value ? esc(r.value) : 'Not logged';
    const v = r.value === null || r.value === undefined ? '–' : fmt(r.value, r.decimal && r.value % 1 ? 1 : 0);
    return `${v} / ${fmt(r.target, r.decimal && r.target % 1 ? 1 : 0)} ${esc(unitLabel(r))}`;
  }

  function weekOfDay(ctx, day) {
    const start = ctx.profile.start_date;
    const w = S.weekOf(start, day);
    return w ? S.weekDates(start, w) : Array.from({ length: 7 }, (_, i) => S.addDays(day, i - 6));
  }

  // Habit x day grid of status dots. Used by the client's "All" view and
  // by the coach.
  function habitWeekHTML(ctx, day) {
    const days = weekOfDay(ctx, day);
    const now = S.today();
    const perDay = days.map((d) => habitRows(ctx, d));
    const rows = perDay[0].map((r, i) => {
      const hits = perDay.filter((rs) => rs[i] && rs[i].status.level === 'good').length;
      const cells = perDay
        .map((rs, j) => {
          const st = rs[i] ? rs[i].status : {};
          return `<td><span class="dot-s ${days[j] > now ? 'future' : st.level || 'empty'}" title="${esc(niceDate(days[j]))}: ${esc(st.label || '')}"></span></td>`;
        })
        .join('');
      return `<tr><th scope="row"><span class="habit-icon sm" aria-hidden="true">${r.icon}</span>${esc(r.name)}<small>${r.choice ? 'Daily' : `Daily · ${fmt(r.target, r.decimal && r.target % 1 ? 1 : 0)} ${esc(unitLabel(r))}`}</small></th>${cells}<td class="hits">${hits}/7</td></tr>`;
    });
    return `<div class="table-wrap"><table class="habit-week">
      <thead><tr><th>Habit</th>${days.map((d) => `<th>${niceDate(d, { weekday: 'narrow' })}<br>${niceDate(d, { day: 'numeric' })}</th>`).join('')}<th>Hit</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
      <p class="legend"><span class="dot-s good"></span> Target hit <span class="dot-s warn"></span> Within 25% <span class="dot-s bad"></span> More than 25% off</p>`;
  }

  async function renderHabits(day, view) {
    const now = S.today();
    if (!day || day > now) day = now;
    view = view === 'all' ? 'all' : 'day';
    const ctx = await loadCtx(state.me.id);
    const rows = habitRows(ctx, day);
    const done = rows.filter((r) => r.status.level === 'good').length;
    const toggle = `<div class="segmented" role="tablist">
      <a role="tab" href="#habits/${day}" aria-selected="${view === 'day'}">Day view</a>
      <a role="tab" href="#habits/${day}/all" aria-selected="${view === 'all'}">All</a></div>`;
    const stepper = `<div class="date-stepper">
      <a href="#habits/${S.addDays(day, -1)}${view === 'all' ? '/all' : ''}" aria-label="Previous day">‹</a>
      <b>${niceDate(day, { day: 'numeric', month: 'long', year: 'numeric' })}</b>
      ${day < now ? `<a href="#habits/${S.addDays(day, 1)}${view === 'all' ? '/all' : ''}" aria-label="Next day">›</a>` : '<span></span>'}</div>`;
    const missing = ctx.habitsReady ? '' : `<div class="card muted-box">Water, sleep and your own habits switch on once ${esc(COACH)} finishes the habit tracker update.</div>`;

    let body;
    if (view === 'day') {
      body = `<p class="section-label">Today's habits · ${done} of ${rows.length} on target</p>
      <ul class="habit-list">${rows
        .map(
          (r) => `<li class="habit" data-key="${esc(r.key)}">
            <button type="button" class="habit-row" aria-expanded="false">
              <span class="habit-icon" aria-hidden="true">${r.icon}</span>
              <span class="habit-text"><b>${esc(r.name)}</b><small>${esc(r.cat)} · ${habitValueText(r)}</small></span>
              ${stateBadge(r.status)}<span class="chev" aria-hidden="true">›</span>
            </button>
            <form class="habit-entry" hidden novalidate>${
              r.choice
                ? choiceField(`hv-${r.key}`, 'Trained today?', r.choice, r.value)
                : `<label for="hv-${esc(r.key)}">${esc(r.name)} (${esc(r.unit)})</label>
                   <div class="entry-row"><input id="hv-${esc(r.key)}" name="value" type="number" inputmode="${r.decimal ? 'decimal' : 'numeric'}" step="${r.decimal ? '0.1' : '1'}" min="0" value="${r.value === null || r.value === undefined ? '' : esc(r.value)}" placeholder="Target ${fmt(r.target, r.decimal && r.target % 1 ? 1 : 0)}"><button class="btn btn-small" type="submit">Save</button></div>`
            }${r.choice ? '<button class="btn btn-small" type="submit">Save</button>' : ''}</form>
          </li>`,
        )
        .join('')}</ul>
      <p class="hint">Tap a habit to log it. Green means you hit the target, orange means you're within 25%, red means more than 25% off.</p>`;
    } else {
      body = `<section class="card">${habitWeekHTML(ctx, day)}</section>
      ${ctx.habits.length ? `<section class="card"><p class="kicker">Your own habits</p><ul class="own-habits">${ctx.habits
        .map((h) => `<li><span class="habit-icon sm" aria-hidden="true">${h.icon || HABIT_CATEGORIES[h.category]}</span><span>${esc(h.name)}<small>${esc(h.category)} · ${fmt(h.target, h.target % 1 ? 1 : 0)} ${esc(h.unit)} a day</small></span><button class="btn btn-ghost btn-small" type="button" data-del-habit="${esc(h.id)}">Remove</button></li>`)
        .join('')}</ul></section>` : ''}
      ${ctx.habitsReady ? `<form id="add-habit" class="card" novalidate><p class="kicker">Add your own habit</p>
        <div class="field"><label for="nh-name">Habit</label><input id="nh-name" name="name" maxlength="60" placeholder="e.g. Morning walk outside" required></div>
        <div class="grid-2">
          <div class="field"><label for="nh-cat">Category</label><select id="nh-cat" name="category">${Object.keys(HABIT_CATEGORIES).map((c) => `<option>${c}</option>`).join('')}</select></div>
          <div class="field"><label for="nh-target">Daily target</label><input id="nh-target" name="target" type="number" inputmode="decimal" step="any" min="0.1" value="1"></div>
        </div>
        <div class="field"><label for="nh-unit">Unit</label><input id="nh-unit" name="unit" maxlength="20" value="times" list="nh-units"><datalist id="nh-units"><option>times</option><option>minutes</option><option>pages</option><option>serves</option><option>L</option></datalist>
        <p class="hint">Yes/no habit? Leave it as 1 time a day.</p></div>
        <button class="btn" type="submit" style="width:100%">Add habit</button></form>` : ''}`;
    }
    shell('Habit tracker', `${done} of ${rows.length} on target`, `${toggle}${stepper}${missing}${body}`, 'habits');

    root.querySelectorAll('.habit').forEach((li) => {
      const row = rows.find((r) => r.key === li.dataset.key);
      const btn = li.querySelector('.habit-row');
      const form = li.querySelector('form');
      btn.addEventListener('click', () => {
        // Yes/no habits (target 1 time) tick straight from the row.
        if (row.custom && row.target === 1 && row.unit === 'times') return saveHabit(row, row.value >= 1 ? null : 1, day, btn);
        const open = form.hidden;
        form.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        if (open) {
          const input = form.querySelector('input[type=number]');
          if (input) input.focus();
        }
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        let value;
        if (row.choice) {
          const picked = form.querySelector('input[type=radio]:checked');
          value = picked ? picked.value : null;
        } else {
          const raw = form.elements.value.value.trim();
          value = raw === '' ? null : Number(raw);
          if (value !== null && (Number.isNaN(value) || value < 0)) return toast('Enter a number of 0 or more.', true);
        }
        saveHabit(row, value, day, form.querySelector('[type=submit]'));
      });
    });
    root.querySelectorAll('[data-del-habit]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!window.confirm('Remove this habit and its history?')) return;
        withBusy(b, async () => {
          must(await sb.from('client_habits').delete().eq('id', b.dataset.delHabit).eq('user_id', state.me.id));
          invalidate(state.me.id);
          renderHabits(day, 'all');
        });
      }),
    );
    const add = document.getElementById('add-habit');
    if (add)
      add.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = readForm(add);
        if (!d.name) return toast('Name the habit.', true);
        if (!d.target || d.target <= 0) return toast('Set a daily target above 0.', true);
        withBusy(add.querySelector('[type=submit]'), async () => {
          must(await sb.from('client_habits').insert({ ...d, unit: d.unit || 'times', user_id: state.me.id, icon: HABIT_CATEGORIES[d.category], sort_order: ctx.habits.length }));
          invalidate(state.me.id);
          toast('Habit added.');
          renderHabits(day, 'all');
        });
      });
  }

  async function saveHabit(row, value, day, button) {
    await withBusy(button, async () => {
      const uid = state.me.id;
      if (row.custom) {
        if (value === null) must(await sb.from('habit_entries').delete().eq('habit_id', row.id).eq('day', day));
        else must(await sb.from('habit_entries').upsert({ habit_id: row.id, user_id: uid, day, value }, { onConflict: 'habit_id,day' }));
      } else {
        must(await sb.from('daily_logs').upsert({ user_id: uid, day, [row.field]: value }, { onConflict: 'user_id,day' }));
      }
      invalidate(uid);
      renderHabits(day, 'day');
    });
  }

  // ---------------------------------------------------------------- client: home

  function progressRow(icon, label, sub, value, target, unit, st, dp) {
    const ratio = value !== null && value !== undefined && target ? Math.min(1, Number(value) / target) : 0;
    return `<div class="prow">
      <span class="habit-icon" aria-hidden="true">${icon}</span>
      <div class="prow-text"><b>${esc(label)}</b><small>${esc(sub || st.label || '')}</small></div>
      <div class="prow-val"><span>${value === null || value === undefined ? '–' : fmt(value, dp)} <i>/ ${target ? fmt(target, dp) : '–'} ${esc(unit)}</i></span>
        <div class="pbar ${st.level || 'empty'}" aria-hidden="true"><span style="width:${Math.round(ratio * 100)}%"></span></div></div>
    </div>`;
  }

  function todaysSession(ctx, day) {
    if (!ctx.training.length) return null;
    const starts = [...new Set(ctx.training.map((r) => r.program_start_date))].sort().reverse();
    const start = starts.find((d) => d <= day);
    if (!start) return null;
    const sessions = ctx.training.filter((r) => r.program_start_date === start);
    const len = Math.max(...sessions.map((r) => r.cycle_day));
    return sessions.find((r) => r.cycle_day === (S.daysBetween(start, day) % len) + 1) || null;
  }

  async function renderHome(day) {
    const now = S.today();
    if (!day || day > now) day = now;
    const ctx = await loadCtx(state.me.id);
    const p = ctx.profile;
    const t = ctx.targets;
    const week = S.weekOf(p.start_date, day);
    const m = S.macrosForWeek(ctx.macros, week || Math.max(S.currentWeek(p.start_date), 1));
    const log = ctx.logs.find((l) => l.day === day) || {};
    const session = todaysSession(ctx, day);
    const rows = habitRows(ctx, day);
    const custom = rows.filter((r) => r.custom);
    const st = (key) => (rows.find((r) => r.key === key) || { status: {} }).status;
    const macroSt = (v, target) => S.habitStatus('default', v, target);
    const label = day === now ? 'Today' : day === S.addDays(now, -1) ? 'Yesterday' : niceDate(day);

    shell(
      `Hi ${p.full_name ? p.full_name.split(' ')[0] : 'there'}`,
      week ? `Week ${week} of 12` : p.start_date && day < p.start_date ? `Starts ${niceDate(p.start_date)}` : '',
      `
      <div class="date-stepper">
        <a href="#home/${S.addDays(day, -1)}" aria-label="Previous day">‹</a>
        <b>${esc(label)} · ${niceDate(day, { day: 'numeric', month: 'short' })}</b>
        ${day < now ? `<a href="#home/${S.addDays(day, 1)}" aria-label="Next day">›</a>` : '<span></span>'}
      </div>
      <a class="checkin-row card" href="#log/${day}">
        <span class="state ${log.id ? 'good' : 'empty'}" aria-hidden="true">${log.id ? STATE_ICONS.good : ''}</span>
        <span><b>Daily check-in</b><small>${log.id ? 'Logged. Tap to update' : 'Weight, steps, food and how the day went'}</small></span><span class="chev" aria-hidden="true">›</span>
      </a>
      ${t.coach_note ? `<div class="card coach-note"><p class="kicker">From ${esc(COACH)} · biggest lever this week</p><div>${esc(t.coach_note)}</div></div>` : ''}
      <section class="panel">
        <div class="panel-banner exercise"><h2>Exercise</h2><p>What to do ${day === now ? 'today' : 'on this day'}</p></div>
        <div class="panel-body">
          <div class="prow">
            <span class="habit-icon" aria-hidden="true">🏋️</span>
            <div class="prow-text"><b>${esc(session ? session.session_name : 'No session set')}</b><small>${session ? (session.is_rest_day ? 'Recovery day' : `Day ${session.cycle_day} of your cycle`) : `${esc(COACH)} adds your program`}</small></div>
            ${session && !session.is_rest_day ? '<a class="btn btn-small" href="#training">Start workout</a>' : stateBadge(st('training'))}
          </div>
          ${t.steps_target ? progressRow('👟', 'Steps', '', log.steps, t.steps_target, 'steps', st('steps')) : ''}
          <div class="prow"><span class="habit-icon" aria-hidden="true">🏃</span><div class="prow-text"><b>Cardio</b><small>Extra conditioning</small></div><div class="prow-val"><span>${fmt(log.cardio_min)} <i>mins</i></span></div></div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-banner nutrition"><h2>Nutrition</h2><p>Your daily intake against target</p></div>
        <div class="panel-body">
          ${m ? `${progressRow('🔥', 'Calories', '', log.calories, m.calories, 'kcal', st('calories'))}
          ${progressRow('🍗', 'Protein', '', log.protein_g, m.protein_g, 'g', st('protein'))}
          ${progressRow('🍚', 'Carbs', '', log.carbs_g, m.carbs_g, 'g', macroSt(log.carbs_g, m.carbs_g))}
          ${progressRow('🥑', 'Fats', '', log.fats_g, m.fats_g, 'g', macroSt(log.fats_g, m.fats_g))}
          ${progressRow('🥦', 'Fibre', '', log.fibre_g, m.fibre_g || t.fibre_target_g, 'g', st('fibre'))}` : `<p class="hint" style="padding:12px 14px">${esc(COACH)} will add your macros after your kickoff call.</p>`}
        </div>
      </section>
      ${ctx.habitsReady ? `<section class="panel">
        <div class="panel-banner recovery"><h2>Recovery</h2><p>Sleep and water</p></div>
        <div class="panel-body">
          ${progressRow('😴', 'Sleep', '', log.sleep_h, t.sleep_target_h, 'hrs', st('sleep'), 1)}
          ${progressRow('💧', 'Water', '', log.water_l, S.parseLitres(t.water_target), 'L', st('water'), 1)}
        </div>
      </section>` : ''}
      <a class="card checkin-row" href="#habits/${day}">
        <span class="habit-icon" aria-hidden="true">✅</span>
        <span><b>Habit tracker</b><small>${rows.filter((r) => r.status.level === 'good').length} of ${rows.length} on target${custom.length ? ` · ${custom.length} of your own` : ''}</small></span><span class="chev" aria-hidden="true">›</span>
      </a>`,
      'home',
    );
  }

  // ---------------------------------------------------------------- client: coach hub

  async function renderHub() {
    const ctx = await loadCtx(state.me.id);
    const week = S.currentWeek(ctx.profile.start_date);
    const latest = ctx.checkins.filter((c) => c.coach_feedback).sort((a, b) => b.week_number - a.week_number)[0];
    const done = ctx.checkins.some((c) => c.week_number === week);
    const items = [
      ['#checkin', ICONS.checkin, 'Weekly check-in', week ? (done ? `Week ${week} sent` : `Week ${week} due Sunday night`) : 'Opens in week 1'],
      ['#photos', ICONS.photos, 'Progress photos', 'Front, side and back each week'],
      ['#supps', ICONS.supps, 'Supplements', ctx.supplements.length ? `${ctx.supplements.length} from ${COACH}` : 'Your plan and the general guide'],
      ['#profile', ICONS.profile, 'Profile and targets', 'Your details and 12-week goals'],
    ];
    shell(
      'Coach hub',
      `You and ${COACH}`,
      `${latest ? `<div class="card coach-note"><p class="kicker">Latest feedback · week ${latest.week_number}</p><div class="feedback">${esc(latest.coach_feedback)}</div></div>` : ''}
      <ul class="hub-list">${items
        .map(([href, icon, title, sub]) => `<li><a class="card checkin-row" href="${href}"><span class="habit-icon" aria-hidden="true">${icon}</span><span><b>${title}</b><small>${esc(sub)}</small></span><span class="chev" aria-hidden="true">›</span></a></li>`)
        .join('')}</ul>`,
      'hub',
    );
  }

  // -------------------------------------------------------- client: training

  function trainingHTML(ctx) {
    if (!ctx.training.length) return '<section class="card"><p>Your coach has not added a training program yet.</p></section>';
    const today = S.today();
    const starts = [...new Set(ctx.training.map((row) => row.program_start_date))].sort().reverse();
    const start = starts.find((date) => date <= today) || starts[starts.length - 1];
    const sessions = ctx.training.filter((row) => row.program_start_date === start).sort((a, b) => a.cycle_day - b.cycle_day);
    const cycleLength = Math.max(...sessions.map((row) => row.cycle_day));
    const activeDay = start <= today ? (S.daysBetween(start, today) % cycleLength) + 1 : null;
    const current = sessions.find((row) => row.cycle_day === activeDay);
    const header = `<section class="training-intro">
      <p class="kicker">Your training plan</p>
      <h2>${esc(sessions[0].program_name)}</h2>
      <p>Starts ${esc(niceDate(start, { day: 'numeric', month: 'long', year: 'numeric' }))} · ${cycleLength}-day repeating cycle</p>
      ${current ? `<div class="training-today"><span>Today · Day ${activeDay}</span><strong>${esc(current.session_name)}</strong></div>` : ''}
    </section>`;
    const cards = sessions.map((row) => {
      const exercises = Array.isArray(row.exercises) ? row.exercises : [];
      const rows = exercises.map((ex, index) => {
        const reps = ex.reps_min === ex.reps_max ? fmt(ex.reps_min) : `${fmt(ex.reps_min)}–${fmt(ex.reps_max)}`;
        const rest = ex.rest_seconds_min && ex.rest_seconds_max ? `${fmt(ex.rest_seconds_min)}–${fmt(ex.rest_seconds_max)} sec rest` : '';
        const effort = ex.rpe_min && ex.rpe_max ? `RPE ${fmt(ex.rpe_min)}–${fmt(ex.rpe_max)}` : '';
        return `<li class="training-exercise"><div class="exercise-count">${index + 1}</div><div>
          <strong>${esc(ex.name)}</strong><div class="exercise-meta">${fmt(ex.sets)} sets × ${esc(reps)} reps${effort ? ` · ${esc(effort)}` : ''}${rest ? ` · ${esc(rest)}` : ''}</div>
          ${ex.final_set_rpe_target ? `<div class="exercise-meta">Final set: about RPE ${fmt(ex.final_set_rpe_target)} if technique stays solid</div>` : ''}
          ${ex.note ? `<p class="exercise-note">${esc(ex.note)}</p>` : ''}
        </div></li>`;
      }).join('');
      return `<details class="training-day card"${row.cycle_day === activeDay ? ' open' : ''}>
        <summary><span class="day-pill">Day ${fmt(row.cycle_day)}</span><span><strong>${esc(row.session_name)}</strong><small>${row.is_rest_day ? 'Recovery day' : `${exercises.length} exercises`}</small></span>${row.cycle_day === activeDay ? '<em>Today</em>' : ''}</summary>
        <div class="training-details">${rows ? `<ol class="training-exercises">${rows}</ol>` : ''}${row.session_note ? `<p class="training-session-note">${esc(row.session_note)}</p>` : ''}</div>
      </details>`;
    }).join('');
    return `${header}<div class="training-days">${cards}</div>`;
  }

  async function renderTraining() {
    const ctx = await loadCtx(state.me.id, true);
    shell('Training', 'Your program', trainingHTML(ctx), 'training');
  }

  // ------------------------------------------------------ client: supplements

  function suppsHTML(ctx) {
    const assigned = ctx.supplements.length
      ? `<section class="assigned-supps"><p class="kicker">From your coach</p><h2>Your supplements</h2>
        <div class="supp-grid">${ctx.supplements.map((item) => `<article class="supp-card card">
          <h3>${esc(item.name)}</h3><div class="supp-facts"><div><span>Dose</span><strong>${esc(item.dose)}</strong></div><div><span>When</span><strong>${esc(item.timing)}</strong></div></div>
          ${item.coach_note ? `<p class="supp-coach-note">${esc(item.coach_note)}</p>` : ''}
        </article>`).join('')}</div></section>`
      : '<section class="card"><p class="kicker">From your coach</p><p>No supplements assigned yet.</p></section>';
    const cards = SUPPLEMENTS.map((item) => `<article class="supp-card card">
      <div class="supp-card-head"><span class="supp-priority">${esc(item.priority)}</span><span class="supp-evidence">Evidence: ${esc(item.evidence)}</span></div>
      <h3>${esc(item.name)}</h3>
      <div class="supp-facts"><div><span>Dose</span><strong>${esc(item.dose)}</strong></div><div><span>When</span><strong>${esc(item.when)}</strong></div></div>
      <p>${esc(item.why)}</p>
    </article>`).join('');
    return `${assigned}<section class="supp-intro"><p class="kicker">Supplement guide</p><h2>Supps</h2>
      <p>General guidance only, not medical advice. Check with your GP before starting any supplement, especially if you take medication or have a medical condition. If you compete in tested sport, choose batch-tested products (e.g. Informed Sport).</p>
    </section><div class="supp-grid">${cards}</div>
    <p class="supp-source">Sources: ISSN position stands on creatine (Kreider et al., 2017), caffeine (Guest et al., 2021) and protein (Jäger et al., 2017). Magnesium upper limit for supplements: 350 mg/day (NHMRC Nutrient Reference Values).</p>`;
  }

  async function renderSupps() {
    const ctx = await loadCtx(state.me.id, true);
    shell('Supps', 'Your plan and general guide', suppsHTML(ctx), 'supps');
  }

  // ---------------------------------------------------------------- client: weekly check-in

  function weekOptions(max, selected, includeStart) {
    const opts = [];
    if (includeStart) opts.push(0);
    for (let w = 1; w <= Math.max(1, max); w++) opts.push(w);
    return opts.map((w) => `<option value="${w}"${w === selected ? ' selected' : ''}>${weekLabel(w)}</option>`).join('');
  }

  function weekSummaryHTML(ctx, week) {
    const st = S.weekStats(ctx, week);
    const prev = week > 1 ? S.weekStats(ctx, week - 1).avgWeight : S.firstWeight(ctx.logs);
    const rows = [
      ['Average weight', fmt(st.avgWeight, 1) + (st.avgWeight !== null ? ' kg' : '')],
      ['Change', st.avgWeight !== null && prev !== null ? `${signed(st.avgWeight - prev, 1)} kg` : '–'],
      ['Average steps', fmt(st.avgSteps)],
      ['Average calories', `${fmt(st.avgCalories)}${st.macro ? ` of ${fmt(st.macro.calories)}` : ''}`],
      ['Average protein', `${fmt(st.avgProtein)}${st.macro ? ` of ${st.macro.protein_g}` : ''} g`],
      ['Food days logged', `${st.foodDays} / 7`],
      ['Training sessions', `${st.sessions}${ctx.profile.training_days_per_week ? ` / ${ctx.profile.training_days_per_week}` : ''}`],
      ['Adherence', pct(st.adherence)],
    ];
    return `<table><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
  }

  async function renderCheckin(weekParam) {
    const ctx = await loadCtx(state.me.id);
    const p = ctx.profile;
    const thisWeek = S.currentWeek(p.start_date);
    const week = Math.min(Math.max(Number(weekParam) || thisWeek || 1, 1), 12);
    const c = ctx.checkins.find((x) => x.week_number === week) || {};
    const evenWeek = week % 2 === 0 ? week : week - 1;
    const mWeek = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('m') || evenWeek);
    const m = ctx.measurements.find((x) => x.week_number === mWeek) || {};
    const scale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    shell(
      'Weekly check-in',
      'Fill in every Sunday night',
      `
      <div class="card">
        <label for="week-pick">Week</label>
        <select id="week-pick">${weekOptions(Math.max(thisWeek, 1), week)}</select>
      </div>
      ${c.coach_feedback ? `<div class="card"><p class="kicker">Feedback from ${esc(COACH)}</p><div class="feedback">${esc(c.coach_feedback)}</div></div>` : ''}
      <section class="card">
        <p class="kicker">Your week in numbers</p>
        <p class="hint" style="margin-top:0">Worked out from your daily logs.</p>
        ${weekSummaryHTML(ctx, week)}
      </section>
      <form id="checkin-form" class="card" novalidate>
        <p class="kicker">How was week ${week}?</p>
        ${numberField('sleep_hours', 'Sleep (hours a night, on average)', c.sleep_hours, { decimal: true, max: 14 })}
        <p class="hint" style="margin:-6px 0 12px">Rate 1 to 10, where 10 is best (low stress = 10).</p>
        ${choiceField('stress', 'Stress', scale, c.stress, 'scale')}
        ${choiceField('energy', 'Energy', scale, c.energy, 'scale')}
        ${choiceField('hunger', 'Hunger', scale, c.hunger, 'scale')}
        ${choiceField('digestion', 'Digestion', scale, c.digestion, 'scale')}
        <div class="field"><label for="f-win">Biggest win</label><textarea id="f-win" name="biggest_win" maxlength="1000">${esc(c.biggest_win || '')}</textarea></div>
        <div class="field"><label for="f-struggle">Biggest struggle</label><textarea id="f-struggle" name="biggest_struggle" maxlength="1000">${esc(c.biggest_struggle || '')}</textarea></div>
        <button class="btn" type="submit" style="width:100%">${c.submitted_at ? 'Update' : 'Send'} check-in</button>
      </form>
      <form id="measure-form" class="card" novalidate>
        <p class="kicker">Body measurements (cm) · every 2 weeks</p>
        <div class="field">
          <label for="m-week">Measurement for</label>
          <select id="m-week">${[0, 2, 4, 6, 8, 10, 12].map((w) => `<option value="${w}"${w === mWeek ? ' selected' : ''}>${weekLabel(w)}</option>`).join('')}</select>
        </div>
        <div class="grid-2">
          ${MEASURES.map(([k, l]) => numberField(k, l, m[k], { decimal: true, max: 250 })).join('')}
        </div>
        <p class="hint">Measure every second Monday morning before food. Tape snug, not tight, same spot every time.</p>
        <button class="btn" type="submit" style="width:100%">Save measurements</button>
      </form>
      ${measurementsTable(ctx)}`,
      'checkin',
    );

    document.getElementById('week-pick').addEventListener('change', (e) => {
      location.hash = `#checkin/${e.target.value}`;
    });
    document.getElementById('m-week').addEventListener('change', (e) => {
      location.hash = `#checkin/${week}?m=${e.target.value}`;
    });
    const form = document.getElementById('checkin-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readForm(form);
      withBusy(form.querySelector('button'), async () => {
        must(await sb.from('weekly_checkins').upsert({ ...data, user_id: state.me.id, week_number: week }, { onConflict: 'user_id,week_number' }));
        invalidate(state.me.id);
        toast(`Check-in sent to ${COACH}.`);
        renderCheckin(week);
      });
    });
    const mform = document.getElementById('measure-form');
    mform.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readForm(mform);
      if (!MEASURES.some(([k]) => data[k] !== null)) return toast('Add at least one measurement.', true);
      withBusy(mform.querySelector('button'), async () => {
        must(
          await sb
            .from('measurements')
            .upsert({ ...data, user_id: state.me.id, week_number: mWeek, measured_on: S.today() }, { onConflict: 'user_id,week_number' }),
        );
        invalidate(state.me.id);
        toast('Measurements saved.');
        renderCheckin(week);
      });
    });
  }

  // ---------------------------------------------------------------- client: photos

  async function renderPhotos(weekParam) {
    const ctx = await loadCtx(state.me.id);
    const thisWeek = S.currentWeek(ctx.profile.start_date);
    const week = weekParam === undefined || weekParam === '' ? thisWeek : Math.min(Math.max(Number(weekParam), 0), 12);
    const mine = POSES.map((pose) => ctx.photos.find((x) => x.week_number === week && x.pose === pose));
    const urls = await signedUrls(mine.filter(Boolean).map((x) => x.storage_path));
    const have = weeksWithPhotos(ctx);
    const compare = have.length > 1 ? await photoCompareHTML(ctx, have[0], have[have.length - 1]) : '';

    shell(
      'Progress photos',
      'Every week',
      `
      <div class="card">
        <label for="week-pick">Photos for</label>
        <select id="week-pick">${weekOptions(Math.max(thisWeek, 1), week, true)}</select>
        <p class="hint">Same lighting, same time (morning, before food), same pose. Only you and ${esc(COACH)} can see these.</p>
      </div>
      <div class="photos">
        ${POSES.map((pose, i) => {
          const row = mine[i];
          const url = row && urls[row.storage_path];
          return `<div class="photo-slot">
            <div class="frame">${url ? `<img src="${esc(url)}" alt="${pose} photo, ${esc(weekLabel(week))}">` : `<span>${pose[0].toUpperCase() + pose.slice(1)}</span>`}</div>
            <input type="file" id="ph-${pose}" accept="image/*" data-pose="${pose}">
            <label class="btn btn-small${row ? ' btn-ghost' : ''}" for="ph-${pose}">${row ? 'Replace' : 'Add'} ${pose}</label>
          </div>`;
        }).join('')}
      </div>
      ${compare ? `<p class="kicker">${esc(weekLabel(have[0]))} vs ${esc(weekLabel(have[have.length - 1]))}</p>${compare}` : ''}`,
      'photos',
    );

    document.getElementById('week-pick').addEventListener('change', (e) => {
      location.hash = `#photos/${e.target.value}`;
    });
    root.querySelectorAll('input[type=file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const pose = input.dataset.pose;
        const label = root.querySelector(`label[for="ph-${pose}"]`);
        label.textContent = 'Uploading…';
        try {
          await uploadPhoto(ctx, week, pose, file);
          toast('Photo saved.');
          invalidate(state.me.id);
          renderPhotos(week);
        } catch (err) {
          toast(friendlyError(err), true);
          label.textContent = `Add ${pose}`;
        }
      });
    });
  }

  async function uploadPhoto(ctx, week, pose, file) {
    const uid = state.me.id;
    const img = await prepareImage(file);
    const path = `${uid}/week-${week}-${pose}-${Date.now()}.${img.ext}`;
    must(await sb.storage.from(BUCKET).upload(path, img.blob, { contentType: img.type, upsert: false }));
    const old = ctx.photos.find((x) => x.week_number === week && x.pose === pose);
    if (old) must(await sb.from('progress_photos').delete().eq('id', old.id));
    must(await sb.from('progress_photos').insert({ user_id: uid, week_number: week, pose, storage_path: path }));
    if (old) await sb.storage.from(BUCKET).remove([old.storage_path]);
  }

  // ---------------------------------------------------------------- client: progress & profile

  async function renderProgress() {
    const ctx = await loadCtx(state.me.id);
    shell('Your progress', 'Updates as you log', dashboardHTML(ctx), 'progress');
  }

  const PROFILE_FIELDS = [
    ['full_name', 'Name', 'text', 'e.g. John Smith'],
    ['phone', 'Phone', 'tel', 'e.g. 04xx xxx xxx'],
    ['start_date', 'Start date', 'date', 'The Monday your 12 weeks begin'],
    ['age', 'Age', 'number', ''],
    ['height_cm', 'Height (cm)', 'number', ''],
  ];
  const PROFILE_CHOICES = [
    ['dream_outcome', 'Dream outcome', ['Fat loss', 'Muscle gain', 'Improve body recomposition', 'Get ready for an event']],
    ['training_days_per_week', 'Training days per week', [2, 3, 4, 5, 6]],
    ['training_experience', 'Training experience', ['Beginner (<1 yr)', 'Intermediate (1-3 yrs)', 'Advanced (3+ yrs)']],
    ['nutrition_tracking', 'Nutrition tracking', ['Macro-based / Flexible', 'Assigned meal plan']],
  ];
  const PROFILE_TEXT = [
    ['injuries', 'Injuries / medical notes', 'Anything your coach should know'],
    ['work_schedule', 'Work hours / schedule', 'e.g. 8:30-5:30, hybrid WFH Mon/Fri'],
    ['wake_sleep', 'Wake / sleep time', 'e.g. 6:00am / 10:30pm'],
  ];

  function profileFormHTML(p, submitLabel) {
    return `<form id="profile-form" class="card" novalidate>
      <p class="kicker">Client profile</p>
      <div class="field"><label>Email</label><input value="${esc(p.email)}" disabled></div>
      ${PROFILE_FIELDS.map(
        ([k, l, type, hint]) => `<div class="field">
          <label for="p-${k}">${l}</label>
          <input id="p-${k}" name="${k}" type="${type}"${type === 'number' ? ' inputmode="decimal"' : ''} value="${esc(p[k] || '')}"${k === 'full_name' ? ' autocomplete="name" required' : ''}${k === 'phone' ? ' autocomplete="tel"' : ''}>
          ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
        </div>`,
      ).join('')}
      ${PROFILE_CHOICES.map(([k, l, opts]) => `<div class="field">
          <label for="p-${k}">${l}</label>
          <select id="p-${k}" name="${k}"${typeof opts[0] === 'number' ? ' data-number' : ''}>
            <option value="">Pick one</option>
            ${opts.map((o) => `<option${String(p[k]) === String(o) ? ' selected' : ''}>${esc(o)}</option>`).join('')}
          </select>
        </div>`).join('')}
      ${PROFILE_TEXT.map(([k, l, hint]) => `<div class="field">
          <label for="p-${k}">${l}</label>
          <textarea id="p-${k}" name="${k}" maxlength="1000" placeholder="${esc(hint)}">${esc(p[k] || '')}</textarea>
        </div>`).join('')}
      <button class="btn" type="submit" style="width:100%">${submitLabel}</button>
    </form>`;
  }

  function bindProfileForm(id, after) {
    const form = document.getElementById('profile-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readForm(form);
      if (!data.full_name) return toast('Add your name.', true);
      if (!data.start_date) return toast('Add your start date.', true);
      withBusy(form.querySelector('button'), async () => {
        const row = must(await sb.from('profiles').update(data).eq('id', id).select().single());
        if (id === state.me.id) state.me = row;
        invalidate(id);
        toast('Profile saved.');
        after();
      });
    });
  }

  function renderOnboarding() {
    bare(`<h1>Welcome to Rewired</h1>
      <p>Start with your profile. ${esc(COACH)} uses it to set your targets after your kickoff call.</p>
      ${profileFormHTML(state.me, 'Save and continue')}`);
    bindProfileForm(state.me.id, () => {
      location.hash = '#home';
      route();
    });
  }

  function targetsSummaryHTML(t) {
    const rows = [
      ['Goal weight', t.goal_weight_kg ? `${fmt(t.goal_weight_kg, 1)} kg` : ''],
      ['Goal waist', t.goal_waist_cm ? `${fmt(t.goal_waist_cm, 1)} cm` : ''],
      ['Strength goal', t.strength_goal],
      ['Non-scale goal', t.non_scale_goal],
      ['Your why', t.why],
      ['Event date', t.event_date ? niceDate(t.event_date, { day: 'numeric', month: 'long', year: 'numeric' }) : ''],
      ['Daily steps', fmt(t.steps_target)],
      ['Water', t.water_target],
      ['Fibre', t.fibre_target_g ? `${t.fibre_target_g} g+` : ''],
      ['Whole foods', t.whole_foods_pct ? `${t.whole_foods_pct}% minimally processed` : ''],
      ['Sleep', t.sleep_target_h ? `${fmt(t.sleep_target_h, 0)}+ hours` : ''],
    ].filter(([, v]) => v && v !== '–');
    return `<table><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td class="wrap-text">${esc(v)}</td></tr>`).join('')}</tbody></table>`;
  }

  async function renderProfile() {
    const ctx = await loadCtx(state.me.id);
    shell(
      'Profile',
      state.me.email,
      `
      <section class="card">
        <p class="kicker">Your 12-week targets</p>
        <p class="hint" style="margin-top:0">Set by ${esc(COACH)} after your kickoff call.</p>
        ${targetsSummaryHTML(ctx.targets)}
      </section>
      ${profileFormHTML(ctx.profile, 'Save profile')}
      <section class="card">
        <p class="kicker">Put the app on your home screen</p>
        <p><b>iPhone:</b> open this page in Safari, tap Share, then "Add to Home Screen".<br><b>Android:</b> open in Chrome, tap ⋮, then "Install app" or "Add to Home screen".</p>
      </section>
      <section class="card row-actions">
        <a href="/privacy.html" target="_blank" rel="noopener">Privacy policy</a>
        <button class="btn btn-ghost btn-small" type="button" data-signout>Sign out</button>
      </section>`,
      'profile',
    );
    bindProfileForm(state.me.id, renderProfile);
    root.querySelector('[data-signout]').addEventListener('click', signOut);
  }

  // ---------------------------------------------------------------- coach CRM building blocks

  function statCards(cards) {
    return `<div class="stat-cards">${cards
      .map((c) => `<div class="stat-card"><div class="k">${esc(c.k)}</div><div class="v">${c.v}${c.delta || ''}</div>${c.s ? `<div class="s">${esc(c.s)}</div>` : ''}</div>`)
      .join('')}</div>`;
  }

  // ▲/▼ change. goodWhen 'down' or 'up' colours it; anything else stays neutral.
  function deltaHTML(d, dp, unit, goodWhen) {
    if (d === null || d === undefined || Number.isNaN(d)) return '<span class="delta">–</span>';
    if (Math.abs(d) < Math.pow(10, -(dp || 0)) / 2) return '<span class="delta">No change</span>';
    const up = d > 0;
    const tone = !goodWhen ? '' : (goodWhen === 'up') === up ? ' good' : ' bad';
    return `<span class="delta${tone}">${up ? '▲' : '▼'} ${signed(d, dp)}${unit ? ` ${unit}` : ''}</span>`;
  }

  function dotCell(st, text) {
    return `<span class="cell-status"><span class="dot-s ${st.level || 'empty'}" title="${esc(st.label || '')}"></span>${text}</span>`;
  }

  // A table that shows `per` rows at a time with a footer like the reference.
  function pagedTable(headers, rows, per) {
    per = per || 10;
    if (!rows.length) return '<div class="card"><p>Nothing logged yet.</p></div>';
    return `<div class="card table-card" data-paged="${per}"><div class="table-wrap"><table class="crm-table">
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
      <div class="pager"><span data-range></span><span class="pager-btns"><button type="button" class="btn btn-ghost btn-small" data-prev aria-label="Previous page">‹</button><span data-page></span><button type="button" class="btn btn-ghost btn-small" data-next aria-label="Next page">›</button></span></div></div>`;
  }

  function bindPaged() {
    root.querySelectorAll('[data-paged]').forEach((box) => {
      const per = Number(box.dataset.paged);
      const trs = [...box.querySelectorAll('tbody tr')];
      const pages = Math.max(1, Math.ceil(trs.length / per));
      let page = 0;
      const show = () => {
        trs.forEach((tr, i) => (tr.hidden = Math.floor(i / per) !== page));
        box.querySelector('[data-range]').textContent = `${page * per + 1}–${Math.min(trs.length, (page + 1) * per)} of ${trs.length} items`;
        box.querySelector('[data-page]').textContent = `${page + 1} of ${pages}`;
        box.querySelector('[data-prev]').disabled = page === 0;
        box.querySelector('[data-next]').disabled = page >= pages - 1;
      };
      box.querySelector('[data-prev]').addEventListener('click', () => { page -= 1; show(); });
      box.querySelector('[data-next]').addEventListener('click', () => { page += 1; show(); });
      show();
    });
  }

  function sectionTabs(id, section, tabs, current) {
    return `<nav class="crm-tabs" aria-label="Section views">${tabs
      .map(([t, l]) => `<a href="#client/${id}/${section}/${t}"${t === current ? ' aria-current="page"' : ''}>${l}</a>`)
      .join('')}</nav>`;
  }

  // The current program week's days (or the last 7 days before a start date).
  function coachWeek(ctx) {
    const w = S.currentWeek(ctx.profile.start_date);
    return { week: w, days: w ? S.weekDates(ctx.profile.start_date, w) : Array.from({ length: 7 }, (_, i) => S.addDays(S.today(), i - 6)) };
  }

  function avgOf(xs) {
    const v = xs.filter((x) => x !== null && x !== undefined && x !== '').map(Number);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  function weekValues(ctx, days, field) {
    const byDay = new Map(ctx.logs.map((l) => [l.day, l]));
    const vals = days.map((d) => (byDay.get(d) || {})[field]).filter((v) => v !== null && v !== undefined);
    return vals.map(Number);
  }

  function prevDays(days) {
    return days.map((d) => S.addDays(d, -7));
  }

  // ---------------------------------------------------------------- coach CRM sections

  function renderCoachPhysique(ctx, nav, title, sub, view) {
    const id = ctx.profile.id;
    view = view === 'measurements' ? 'measurements' : 'bodyweight';
    const tabs = sectionTabs(id, 'physique', [['bodyweight', 'Bodyweight'], ['measurements', 'Measurements']], view);
    if (view === 'measurements') {
      return shell(title, sub, `${tabs}${measurementsTable(ctx) || '<div class="card"><p>No measurements yet.</p></div>'}`);
    }
    const { days } = coachWeek(ctx);
    const w = weekValues(ctx, days, 'weight_kg');
    const pw = weekValues(ctx, prevDays(days), 'weight_kg');
    const avg = avgOf(w);
    const startW = S.firstWeight(ctx.logs);
    const goalDown = ctx.targets.goal_weight_kg && startW ? Number(ctx.targets.goal_weight_kg) < startW : true;
    const goal = goalDown ? 'down' : 'up';
    const logged = `${w.length}/7 days logged`;
    const weights = ctx.logs.filter((l) => l.weight_kg !== null && l.weight_kg !== undefined);
    const rows = weights
      .map((l, i) => ({ l, change: i ? Number(l.weight_kg) - Number(weights[i - 1].weight_kg) : null }))
      .reverse()
      .map(({ l, change }) => `<tr><td>${niceDate(l.day, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td><td>${fmt(l.weight_kg, 1)} kg</td><td>${change === null ? '–' : deltaHTML(change, 1, 'kg', goal)}</td></tr>`);
    shell(
      title,
      sub,
      `${tabs}${statCards([
        { k: 'Average weight', v: avg === null ? '–' : `${fmt(avg, 1)} kg`, delta: avg !== null && pw.length ? deltaHTML(avg - avgOf(pw), 1, 'kg', goal) : '', s: logged },
        { k: 'High weight', v: w.length ? `${fmt(Math.max(...w), 1)} kg` : '–', s: logged },
        { k: 'Low weight', v: w.length ? `${fmt(Math.min(...w), 1)} kg` : '–', s: logged },
        { k: 'Goal weight', v: ctx.targets.goal_weight_kg ? `${fmt(ctx.targets.goal_weight_kg, 1)} kg` : '–', s: startW ? `Started at ${fmt(startW, 1)} kg` : '' },
      ])}${pagedTable(['Date', 'Weight', 'Change (kg)'], rows)}`,
    );
    bindPaged();
  }

  function renderCoachNutrition(ctx, nav, title, sub, view) {
    const id = ctx.profile.id;
    const tabs = sectionTabs(id, 'nutrition', [['daily', 'Daily intake'], ['targets', 'Targets and macros']], view === 'targets' ? 'targets' : 'daily');
    if (view === 'targets') return renderCoachTargets(ctx, tabs, title, sub);
    const { week, days } = coachWeek(ctx);
    const m = S.macrosForWeek(ctx.macros, Math.max(week, 1));
    const cal = weekValues(ctx, days, 'calories');
    const pro = weekValues(ctx, days, 'protein_g');
    const fib = weekValues(ctx, days, 'fibre_g');
    const rows = ctx.logs
      .filter((l) => l.calories !== null || l.protein_g !== null)
      .slice()
      .reverse()
      .map((l) => {
        const mm = S.macrosForWeek(ctx.macros, S.weekOf(ctx.profile.start_date, l.day) || 1) || {};
        return `<tr><td>${niceDate(l.day, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
          <td>${dotCell(S.habitStatus('calories', l.calories, mm.calories), fmt(l.calories))}</td>
          <td>${dotCell(S.habitStatus('protein', l.protein_g, mm.protein_g), `${fmt(l.protein_g)} g`)}</td>
          <td>${fmt(l.carbs_g)} g</td><td>${fmt(l.fats_g)} g</td>
          <td>${dotCell(S.habitStatus('fibre', l.fibre_g, mm.fibre_g || ctx.targets.fibre_target_g), `${fmt(l.fibre_g)} g`)}</td>
          ${ctx.profile.nutrition_tracking === 'Assigned meal plan' ? `<td>${esc(l.meal_plan || '–')}</td>` : ''}</tr>`;
      });
    const food = `${cal.length}/7 days logged`;
    shell(
      title,
      sub,
      `${tabs}${statCards([
        { k: 'Average calories', v: fmt(avgOf(cal)), s: m ? `Target ${fmt(m.calories)} kcal · ${food}` : food },
        { k: 'Average protein', v: avgOf(pro) === null ? '–' : `${fmt(avgOf(pro))} g`, s: m ? `Target ${m.protein_g} g` : '' },
        { k: 'Average fibre', v: avgOf(fib) === null ? '–' : `${fmt(avgOf(fib))} g`, s: `Target ${fmt((m && m.fibre_g) || ctx.targets.fibre_target_g)} g` },
        { k: 'Tracking', v: esc(ctx.profile.nutrition_tracking || '–'), s: m ? `P ${m.protein_g} · C ${m.carbs_g} · F ${m.fats_g}` : 'No macros set' },
      ])}${pagedTable(['Date', 'Calories', 'Protein', 'Carbs', 'Fats', 'Fibre'].concat(ctx.profile.nutrition_tracking === 'Assigned meal plan' ? ['Meal plan'] : []), rows)}`,
    );
    bindPaged();
  }

  function renderCoachActivity(ctx, nav, title, sub) {
    const { week, days } = coachWeek(ctx);
    const t = ctx.targets;
    const steps = weekValues(ctx, days, 'steps');
    const psteps = weekValues(ctx, prevDays(days), 'steps');
    const cardio = weekValues(ctx, days, 'cardio_min');
    const byDay = new Map(ctx.logs.map((l) => [l.day, l]));
    const sessions = days.filter((d) => (byDay.get(d) || {}).trained === 'Yes').length;
    const rows = ctx.logs
      .filter((l) => l.steps !== null || l.cardio_min !== null || l.trained)
      .slice()
      .reverse()
      .map((l) => `<tr><td>${niceDate(l.day, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
        <td>${dotCell(S.habitStatus('steps', l.steps, t.steps_target), fmt(l.steps))}</td><td>${fmt(l.cardio_min)} min</td>
        <td>${dotCell(trainedStatus(l.trained), esc(l.trained || '–'))}</td></tr>`);
    shell(
      title,
      sub,
      `${statCards([
        { k: 'Average steps', v: fmt(avgOf(steps)), delta: avgOf(steps) !== null && psteps.length ? deltaHTML(avgOf(steps) - avgOf(psteps), 0, '', 'up') : '', s: `Target ${fmt(t.steps_target)} · ${steps.length}/7 days logged` },
        { k: 'Training sessions', v: `${sessions}${ctx.profile.training_days_per_week ? ` / ${ctx.profile.training_days_per_week}` : ''}`, s: week ? `Week ${week}` : 'Last 7 days' },
        { k: 'Cardio', v: cardio.length ? `${fmt(cardio.reduce((a, b) => a + b, 0))} min` : '–', s: 'Total this week' },
      ])}${pagedTable(['Date', 'Steps', 'Cardio', 'Trained'], rows)}`,
    );
    bindPaged();
  }

  function renderCoachRecovery(ctx, nav, title, sub) {
    const { days } = coachWeek(ctx);
    const t = ctx.targets;
    const water = S.parseLitres(t.water_target);
    const sleep = weekValues(ctx, days, 'sleep_h');
    const drank = weekValues(ctx, days, 'water_l');
    const latest = ctx.checkins.slice().sort((a, b) => b.week_number - a.week_number)[0] || {};
    const rows = ctx.logs
      .filter((l) => l.sleep_h != null || l.water_l != null)
      .slice()
      .reverse()
      .map((l) => `<tr><td>${niceDate(l.day, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
        <td>${dotCell(S.habitStatus('sleep', l.sleep_h, t.sleep_target_h), `${fmt(l.sleep_h, 1)} hrs`)}</td>
        <td>${dotCell(S.habitStatus('water', l.water_l, water), `${fmt(l.water_l, 1)} L`)}</td></tr>`);
    const weekly = ctx.checkins
      .slice()
      .sort((a, b) => b.week_number - a.week_number)
      .map((c) => `<tr><td>Week ${c.week_number}</td><td>${fmt(c.sleep_hours, 1)} hrs</td><td>${fmt(c.stress)}</td><td>${fmt(c.energy)}</td><td>${fmt(c.hunger)}</td><td>${fmt(c.digestion)}</td></tr>`);
    shell(
      title,
      sub,
      `${statCards([
        { k: 'Average sleep', v: avgOf(sleep) === null ? '–' : `${fmt(avgOf(sleep), 1)} hrs`, s: `Target ${fmt(t.sleep_target_h, 0)}+ hrs · ${sleep.length}/7 days logged` },
        { k: 'Average water', v: avgOf(drank) === null ? '–' : `${fmt(avgOf(drank), 1)} L`, s: `Target ${esc(t.water_target || '–')}` },
        { k: 'Stress / Energy', v: latest.week_number ? `${fmt(latest.stress)} / ${fmt(latest.energy)}` : '–', s: latest.week_number ? `Week ${latest.week_number} check-in (10 = best)` : 'No check-ins yet' },
      ])}
      ${ctx.habitsReady ? '' : '<div class="card muted-box">Daily sleep and water start once the habit tracker update has been run in Supabase (see docs/client-app-setup.md).</div>'}
      <h2 class="crm-sub">Daily</h2>${pagedTable(['Date', 'Sleep', 'Water'], rows)}
      <h2 class="crm-sub">Weekly check-ins</h2>${pagedTable(['Week', 'Sleep', 'Stress', 'Energy', 'Hunger', 'Digestion'], weekly)}`,
    );
    bindPaged();
  }

  function renderCoachHabits(ctx, nav, title, sub, day) {
    const now = S.today();
    if (!day || day > now) day = now;
    const id = ctx.profile.id;
    const rows = habitRows(ctx, day);
    shell(
      title,
      sub,
      `<div class="date-stepper">
        <a href="#client/${id}/habits/${S.addDays(day, -7)}" aria-label="Previous week">‹</a>
        <b>Week of ${niceDate(weekOfDay(ctx, day)[0], { day: 'numeric', month: 'long' })}</b>
        ${day < now ? `<a href="#client/${id}/habits/${S.addDays(day, 7)}" aria-label="Next week">›</a>` : '<span></span>'}
      </div>
      ${statCards([
        { k: 'On target today', v: `${rows.filter((r) => r.status.level === 'good').length} / ${rows.length}`, s: niceDate(day) },
        { k: 'Own habits', v: String(ctx.habits.length), s: 'Added by the client' },
      ])}
      <section class="card">${habitWeekHTML(ctx, day)}</section>`,
    );
  }

  async function renderInbox() {
    const [clients, open] = await Promise.all([
      sb.from('profiles').select('id, full_name, email').eq('role', 'client'),
      sb.from('weekly_checkins').select('user_id, week_number, submitted_at, biggest_win, biggest_struggle').is('coach_feedback', null).order('submitted_at'),
    ]).then((rs) => rs.map(must));
    const name = new Map(clients.map((c) => [c.id, c.full_name || c.email]));
    const rows = open.map(
      (c) => `<tr><td><a href="#client/${c.user_id}/checkins">${esc(name.get(c.user_id) || 'Client')}</a></td><td>Week ${c.week_number}</td>
        <td>${new Date(c.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</td><td class="wrap-text">${esc(c.biggest_struggle || c.biggest_win || '–')}</td></tr>`,
    );
    state.coachView = { section: 'inbox' };
    shell('Check-ins', `${open.length} waiting for your reply`, pagedTable(['Client', 'Week', 'Sent', 'Note'], rows, 15));
    bindPaged();
  }

  // ---------------------------------------------------------------- coach

  async function renderClients() {
    state.coachView = { section: 'clients' };
    const since = S.addDays(S.today(), -21);
    const [clients, logs, checkins] = await Promise.all([
      sb.from('profiles').select('*').eq('role', 'client').order('full_name'),
      sb.from('daily_logs').select('user_id, day, weight_kg, steps, trained, calories, meal_plan').gte('day', since).order('day'),
      sb.from('weekly_checkins').select('user_id, week_number, coach_feedback'),
    ]).then((rs) => rs.map(must));

    const now = S.today();
    const cards = clients.map((c) => {
      const mine = logs.filter((l) => l.user_id === c.id);
      const last = mine.length ? mine[mine.length - 1].day : null;
      const daysSince = last ? S.daysBetween(last, now) : null;
      const week = S.currentWeek(c.start_date);
      const ctx = { profile: c, targets: {}, macros: [], logs: mine };
      const st = week ? S.weekStats(ctx, week) : null;
      const prevSt = week > 1 ? S.weekStats(ctx, week - 1) : null;
      const mineCheckins = checkins.filter((x) => x.user_id === c.id);
      const flags = [];
      if (!c.consent_at) flags.push('Not signed in yet');
      else if (!c.start_date) flags.push('No start date');
      if (week && (daysSince === null || daysSince >= 2)) flags.push(daysSince === null ? 'No logs yet' : `No log for ${daysSince} days`);
      if (week > 1 && !mineCheckins.some((x) => x.week_number === week - 1)) flags.push(`Week ${week - 1} check-in missing`);
      const needsFeedback = mineCheckins.filter((x) => !x.coach_feedback).length;
      if (needsFeedback) flags.push(`${needsFeedback} check-in${needsFeedback > 1 ? 's' : ''} to reply to`);
      return { c, flags, week, st, prevSt, last, daysSince };
    });
    cards.sort((a, b) => b.flags.length - a.flags.length);

    shell(
      'Your clients',
      `${clients.length} client${clients.length === 1 ? '' : 's'}`,
      `
      <div class="client-list">
        ${
          cards
            .map(({ c, flags, week, st, prevSt, last, daysSince }) => {
              const change = st && prevSt && st.avgWeight !== null && prevSt.avgWeight !== null ? st.avgWeight - prevSt.avgWeight : null;
              return `<a class="card client-row" href="#client/${c.id}/overview">
                <div>
                  <div class="name">${esc(c.full_name || c.email)}</div>
                  <div class="meta">${week ? `Week ${week} of 12` : c.start_date ? `Starts ${niceDate(c.start_date)}` : 'No start date'} · Last log: ${
                    last ? (daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`) : 'never'
                  }</div>
                  <div class="meta">${st ? `This week: ${st.logsCount}/7 days · ${fmt(st.avgWeight, 1)} kg${change !== null ? ` (${signed(change, 1)})` : ''} · ${st.sessions} sessions` : ''}</div>
                  <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">${flags.map((f) => `<span class="flag">${esc(f)}</span>`).join('')}</div>
                </div>
                <div class="status" aria-hidden="true">›</div>
              </a>`;
            })
            .join('') || '<div class="card"><p>No clients yet.</p></div>'
        }
      </div>
      <section class="card">
        <p class="kicker">Add a client</p>
        <ol>
          <li>In Supabase, open <b>Authentication → Users → Add user → Create new user</b>.</li>
          <li>Enter their email, tick <b>Auto confirm user</b>, and create them. Leave the password blank or random; they sign in with an email code.</li>
          <li>Send them the app link. They sign in, agree to the privacy notice and fill in their profile.</li>
          <li>Come back here and set their targets and macros.</li>
        </ol>
      </section>`,
    );
  }

  // Old links (#client/<id>/dashboard, /targets, /profile) still land in the right place.
  const OLD_SECTIONS = { dashboard: 'overview', targets: 'nutrition', profile: 'settings' };

  async function renderClient(id, section, arg) {
    if (OLD_SECTIONS[section]) {
      if (section === 'targets') arg = 'targets';
      section = OLD_SECTIONS[section];
    }
    section = section || 'overview';
    const ctx = await loadCtx(id, section === 'overview');
    const p = ctx.profile;
    const week = S.currentWeek(p.start_date);
    const name = p.full_name || p.email;
    state.coachView = { clientId: id, clientName: name, section };
    const label = (COACH_SECTIONS.find(([s]) => s === section) || [, 'Client settings'])[1];
    const title = label;
    const sub = `${name} · ${week ? `Week ${week} of 12` : p.start_date ? `Starts ${niceDate(p.start_date)}` : 'No start date yet'}`;
    const nav = '';

    if (section === 'overview') return shell(title, sub, dashboardHTML(ctx));
    if (section === 'physique') return renderCoachPhysique(ctx, nav, title, sub, arg);
    if (section === 'nutrition') return renderCoachNutrition(ctx, nav, title, sub, arg);
    if (section === 'activity') return renderCoachActivity(ctx, nav, title, sub);
    if (section === 'recovery') return renderCoachRecovery(ctx, nav, title, sub);
    if (section === 'habits') return renderCoachHabits(ctx, nav, title, sub, arg);
    if (section === 'logs') return renderCoachLogs(ctx, nav, title, sub, Number(arg) || Math.max(week, 1));
    if (section === 'checkins') return renderCoachCheckins(ctx, nav, title, sub);
    if (section === 'photos') return renderCoachPhotos(ctx, nav, title, sub, arg);
    if (section === 'training') return renderCoachTraining(ctx, nav, title, sub);
    if (section === 'supps') return renderCoachSupps(ctx, nav, title, sub);
    const rows = [
      ['Email', p.email],
      ['Phone', p.phone],
      ['Start date', p.start_date && niceDate(p.start_date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })],
      ['Age', p.age],
      ['Height', p.height_cm && `${p.height_cm} cm`],
      ['Dream outcome', p.dream_outcome],
      ['Training days a week', p.training_days_per_week],
      ['Experience', p.training_experience],
      ['Nutrition tracking', p.nutrition_tracking],
      ['Injuries / medical', p.injuries],
      ['Work schedule', p.work_schedule],
      ['Wake / sleep', p.wake_sleep],
      ['Privacy consent', p.consent_at ? new Date(p.consent_at).toLocaleString('en-AU') : 'Not yet'],
    ];
    return shell(
      'Client settings',
      sub,
      `<section class="card"><table><tbody>${rows
        .map(([k, v]) => `<tr><th scope="row">${k}</th><td class="wrap-text">${esc(v || '–')}</td></tr>`)
        .join('')}</tbody></table></section>
      <p class="hint">Start date, targets and macros are set under <a href="#client/${id}/nutrition/targets">Nutrition → Targets and macros</a>.</p>`,
    );
  }

  function renderCoachLogs(ctx, nav, title, sub, week) {
    const p = ctx.profile;
    if (!p.start_date) return shell(title, sub, `${nav}<div class="card"><p>Set a start date on the Targets tab first.</p></div>`);
    const byDay = new Map(ctx.logs.map((l) => [l.day, l]));
    const rows = S.weekDates(p.start_date, week)
      .map((d) => {
        const l = byDay.get(d) || {};
        return `<tr><th scope="row">${niceDate(d)}</th><td>${fmt(l.weight_kg, 1)}</td><td>${fmt(l.steps)}</td><td>${fmt(l.cardio_min)}</td><td>${esc(l.trained || '–')}</td><td>${fmt(l.calories)}</td><td>${fmt(l.protein_g)}</td><td>${fmt(l.carbs_g)}</td><td>${fmt(l.fats_g)}</td><td>${fmt(l.fibre_g)}</td>${
          p.nutrition_tracking === 'Assigned meal plan' ? `<td>${esc(l.meal_plan || '–')}</td>` : ''
        }<td class="wrap-text">${esc(l.notes || '')}</td></tr>`;
      })
      .join('');
    shell(
      title,
      sub,
      `${nav}
      <div class="card"><label for="week-pick">Week</label><select id="week-pick">${weekOptions(12, week)}</select></div>
      <section class="card">
        <p class="kicker">Week ${week} targets</p>${targetsLine(ctx, week)}
      </section>
      <section class="card"><div class="table-wrap"><table>
        <thead><tr><th>Day</th><th>Kg</th><th>Steps</th><th>Cardio</th><th>Trained</th><th>Kcal</th><th>P</th><th>C</th><th>F</th><th>Fibre</th>${
          p.nutrition_tracking === 'Assigned meal plan' ? '<th>Meal plan</th>' : ''
        }<th>How did today go?</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></section>
      <section class="card"><p class="kicker">Week ${week} summary</p>${weekSummaryHTML(ctx, week)}</section>`,
    );
    document.getElementById('week-pick').addEventListener('change', (e) => {
      location.hash = `#client/${p.id}/logs/${e.target.value}`;
    });
  }

  function renderCoachCheckins(ctx, nav, title, sub) {
    const p = ctx.profile;
    const items = ctx.checkins
      .slice()
      .sort((a, b) => b.week_number - a.week_number)
      .map(
        (c) => `<section class="card">
          <p class="kicker">Week ${c.week_number}${c.coach_feedback ? '' : ' · <span class="flag">Needs reply</span>'}</p>
          ${p.start_date ? weekSummaryHTML(ctx, c.week_number) : ''}
          <table style="margin-top:10px"><tbody>
            <tr><th scope="row">Sleep</th><td>${fmt(c.sleep_hours, 1)} hrs</td></tr>
            <tr><th scope="row">Stress / Energy</th><td>${fmt(c.stress)} / ${fmt(c.energy)}</td></tr>
            <tr><th scope="row">Hunger / Digestion</th><td>${fmt(c.hunger)} / ${fmt(c.digestion)}</td></tr>
            <tr><th scope="row">Biggest win</th><td class="wrap-text">${esc(c.biggest_win || '–')}</td></tr>
            <tr><th scope="row">Biggest struggle</th><td class="wrap-text">${esc(c.biggest_struggle || '–')}</td></tr>
          </tbody></table>
          <form class="feedback-form" data-week="${c.week_number}" style="margin-top:12px">
            <label for="fb-${c.week_number}">Your feedback</label>
            <textarea id="fb-${c.week_number}" name="coach_feedback" maxlength="4000">${esc(c.coach_feedback || '')}</textarea>
            <button class="btn btn-small" type="submit" style="margin-top:8px">Save feedback</button>
          </form>
        </section>`,
      )
      .join('');
    shell(title, sub, `${nav}${items || '<div class="card"><p>No check-ins yet.</p></div>'}`);
    root.querySelectorAll('.feedback-form').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        withBusy(form.querySelector('button'), async () => {
          const rows = must(
            await sb
              .from('weekly_checkins')
              .update({ coach_feedback: form.coach_feedback.value.trim() || null })
              .eq('user_id', p.id)
              .eq('week_number', Number(form.dataset.week))
              .select(),
          );
          if (!rows.length) throw new Error('Not saved. Check you are signed in as the coach.');
          invalidate(p.id);
          toast('Feedback saved. They will see it in their check-in.');
        });
      });
    });
  }

  async function renderCoachPhotos(ctx, nav, title, sub, arg) {
    const have = weeksWithPhotos(ctx);
    if (!have.length) return shell(title, sub, `${nav}<div class="card"><p>No photos yet.</p></div>`);
    const [a, b] = (arg || '').split('-').map((x) => (x === '' || x === undefined ? undefined : Number(x)));
    const weekA = have.includes(a) ? a : have[0];
    const weekB = have.includes(b) ? b : have[have.length - 1];
    const opts = (sel) => have.map((w) => `<option value="${w}"${w === sel ? ' selected' : ''}>${weekLabel(w)}</option>`).join('');
    const body = await photoCompareHTML(ctx, weekA, weekB);
    shell(
      title,
      sub,
      `${nav}
      <div class="card grid-2">
        <div><label for="pa">Compare</label><select id="pa">${opts(weekA)}</select></div>
        <div><label for="pb">with</label><select id="pb">${opts(weekB)}</select></div>
      </div>
      ${body}`,
    );
    const go = () => {
      location.hash = `#client/${ctx.profile.id}/photos/${document.getElementById('pa').value}-${document.getElementById('pb').value}`;
    };
    document.getElementById('pa').addEventListener('change', go);
    document.getElementById('pb').addEventListener('change', go);
  }

  // The coach saves one complete eight-day version at a time. A new start
  // date creates a new version; the old plan remains available in Supabase.
  function exerciseEditorHTML(ex) {
    const field = (key, label, extra) => `<label>${label}<input data-ex-field="${key}" value="${esc(ex[key] ?? '')}" ${extra || ''}></label>`;
    return `<div class="exercise-editor" data-exercise>
      <div class="exercise-editor-top">${field('name', 'Exercise', 'maxlength="120" required')}<button type="button" class="btn btn-ghost btn-small" data-remove-ex>Remove</button></div>
      <div class="exercise-editor-grid">
        ${field('sets', 'Sets', 'type="number" min="1" max="20" inputmode="numeric"')}
        ${field('reps_min', 'Reps from', 'type="number" min="1" max="100" inputmode="numeric"')}
        ${field('reps_max', 'Reps to', 'type="number" min="1" max="100" inputmode="numeric"')}
        ${field('rpe_min', 'RPE from', 'type="number" min="1" max="10" step="0.5" inputmode="decimal"')}
        ${field('rpe_max', 'RPE to', 'type="number" min="1" max="10" step="0.5" inputmode="decimal"')}
        ${field('final_set_rpe_target', 'Final set RPE', 'type="number" min="1" max="10" step="0.5" inputmode="decimal"')}
        ${field('rest_seconds_min', 'Rest from (sec)', 'type="number" min="0" max="1200" inputmode="numeric"')}
        ${field('rest_seconds_max', 'Rest to (sec)', 'type="number" min="0" max="1200" inputmode="numeric"')}
      </div>${field('note', 'Exercise note', 'maxlength="500"')}
    </div>`;
  }

  function renderCoachTraining(ctx, nav, title, sub, newPlan) {
    const latestStart = ctx.training.length ? ctx.training[0].program_start_date : null;
    const latest = newPlan || !latestStart ? [] : ctx.training.filter((row) => row.program_start_date === latestStart);
    const defaults = ['Chest-focused push', 'Pull', 'Legs', 'Rest', 'Shoulder-focused push', 'Pull 2', 'Hamstring-focused legs', 'Rest'];
    const sessions = defaults.map((name, i) => latest.find((row) => row.cycle_day === i + 1) || {
      cycle_day: i + 1, session_name: name, is_rest_day: i === 3 || i === 7, exercises: [], session_note: '',
    });
    const start = newPlan || !latestStart ? (ctx.profile.start_date || S.today()) : latestStart;
    const programName = latest[0]?.program_name || 'Classic Physique — 3 On / 1 Off';
    shell(title, sub, `${nav}
      <section class="card coach-editor-intro"><p class="kicker">Coach controls · Training</p>
        <h2>${newPlan ? 'Create a new training plan' : latest.length ? 'Edit training plan' : 'Assign a training plan'}</h2>
        <p>Save all eight days together. Your client sees the updated program when they open Training.</p>
        ${latest.length && !newPlan ? '<button class="btn btn-ghost btn-small" type="button" id="new-training-plan">Create a new program version</button>' : ''}
        ${newPlan ? '<button class="btn btn-ghost btn-small" type="button" id="cancel-training-plan">Back to current program</button>' : ''}
      </section>
      <form id="training-editor" class="card" novalidate>
        <div class="grid-2"><label>Program name<input name="program_name" value="${esc(programName)}" maxlength="160" required></label>
        <label>Start date<input name="program_start_date" type="date" value="${esc(start)}"${latest.length && !newPlan ? ' readonly' : ''} required></label></div>
        <p class="hint">To schedule a different start date, create a new program version.</p>
        <div class="training-edit-days">${sessions.map((row) => `<details class="training-edit-day" data-training-day="${row.cycle_day}"${row.cycle_day === 1 ? ' open' : ''}>
          <summary><b>Day ${row.cycle_day}</b> · ${esc(row.session_name)} <span>${row.is_rest_day ? 'Rest' : `${row.exercises.length} exercises`}</span></summary>
          <div class="training-edit-body">
            <label>Session name<input data-session-name value="${esc(row.session_name)}" maxlength="120" required></label>
            <label class="training-rest-toggle"><input type="checkbox" data-rest-day${row.is_rest_day ? ' checked' : ''}> Rest day</label>
            <div data-exercise-controls${row.is_rest_day ? ' hidden' : ''}>
              <div data-exercise-list>${(Array.isArray(row.exercises) ? row.exercises : []).map(exerciseEditorHTML).join('')}</div>
              <button class="btn btn-ghost btn-small" type="button" data-add-ex>Add exercise</button>
            </div>
            <label>Session note<textarea data-session-note maxlength="2000">${esc(row.session_note || '')}</textarea></label>
          </div>
        </details>`).join('')}</div>
        <button class="btn" type="submit">Save training plan</button>
      </form>
      ${latest.length && !newPlan ? `<section class="coach-preview"><p class="kicker">Client preview</p>${trainingHTML(ctx)}</section>` : ''}`);

    if (root.querySelector('#new-training-plan')) root.querySelector('#new-training-plan').addEventListener('click', () => renderCoachTraining(ctx, nav, title, sub, true));
    if (root.querySelector('#cancel-training-plan')) root.querySelector('#cancel-training-plan').addEventListener('click', () => renderCoachTraining(ctx, nav, title, sub, false));
    const form = root.querySelector('#training-editor');
    form.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add-ex]');
      if (add) add.closest('[data-training-day]').querySelector('[data-exercise-list]').insertAdjacentHTML('beforeend', exerciseEditorHTML({}));
      const remove = e.target.closest('[data-remove-ex]');
      if (remove) remove.closest('[data-exercise]').remove();
    });
    form.addEventListener('change', (e) => {
      if (e.target.matches('[data-rest-day]')) e.target.closest('[data-training-day]').querySelector('[data-exercise-controls]').hidden = e.target.checked;
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(form.querySelector('[type="submit"]'), async () => {
        const name = form.elements.program_name.value.trim();
        const programStart = form.elements.program_start_date.value;
        if (!name || !programStart) throw new Error('Add a program name and start date.');
        const rows = [...form.querySelectorAll('[data-training-day]')].map((day) => {
          const cycleDay = Number(day.dataset.trainingDay);
          const sessionName = day.querySelector('[data-session-name]').value.trim();
          const rest = day.querySelector('[data-rest-day]').checked;
          if (!sessionName) throw new Error(`Add a name for day ${cycleDay}.`);
          const exercises = rest ? [] : [...day.querySelectorAll('[data-exercise]')].map((item) => {
            const value = (key) => item.querySelector(`[data-ex-field="${key}"]`).value.trim();
            const number = (key, low, high, required) => {
              const raw = value(key);
              if (!raw) { if (required) throw new Error(`Day ${cycleDay}: add ${key.replaceAll('_', ' ')}.`); return null; }
              const n = Number(raw);
              if (!Number.isFinite(n) || n < low || n > high) throw new Error(`Day ${cycleDay}: check ${key.replaceAll('_', ' ')}.`);
              return n;
            };
            const ex = {
              name: value('name'), sets: number('sets', 1, 20, true),
              reps_min: number('reps_min', 1, 100, true), reps_max: number('reps_max', 1, 100, true),
            };
            if (!ex.name) throw new Error(`Day ${cycleDay}: add an exercise name.`);
            if (ex.reps_min > ex.reps_max) throw new Error(`Day ${cycleDay}: rep range is reversed.`);
            for (const key of ['rpe_min', 'rpe_max', 'final_set_rpe_target']) {
              const n = number(key, 1, 10, false); if (n !== null) ex[key] = n;
            }
            for (const key of ['rest_seconds_min', 'rest_seconds_max']) {
              const n = number(key, 0, 1200, false); if (n !== null) ex[key] = n;
            }
            if (ex.rpe_min != null && ex.rpe_max != null && ex.rpe_min > ex.rpe_max) throw new Error(`Day ${cycleDay}: RPE range is reversed.`);
            if (ex.rest_seconds_min != null && ex.rest_seconds_max != null && ex.rest_seconds_min > ex.rest_seconds_max) throw new Error(`Day ${cycleDay}: rest range is reversed.`);
            if (value('note')) ex.note = value('note');
            return ex;
          });
          if (!rest && !exercises.length) throw new Error(`Day ${cycleDay}: add an exercise or mark it as rest.`);
          return { client_id: ctx.profile.id, program_start_date: programStart, cycle_day: cycleDay,
            program_name: name, session_name: sessionName, is_rest_day: rest, exercises,
            session_note: day.querySelector('[data-session-note]').value.trim() || null };
        });
        const saved = must(await sb.from('training_plan').upsert(rows, { onConflict: 'client_id,program_start_date,cycle_day' }).select('cycle_day'));
        if (saved.length !== 8) throw new Error('The full program was not saved. Please retry.');
        invalidate(ctx.profile.id);
        toast('Training plan saved for this client.');
        renderClient(ctx.profile.id, 'training');
      });
    });
  }

  function renderCoachSupps(ctx, nav, title, sub) {
    const fields = (item) => `<div class="grid-2"><label>Supplement<input name="name" value="${esc(item.name || '')}" maxlength="120" required></label>
      <label>Dose<input name="dose" value="${esc(item.dose || '')}" maxlength="120" required></label>
      <label>When<input name="timing" value="${esc(item.timing || '')}" maxlength="200" required></label>
      <label>Coach note<input name="coach_note" value="${esc(item.coach_note || '')}" maxlength="1000"></label></div>`;
    shell(title, sub, `${nav}<section class="card coach-editor-intro"><p class="kicker">Coach controls · Supps</p>
      <h2>Assigned supplements</h2><p>Only items you assign here appear in this client's personal plan. The general guide stays available to every client.</p></section>
      ${ctx.supplements.map((item) => `<form class="card assigned-supp-form" data-supp-id="${esc(item.id)}" novalidate>
        ${fields(item)}<div class="row-actions"><button class="btn btn-small" type="submit">Save changes</button>
        <button class="btn btn-ghost btn-small" type="button" data-remove-supp>Unassign</button></div></form>`).join('') || '<div class="card"><p>No supplements assigned to this client yet.</p></div>'}
      <form id="add-supp-form" class="card" novalidate><p class="kicker">Assign a supplement</p>
        <label>Choose from the guide<select id="supp-preset"><option value="">Custom supplement</option>${SUPPLEMENTS.map((item, i) => `<option value="${i}">${esc(item.name)}</option>`).join('')}</select></label>
        ${fields({})}<button class="btn" type="submit">Assign to ${esc(ctx.profile.full_name || 'client')}</button>
      </form><section class="coach-preview"><p class="kicker">Client preview</p>${suppsHTML(ctx)}</section>`);
    const addForm = root.querySelector('#add-supp-form');
    root.querySelector('#supp-preset').addEventListener('change', (e) => {
      const preset = SUPPLEMENTS[Number(e.target.value)];
      if (!e.target.value || !preset) return;
      addForm.elements.name.value = preset.name;
      addForm.elements.dose.value = preset.dose;
      addForm.elements.timing.value = preset.when;
    });
    const payload = (form) => {
      const data = {
        name: form.elements.name.value.trim(), dose: form.elements.dose.value.trim(),
        timing: form.elements.timing.value.trim(), coach_note: form.elements.coach_note.value.trim() || null,
      };
      if (!data.name || !data.dose || !data.timing) throw new Error('Add a supplement, dose and timing.');
      return data;
    };
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(addForm.querySelector('[type="submit"]'), async () => {
        const data = payload(addForm);
        must(await sb.from('supplement_plan').insert({ ...data, client_id: ctx.profile.id, sort_order: ctx.supplements.length }).select('id').single());
        invalidate(ctx.profile.id);
        toast('Supplement assigned to this client.');
        renderClient(ctx.profile.id, 'supps');
      });
    });
    root.querySelectorAll('.assigned-supp-form').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        withBusy(form.querySelector('[type="submit"]'), async () => {
          const saved = must(await sb.from('supplement_plan').update(payload(form)).eq('id', form.dataset.suppId).eq('client_id', ctx.profile.id).select('id'));
          if (!saved.length) throw new Error('Supplement was not saved.');
          invalidate(ctx.profile.id);
          toast('Supplement updated.');
          renderClient(ctx.profile.id, 'supps');
        });
      });
      form.querySelector('[data-remove-supp]').addEventListener('click', (e) => {
        if (!window.confirm('Unassign this supplement from the client?')) return;
        withBusy(e.target, async () => {
          const removed = must(await sb.from('supplement_plan').delete().eq('id', form.dataset.suppId).eq('client_id', ctx.profile.id).select('id'));
          if (!removed.length) throw new Error('Supplement was not removed.');
          invalidate(ctx.profile.id);
          toast('Supplement unassigned.');
          renderClient(ctx.profile.id, 'supps');
        });
      });
    });
  }

  function renderCoachTargets(ctx, nav, title, sub) {
    const p = ctx.profile;
    const t = ctx.targets;
    const text = (k, l, v, type, extra) =>
      `<div class="field"><label for="t-${k}">${l}</label><input id="t-${k}" name="${k}" type="${type || 'text'}"${
        type === 'number' ? ' inputmode="decimal" step="any"' : ''
      } value="${esc(v === null || v === undefined ? '' : v)}"${extra || ''}></div>`;
    const macroRows = ctx.macros
      .map(
        (m) =>
          `<tr><th scope="row">Week ${m.week_number}</th><td>${m.protein_g}</td><td>${m.carbs_g}</td><td>${m.fats_g}</td><td>${m.fibre_g}</td><td><b>${fmt(m.calories)}</b></td><td><button class="btn btn-ghost btn-small" type="button" data-del-macro="${m.week_number}">Remove</button></td></tr>`,
      )
      .join('');
    const week = Math.max(S.currentWeek(p.start_date), 1);
    const current = S.macrosForWeek(ctx.macros, week) || {};

    shell(
      title,
      sub,
      `${nav}
      <form id="plan-form" class="card" novalidate>
        <p class="kicker">Program setup</p>
        <div class="grid-2">
          ${text('start_date', 'Start date (a Monday)', p.start_date, 'date')}
          <div class="field"><label for="t-training_days_per_week">Training days a week</label>
            <select id="t-training_days_per_week" name="training_days_per_week" data-number><option value="">–</option>${[2, 3, 4, 5, 6]
              .map((n) => `<option${Number(p.training_days_per_week) === n ? ' selected' : ''}>${n}</option>`)
              .join('')}</select></div>
        </div>
        <div class="field"><label for="t-nutrition_tracking">Nutrition tracking</label>
          <select id="t-nutrition_tracking" name="nutrition_tracking"><option value="">–</option>${['Macro-based / Flexible', 'Assigned meal plan']
            .map((n) => `<option${p.nutrition_tracking === n ? ' selected' : ''}>${n}</option>`)
            .join('')}</select></div>
        <button class="btn btn-small" type="submit">Save setup</button>
      </form>
      <form id="targets-form" class="card" novalidate>
        <p class="kicker">12-week targets</p>
        <div class="grid-2">
          ${text('goal_weight_kg', 'Goal weight (kg)', t.goal_weight_kg, 'number')}
          ${text('goal_waist_cm', 'Goal waist (cm)', t.goal_waist_cm, 'number')}
        </div>
        ${text('strength_goal', 'Strength goal', t.strength_goal, 'text', ' placeholder="e.g. Squat 100 kg x 5"')}
        ${text('non_scale_goal', 'Non-scale goal', t.non_scale_goal, 'text', ' placeholder="e.g. 7 h sleep, energy at work, old jeans fit"')}
        <div class="field"><label for="t-why">Their why (in their words)</label><textarea id="t-why" name="why">${esc(t.why || '')}</textarea></div>
        ${text('event_date', 'Event / deadline date', t.event_date, 'date')}
        <p class="kicker" style="margin-top:12px">Weekly average targets</p>
        <div class="grid-2">
          ${text('steps_target', 'Daily steps', t.steps_target, 'number')}
          ${text('sleep_target_h', 'Sleep (hours)', t.sleep_target_h, 'number')}
          ${text('water_target', 'Water', t.water_target)}
          ${text('fibre_target_g', 'Fibre (g)', t.fibre_target_g, 'number')}
          ${text('whole_foods_pct', 'Whole foods (%)', t.whole_foods_pct, 'number')}
        </div>
        <div class="field"><label for="t-coach_note">Coach note: biggest lever for next week</label><textarea id="t-coach_note" name="coach_note">${esc(t.coach_note || '')}</textarea>
          <p class="hint">Shows at the top of their dashboard.</p></div>
        <button class="btn btn-small" type="submit">Save targets</button>
      </form>
      <section class="card">
        <p class="kicker">Macro targets by week</p>
        <p class="hint" style="margin-top:0">Set Monday's targets. Later weeks keep the latest numbers until you change them. Calories = protein×4 + carbs×4 + fats×9 + fibre×2.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>From</th><th>Protein</th><th>Carbs</th><th>Fats</th><th>Fibre</th><th>Kcal</th><th></th></tr></thead>
          <tbody>${macroRows || '<tr><td colspan="7">None set yet.</td></tr>'}</tbody>
        </table></div>
        <form id="macro-form" style="margin-top:12px" novalidate>
          <div class="field"><label for="mw">Starting week</label><select id="mw" name="week_number" data-number>${weekOptions(12, week)}</select></div>
          <div class="grid-2">
            ${text('protein_g', 'Protein (g)', current.protein_g, 'number', ' required')}
            ${text('carbs_g', 'Carbs (g)', current.carbs_g, 'number', ' required')}
            ${text('fats_g', 'Fats (g)', current.fats_g, 'number', ' required')}
            ${text('fibre_g', 'Fibre (g)', current.fibre_g || 30, 'number')}
          </div>
          <p class="hint" id="kcal-preview"></p>
          <button class="btn btn-small" type="submit">Save macros</button>
        </form>
      </section>`,
    );

    const planForm = document.getElementById('plan-form');
    planForm.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(planForm.querySelector('button'), async () => {
        must(await sb.from('profiles').update(readForm(planForm)).eq('id', p.id));
        invalidate(p.id);
        toast('Setup saved.');
        renderClient(p.id, 'targets');
      });
    });
    const tForm = document.getElementById('targets-form');
    tForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readForm(tForm);
      for (const k of ['steps_target', 'water_target', 'fibre_target_g', 'sleep_target_h', 'whole_foods_pct']) if (data[k] === null) delete data[k];
      withBusy(tForm.querySelector('button'), async () => {
        const rows = must(await sb.from('targets').update(data).eq('client_id', p.id).select());
        if (!rows.length) throw new Error('Not saved. Check you are signed in as the coach.');
        invalidate(p.id);
        toast('Targets saved.');
      });
    });
    const mForm = document.getElementById('macro-form');
    const preview = () => {
      const d = readForm(mForm);
      const kcal = (d.protein_g || 0) * 4 + (d.carbs_g || 0) * 4 + (d.fats_g || 0) * 9 + (d.fibre_g || 0) * 2;
      document.getElementById('kcal-preview').textContent = `= ${fmt(kcal)} kcal a day`;
    };
    mForm.addEventListener('input', preview);
    preview();
    mForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = readForm(mForm);
      if (d.protein_g === null || d.carbs_g === null || d.fats_g === null) return toast('Add protein, carbs and fats.', true);
      withBusy(mForm.querySelector('button'), async () => {
        must(await sb.from('macro_targets').upsert({ ...d, fibre_g: d.fibre_g || 0, client_id: p.id }, { onConflict: 'client_id,week_number' }));
        invalidate(p.id);
        toast(`Macros saved from week ${d.week_number}.`);
        renderClient(p.id, 'targets');
      });
    });
    root.querySelectorAll('[data-del-macro]').forEach((btn) => {
      btn.addEventListener('click', () =>
        withBusy(btn, async () => {
          must(await sb.from('macro_targets').delete().eq('client_id', p.id).eq('week_number', Number(btn.dataset.delMacro)));
          invalidate(p.id);
          renderClient(p.id, 'targets');
        }),
      );
    });
  }

  // ---------------------------------------------------------------- router

  async function route() {
    const id = ++state.renderId;
    if (!sb) return renderSetupNeeded();
    if (!state.session) return renderLogin();
    try {
      if (!state.me) await loadMe();
      if (id !== state.renderId) return;
      const [path] = location.hash.replace(/^#/, '').split('?');
      const parts = path.split('/');

      if (state.me.role === 'coach') {
        if (parts[0] === 'client' && parts[1]) return await renderClient(parts[1], parts[2], parts[3]);
        if (parts[0] === 'inbox') return await renderInbox();
        return await renderClients();
      }

      if (!state.me.consent_at) return renderConsent();
      if (!state.me.full_name || !state.me.start_date) return renderOnboarding();
      switch (parts[0]) {
        case 'log':
          return await renderLog(parts[1]);
        case 'habits':
          return await renderHabits(parts[1], parts[2]);
        case 'hub':
          return await renderHub();
        case 'training':
          return await renderTraining();
        case 'supps':
          return await renderSupps();
        case 'checkin':
          return await renderCheckin(parts[1]);
        case 'photos':
          return await renderPhotos(parts[1]);
        case 'progress':
          return await renderProgress();
        case 'profile':
          return await renderProfile();
        default:
          // #today/<day> was the old home; keep it working.
          return await renderHome(parts[1]);
      }
    } catch (err) {
      console.error(err);
      bare(`<div class="card"><h1>Something went wrong</h1><p>${esc(friendlyError(err))}</p>
        <div class="row-actions"><button class="btn" type="button" data-retry>Try again</button><button class="btn btn-ghost" type="button" data-signout>Sign out</button></div></div>`);
      root.querySelector('[data-retry]').addEventListener('click', () => {
        state.ctx = {};
        state.me = null;
        route();
      });
      root.querySelector('[data-signout]').addEventListener('click', signOut);
    }
  }

  window.addEventListener('hashchange', route);

  // Keep read-only client plans current while the app is open. Coach forms are
  // never refreshed here, so unsaved edits cannot be lost.
  function refreshOpenClientPlan() {
    if (!document.hidden && state.me && state.me.role === 'client' && /^#(training|supps)(\/|$)/.test(location.hash)) route();
  }
  document.addEventListener('visibilitychange', refreshOpenClientPlan);
  setInterval(refreshOpenClientPlan, 60000);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // A sign-in link from the email lands here with the session in the hash
  // (#access_token=...&refresh_token=...). Supabase's own URL detection is off
  // because it would clash with the hash routes, so pick it up by hand.
  const linkParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const linkError = linkParams.get('error_description');
  const linkSession =
    linkParams.get('access_token') && linkParams.get('refresh_token')
      ? { access_token: linkParams.get('access_token'), refresh_token: linkParams.get('refresh_token') }
      : null;
  if (linkSession || linkError) history.replaceState(null, '', location.pathname);

  if (sb) {
    sb.auth.onAuthStateChange((event, session) => {
      const changedUser = (session && session.user.id) !== (state.session && state.session.user.id);
      state.session = session;
      if (changedUser) {
        state.me = null;
        state.ctx = {};
      }
      // SIGNED_IN also fires when a tab regains focus; only re-render when the
      // person actually changed, so a half-filled form isn't wiped.
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT' || changedUser) {
        // Run outside the auth callback, as Supabase recommends.
        setTimeout(route, 0);
      }
    });
    if (linkSession) {
      sb.auth.setSession(linkSession).then(({ error }) => {
        if (error) toast('That sign-in link has expired. Ask for a new code.', true);
      });
    } else if (linkError) {
      setTimeout(() => toast('That sign-in link has expired. Ask for a new code.', true), 300);
    }
  } else {
    route();
  }
})();
