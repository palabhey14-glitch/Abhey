// Rewired Coaching client app.
// One page, hash routes (#today, #checkin/3, #client/<id>/photos ...), plain
// JavaScript with no build step so it can be hosted as static files on Netlify.
(function () {
  'use strict';

  const S = window.RewiredStats;
  const NUI = window.RewiredNutritionUI;
  const X = window.RewiredExercises;
  const EUI = window.RewiredExerciseLibraryUI;
  const CUI = window.RewiredCalendarUI;
  const W = window.RewiredWellness;
  const WUI = window.RewiredWellnessUI;
  const T = window.RewiredTraining;
  const TUI = window.RewiredTrainingUI;
  const CI = window.RewiredCoachIcons;
  const PUI = window.RewiredPhasesUI;
  const PR = window.RewiredProspects;
  const PRUI = window.RewiredProspectsUI;
  const FUI = window.RewiredFormsUI;
  const MSG = window.RewiredMessages;
  const FILES = window.RewiredFilesUI;
  const cfg = window.REWIRED_CONFIG || {};
  const root = document.getElementById('root');
  const configured =
    Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey) && !/YOUR-/.test(cfg.supabaseUrl + cfg.supabaseAnonKey);
  const sb = configured
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;
  // ?preview=<client id>: the coach's "Client view". The app opens as that
  // client, read-only, inside the coach dashboard. Every write is refused here
  // (and row level security still applies to anything that gets through).
  const PREVIEW = new URLSearchParams(location.search).get('preview');
  const PREVIEW_MSG = 'Client view is a preview. Nothing is saved.';
  if (PREVIEW && sb) {
    const refused = () => {
      const r = Promise.resolve({ data: null, error: { message: PREVIEW_MSG } });
      const chain = new Proxy(function () {}, {
        get: (_, k) => (k === 'then' || k === 'catch' || k === 'finally' ? r[k].bind(r) : () => chain),
      });
      return chain;
    };
    // Writes are refused once loadMe has confirmed the coach opened the preview.
    const on = () => state.preview;
    const from = sb.from.bind(sb);
    sb.from = (table) => {
      const q = from(table);
      return on() ? Object.assign(q, { insert: refused, upsert: refused, update: refused, delete: refused }) : q;
    };
    const bucket = sb.storage.from.bind(sb.storage);
    sb.storage.from = (name) => {
      const b = bucket(name);
      return on() ? Object.assign(b, { upload: refused, remove: refused, update: refused, move: refused }) : b;
    };
    const rpc = sb.rpc.bind(sb);
    sb.rpc = (fn, args) => (on() && fn !== 'food_search' ? refused() : rpc(fn, args));
    const realFetch = window.fetch.bind(window);
    window.fetch = (url, opts) => {
      const same = new URL(String(url && url.url ? url.url : url), location.href).origin === location.origin;
      if (on() && same && opts && opts.method && opts.method.toUpperCase() !== 'GET') return Promise.reject(new Error(PREVIEW_MSG));
      return realFetch(url, opts);
    };
  }
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

  const state = { session: null, me: null, ctx: {}, renderId: 0, workoutSession: null, workoutSaveQueue: Promise.resolve() };

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
    prospects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 21c0-5 3-7 7-7s7 2 7 7M19 7v6m-3-3h6"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/></svg>',
    messages:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
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
    meals:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M8 7c0-1.6 1-1.6 1-3.2M12 7c0-1.6 1-1.6 1-3.2M16 7c0-1.6 1-1.6 1-3.2"/></svg>',
    log:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    sun:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    forms:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    recipes:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M10 8h5"/></svg>',
    foods:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 8c-3-3-8-1-8 4 0 5 4 9 6 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 6-4 6-9 0-5-5-7-8-4z"/><path d="M12 8c0-2 1-4 3-5"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
  };

  // ------------------------------------------------------------------ data

  async function loadMe() {
    const uid = state.session.user.id;
    state.me = must(await sb.from('profiles').select('*').eq('id', uid).single());
    // Client view: only the coach can open it, and it shows that client's app.
    if (PREVIEW && state.me.role === 'coach' && PREVIEW !== uid) {
      state.me = { ...must(await sb.from('profiles').select('*').eq('id', PREVIEW).single()), role: 'client' };
      state.preview = true;
      document.body.classList.add('is-preview');
    }
    if (state.me.role === 'client' && !state.preview) {
      const session = await sb.from('client_workout_sessions').select('*').eq('user_id', state.me.id).maybeSingle();
      setActiveWorkout(session.error ? null : session.data);
      state.workoutSessionReady = !session.error;
    }
  }

  // Everything about one client: the workbook, as rows.
  // Cached for a minute, so changes the coach makes (habits, targets, plans)
  // reach an open client app without a reload.
  async function loadCtx(id, force) {
    if (!force && state.ctx[id] && Date.now() - state.ctx[id].loadedAt < 60000) return state.ctx[id];
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
    // Same for migrations/2026-10-25-nutrition.sql (plans and food logs).
    const nutrition = await NUI.load(id);
    // Same for migrations/2026-10-26-workout-logs.sql (sets and reps).
    const workouts = await sb.from('workout_logs').select('*').eq('user_id', id).order('day', { ascending: false }).limit(60);
    const phases = await sb.from('client_phases').select('*').eq('client_id', id).order('start_date');
    const [homePrefs, supplementIntake] = await Promise.all([
      sb.from('client_home_preferences').select('*').eq('user_id', id).maybeSingle(),
      sb.from('client_supplement_intake').select('*').eq('user_id', id).order('day', { ascending: false }).limit(100),
    ]);
    const ctx = {
      profile, targets: targets || {}, macros, training, supplements, logs, checkins, measurements, photos,
      habits: habitsReady ? habits.data : [], habitEntries: habitsReady ? habitEntries.data : [], habitsReady,
      workouts: workouts.error ? [] : workouts.data, workoutsReady: !workouts.error,
      phases: phases.error ? [] : phases.data, phasesReady: !phases.error,
      homePrefs: homePrefs.error ? { metric_keys: [], habit_keys: [] } : (homePrefs.data || { metric_keys: [], habit_keys: [] }),
      homePrefsReady: !homePrefs.error,
      supplementIntake: supplementIntake.error ? [] : supplementIntake.data,
      supplementIntakeReady: !supplementIntake.error,
      ...nutrition,
      loadedAt: Date.now(),
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
    ['meals', 'Nutrition'],
    ['training', 'Training'],
    ['habits', 'Habits'],
    ['messages', 'Messages'],
  ];
  // Screens without their own tab (reached from Home) keep Home lit.
  const TAB_OF = {
    checkin: 'home', photos: 'home', supps: 'meals', profile: 'home', log: 'home', today: 'home', progress: 'home', hub: 'home', calendar: 'home',
    recipes: 'meals', recipe: 'meals', 'recipe-import': 'meals', forms: 'home', form: 'home',
  };

  const COACH_SECTIONS = [
    ['overview', 'Overview'],
    ['phases', 'Phases'],
    ['calendar', 'Calendar'],
    ['physique', 'Physique'],
    ['nutrition', 'Nutrition'],
    ['goals', 'Goals'],
    ['foodlog', 'Food log'],
    ['activity', 'Activity'],
    ['sleep', 'Sleep'],
    ['recovery', 'Recovery'],
    ['habits', 'Habits'],
    ['health-markers', 'Health Markers'],
    ['training', 'Training'],
    ['supps', 'Supplements'],
    ['checkins', 'Check-ins'],
  ];

  function workoutElapsed() {
    if (!state.workoutSession) return '00:00';
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(state.workoutSession.started_at)) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function updateWorkoutTimer() {
    document.querySelectorAll('[data-workout-timer], [data-elapsed]').forEach((el) => (el.textContent = workoutElapsed()));
  }

  function setActiveWorkout(session) {
    state.workoutSession = session;
    document.body.classList.toggle('has-active-workout', Boolean(session));
    if (state.workoutClock) clearInterval(state.workoutClock);
    state.workoutClock = session ? setInterval(updateWorkoutTimer, 1000) : null;
    updateWorkoutTimer();
  }

  // opts.center replaces the title with other markup (Home puts its day picker there).
  function shell(title, sub, body, tab, opts) {
    const isCoach = state.me && state.me.role === 'coach';
    if (isCoach) return coachShell(title, sub, body);
    const active = TAB_OF[tab] || tab;
    document.body.dataset.tab = tab === 'home' ? 'home' : 'page';
    document.body.dataset.clientScreen = tab || '';
    const initial = ((state.me && state.me.full_name) || '?').trim()[0].toUpperCase();
    const center = opts && opts.center ? opts.center : `<div class="title">${esc(title)}${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
    root.innerHTML = `
      <header class="topbar">
        <a class="icon-btn brand" href="#home" aria-label="Home"><img src="icons/icon-192.png" alt=""></a>
        ${center}
        <a class="icon-btn avatar" href="#profile" aria-label="Profile">${esc(initial)}</a>
      </header>
      <main class="screen">${body}</main>
      ${state.workoutSession ? `<aside class="workout-mini" aria-label="Workout in progress"><span class="workout-mini-dot" aria-hidden="true"></span><span><b>Workout in progress</b><small>${esc(state.workoutSession.session_name || 'Training session')}</small></span><strong data-workout-timer>${workoutElapsed()}</strong><a href="#training/log/${esc(state.workoutSession.day)}/${Number(state.workoutSession.cycle_day)}">Resume ›</a></aside>` : ''}
      <nav class="tabs" aria-label="Main">${CLIENT_TABS.map(
        ([id, label]) => `<a href="#${id}"${active === id ? ' aria-current="page"' : ''}>${ICONS[id]}<span>${label}</span>${id === 'messages' ? '<b class="nav-badge" data-msg-badge hidden></b>' : ''}</a>`,
      ).join('')}</nav>`;
    if (!state.preview) MSG.badge();
    updateWorkoutTimer();
    window.scrollTo(0, 0);
  }

  // Coach CRM: app rail, the client's section menu, then the main pane.
  function coachShell(title, sub, body) {
    const v = state.coachView || {};
    document.body.classList.add('crm-body');
    const hash = location.hash || '#clients';
    const lib = v.section === 'library' ? (hash.match(/^#library\/(recipes?|recipe-import|foods)/) ? (/foods/.test(hash) ? 'foods' : 'recipes') : 'templates') : '';
    const item = (href, on, icon, label) => `<a href="${href}"${on ? ' aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
    const me = state.me || {};
    const name = (me.full_name || 'Coach').trim();
    const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const rail = `<aside class="crm-rail">
        <a class="crm-brand" href="#clients"><img src="icons/icon-192.png" alt=""><span>Rewired<small>Coach</small></span></a>
        <p class="crm-group">Workspace</p>
        ${item('#clients', !['prospects', 'inbox', 'library', 'exercise-library', 'forms', 'messages', 'files'].includes(v.section), ICONS.profile, 'Clients')}
        ${item('#prospects', v.section === 'prospects', ICONS.prospects, 'Prospects')}
        ${item('#inbox', v.section === 'inbox', ICONS.checkin, 'Check-ins')}
        ${item('#messages', v.section === 'messages', ICONS.messages, 'Messages<b class="nav-badge" data-msg-badge hidden></b>')}
        ${item('#files', v.section === 'files', ICONS.files, 'Files')}
        <p class="crm-group">Content</p>
        ${item('#library/templates', lib === 'templates', ICONS.meals, 'Meal plans')}
        ${item('#library/recipes', lib === 'recipes', ICONS.recipes, 'Recipes')}
        ${item('#library/foods', lib === 'foods', ICONS.foods, 'Foods')}
        ${item('#exercise-library', v.section === 'exercise-library', ICONS.training, 'Exercise library')}
        ${item('#forms', v.section === 'forms', ICONS.forms, 'Forms')}
        <div class="crm-me"><span class="crm-avatar" aria-hidden="true">${esc(initials)}</span><span class="crm-me-name">${esc(name)}<small>Rewired Coaching</small></span>
          <button type="button" class="crm-signout" data-signout>Sign out</button></div>
      </aside>`;
    const sections = v.clientId
      ? `<nav class="crm-sections" aria-label="Client sections">
          <a class="crm-back" href="#clients">‹ ${esc(v.clientName)}</a>
          ${COACH_SECTIONS.map(([id, label]) => `<a href="#client/${v.clientId}/${id}"${v.section === id ? ' aria-current="page"' : ''}>${CI.icon(id)}<span>${label}</span></a>`).join('')}
          <a class="crm-settings" href="#client/${v.clientId}/settings"${v.section === 'settings' ? ' aria-current="page"' : ''}>⚙ Client settings</a>
        </nav>`
      : '';
    const preview = v.clientId
      ? `<button type="button" class="btn btn-ghost btn-small crm-preview" data-client-view>${ICONS.phone}<span>Client view</span></button>`
      : '';
    root.innerHTML = `<div class="crm${v.clientId ? ' with-sections' : ''}">${rail}${sections}
      <main class="crm-main"><header class="crm-head"><h1>${v.clientId && COACH_SECTIONS.some(([id]) => id === v.section) ? CI.icon(v.section) : ''}${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}${(v.badges || []).map((b) => `<span class="crm-badge">${esc(b)}</span>`).join('')}${v.clientId ? WUI.headerHTML(state.ctx[v.clientId]) : ''}${preview}${v.actions ? `<div class="crm-actions">${v.actions}</div>` : ''}</header>${body}</main></div>`;
    CI.decorate(root);
    if (v.clientId) WUI.bindHeader(state.ctx[v.clientId]);
    root.querySelector('[data-signout]').addEventListener('click', signOut);
    MSG.badge();
    const pv = root.querySelector('[data-client-view]');
    if (pv) pv.addEventListener('click', () => openClientView(v));
    const current = root.querySelector('.crm-sections [aria-current]');
    if (current) current.scrollIntoView({ block: 'nearest', inline: 'center' });
    window.scrollTo(0, 0);
  }

  // The client's own screen for each coach section, for Client view.
  const CLIENT_SCREEN = {
    overview: 'home', physique: 'progress', nutrition: 'meals', goals: 'progress', foodlog: 'meals', activity: 'habits',
    recovery: 'habits', sleep: 'habits', 'health-markers': 'habits', habits: 'habits/today/all', training: 'training', supps: 'supps', checkins: 'checkin', settings: 'profile',
  };

  // Client view: the client's phone app, read-only, beside the coach dashboard.
  function openClientView(v) {
    const old = document.querySelector('.client-view');
    if (old) old.remove();
    let screen = CLIENT_SCREEN[v.section] || 'home';
    if (v.section === 'physique' && v.view === 'photos') screen = 'photos';
    screen = screen.replace('today', S.today());
    const box = document.createElement('div');
    box.className = 'client-view';
    box.innerHTML = `<div class="cv-panel" role="dialog" aria-modal="true" aria-label="Client view">
        <div class="cv-head"><div><b>Client view</b><small>What ${esc(v.clientName)} sees on their phone. Read-only.</small></div>
          <button type="button" class="btn btn-ghost btn-small" data-cv-close aria-label="Close client view">Close</button></div>
        <div class="cv-phone"><iframe title="${esc(v.clientName)}'s app" src="./?preview=${encodeURIComponent(v.clientId)}#${screen}"></iframe></div>
      </div>`;
    document.body.appendChild(box);
    const close = () => {
      box.remove();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
    };
    const onKey = (e) => e.key === 'Escape' && close();
    box.addEventListener('click', (e) => (e.target === box || e.target.closest('[data-cv-close]')) && close());
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    box.querySelector('[data-cv-close]').focus();
  }

  function bare(body) {
    root.innerHTML = `<main class="screen center">${body}</main>`;
  }

  // Sign-in screens sit over an embossed preview of the app: the client app
  // by default, the coach dashboard when the link carries ?coach.
  const COACH_LOGIN = new URLSearchParams(location.search).has('coach');

  function loginScreen(body) {
    root.innerHTML = `<div class="login-art${COACH_LOGIN ? ' coach' : ''}" aria-hidden="true">${COACH_LOGIN ? coachArt() : clientArt()}</div>
      <a class="login-home" href="/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/></svg>Home</a>
      <main class="screen center login">${body}</main>`;
  }

  function clientArt() {
    const rows = (items) => items.map(([a, b]) => `<div class="e-in la-row"><b>${a}</b><span>${b}</span></div>`).join('');
    return `<div class="la-stage">
      <div class="e-up la-phone">
        <div class="la-hero"><small>Thursday · Week 6 of 12</small><b>Good morning</b><strong>86</strong><small>Weekly score</small></div>
        <div class="e-in la-row tall"><b>Upper A · Hotel gym</b><span>45 min</span></div>
        <div class="la-two"><div class="e-up"><small>Protein</small><b>150 g</b></div><div class="e-up"><small>Steps</small><b>11,240</b></div></div>
        <div class="e-in la-chart"><svg viewBox="0 0 200 70" preserveAspectRatio="none"><polyline points="0,20 30,24 60,22 90,34 120,38 150,46 180,52 200,56"/></svg></div>
      </div>
      <div class="e-up la-phone mid">
        <div class="la-head"><small>Meal plan</small><b>Today</b></div>
        ${rows([['Breakfast', '420 kcal'], ['Lunch', '610 kcal'], ['Snack', '180 kcal'], ['Dinner', '640 kcal']])}
        <div class="la-three"><div class="e-up"><small>Protein</small><b>41 g</b></div><div class="e-up"><small>Carbs</small><b>78 g</b></div><div class="e-up"><small>Fat</small><b>24 g</b></div></div>
      </div>
      <div class="e-up la-phone">
        <div class="la-head"><small>Habits</small><b>This week</b></div>
        ${rows([['Protein', '●'], ['Steps', '●'], ['Water', '●'], ['Sleep', '●'], ['Training', '●']])}
        <div class="e-in la-bar"><i></i></div>
      </div>
    </div>`;
  }

  function coachArt() {
    const names = ['Arjun', 'Rohan', 'Imran', 'Vikram', 'Sameer', 'Kabir', 'Dev'];
    return `<div class="la-desk e-up">
      <div class="la-side">
        <div class="la-logo e-up">R.</div>
        ${names.map((n, i) => `<div class="${i === 0 ? 'e-in' : ''} la-name"><i class="e-up"></i>${n}</div>`).join('')}
      </div>
      <div class="la-main">
        <div class="la-head"><small>Coach</small><b>Clients</b></div>
        <div class="la-stats">${[['Check-ins due', '3'], ['Weekly score', '82'], ['Messages', '5'], ['On track', '9']]
          .map(([a, b]) => `<div class="e-up"><small>${a}</small><b>${b}</b></div>`).join('')}</div>
        <div class="e-in la-chart wide"><svg viewBox="0 0 400 90" preserveAspectRatio="none"><polyline points="0,70 50,64 100,66 150,50 200,46 250,38 300,30 350,26 400,18"/></svg></div>
        ${names.slice(0, 5).map((n, i) => `<div class="e-in la-row"><b>${n}</b><span>Week ${3 + i}</span><span>${88 - i * 4}</span></div>`).join('')}
      </div>
    </div>`;
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
  function dashboardHTML(ctx, opts) {
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
    loginScreen(`
      <img class="login-logo" src="icons/icon-192.png" alt="Rewired">
      <p class="login-kicker">${COACH_LOGIN ? 'Coach login' : 'Client login'}</p>
      <h1>Rewired Coaching</h1>
      <p>${COACH_LOGIN ? 'Sign in with your coach email.' : `Sign in with the email you gave ${esc(COACH)}.`} We'll email you a code, no password needed.</p>
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
    loginScreen(`
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
    // Signing out inside Client view would sign the coach out too.
    if (state.preview) return toast(PREVIEW_MSG, true);
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
        <p>To coach you, Rewired stores what you log and send here. Some of it is health information, which the law treats as sensitive.</p>
        <ul>
          <li>Your profile, daily logs (weight, steps, food, training, sleep), check-ins, measurements and progress photos.</li>
          <li>Anything you choose to add, such as health markers, blood test results, a health screen, injuries or a doctor's letter.</li>
          <li>Only you and ${esc(COACH)} can see it. Photos are kept in private storage and are never public.</li>
          <li>It's stored with Supabase in Sydney, Australia, and used only to coach you. It's never sold.</li>
          <li>You can ask to see, correct or delete it, or withdraw consent, at any time by messaging ${esc(COACH)}.</li>
          <li>Coaching isn't medical advice. Tell ${esc(COACH)} about any injury or condition, and check with your GP before big changes.</li>
        </ul>
        <p><a href="/privacy.html" target="_blank" rel="noopener">Read the full Privacy Policy</a></p>
        <form id="consent-form">
          <p class="kicker" style="margin-top:8px">Needed to use the app</p>
          <div class="field" style="display:flex;gap:10px;align-items:flex-start">
            <input id="agree" name="agree" type="checkbox" required style="flex:0 0 24px;width:24px;height:24px;min-height:24px;margin-top:2px">
            <label for="agree" style="font-weight:500">I consent to Rewired collecting and using my information, including health information and progress photos, to coach me.</label>
          </div>
          <p class="kicker" style="margin-top:8px">Optional. Your coaching is the same either way</p>
          <div class="field" style="display:flex;gap:10px;align-items:flex-start">
            <input id="opt-marketing" name="marketing" type="checkbox" style="flex:0 0 24px;width:24px;height:24px;min-height:24px;margin-top:2px">
            <label for="opt-marketing" style="font-weight:500">Send me occasional tips and offers by email.</label>
          </div>
          <div class="field" style="display:flex;gap:10px;align-items:flex-start">
            <input id="opt-photos" name="photos" type="checkbox" style="flex:0 0 24px;width:24px;height:24px;min-height:24px;margin-top:2px">
            <label for="opt-photos" style="font-weight:500">I'm happy for ${esc(COACH)} to ask about featuring my progress photos or results. Nothing is published unless I agree to that specific use.</label>
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
      if (!form.agree.checked) return toast('Tick the first box to continue.', true);
      withBusy(form.querySelector('button'), async () => {
        const consent_at = new Date().toISOString();
        must(await sb.from('profiles').update({ consent_at }).eq('id', state.me.id));
        state.me.consent_at = consent_at;
        // Optional choices are saved separately so the app still works before
        // the consent-choices columns exist. Unticked boxes save nothing.
        const optional = {};
        if (form.marketing.checked) optional.marketing_consent_at = consent_at;
        if (form.photos.checked) optional.photo_share_consent_at = consent_at;
        if (Object.keys(optional).length) await sb.from('profiles').update(optional).eq('id', state.me.id);
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

  // The calorie and macro targets for one day: the assigned nutrition plan
  // if there is one, otherwise the weekly macro targets.
  function macrosForDay(ctx, day) {
    return NUI.dayTarget(ctx, day);
  }

  function targetsLine(ctx, day) {
    const m = day ? macrosForDay(ctx, day) : null;
    const t = ctx.targets;
    const bits = [];
    if (m) {
      bits.push(`<span><b>${fmt(m.calories)}</b> kcal</span>`, `<span><b>${m.protein_g}</b>g protein</span>`, `<span><b>${m.carbs_g}</b>g carbs</span>`, `<span><b>${m.fats_g}</b>g fats</span>`);
      if (m.fibre_g) bits.push(`<span><b>${m.fibre_g}</b>g fibre</span>`);
      if (m.dayLabel) bits.push(`<span class="t-kind">${esc(m.dayLabel)}</span>`);
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
    // Days with a food log show its totals; the database keeps them in step.
    const fromLog = NUI.checkinFoodHTML(ctx, day);
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
      <div class="card"><p class="kicker">${week ? "This day's targets" : "This week's targets"}</p>${targetsLine(ctx, week ? day : null)}</div>
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
        ${fromLog || `<p class="hint" style="margin:-4px 0 12px">Log meals in the <a href="#meals/${day}">Meal plan tab</a> and these fill in for you, or type your daily totals here. Logging yesterday's food? Tap ‹ to go back a day.</p>
        <div class="grid-2">
          ${numberField('calories', 'Calories', log.calories, { max: 10000 })}
          ${numberField('protein_g', 'Protein (g)', log.protein_g, { max: 600 })}
          ${numberField('carbs_g', 'Carbs (g)', log.carbs_g, { max: 1000 })}
          ${numberField('fats_g', 'Fats (g)', log.fats_g, { max: 400 })}
          ${numberField('fibre_g', 'Fibre (g)', log.fibre_g, { max: 150 })}
        </div>`}
        ${mealPlan && !NUI.hasMealPlan(ctx, day) ? choiceField('meal_plan', 'Followed the meal plan?', ['Yes', 'Partly', 'No'], log.meal_plan) : ''}
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

  const HABIT_ICON_KEYS = {
    steps: 'steps', training: 'training', protein: 'protein', calories: 'flame',
    fibre: 'fibre', water: 'water', sleep: 'sleep',
    Activity: 'activity', Nutrition: 'food', Hydration: 'water',
    Recovery: 'recovery', Mindset: 'goals', Lifestyle: 'sun',
  };

  function habitIcon(row) {
    return CI.icon(HABIT_ICON_KEYS[row.key] || HABIT_ICON_KEYS[row.cat || row.category] || 'habits');
  }

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

  // The coach's target habits for one day, with the coach's own names,
  // categories and show/hide choices (targets.habit_settings) applied.
  function builtInHabits(ctx, day) {
    const t = ctx.targets;
    const m = macrosForDay(ctx, day);
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
    const settings = t.habit_settings || {};
    for (const r of builtIn) {
      const o = settings[r.key] || {};
      if (o.name) r.name = o.name;
      if (HABIT_CATEGORIES[o.category]) r.cat = o.category;
      r.hidden = Boolean(o.hidden);
    }
    return builtIn;
  }

  // Every row on the habit tracker for one day: the targets the coach set
  // (stored on daily_logs) followed by the client's own habits.
  function habitRows(ctx, day) {
    const log = ctx.logs.find((l) => l.day === day) || {};
    const rows = builtInHabits(ctx, day)
      .filter((r) => !r.hidden && (r.choice || r.target))
      .map((r) => ({
        ...r, value: log[r.field], status: r.choice ? trainedStatus(log.trained) : S.habitStatus(r.key, log[r.field], r.target),
        fromLog: r.cat === 'Nutrition' && Boolean(log.food_from_log),
      }));
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
      return `<tr><th scope="row"><span class="habit-icon sm" aria-hidden="true">${habitIcon(r)}</span>${esc(r.name)}<small>${r.choice ? 'Daily' : `Daily · ${fmt(r.target, r.decimal && r.target % 1 ? 1 : 0)} ${esc(unitLabel(r))}`}</small></th>${cells}<td class="hits">${hits}/7</td></tr>`;
    });
    return `<div class="table-wrap"><table class="habit-week">
      <thead><tr><th>Habit</th>${days.map((d) => `<th>${niceDate(d, { weekday: 'narrow' })}<br>${niceDate(d, { day: 'numeric' })}</th>`).join('')}<th>Hit</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
      <p class="legend"><span class="dot-s good"></span> Target hit <span class="dot-s warn"></span> Within 25% <span class="dot-s bad"></span> More than 25% off</p>`;
  }

  function clientDateControls(section, day, suffix = '') {
    const label = day === S.today() ? `Today · ${niceDate(day, { day: 'numeric', month: 'short' })}` : niceDate(day, { day: 'numeric', month: 'short', year: 'numeric' });
    const calendarIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-12 4h2m3 0h2"/></svg>';
    const route = (date) => `#${section}/${date}${suffix}`;
    return `<div class="client-date-stepper">
      <a href="${route(S.addDays(day, -1))}" aria-label="Previous day">‹</a>
      <div class="client-date-middle"><b>${label}</b><button type="button" data-client-date-toggle aria-label="Choose a ${section} date" aria-expanded="false" aria-controls="${section}-date-panel">${calendarIcon}</button></div>
      <a href="${route(S.addDays(day, 1))}" aria-label="Next day">›</a></div>
      <div class="client-date-panel" id="${section}-date-panel" hidden><label for="${section}-date-input">Jump to any ${section} date</label>
      <form data-client-date-form><input id="${section}-date-input" type="date" value="${day}" required><button type="submit">Show date</button></form>
      <small>Choose a past date or preview a future assignment.</small></div>`;
  }

  function bindClientDateControls(section, suffix = '') {
    const toggle = root.querySelector('[data-client-date-toggle]');
    const panel = root.querySelector(`#${section}-date-panel`);
    toggle?.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) panel.querySelector('input').focus();
    });
    panel?.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = panel.querySelector('input');
      if (!input.reportValidity() || !/^\d{4}-\d{2}-\d{2}$/.test(input.value)) return;
      location.hash = `#${section}/${input.value}${suffix}`;
    });
  }

  async function renderHabits(day, view) {
    const now = S.today();
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) day = now;
    const future = day > now;
    view = view === 'all' ? 'all' : 'day';
    const ctx = await loadCtx(state.me.id);
    const rows = habitRows(ctx, day);
    const done = rows.filter((r) => r.status.level === 'good').length;
    const toggle = `<div class="segmented" role="tablist">
      <a role="tab" href="#habits/${day}" aria-selected="${view === 'day'}">Day view</a>
      <a role="tab" href="#habits/${day}/all" aria-selected="${view === 'all'}">All</a></div>`;
    const stepper = clientDateControls('habits', day, view === 'all' ? '/all' : '');
    const futureNote = future ? '<p class="client-future-note">Upcoming habit targets for this date. Logging opens on the day.</p>' : '';
    const missing = ctx.habitsReady ? '' : `<div class="card muted-box">Water, sleep and your own habits switch on once ${esc(COACH)} finishes the habit tracker update.</div>`;

    let body;
    if (view === 'day') {
      body = `<p class="section-label">${future ? 'Upcoming habits' : day === now ? "Today's habits" : 'Habits for this day'} · ${future ? `${rows.length} targets` : `${done} of ${rows.length} on target`}</p>
      <ul class="habit-list">${rows
        .map(
          (r) => `<li class="habit" data-key="${esc(r.key)}">
            <button type="button" class="habit-row" aria-expanded="false">
              <span class="habit-icon" aria-hidden="true">${habitIcon(r)}</span>
              <span class="habit-text"><b>${esc(r.name)}</b><small>${esc(r.cat)} · ${habitValueText(r)}</small></span>
              ${stateBadge(r.status)}<span class="chev" aria-hidden="true">›</span>
            </button>
            <form class="habit-entry" hidden novalidate>${
              r.fromLog
                ? `<p class="hint">Worked out from the food you logged. <a href="#meals/${day}">Change it in Meal plan</a>.</p>`
                : r.choice
                ? choiceField(`hv-${r.key}`, 'Trained today?', r.choice, r.value)
                : `<label for="hv-${esc(r.key)}">${esc(r.name)} (${esc(r.unit)})</label>
                   <div class="entry-row"><input id="hv-${esc(r.key)}" name="value" type="number" inputmode="${r.decimal ? 'decimal' : 'numeric'}" step="${r.decimal ? '0.1' : '1'}" min="0" value="${r.value === null || r.value === undefined ? '' : esc(r.value)}" placeholder="Target ${fmt(r.target, r.decimal && r.target % 1 ? 1 : 0)}"><button class="btn btn-small" type="submit">Save</button></div>`
            }${r.choice ? '<button class="btn btn-small" type="submit">Save</button>' : ''}</form>
          </li>`,
        )
        .join('')}</ul>
      ${future ? '' : '<p class="hint">Tap a habit to log it. Green means you hit the target, amber means you are within 25%, red means more than 25% off.</p>'}`;
    } else {
      body = `<section class="card">${habitWeekHTML(ctx, day)}</section>
      ${ctx.habits.length ? `<section class="card"><p class="kicker">Your own habits</p><ul class="own-habits">${ctx.habits
        .map((h) => `<li><span class="habit-icon sm" aria-hidden="true">${habitIcon(h)}</span><span>${esc(h.name)}<small>${esc(h.category)} · ${fmt(h.target, h.target % 1 ? 1 : 0)} ${esc(h.unit)} a day</small></span><button class="btn btn-ghost btn-small" type="button" data-del-habit="${esc(h.id)}">Remove</button></li>`)
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
    shell('Habit tracker', future ? 'Preview upcoming targets' : `${done} of ${rows.length} on target`, `${toggle}${stepper}${futureNote}${missing}${body}<div data-client-health></div>`, 'habits');
    bindClientDateControls('habits', view === 'all' ? '/all' : '');
    if (future) root.querySelectorAll('.habit-row').forEach((button) => { button.disabled = true; });

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
    if (!future) await WUI.mountHabits(ctx, day);
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

  // The coach picks each client's check-in day (targets.checkin_day,
  // 0 = Sunday). The check-in opens the day before and closes at the end of
  // that day; see checkinWindow in stats.js.
  function checkinDay(ctx) {
    const d = Number(ctx.targets && ctx.targets.checkin_day);
    return Number.isInteger(d) && d >= 0 && d <= 6 ? d : 0;
  }

  // The week's check-in is flagged on Home while its window is open and it
  // has not been sent.
  function checkinDue(ctx) {
    const now = S.today();
    const win = S.openCheckin(ctx.profile.start_date, checkinDay(ctx), now);
    if (!win || ctx.checkins.some((c) => c.week_number === win.week)) return null;
    return { week: win.week, dueToday: win.due === now, due: win.due };
  }

  // The check-in button on Home: live while the window is open, ticked once
  // this window's check-in is sent, otherwise greyed out until it opens.
  function checkinButtonHTML(ctx, due) {
    const now = S.today();
    const short = (iso) => niceDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
    if (due) {
      return `<a class="log-btn checkin-btn due" href="#checkin/${due.week}"><span aria-hidden="true">${ICONS.checkin}</span>${due.dueToday ? 'Check-in due today' : 'Check-in open'}<i class="red-dot" aria-hidden="true"></i></a>`;
    }
    const win = S.openCheckin(ctx.profile.start_date, checkinDay(ctx), now);
    if (win) return `<a class="log-btn done checkin-btn" href="#checkin/${win.week}"><span aria-hidden="true">${STATE_ICONS.good}</span>Check-in sent</a>`;
    const next = ctx.profile.start_date ? S.nextCheckin(ctx.profile.start_date, checkinDay(ctx), now) : null;
    const when = next ? `opens ${short(next.opens)}` : ctx.profile.start_date ? 'all done' : 'not set yet';
    return `<span class="log-btn checkin-btn locked" role="link" aria-disabled="true" title="Your check-in opens the day before your check-in day"><span aria-hidden="true">${ICONS.checkin}</span>Check-in · ${esc(when)}</span>`;
  }

  // Smooth weekly-average bodyweight line with the latest week highlighted.
  function trendChart(d) {
    const pts = d.weeks.filter((w) => w.week <= Math.max(d.thisWeek, 1));
    const vals = pts.map((w) => w.avgWeight);
    const known = vals.filter((v) => v !== null);
    if (known.length < 2) return '<p class="hint">Your trend line appears after two weeks of weigh-ins.</p>';
    const W = 340, H = 150, top = 18, bottom = 124;
    const n = Math.max(pts.length, 6);
    const x = (i) => 14 + (i * (W - 28)) / (n - 1);
    let min = Math.min(...known), max = Math.max(...known);
    if (max - min < 1) { min -= 0.5; max += 0.5; }
    const y = (v) => top + ((max - v) * (bottom - top)) / (max - min);
    const p = [];
    vals.forEach((v, i) => { if (v !== null) p.push([x(i), y(v)]); });
    let line = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let i = 1; i < p.length; i++) {
      const [a, b] = [p[i - 1], p[i]], c = (b[0] - a[0]) / 2;
      line += ` C${(a[0] + c).toFixed(1)},${a[1].toFixed(1)} ${(b[0] - c).toFixed(1)},${b[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
    }
    const last = p[p.length - 1];
    const lastIdx = vals.map((v, i) => (v !== null ? i : -1)).filter((i) => i >= 0).pop();
    const area = `${line} L${last[0].toFixed(1)},${bottom} L${p[0][0].toFixed(1)},${bottom} Z`;
    const labels = Array.from({ length: n }, (_, i) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle"${i === lastIdx ? ' class="on"' : ''}>W${i + 1}</text>`).join('');
    return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly average bodyweight, latest ${fmt(vals[lastIdx], 1)} kg in week ${lastIdx + 1}">
      <defs><linearGradient id="tr-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2444f9" stop-opacity=".18"/><stop offset="1" stop-color="#2444f9" stop-opacity="0"/></linearGradient>
      <linearGradient id="tr-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b74ff" stop-opacity=".05"/><stop offset="1" stop-color="#5b74ff" stop-opacity=".35"/></linearGradient></defs>
      <rect x="${(last[0] - 13).toFixed(1)}" y="${top - 8}" width="26" height="${bottom - top + 8}" rx="8" fill="url(#tr-b)"/>
      <path d="${area}" fill="url(#tr-a)"/>
      <path d="${line}" fill="none" stroke="#2444f9" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="7" fill="#fff" stroke="#2444f9" stroke-width="3.5"/>
      <text x="${last[0].toFixed(1)}" y="${(last[1] - 14).toFixed(1)}" text-anchor="middle" class="tip">${fmt(vals[lastIdx], 1)} kg</text>
      ${labels}</svg>`;
  }

  // One dark stat pill for the grid on Home.
  function statPill(label, value, target, unit, st, dp) {
    const has = value !== null && value !== undefined;
    return `<div class="stat-pill"><span class="sp-k">${esc(label)}<i class="sp-dot ${st.level || 'empty'}" title="${esc(st.label || 'Not logged')}"></i></span>
      <b>${has ? fmt(value, dp) : '–'}<small> / ${fmt(target, dp)} ${esc(unit)}</small></b></div>`;
  }

  const HOME_METRICS = [
    ['blood_glucose', 'Blood Glucose', 'health-markers'], ['blood_pressure', 'Blood Pressure', 'health-markers'],
    ['body_temperature', 'Body Temperature', 'health-markers'], ['bodyweight', 'Bodyweight', 'scale'],
    ['cardio', 'Cardio', 'activity'], ['energy', 'Energy Level', 'recovery'],
    ['fluid', 'Fluid Intake', 'water'], ['heart_rate', 'Heart Rate', 'health-markers'],
    ['hrv', 'Heart Rate Variability', 'health-markers'], ['respiratory', 'Respiratory Rate', 'health-markers'],
    ['measurements', 'Measurements', 'scale'], ['menstrual', 'Menstrual Cycle', 'calendar'],
    ['mental', 'Mental Readiness', 'recovery'], ['soreness', 'Muscle Soreness', 'training'],
    ['sleep', 'Sleep', 'sleep'], ['steps', 'Steps', 'steps'],
  ];

  function clientSheet(title, body) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="sheet-x" data-close aria-label="Close">×</button></div>
      <div class="sheet-body">${body}</div></div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('sheet-open');
    const close = () => { wrap.remove(); document.body.classList.remove('sheet-open'); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    return { wrap, close };
  }

  async function saveHomePrefs(ctx, field, keys) {
    const value = { ...ctx.homePrefs, user_id: state.me.id, [field]: keys };
    must(await sb.from('client_home_preferences').upsert({
      user_id: state.me.id, metric_keys: value.metric_keys || [], habit_keys: value.habit_keys || [],
    }, { onConflict: 'user_id' }));
    invalidate(state.me.id);
    await renderHome();
  }

  async function renderHome(day) {
    const now = S.today();
    if (!day || day > now || !/^\d{4}-\d{2}-\d{2}$/.test(day)) day = now;
    const ctx = await loadCtx(state.me.id);
    const profile = ctx.profile;
    const targets = ctx.targets;
    const week = S.weekOf(profile.start_date, day);
    const log = ctx.logs.find((entry) => entry.day === day) || {};
    const session = todaysSession(ctx, day);
    const rows = habitRows(ctx, day);
    const hit = rows.filter((row) => row.status.level === 'good').length;
    const first = profile.full_name ? esc(profile.full_name.split(' ')[0]) : 'there';
    const summary = S.dashboard(ctx);
    const due = day === now ? checkinDue(ctx) : null;
    const exercises = session && Array.isArray(session.exercises) ? session.exercises.length : 0;
    const formsCard = state.preview ? '' : await FUI.homeCardHTML();
    const activePhase = ctx.phases.find((phase) => phase.status === 'active');
    const greet = !session ? `Good to see you,<br>${first}.` : session.is_rest_day ? `Recovery day,<br>${first}.` : `Ready to train,<br>${first}?`;
    const pinnedMetrics = HOME_METRICS.filter(([key]) => (ctx.homePrefs.metric_keys || []).includes(key));
    const pinnedHabits = rows.filter((row) => (ctx.homePrefs.habit_keys || []).includes(row.key));
    const metricValue = (key) => {
      const values = { bodyweight: log.weight_kg == null ? null : `${fmt(log.weight_kg, 1)} kg`,
        cardio: log.cardio_min == null ? null : `${fmt(log.cardio_min)} min`,
        fluid: log.water_l == null ? null : `${fmt(log.water_l, 1)} L`,
        sleep: log.sleep_h == null ? null : `${fmt(log.sleep_h, 1)} h`,
        steps: log.steps == null ? null : fmt(log.steps) };
      return values[key] || 'Tap to log';
    };
    const sessionName = session ? session.is_rest_day ? 'Recovery day' : session.session_name : 'No session assigned';
    const sessionDetail = session ? session.is_rest_day ? 'Walk, stretch and recover' : `Day ${session.cycle_day} of your cycle · ${exercises} exercise${exercises === 1 ? '' : 's'}` : `${esc(COACH)} will add your program after kickoff`;
    const dateLabel = niceDate(day, { weekday: 'long', day: 'numeric', month: 'long' });
    const summaryWeight = summary?.latestAvgWeight == null ? '–' : `${fmt(summary.latestAvgWeight, 1)} kg`;
    const summaryChange = summary?.totalChange == null ? 'No comparison yet' : `${signed(summary.totalChange, 1)} kg since start`;
    shell('Home', '', `<div class="client-home">
      <header class="client-home-top"><p>${dateLabel}${week ? ` · Week ${week} of 12` : ''}</p><h1>${greet}</h1><span>Your plan for ${day === now ? 'today' : 'this day'}, all in one place.</span></header>
      <div class="client-home-body">
        <section class="client-home-session"><div class="client-home-session-head"><span>${ICONS.training}</span><div><small>${day === now ? "Today's session" : 'Session'}</small><h2>${esc(sessionName)}</h2></div></div><p>${sessionDetail}</p><div class="client-home-actions"><a href="#training/${day}">View workout <span aria-hidden="true">→</span></a><a href="#log/${day}">${log.id ? 'Update log' : day === now ? 'Log today' : 'Log this day'}</a></div></section>
        ${due ? `<a class="client-home-due" href="#checkin/${due.week}"><span>${ICONS.checkin}</span><span><b>${due.dueToday ? 'Check-in due today' : `Check-in due ${esc(S.DAY_NAMES[checkinDay(ctx)])}`}</b><small>Week ${due.week} · photos, measurements and your week</small></span><i aria-hidden="true">›</i></a>` : ''}
        ${formsCard}
        <div class="client-home-section-title"><h2>Today at a glance</h2><a href="#calendar">Open Calendar</a></div>
        <div class="client-home-glance"><a href="#habits/${day}">${ICONS.habits}<span>Habits on target</span><b>${hit} of ${rows.length}</b></a><a href="#training/${day}">${ICONS.progress}<span>Daily steps</span><b>${targets.steps_target ? `${fmt(targets.steps_target)} target` : log.steps == null ? 'No target' : `${fmt(log.steps)} logged`}</b></a></div>
        <div class="client-home-section-title"><h2>More for you</h2></div>
        <div class="client-home-quick"><a href="#calendar">${ICONS.today}<span>Calendar</span></a><a href="#coach-notes">${ICONS.messages}<span>Coach Notes</span></a><a href="#files">${ICONS.files}<span>Files</span></a></div>
        ${activePhase ? `<section class="card ph-client-summary"><span class="ph-client-symbol" aria-hidden="true">${CI.icon('phases')}</span><div><p class="kicker">Current coaching phase</p><h2>${esc(activePhase.name)}</h2>${activePhase.description ? `<p>${esc(activePhase.description)}</p>` : ''}<small>Projected through ${niceDate(activePhase.end_date, { day: 'numeric', month: 'long', year: 'numeric' })}</small></div></section>` : ''}
        <details class="client-home-pinned"><summary>Customize your home</summary><div class="client-home-pin-actions"><button type="button" data-pin="metric_keys">Edit pinned metrics</button><button type="button" data-pin="habit_keys">Edit pinned habits</button><button type="button" data-data-metrics>View data metrics</button></div>${pinnedMetrics.length ? `<div class="pinned-grid">${pinnedMetrics.map(([key, name, icon]) => `<a class="pinned-tile" href="${key === 'steps' || key === 'cardio' ? '#training' : '#habits'}">${CI.icon(icon)}<span><b>${esc(name)}</b><small>${esc(metricValue(key))}</small></span></a>`).join('')}</div>` : ''}${pinnedHabits.length ? `<div class="pinned-grid">${pinnedHabits.map((row) => `<a class="pinned-tile" href="#habits/${day}"><span class="habit-icon" aria-hidden="true">${habitIcon(row)}</span><span><b>${esc(row.name)}</b><small>${esc(row.status.label || 'Not logged')}</small></span></a>`).join('')}</div>` : ''}</details>
        <section class="client-home-progress" aria-label="Bodyweight and progress summary"><div class="client-home-section-title"><h2>Your progress</h2></div><div><h3>Bodyweight</h3><p>Latest weekly average</p><div class="client-home-weight"><strong>${summaryWeight}</strong><span>${summaryChange}</span></div><div class="client-home-progress-detail"><div><small>Start weight</small><b>${summary?.startWeight == null ? '–' : `${fmt(summary.startWeight, 1)} kg`}</b></div><div><small>Average adherence</small><b>${summary?.avgAdherence == null ? '–' : pct(summary.avgAdherence)}</b></div></div><a href="#progress">See all progress <span aria-hidden="true">→</span></a></div></section>
      </div></div>`, 'home', { center: '<div class="title">Rewired</div>' });
    root.querySelectorAll('[data-pin]').forEach((button) => button.addEventListener('click', () => {
      const field = button.dataset.pin;
      const options = field === 'metric_keys' ? HOME_METRICS.map(([key, name, icon]) => ({ key, name, icon: CI.icon(icon) })) : rows.map((r) => ({ key: r.key, name: r.name, icon: habitIcon(r) }));
      const selected = ctx.homePrefs[field] || [];
      const sheet = clientSheet(field === 'metric_keys' ? 'Choose Pinned Metrics' : 'Choose Pinned Habits',
        `<p class="hint">Choose what appears on your home screen. Nothing is added until you save.</p><div class="pin-options">${options.map((o) => `<label><input type="checkbox" value="${esc(o.key)}"${selected.includes(o.key) ? ' checked' : ''}><span aria-hidden="true">${o.icon}</span><b>${esc(o.name)}</b></label>`).join('')}</div><button type="button" class="btn-dark wide" data-save-pins>Save choices</button>`);
      sheet.wrap.querySelector('[data-save-pins]').addEventListener('click', (e) => withBusy(e.target, async () => {
        if (!ctx.homePrefsReady) throw new Error('Pinned choices are not enabled yet.');
        const keys = [...sheet.wrap.querySelectorAll('input:checked')].map((input) => input.value);
        sheet.close();
        await saveHomePrefs(ctx, field, keys);
      }));
    }));
    root.querySelector('[data-data-metrics]')?.addEventListener('click', () => clientSheet('Data Metrics',
      `<p class="hint">Track or review these metrics from your daily log and health pages.</p><div class="pin-options">${HOME_METRICS.map(([key, name, icon]) => `<a href="${key === 'steps' || key === 'cardio' ? '#training' : '#habits'}">${CI.icon(icon)}<b>${esc(name)}</b><span>›</span></a>`).join('')}</div>`));
  }

  async function renderClientCoachNotes() {
    const ctx = await loadCtx(state.me.id);
    const note = ctx.targets.coach_note;
    shell('Coach Notes', 'A message from your coach', `<a class="files-back" href="#home">‹ Home</a><section class="note-card client-coach-note"><span class="note-mark" aria-hidden="true">R<i>.</i></span><div><p class="kicker">From ${esc(COACH)}</p>${note ? `<p>${esc(note)}</p>` : '<p class="hint">Your coach has not added a note yet.</p>'}</div></section>`, 'home');
  }

  // ---------------------------------------------------------------- client: coach hub

  async function renderHub() {
    const ctx = await loadCtx(state.me.id);
    const week = S.currentWeek(ctx.profile.start_date);
    const latest = ctx.checkins.filter((c) => c.coach_feedback).sort((a, b) => b.week_number - a.week_number)[0];
    const next = S.nextCheckin(ctx.profile.start_date, checkinDay(ctx), S.today());
    const nextSent = next && ctx.checkins.some((c) => c.week_number === next.week);
    const items = [
      ['#checkin', ICONS.checkin, 'Weekly check-in', !week || !next ? 'Opens in week 1'
        : nextSent ? `Week ${next.week} sent` : `Week ${next.week} due ${niceDate(next.due, { weekday: 'long', day: 'numeric', month: 'short' })}`],
      ['#photos', ICONS.photos, 'Progress photos', 'Front, side and back each week'],
      ['#supps', ICONS.supps, 'Supplements', ctx.supplements.length ? `${ctx.supplements.length} from ${COACH}` : 'Your plan and the general guide'],
      ['#files', ICONS.files, 'Files', 'Guides and resources shared by your coach'],
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
      const exercises = (Array.isArray(row.exercises) ? row.exercises : []).map((ex) => withMuscles(ex, state.exLib && state.exLib.list));
      const rows = exercises.map((ex, index) => {
        const reps = ex.reps_min === ex.reps_max ? fmt(ex.reps_min) : `${fmt(ex.reps_min)}–${fmt(ex.reps_max)}`;
        const rest = !ex.rest_seconds_min && !ex.rest_seconds_max ? ''
          : ex.rest_seconds_min === ex.rest_seconds_max || !ex.rest_seconds_max ? `${fmt(ex.rest_seconds_min || ex.rest_seconds_max)} sec rest`
            : `${fmt(ex.rest_seconds_min)}–${fmt(ex.rest_seconds_max)} sec rest`;
        const effort = ex.rir && ex.rir_target != null ? `${fmt(ex.rir_target)} RIR` : ex.rpe_min && ex.rpe_max ? `RPE ${fmt(ex.rpe_min)}–${fmt(ex.rpe_max)}` : '';
        const muscles = (ex.primary || []).map((k) => X.MUSCLES[k]).filter(Boolean).join(', ');
        return `<li class="training-exercise"><div class="exercise-map" aria-hidden="true"><span class="exercise-count">${index + 1}</span>${(ex.primary || []).length ? X.bodyDiagram(ex.primary, ex.secondary, { small: true }) : ''}</div><div>
          <strong>${esc(ex.name)}</strong>${muscles ? `<div class="exercise-muscles">${esc(muscles)}</div>` : ''}<div class="exercise-meta">${fmt(ex.sets)} sets × ${esc(reps)} reps${effort ? ` · ${esc(effort)}` : ''}${rest ? ` · ${esc(rest)}` : ''}</div>
          ${ex.rir && ex.rir_target != null ? `<div class="exercise-meta">${Number(ex.rir_target) === 0 ? 'Take each set to the last clean rep' : `Stop each set with about ${fmt(ex.rir_target)} clean rep${Number(ex.rir_target) === 1 ? '' : 's'} left in the tank`}</div>` : ''}
          ${ex.final_set_rpe_target ? `<div class="exercise-meta">Final set: about RPE ${fmt(ex.final_set_rpe_target)} if technique stays solid</div>` : ''}
          ${prescriptionHTML(ex)}
          ${ex.note ? `<p class="exercise-note">${esc(ex.note)}</p>` : ''}
        </div></li>`;
      }).join('');
      return `<details class="training-day card"${row.cycle_day === activeDay ? ' open' : ''}>
        <summary><span class="day-pill">Day ${fmt(row.cycle_day)}</span><span><strong>${esc(row.session_name)}</strong><small>${row.is_rest_day ? 'Recovery day' : `${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`}</small></span>${row.cycle_day === activeDay ? '<em>Today</em>' : ''}</summary>
        <div class="training-details">${rows ? `<ol class="training-exercises">${rows}</ol>` : ''}${row.session_note ? `<p class="training-session-note">${esc(row.session_note)}</p>` : ''}</div>
      </details>`;
    }).join('');
    return `${header}<div class="training-days">${cards}</div>`;
  }

  function prescriptionHTML(ex) {
    if (!Array.isArray(ex.prescriptions) || !ex.prescriptions.length) return '';
    return `<details class="training-prescriptions"><summary>Set instructions</summary><div class="tr-scroll"><table><thead><tr><th>Set</th><th>Weight</th><th>Reps</th><th>Tempo</th><th>RIR</th><th>Type / group</th><th>Rest</th></tr></thead><tbody>${ex.prescriptions.map((s,i) => `<tr><td>${i+1}</td><td>${s.weight_kg == null || s.weight_kg === '' ? '–' : `${fmt(s.weight_kg,1)} kg`}</td><td>${fmt(s.reps_min)}–${fmt(s.reps_max)}</td><td>${esc(s.tempo || '–')}</td><td>${s.rir == null || s.rir === '' ? '–' : fmt(s.rir)}</td><td>${esc(s.set_type || 'Working set')}${s.group ? ` · ${esc(s.group)}` : ''}</td><td>${fmt(s.rest_seconds)} sec</td></tr>`).join('')}</tbody></table></div></details>`;
  }

  // ------------------------------------------------- client: workout log
  // The client logs kg and reps for each set of a session. Saving also marks
  // the day "Trained: Yes" on daily_logs, which ticks Training on Habits.
  function programFor(ctx, day) {
    const starts = [...new Set(ctx.training.map((r) => r.program_start_date))].sort().reverse();
    const start = starts.find((d) => d <= day) || starts[starts.length - 1];
    const sessions = ctx.training.filter((r) => r.program_start_date === start).sort((a, b) => a.cycle_day - b.cycle_day);
    const len = sessions.length ? Math.max(...sessions.map((r) => r.cycle_day)) : 0;
    const scheduled = start && start <= day && len ? (S.daysBetween(start, day) % len) + 1 : null;
    return { start, sessions, scheduled };
  }

  function setsText(sets) {
    return (sets || []).filter((x) => x.reps).map((x) => `${x.kg != null ? `${fmt(x.kg, 1)} kg × ` : ''}${fmt(x.reps)}`).join(', ');
  }

  // The last time this exercise was logged before the given day.
  function lastSets(ctx, name, before) {
    for (const w of ctx.workouts) {
      if (w.day >= before) continue;
      const hit = (w.exercises || []).find((e) => X.normalise(e.name) === X.normalise(name) && (e.sets || []).some((x) => x.reps));
      if (hit) return { day: w.day, sets: hit.sets };
    }
    return null;
  }

  function workoutFormHTML(ctx, day, cycleDay) {
    const prog = programFor(ctx, day);
    const training = prog.sessions.filter((r) => !r.is_rest_day);
    const existing = ctx.workouts.find((w) => w.day === day);
    const active = state.workoutSession && state.workoutSession.day === day ? state.workoutSession : null;
    const chosen = (active && active.cycle_day) || cycleDay || (existing && existing.cycle_day) || (training.some((r) => r.cycle_day === prog.scheduled) ? prog.scheduled : training[0] && training[0].cycle_day);
    const session = prog.sessions.find((r) => r.cycle_day === chosen);
    const scheduledRest = prog.sessions.find((r) => r.cycle_day === prog.scheduled && r.is_rest_day);
    const saved = active?.draft?.exercises ? active.draft : existing && existing.cycle_day === chosen ? existing : null;
    const exerciseRows = saved ? saved.exercises.map((entry) => {
      const assigned = session?.exercises?.find((ex) => (ex.exercise_id && ex.exercise_id === entry.exercise_id) || X.normalise(ex.name) === X.normalise(entry.name));
      return assigned ? { ...assigned, name: entry.name, exercise_id: entry.exercise_id || assigned.exercise_id, primary: entry.primary || assigned.primary } : { ...entry, sets: entry.sets.length, reps_min: null, reps_max: null };
    }) : (session?.exercises || []);
    const rows = (active || (session && !session.is_rest_day)) ? exerciseRows.map((ex, i) => {
      const logged = saved?.exercises?.[i] || null;
      const prev = lastSets(ctx, ex.name, day);
      const count = Math.max(Number(ex.sets) || 1, logged ? logged.sets.length : 0);
      const reps = ex.reps_min === ex.reps_max ? fmt(ex.reps_min) : `${fmt(ex.reps_min)}–${fmt(ex.reps_max)}`;
      const sets = Array.from({ length: count }, (_, n) => {
        const v = logged && logged.sets[n] ? logged.sets[n] : {};
        const p = prev && prev.sets[n] ? prev.sets[n] : {};
        const prescription = ex.prescriptions?.[n];
        const done = active ? Boolean(v.completed) : v.reps != null;
        return `<div class="wl-set${done ? ' completed' : ''}"><span class="wl-n">${n + 1}</span>
          <label><span>kg</span><input data-kg type="number" inputmode="decimal" step="0.5" min="0" max="500" value="${esc(v.kg ?? '')}" placeholder="${esc(p.kg ?? '')}"></label>
          <label><span>reps</span><input data-reps type="number" inputmode="numeric" min="0" max="100" value="${esc(v.reps ?? '')}" placeholder="${esc(p.reps ?? '')}"></label>
          <select data-set-type aria-label="Set type">${T.SET_TYPES.map((type) => `<option${type === (v.set_type || prescription?.set_type || 'Working set') ? ' selected' : ''}>${esc(type)}</option>`).join('')}</select>
          <input type="checkbox" data-done aria-label="Complete set ${n + 1}"${done ? ' checked' : ''}></div>`;
      }).join('');
      return `<li class="wl-ex${logged?.superset ? ' is-superset' : ''}" data-wl-ex="${i}" data-name="${esc(ex.name)}" data-exercise-id="${esc(ex.exercise_id || '')}" data-primary="${esc(JSON.stringify(ex.primary || []))}" data-rest-seconds="${Number(logged?.rest_seconds ?? ex.prescriptions?.[0]?.rest_seconds ?? ex.rest_seconds_min ?? 90)}" data-superset="${esc(logged?.superset || '')}">
        <div class="wl-ex-head"><div class="wl-ex-map" aria-hidden="true">${(withMuscles(ex).primary || []).length ? X.bodyDiagram(withMuscles(ex).primary, withMuscles(ex).secondary, { small: true }) : ''}</div>
          <div><strong>${esc(ex.name)}</strong><small>Target: ${fmt(ex.sets)} sets × ${esc(reps)} reps${ex.rir && ex.rir_target != null ? ` · ${fmt(ex.rir_target)} RIR` : ''}</small>
          ${prev ? `<small class="wl-prev">Last time (${esc(niceDate(prev.day))}): ${esc(setsText(prev.sets))}</small>` : ''}</div>
          <button type="button" class="wl-menu-button" data-ex-menu aria-label="Options for ${esc(ex.name)}">⋯</button></div>${prescriptionHTML(ex)}
        <div class="wl-set-labels"><span>Set</span><span>Weight (kg)</span><span>Reps</span><span>Set Type</span><span></span></div>
        <div class="wl-sets" data-sets>${sets}</div>
        <div class="wl-ex-actions"><button type="button" class="wl-add" data-add-set>⊕ Add Set</button><button type="button" class="wl-add" data-ex-notes>▤ Notes</button></div>
        <textarea class="wl-ex-note" data-ex-note maxlength="500" hidden placeholder="Notes about this exercise">${esc(logged?.note || '')}</textarea>
      </li>`;
    }).join('') : '';
    return `<form id="workout-log" class="card wl${active ? '' : ' wl-prestart'}" novalidate>
      <div class="wl-top"><div><p class="kicker">Log your workout</p>
        <h2>${existing ? 'Workout logged <span class="wl-done">✓</span>' : scheduledRest && !cycleDay ? 'Rest day today' : 'How did it go?'}</h2>
        <p class="hint" style="margin-top:0">${scheduledRest && !existing ? 'Rest day on your plan. Trained anyway? Pick the session below.' : 'Enter the weight and reps you did for each set. Grey numbers are from last time.'}</p></div></div>
      <div class="wl-meta">
        <label>Date<input type="date" id="wl-day" value="${esc(day)}" max="${esc(S.today())}" min="${esc(S.addDays(S.today(), -14))}"${active ? ' disabled' : ''}></label>
        <label>Session<select id="wl-session"${active ? ' disabled' : ''}>${active && !training.some((r) => r.cycle_day === chosen) ? `<option value="${chosen}" selected>${esc(active.session_name || 'Current workout')}</option>` : ''}${training.map((r) => `<option value="${r.cycle_day}"${r.cycle_day === chosen ? ' selected' : ''}>Day ${r.cycle_day} · ${esc(r.session_name)}${r.cycle_day === prog.scheduled ? ' · today' : ''}</option>`).join('')}</select></label>
      </div>
      ${rows ? `<ol class="wl-list">${rows}</ol>` : '<p>No exercises in this session.</p>'}
      <button type="button" class="btn-dark wide wl-start" data-start-workout>Start workout</button>
      <div class="wl-active-toolbar"><button type="button" class="wl-add" data-add-exercise>⊕ Add Exercise</button><span data-rest-display></span><span data-elapsed>${workoutElapsed()}</span></div>
      <div class="wl-save-line"><span data-save-status>Changes save automatically</span><button type="button" data-retry-save>Save now</button></div>
      <label>Notes (optional)<textarea id="wl-note" maxlength="2000" placeholder="How it felt, anything to tell ${esc(COACH)}">${esc(saved?.note || '')}</textarea></label>
      ${ctx.workoutsReady ? `<div class="wl-finish"><button class="btn btn-ghost" type="button" data-cancel-workout>Cancel Workout</button><button class="btn" type="submit">${existing ? 'Update workout' : 'Finish Workout'}</button></div>` : `<p class="hint">Workout logging switches on once ${esc(COACH)} finishes the app update.</p>`}
    </form>`;
  }

  function workoutHistoryHTML(ctx, limit) {
    const list = ctx.workouts.slice(0, limit || 6);
    if (!list.length) return '';
    return `<section class="card wl-history"><p class="kicker">Recent workouts</p>
      ${list.map((w) => `<details><summary><b>${esc(niceDate(w.day, { weekday: 'short', day: 'numeric', month: 'short' }))}</b><span>${esc(w.session_name || 'Workout')} · ${(w.exercises || []).reduce((n, e) => n + (e.sets || []).filter((x) => x.reps).length, 0)} sets</span></summary>
        <ul>${(w.exercises || []).filter((e) => (e.sets || []).some((x) => x.reps)).map((e) => `<li><strong>${esc(e.name)}</strong><span>${esc(setsText(e.sets))}</span></li>`).join('')}</ul>
        ${w.note ? `<p class="exercise-note">${esc(w.note)}</p>` : ''}</details>`).join('')}
    </section>`;
  }

  function readWorkoutDraft(form) {
    return {
      note: form.querySelector('#wl-note').value.trim() || null,
      exercises: [...form.querySelectorAll('[data-wl-ex]')].map((li, index) => ({
        index,
        name: li.dataset.name,
        exercise_id: li.dataset.exerciseId || null,
        primary: JSON.parse(li.dataset.primary || '[]'),
        superset: li.dataset.superset || null,
        rest_seconds: Number(li.dataset.restSeconds) || 0,
        note: li.querySelector('[data-ex-note]').value.trim() || null,
        sets: [...li.querySelectorAll('.wl-set')].map((row) => {
          const kg = row.querySelector('[data-kg]').value.trim();
          const reps = row.querySelector('[data-reps]').value.trim();
          return { kg: kg === '' ? null : Number(kg), reps: reps === '' ? null : Number(reps), set_type: row.querySelector('[data-set-type]').value, completed: row.querySelector('[data-done]').checked };
        }),
      })),
    };
  }

  function saveWorkoutDraft(form) {
    if (!state.workoutSession) return Promise.resolve();
    const draft = readWorkoutDraft(form);
    state.workoutSession = { ...state.workoutSession, draft };
    const status = form.querySelector('[data-save-status]');
    if (status) status.textContent = 'Saving…';
    const write = state.workoutSaveQueue.catch(() => {}).then(async () => {
      const saved = must(await sb.from('client_workout_sessions').update({ draft, updated_at: new Date().toISOString() }).eq('user_id', state.me.id).select('user_id').maybeSingle());
      if (!saved) throw new Error('This workout session is no longer active.');
      if (status?.isConnected) status.textContent = 'Saved';
    });
    state.workoutSaveQueue = write;
    write.catch((err) => { if (status?.isConnected) status.textContent = 'Not saved · retry'; toast(friendlyError(err), true); });
    return write;
  }

  function cancelWorkoutSession() {
    if (!state.workoutSession) { location.hash = '#training'; return; }
    const sheet = clientSheet('Cancel workout?', `<p class="hint">This will discard the in-progress workout and stop its timer. Completed workout logs and your coach's plan will stay as they are.</p>
      <div class="wl-finish"><button type="button" class="btn btn-ghost" data-close>Keep workout</button><button type="button" class="btn" data-confirm-cancel>Cancel workout</button></div>`);
    sheet.wrap.querySelector('[data-confirm-cancel]').addEventListener('click', (e) => withBusy(e.target, async () => {
      clearTimeout(state.workoutDraftTimer);
      await state.workoutSaveQueue.catch(() => {});
      must(await sb.from('client_workout_sessions').delete().eq('user_id', state.me.id));
      setActiveWorkout(null);
      sheet.close();
      const alreadyOnTraining = location.hash === '#training';
      location.hash = '#training';
      if (alreadyOnTraining) await renderTraining();
      toast('Workout cancelled.');
    }));
  }

  async function renderTraining(view) {
    const ctx = await loadCtx(state.me.id, true);
    if (view === 'library') {
      const library = await loadExerciseLibrary();
      shell('Exercise Library', 'Browse your exercises', `<a class="back-link" href="#training">← Training</a><div class="card client-exercise-library"><input type="search" aria-label="Search exercises" placeholder="Search exercises" data-library-search><ul>${library.list.map((ex) => `<li>${esc(ex.name)}<small>${esc(ex.equipment || '')}</small></li>`).join('')}</ul></div>`, 'training');
      root.querySelector('[data-library-search]')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        root.querySelectorAll('.client-exercise-library li').forEach((li) => (li.hidden = !li.textContent.toLowerCase().includes(term)));
      });
      return;
    }
    if (view === 'plans') {
      shell('Training plans', 'Your assigned program', `<a class="back-link" href="#training">← Training</a>${trainingHTML(ctx)}`, 'training');
      return;
    }
    const actualToday = S.today();
    const today = /^\d{4}-\d{2}-\d{2}$/.test(view || '') ? view : actualToday;
    const future = today > actualToday;
    const log = ctx.logs.find((r) => r.day === today) || {};
    const t = ctx.targets || {};
    const prog = programFor(ctx, today);
    const session = prog.sessions.find((r) => r.cycle_day === prog.scheduled);
    const count = session?.exercises?.length || 0;
    const active = state.workoutSession?.day === today ? state.workoutSession : null;
    const workoutHref = future ? '#training/plans' : active ? `#training/log/${active.day}/${active.cycle_day}` : `#training/log/${today}`;
    shell('Training', 'Your activity and workout plan', `
      ${clientDateControls('training', today)}
      ${future ? '<p class="client-future-note">Previewing the workout scheduled for this date. Activity and workout logging open on the day.</p>' : ''}
      <a class="client-training-hero" href="${workoutHref}"><span class="kicker">${future ? 'Scheduled workout' : active ? 'Workout in progress' : 'Log Training'}</span><b>${active ? esc(active.session_name || 'Training session') : session && !session.is_rest_day ? esc(session.session_name) : future ? 'Recovery or unassigned day' : 'Start a workout'}</b><span>${future ? 'View training plans ›' : active ? `Resume workout · ${workoutElapsed()} ›` : 'Open workout log ›'}</span></a>
      ${active ? '<button type="button" class="training-cancel" data-cancel-workout>Cancel workout</button>' : ''}
      <section class="card training-activity"><div class="home-section-head"><h2>Activity</h2>${future ? '' : '<button type="button" class="activity-plus" data-log-activity aria-label="Log activity">+</button>'}</div>
        <p>${niceDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <div class="activity-line">${CI.icon('steps')}<span><b>Steps</b><small>${t.steps_target ? `Goal ${fmt(t.steps_target)}` : 'Daily movement'}</small></span><strong>${fmt(log.steps || 0)} steps</strong></div>
        <div class="activity-line">${CI.icon('activity')}<span><b>Cardio</b><small>Minutes logged</small></span><strong>${fmt(log.cardio_min || 0)} min</strong></div>
      </section>
      <section class="card workout-plan-card"><div class="plan-card-head">${CI.icon('training')}<div><h2>Workout Plan</h2><small>${esc(prog.scheduled ? prog.sessions[0]?.program_name || 'No assigned plan' : 'No assigned plan for this date')}</small></div></div>
        ${session ? `<a href="${workoutHref}"><span><b>${esc(session.session_name)}</b><small>${session.is_rest_day ? 'Recovery day' : `${count} exercise${count === 1 ? '' : 's'}`}</small></span><span>›</span></a>` : '<p>Your coach has not assigned a workout for this date.</p>'}</section>
      <div class="training-shortcuts"><a class="card" href="#training/plans">${CI.icon('training')} Training Plans ›</a><a class="card" href="#training/library">${CI.icon('foodlog')} Exercise Library ›</a></div>
      <section class="card training-plan-extra">${CI.icon('activity')}<span><b>Cardio Plan</b><small>${t.cardio_target_min ? `${fmt(t.cardio_target_min)} min target` : 'No cardio plan assigned yet'}</small></span></section>
      <section class="card training-plan-extra">${CI.icon('steps')}<span><b>Steps Plan</b><small>${t.steps_target ? `${fmt(t.steps_target)} steps target` : 'No steps plan assigned yet'}</small></span></section>
      <section><h2 class="sec-title">Workout History</h2>${workoutHistoryHTML(ctx) || '<p class="hint">No workouts logged yet.</p>'}</section>
    `, 'training');
    bindClientDateControls('training');
    root.querySelector('[data-cancel-workout]')?.addEventListener('click', cancelWorkoutSession);
    root.querySelector('[data-log-activity]')?.addEventListener('click', () => {
      const sheet = clientSheet('Log activity', `<form id="activity-log-form" class="client-supp-form">
        <label>Steps<input name="steps" type="number" min="0" max="100000" inputmode="numeric" value="${esc(log.steps ?? '')}"></label>
        <label>Cardio minutes<input name="cardio_min" type="number" min="0" max="600" inputmode="numeric" value="${esc(log.cardio_min ?? '')}"></label>
        <button class="btn-dark wide" type="submit">Save activity</button></form>`);
      sheet.wrap.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        withBusy(e.target.querySelector('[type="submit"]'), async () => {
          const values = readForm(e.target);
          if (values.steps == null && values.cardio_min == null) throw new Error('Add steps or cardio minutes.');
          must(await sb.from('daily_logs').upsert({ user_id: state.me.id, day: today, ...values }, { onConflict: 'user_id,day' }));
          sheet.close(); invalidate(state.me.id); await renderTraining(today); toast('Activity saved.');
        });
      });
    });
  }

  async function renderWorkoutLog(day, cycleDay) {
    if (state.restClock) clearInterval(state.restClock);
    const ctx = await loadCtx(state.me.id, true);
    const d = day || state.workoutSession?.day || S.today();
    if (state.workoutSession && d !== state.workoutSession.day) {
      location.hash = `#training/log/${state.workoutSession.day}/${state.workoutSession.cycle_day}`;
      return;
    }
    state.trainingView = { day: d, cycleDay };
    const log = ctx.training.length ? workoutFormHTML(ctx, d, cycleDay) : '';
    shell('Log', 'Record this workout', `<a class="back-link" href="#training">← Training</a>${log}`, 'training');
    const form = root.querySelector('#workout-log');
    if (!form) return;
    form.querySelector('[data-start-workout]')?.addEventListener('click', (e) => withBusy(e.target, async () => {
      if (!state.workoutSessionReady) throw new Error('Workout saving is not enabled yet.');
      if (state.workoutSession) return renderWorkoutLog(state.workoutSession.day, state.workoutSession.cycle_day);
      const dayValue = form.querySelector('#wl-day').value;
      const cd = Number(form.querySelector('#wl-session').value);
      const session = programFor(ctx, dayValue).sessions.find((r) => r.cycle_day === cd);
      if (!dayValue || dayValue > S.today() || !session) throw new Error('Choose a valid workout day.');
      const active = { user_id: state.me.id, day: dayValue, cycle_day: cd, session_name: session.session_name,
        started_at: new Date().toISOString(), draft: readWorkoutDraft(form) };
      must(await sb.from('client_workout_sessions').upsert(active, { onConflict: 'user_id' }));
      setActiveWorkout(active);
      await renderWorkoutLog(dayValue, cd);
      root.querySelector('.wl-set input[data-kg]')?.focus();
      toast('Workout started. Sets save as you log them.');
    }));
    form.querySelector('[data-cancel-workout]')?.addEventListener('click', cancelWorkoutSession);
    form.querySelector('[data-retry-save]')?.addEventListener('click', () => saveWorkoutDraft(form));
    const pickExercise = async (onPick) => {
      const library = await loadExerciseLibrary();
      if (!library.ready) return toast('Exercise library is unavailable.', true);
      const sheet = clientSheet('Choose exercise', `<input type="search" data-ex-search placeholder="Search exercises" aria-label="Search exercises"><div class="workout-ex-picker">${library.list.map((ex, i) => `<button type="button" data-pick-ex="${i}">${esc(ex.name)}</button>`).join('')}</div>`);
      sheet.wrap.querySelector('[data-ex-search]').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        sheet.wrap.querySelectorAll('[data-pick-ex]').forEach((b) => (b.hidden = !b.textContent.toLowerCase().includes(term)));
      });
      sheet.wrap.querySelectorAll('[data-pick-ex]').forEach((b) => b.addEventListener('click', () => {
        onPick(library.list[Number(b.dataset.pickEx)]);
        sheet.close();
      }));
    };
    const renameExercise = (li, ex, reset, added) => {
      li.dataset.name = ex.name;
      li.dataset.exerciseId = ex.id || '';
      li.dataset.primary = JSON.stringify(ex.primary || []);
      li.querySelector('.wl-ex-head strong').textContent = ex.name;
      li.querySelector('[data-ex-menu]').setAttribute('aria-label', `Options for ${ex.name}`);
      li.querySelector('.wl-ex-head small').textContent = added ? 'Added to this workout' : 'Replacement for this workout';
      li.querySelector('.wl-ex-map').innerHTML = ex.primary?.length ? X.bodyDiagram(ex.primary, ex.secondary, { small: true }) : '';
      li.querySelector('.training-prescriptions')?.remove();
      li.querySelector('.wl-prev')?.remove();
      if (reset) li.querySelectorAll('.wl-set').forEach((row, i) => { if (i) row.remove(); else { row.querySelector('[data-kg]').value = ''; row.querySelector('[data-reps]').value = ''; row.querySelector('[data-done]').checked = false; row.classList.remove('completed'); } });
    };
    const startRest = (li) => {
      const seconds = Number(li.dataset.restSeconds) || 0;
      if (!seconds) return;
      if (state.restClock) clearInterval(state.restClock);
      let left = seconds;
      const label = form.querySelector('[data-rest-display]');
      state.restClock = setInterval(() => {
        if (!label || !label.isConnected || left <= 0) { clearInterval(state.restClock); if (label && label.isConnected) label.textContent = 'Rest complete'; return; }
        label.textContent = `Rest ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        left -= 1;
      }, 1000);
    };
    form.addEventListener('input', () => {
      form.dataset.dirty = '1';
      if (!state.workoutSession) return;
      state.workoutSession.draft = readWorkoutDraft(form);
      clearTimeout(state.workoutDraftTimer);
      state.workoutDraftTimer = setTimeout(() => saveWorkoutDraft(form), 500);
    });
    form.querySelector('#wl-day').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v && v <= S.today()) renderWorkoutLog(v);
    });
    form.querySelector('#wl-session').addEventListener('change', (e) => renderWorkoutLog(form.querySelector('#wl-day').value, Number(e.target.value)));
    form.addEventListener('change', (e) => {
      if (e.target.matches('[data-done]')) {
        const row = e.target.closest('.wl-set');
        const reps = Number(row.querySelector('[data-reps]').value);
        const kgField = row.querySelector('[data-kg]');
        const kg = kgField.value === '' ? null : Number(kgField.value);
        if (e.target.checked && (!Number.isFinite(reps) || reps < 1 || reps > 100 || (kg !== null && (!Number.isFinite(kg) || kg < 0 || kg > 500)))) {
          e.target.checked = false;
          toast('Enter valid reps before completing this set.', true);
          return;
        }
        row.classList.toggle('completed', e.target.checked);
        clearTimeout(state.workoutDraftTimer);
        saveWorkoutDraft(form).then(() => { if (e.target.checked) startRest(row.closest('[data-wl-ex]')); }).catch(() => {});
      }
    });
    form.addEventListener('click', (e) => {
      const notes = e.target.closest('[data-ex-notes]');
      if (notes) { const field = notes.closest('[data-wl-ex]').querySelector('[data-ex-note]'); field.hidden = !field.hidden; if (!field.hidden) field.focus(); return; }
      if (e.target.closest('[data-add-exercise]')) return pickExercise((ex) => {
        const template = form.querySelector('[data-wl-ex]');
        if (!template) return;
        const li = template.cloneNode(true);
        form.dataset.dirty = '1';
        li.dataset.wlEx = String(Date.now());
        li.dataset.superset = '';
        li.dataset.restSeconds = '90';
        li.classList.remove('is-superset');
        li.querySelector('[data-ex-note]').value = '';
        li.querySelector('[data-ex-note]').hidden = true;
        renameExercise(li, ex, true, true);
        form.querySelector('.wl-list').appendChild(li);
        saveWorkoutDraft(form);
        li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      const menu = e.target.closest('[data-ex-menu]');
      if (menu) {
        const li = menu.closest('[data-wl-ex]');
        form.dataset.dirty = '1';
        const sheet = clientSheet(li.dataset.name, `<p class="hint">Changes here affect this workout log only. Your coach's plan stays the same.</p>
          <div class="workout-menu">${[['timer','◷','Rest Timer'],['replace','⇄','Replace'],['reorder','↕','Reorder'],['superset','＋','Create Superset'],['delete','▤','Delete']].map(([id,icon,label]) => `<button type="button" data-menu-action="${id}"><span>${icon}</span>${label}<span>›</span></button>`).join('')}</div>`);
        sheet.wrap.querySelectorAll('[data-menu-action]').forEach((b) => b.addEventListener('click', () => {
          const act = b.dataset.menuAction;
          sheet.close();
          if (act === 'timer') {
            const edit = clientSheet('Rest Timer', `<label>Rest after each set (seconds)<input type="number" min="0" max="1200" value="${esc(li.dataset.restSeconds || '90')}" data-rest-value></label><button type="button" class="btn-dark wide" data-save-rest>Save timer</button>`);
            edit.wrap.querySelector('[data-save-rest]').addEventListener('click', () => { li.dataset.restSeconds = String(Math.max(0, Math.min(1200, Number(edit.wrap.querySelector('[data-rest-value]').value) || 0))); edit.close(); saveWorkoutDraft(form); toast('Rest timer updated for this workout.'); });
          } else if (act === 'replace') pickExercise((ex) => { renameExercise(li, ex, true, false); saveWorkoutDraft(form); });
          else if (act === 'reorder') {
            const edit = clientSheet('Reorder exercise', `<div class="workout-menu"><button type="button" data-move="up">↑ Move up</button><button type="button" data-move="down">↓ Move down</button></div>`);
            edit.wrap.querySelectorAll('[data-move]').forEach((move) => move.addEventListener('click', () => {
              if (move.dataset.move === 'up' && li.previousElementSibling) li.parentElement.insertBefore(li, li.previousElementSibling);
              if (move.dataset.move === 'down' && li.nextElementSibling) li.parentElement.insertBefore(li.nextElementSibling, li);
              saveWorkoutDraft(form);
              edit.close();
            }));
          } else if (act === 'superset') {
            const others = [...form.querySelectorAll('[data-wl-ex]')].filter((x) => x !== li);
            if (!others.length) return toast('Add another exercise first.', true);
            const edit = clientSheet('Create Superset', `<p class="hint">Pair ${esc(li.dataset.name)} with another exercise in this workout.</p><div class="workout-menu">${others.map((x, i) => `<button type="button" data-pair="${i}">${esc(x.dataset.name)}</button>`).join('')}</div>`);
            edit.wrap.querySelectorAll('[data-pair]').forEach((pair) => pair.addEventListener('click', () => {
              const other = others[Number(pair.dataset.pair)];
              const group = `S${Date.now()}`; li.dataset.superset = group; other.dataset.superset = group;
              li.classList.add('is-superset'); other.classList.add('is-superset');
              li.parentElement.insertBefore(other, li.nextElementSibling);
              saveWorkoutDraft(form);
              edit.close(); toast('Superset paired for this workout.');
            }));
          } else if (act === 'delete') {
            if (form.querySelectorAll('[data-wl-ex]').length <= 1) return toast('Keep one exercise so you can finish this workout.', true);
            li.remove(); saveWorkoutDraft(form); toast('Exercise removed from this workout.');
          }
        }));
        return;
      }
      const add = e.target.closest('[data-add-set]');
      if (!add) return;
      const box = add.closest('[data-wl-ex]').querySelector('[data-sets]');
      const n = box.children.length + 1;
      box.insertAdjacentHTML('beforeend', `<div class="wl-set"><span class="wl-n">${n}</span>
        <label><span>kg</span><input data-kg type="number" inputmode="decimal" step="0.5" min="0" max="500"></label>
        <label><span>reps</span><input data-reps type="number" inputmode="numeric" min="0" max="100"></label>
        <select data-set-type aria-label="Set type">${T.SET_TYPES.map((type) => `<option>${esc(type)}</option>`).join('')}</select>
        <input type="checkbox" data-done aria-label="Complete set ${n}"></div>`);
      saveWorkoutDraft(form);
      box.lastElementChild.querySelector('[data-kg]').focus();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(form.querySelector('[type="submit"]'), async () => {
        const dayValue = form.querySelector('#wl-day').value;
        if (!dayValue || dayValue > S.today()) throw new Error('Pick today or an earlier day.');
        const prog = programFor(ctx, dayValue);
        const cd = Number(form.querySelector('#wl-session').value);
        const session = prog.sessions.find((r) => r.cycle_day === cd);
        const draft = readWorkoutDraft(form);
        const exercises = draft.exercises.map((ex) => ({ ...ex, sets: ex.sets.filter((x) => x.reps !== null || x.kg !== null) }));
        for (const ex of exercises) {
          for (const x of ex.sets) {
            if (x.reps === null) throw new Error(`${ex.name}: add the reps for each set you entered a weight for.`);
            if (!Number.isFinite(x.reps) || x.reps < 0 || x.reps > 100 || (x.kg !== null && (!Number.isFinite(x.kg) || x.kg < 0 || x.kg > 500))) throw new Error(`${ex.name}: check the numbers.`);
          }
        }
        if (!exercises.some((ex) => ex.sets.some((x) => x.reps > 0))) throw new Error('Add the reps for at least one set.');
        clearTimeout(state.workoutDraftTimer);
        await state.workoutSaveQueue.catch(() => {});
        must(await sb.from('workout_logs').upsert({
          user_id: state.me.id, day: dayValue, program_start_date: prog.start || null, cycle_day: cd,
          session_name: session ? session.session_name : state.workoutSession?.session_name || null, exercises, note: draft.note,
        }, { onConflict: 'user_id,day' }));
        must(await sb.from('daily_logs').upsert({ user_id: state.me.id, day: dayValue, trained: 'Yes' }, { onConflict: 'user_id,day' }));
        must(await sb.from('client_workout_sessions').delete().eq('user_id', state.me.id));
        setActiveWorkout(null);
        invalidate(state.me.id);
        toast('Workout saved. Training is ticked on your Habits.');
        if (state.restClock) clearInterval(state.restClock);
        location.hash = '#training';
      });
    });
  }

  // ------------------------------------------------------ client: supplements

  function supplementSchedule(timing) {
    const text = String(timing || '').trim();
    if (/\b(twice|two times|2 times|2x)\b/i.test(text)) return { count: 2, label: 'Twice daily' };
    if (/\b(three times|3 times|3x)\b/i.test(text)) return { count: 3, label: 'Three times daily' };
    if (/\b(once|daily|every day|each day|breakfast|lunch|dinner|morning|evening|bedtime)\b/i.test(text)) return { count: 1, label: 'Once daily' };
    return { count: null, label: text || 'Follow coach timing' };
  }

  function suppsHTML(ctx) {
    const today = S.today();
    const todayIntake = ctx.supplementIntake.filter((entry) => entry.day === today);
    const dueToday = `<section class="card supp-today"><div class="supp-today-head"><p class="kicker">Today · ${esc(niceDate(today, { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h2>Supplements to take today</h2><p class="hint">Your coach's assigned doses and timing. Mark each dose after taking it.</p></div>
      ${ctx.supplements.length ? `<div class="supp-today-list">${ctx.supplements.map((item) => {
        const schedule = supplementSchedule(item.timing);
        const taken = todayIntake.filter((entry) => entry.name.toLowerCase() === item.name.toLowerCase()).length;
        const complete = schedule.count !== null && taken >= schedule.count;
        const status = complete ? 'Taken today' : taken ? `${taken} logged today${schedule.count ? ` · ${schedule.count} planned` : ''}` : 'Not taken yet';
        return `<article class="supp-today-item"><span class="supp-today-icon" aria-hidden="true">${ICONS.supps}</span><div class="supp-today-copy"><b>${esc(item.name)}</b><small>${esc(item.dose)} · ${esc(item.timing || 'Follow coach timing')}</small><span class="supp-frequency">${esc(schedule.label)}</span></div><div class="supp-today-action"><span class="${complete ? 'is-taken' : ''}">${esc(status)}</span>${complete ? '' : `<button type="button" data-mark-supp="${esc(item.id)}">${taken ? 'Log another dose' : 'Mark taken'}</button>`}</div></article>`;
      }).join('')}</div>` : '<p class="hint">No supplements assigned for today.</p>'}</section>`;
    const assigned = ctx.supplements.length
      ? `<section class="assigned-supps"><p class="kicker">From your coach</p><h2>Your assigned plan</h2>
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
    const intake = ctx.supplementIntake.slice(0, 20).map((entry) => `<li><span><b>${esc(entry.name)}</b><small>${esc(niceDate(entry.day))}${entry.dose ? ` · ${esc(entry.dose)}` : ''}</small></span><button type="button" data-delete-intake="${esc(entry.id)}" aria-label="Remove ${esc(entry.name)}">×</button></li>`).join('');
    return `<a class="back-link" href="#meals">← Nutrition</a>${dueToday}${assigned}
      <section class="card client-intake"><h2>Supplements you took</h2>
        ${intake ? `<ul>${intake}</ul>` : '<p class="hint">Nothing logged yet.</p>'}
        <button type="button" class="btn-dark" data-custom-supp>+ Add custom supplement</button>
      </section><section class="supp-intro"><p class="kicker">Supplement guide</p><h2>Supps</h2>
      <p>General guidance only, not medical advice. Check with your GP before starting any supplement, especially if you take medication or have a medical condition. If you compete in tested sport, choose batch-tested products (e.g. Informed Sport).</p>
    </section><div class="supp-grid">${cards}</div>
    <p class="supp-source">Sources: ISSN position stands on creatine (Kreider et al., 2017), caffeine (Guest et al., 2021) and protein (Jäger et al., 2017). Magnesium upper limit for supplements: 350 mg/day (NHMRC Nutrient Reference Values).</p>`;
  }

  async function renderSupps() {
    const ctx = await loadCtx(state.me.id, true);
    shell('Supps', 'Your plan and general guide', suppsHTML(ctx), 'supps');
    root.querySelectorAll('[data-mark-supp]').forEach((button) => button.addEventListener('click', () => withBusy(button, async () => {
      if (!ctx.supplementIntakeReady) throw new Error('Supplement logging is not enabled yet.');
      const item = ctx.supplements.find((entry) => String(entry.id) === button.dataset.markSupp);
      if (!item) throw new Error('This supplement is no longer assigned.');
      must(await sb.from('client_supplement_intake').insert({ user_id: state.me.id, day: S.today(), name: item.name, dose: item.dose, note: 'From assigned plan' }));
      invalidate(state.me.id);
      await renderSupps();
      toast('Supplement marked taken.');
    })));
    root.querySelector('[data-custom-supp]')?.addEventListener('click', () => {
      const sheet = clientSheet('Add custom supplement', `<form id="custom-supp-form" class="client-supp-form">
        <label>Name<input name="name" maxlength="120" required placeholder="e.g. Creatine"></label>
        <label>Dose taken<input name="dose" maxlength="120" placeholder="e.g. 5 g"></label>
        <label>Date<input name="day" type="date" max="${S.today()}" value="${S.today()}" required></label>
        <label>Notes (optional)<textarea name="note" maxlength="500"></textarea></label>
        <button class="btn-dark wide" type="submit">Save supplement</button></form>`);
      sheet.wrap.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        withBusy(e.target.querySelector('[type="submit"]'), async () => {
          if (!ctx.supplementIntakeReady) throw new Error('Supplement logging is not enabled yet.');
          const values = readForm(e.target);
          if (!values.name || !values.day || values.day > S.today()) throw new Error('Add a name and a valid date.');
          must(await sb.from('client_supplement_intake').insert({ user_id: state.me.id, day: values.day, name: values.name, dose: values.dose, note: values.note }));
          sheet.close();
          invalidate(state.me.id);
          await renderSupps();
          toast('Supplement saved.');
        });
      });
    });
    root.querySelectorAll('[data-delete-intake]').forEach((button) => button.addEventListener('click', () => withBusy(button, async () => {
      must(await sb.from('client_supplement_intake').delete().eq('id', button.dataset.deleteIntake).eq('user_id', state.me.id));
      invalidate(state.me.id);
      await renderSupps();
      toast('Supplement entry removed.');
    })));
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

  // Emails the coach through the "checkin-complete" Netlify form (declared in
  // app/index.html); Netlify's form notification sends it to the coach inbox.
  // A failed notice never blocks the check-in itself.
  async function notifyCheckin(ctx, week) {
    const name = ctx.profile.full_name || (state.session && state.session.user && state.session.user.email) || 'A client';
    const body = new URLSearchParams({
      'form-name': 'checkin-complete',
      subject: `Check-in complete for ${name}`,
      client_name: name,
      client_email: (state.session && state.session.user && state.session.user.email) || '',
      week: `Week ${week}`,
      sent_at: new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }),
      review_link: `${location.origin}/app/#client/${ctx.profile.id}/checkins`,
    });
    try {
      await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    } catch (_) { /* offline or blocked: the coach still sees it in Check-ins */ }
  }

  // Nudge on the check-in page to upload this week's front, side and back photos.
  function photoPromptHTML(ctx, week, winState) {
    const have = POSES.filter((pose) => ctx.photos.some((x) => x.week_number === week && x.pose === pose));
    const done = have.length === POSES.length;
    if (winState === 'closed' && !have.length) return '';
    return `<a class="card photo-prompt${done ? ' done' : ''}" href="#photos/${week}">
      <span class="habit-icon" aria-hidden="true">${done ? STATE_ICONS.good : ICONS.photos}</span>
      <span><b>${done ? `Week ${week} photos uploaded` : `Upload your week ${week} check-in photos`}</b>
      <small>${done ? 'Front, side and back are in. Tap to view or replace.' : `${have.length} of 3 done. Front, side and back, same spot and lighting each week.`}</small></span>
      <span class="chev" aria-hidden="true">›</span></a>`;
  }

  async function renderCheckin(weekParam) {
    const ctx = await loadCtx(state.me.id);
    const p = ctx.profile;
    const thisWeek = S.currentWeek(p.start_date);
    const day = checkinDay(ctx);
    const dayName = S.DAY_NAMES[day];
    const openWin = S.openCheckin(p.start_date, day, S.today());
    const week = Math.min(Math.max(Number(weekParam) || (openWin && openWin.week) || thisWeek || 1, 1), 12);
    const c = ctx.checkins.find((x) => x.week_number === week) || {};
    const win = p.start_date ? S.checkinWindow(p.start_date, week, day) : null;
    const winState = S.checkinState(win, S.today());
    const long = (iso) => niceDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
    const windowNote = !win ? `Your check-in opens once ${esc(COACH)} sets your start date.`
      : winState === 'open' ? `Open now until the end of ${long(win.due)}.`
        : winState === 'upcoming' ? `Opens ${long(win.opens)}, the day before your check-in day (${dayName}).`
          : c.submitted_at ? `Sent ${niceDate(c.submitted_at.slice(0, 10))}. This check-in closed at the end of ${long(win.due)}.`
            : `This check-in closed at the end of ${long(win.due)} without being sent.`;
    const evenWeek = week % 2 === 0 ? week : week - 1;
    const mWeek = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('m') || evenWeek);
    const m = ctx.measurements.find((x) => x.week_number === mWeek) || {};
    const scale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    shell(
      'Weekly check-in',
      `Every ${dayName} · opens the day before`,
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
      ${photoPromptHTML(ctx, week, winState)}
      <form id="checkin-form" class="card" novalidate>
        <p class="kicker">How was week ${week}?</p>
        <p class="checkin-window ${winState}">${windowNote}</p>
        <fieldset class="checkin-fields"${winState === 'open' ? '' : ' disabled'}>
        ${numberField('sleep_hours', 'Sleep (hours a night, on average)', c.sleep_hours, { decimal: true, max: 14 })}
        <p class="hint" style="margin:-6px 0 12px">Rate 1 to 10, where 10 is best (low stress = 10).</p>
        ${choiceField('stress', 'Stress', scale, c.stress, 'scale')}
        ${choiceField('energy', 'Energy', scale, c.energy, 'scale')}
        ${choiceField('hunger', 'Hunger', scale, c.hunger, 'scale')}
        ${choiceField('digestion', 'Digestion', scale, c.digestion, 'scale')}
        <div class="field"><label for="f-win">Biggest win</label><textarea id="f-win" name="biggest_win" maxlength="1000">${esc(c.biggest_win || '')}</textarea></div>
        <div class="field"><label for="f-struggle">Biggest struggle</label><textarea id="f-struggle" name="biggest_struggle" maxlength="1000">${esc(c.biggest_struggle || '')}</textarea></div>
        ${winState === 'open' ? `<button class="btn" type="submit" style="width:100%">${c.submitted_at ? 'Update' : 'Send'} check-in</button>` : ''}
        </fieldset>
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
      if (S.checkinState(win, S.today()) !== 'open') return toast(`This check-in is closed. Your check-in day is ${dayName}.`, true);
      const data = readForm(form);
      withBusy(form.querySelector('button[type="submit"]'), async () => {
        must(await sb.from('weekly_checkins').upsert({ ...data, user_id: state.me.id, week_number: week }, { onConflict: 'user_id,week_number' }));
        if (!c.submitted_at) await notifyCheckin(ctx, week);
        invalidate(state.me.id);
        const photos = POSES.filter((pose) => ctx.photos.some((x) => x.week_number === week && x.pose === pose)).length;
        toast(photos < POSES.length ? `Check-in sent to ${COACH}. Now upload your week ${week} photos.` : `Check-in sent to ${COACH}.`);
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
      ${'country' in p ? `<div class="field">
          <label for="p-country">Country you buy food in</label>
          <select id="p-country" name="country">${NUI.COUNTRIES.map(([c, l]) => `<option value="${c}"${(p.country || 'AU') === c ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <p class="hint">Food search shows foods sold there first.</p>
        </div>` : ''}
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
        <a href="/terms.html" target="_blank" rel="noopener">Terms &amp; Conditions</a>
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
      .map((c) => `<div class="stat-card"><div class="k">${CI.forText(c.k) ? CI.icon(CI.forText(c.k)) : ''}${esc(c.k)}</div><div class="v">${c.v}${c.delta || ''}</div>${c.s ? `<div class="s">${esc(c.s)}</div>` : ''}</div>`)
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
    return { week: WUI.programWeek(ctx), days: WUI.rangeFor(ctx).days };
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

  function renderCoachPhysique(ctx, nav, title, sub, view, arg) {
    const id = ctx.profile.id;
    view = ['measurements', 'photos'].includes(view) ? view : 'bodyweight';
    state.coachView.view = view;
    const tabs = sectionTabs(id, 'physique', [['bodyweight', 'Bodyweight'], ['measurements', 'Measurements'], ['photos', 'Photos']], view);
    if (view === 'photos') return renderCoachPhotos(ctx, tabs, title, sub, arg);
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

  function renderCoachNutrition(ctx, nav, title, sub, view, arg2) {
    const id = ctx.profile.id;
    const builderViews = ['builder', 'assign', 'history', 'targets'];
    const isBuilder = builderViews.includes(view) || /^v\d+$/.test(view || '');
    const tabs = sectionTabs(id, 'nutrition', [['daily', 'Daily intake'], ['builder', 'Nutrition builder'], ['current', 'Current nutrition']], isBuilder ? 'builder' : view === 'current' ? 'current' : 'daily');
    if (isBuilder) return renderNutritionBuilder(ctx, tabs, title, sub, view, arg2);
    if (view === 'current') return NUI.coachCurrent(ctx, title, sub, tabs, arg2);
    const { week, days } = coachWeek(ctx);
    const m = macrosForDay(ctx, S.today());
    const cal = weekValues(ctx, days, 'calories');
    const pro = weekValues(ctx, days, 'protein_g');
    const fib = weekValues(ctx, days, 'fibre_g');
    const rows = ctx.logs
      .filter((l) => l.calories !== null || l.protein_g !== null)
      .slice()
      .reverse()
      .map((l) => {
        const mm = macrosForDay(ctx, l.day) || {};
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

  // Where each target habit's daily target lives on the targets row.
  const HABIT_TARGET_FIELDS = {
    steps: { field: 'steps_target', type: 'number', step: '500', label: 'Daily target (steps)' },
    fibre: { field: 'fibre_target_g', type: 'number', step: '1', label: 'Daily target (g)', hint: 'An assigned nutrition plan’s fibre wins over this.' },
    water: { field: 'water_target', type: 'text', label: 'Daily target', hint: 'e.g. 3-4 L. The tracker uses the first number.' },
    sleep: { field: 'sleep_target_h', type: 'number', step: '0.5', label: 'Daily target (hrs)' },
  };
  const HABITS_SQL = 'supabase/migrations/2026-10-28-coach-habits.sql';

  function categoryOptions(selected) {
    return Object.keys(HABIT_CATEGORIES).map((c) => `<option${c === selected ? ' selected' : ''}>${c}</option>`).join('');
  }

  function coachHabitEditorHTML(ctx, day) {
    const id = ctx.profile.id;
    const first = esc((ctx.profile.full_name || 'the client').split(' ')[0]);
    const builtIn = builtInHabits(ctx, day).map((r) => {
      const tf = HABIT_TARGET_FIELDS[r.key];
      const target = tf
        ? `<div class="field"><label for="hb-${r.key}-t">${tf.label}</label><input id="hb-${r.key}-t" name="${tf.field}" type="${tf.type}"${
            tf.type === 'number' ? ` inputmode="decimal" step="${tf.step}" min="0"` : ' maxlength="20"'
          } value="${esc(ctx.targets[tf.field] ?? '')}">${tf.hint ? `<p class="hint">${tf.hint}</p>` : ''}</div>`
        : r.choice
          ? '<div class="field"><span class="label">Daily target</span><p class="ha-note">Yes, Rest day or Missed</p></div>'
          : `<div class="field"><span class="label">Daily target</span><p class="ha-note">${r.target ? `${fmt(r.target)} ${esc(r.unit)} · ` : ''}<a href="#client/${id}/nutrition/builder">Set in Nutrition</a></p></div>`;
      return `<li class="ha-item"><div class="ha-summary">
        <span class="habit-icon sm" aria-hidden="true">${habitIcon(r)}</span>
        <span class="ha-summary-text"><b>${esc(r.name)}</b><small>${esc(r.cat)}${r.hidden ? ' · Hidden from tracker' : r.target ? ` · ${fmt(r.target, r.decimal && r.target % 1 ? 1 : 0)} ${esc(r.unit)}/day` : ''}</small></span>
        <button class="btn btn-ghost btn-small" type="button" data-edit-habit aria-expanded="false" aria-controls="ha-builtin-${r.key}">Edit</button>
      </div><form id="ha-builtin-${r.key}" class="ha-row${r.hidden ? ' is-hidden' : ''}" data-builtin="${r.key}" hidden novalidate>
        <div class="ha-fields">
          <div class="field"><label for="hb-${r.key}-n">Name</label><input id="hb-${r.key}-n" name="name" maxlength="60" value="${esc(r.name)}" required></div>
          <div class="field"><label for="hb-${r.key}-c">Category</label><select id="hb-${r.key}-c" name="category">${categoryOptions(r.cat)}</select></div>
          ${target}
          <label class="check ha-show"><input type="checkbox" name="show"${r.hidden ? '' : ' checked'}> Show on ${first}'s tracker</label>
        </div>
        <div class="ha-actions"><button class="btn btn-small" type="submit">Save</button><button class="btn btn-ghost btn-small" type="button" data-cancel-edit>Cancel</button></div>
      </form></li>`;
    });
    const own = ctx.habits.map((h) => `<li class="ha-item"><div class="ha-summary">
        <span class="habit-icon sm" aria-hidden="true">${habitIcon(h)}</span>
        <span class="ha-summary-text"><b>${esc(h.name)}</b><small>${esc(h.category)} · ${fmt(h.target, h.target % 1 ? 1 : 0)} ${esc(h.unit)}/day</small></span>
        <button class="btn btn-ghost btn-small" type="button" data-edit-habit aria-expanded="false" aria-controls="ha-own-${esc(h.id)}">Edit</button>
      </div><form id="ha-own-${esc(h.id)}" class="ha-row" data-habit="${esc(h.id)}" hidden novalidate>
        <div class="ha-fields">
          <div class="field"><label for="hc-${esc(h.id)}-n">Name</label><input id="hc-${esc(h.id)}-n" name="name" maxlength="60" value="${esc(h.name)}" required></div>
          <div class="field"><label for="hc-${esc(h.id)}-c">Category</label><select id="hc-${esc(h.id)}-c" name="category">${categoryOptions(h.category)}</select></div>
          <div class="field"><label for="hc-${esc(h.id)}-t">Daily target</label><input id="hc-${esc(h.id)}-t" name="target" type="number" inputmode="decimal" step="any" min="0.1" value="${esc(h.target)}"></div>
          <div class="field"><label for="hc-${esc(h.id)}-u">Unit</label><input id="hc-${esc(h.id)}-u" name="unit" maxlength="20" value="${esc(h.unit)}" list="nh-units"></div>
        </div>
        <div class="ha-actions"><button class="btn btn-small" type="submit">Save</button><button class="btn btn-ghost btn-small" type="button" data-cancel-edit>Cancel</button><button class="btn btn-ghost btn-small" type="button" data-remove>Remove</button></div>
      </form></li>`);
    return `<section class="card habit-admin">
        <p class="kicker">Edit habits</p>
        <p class="hint" style="margin-top:0">Choose Edit on a habit to change its name, category, target or visibility.</p>
        <p class="section-label">Coach targets</p><ul class="ha-list">${builtIn.join('')}</ul>
        <p class="section-label">${first}'s own habits</p>${own.length ? `<ul class="ha-list">${own.join('')}</ul>` : `<p class="hint">${first} hasn't added any yet.</p>`}
        <datalist id="nh-units"><option>times</option><option>minutes</option><option>pages</option><option>serves</option><option>L</option></datalist>
      </section>
      ${ctx.habitsReady ? `<section class="card habit-add"><button class="btn" type="button" data-open-add-habit aria-expanded="false" aria-controls="coach-add-habit">＋ Add habit</button>
      <form id="coach-add-habit" hidden novalidate><p class="kicker">Add a habit for ${first}</p>
        <div class="grid-2">
          <div class="field"><label for="ch-name">Habit</label><input id="ch-name" name="name" maxlength="60" placeholder="e.g. 10 minute walk after dinner" required></div>
          <div class="field"><label for="ch-cat">Category</label><select id="ch-cat" name="category">${categoryOptions('Lifestyle')}</select></div>
          <div class="field"><label for="ch-target">Daily target</label><input id="ch-target" name="target" type="number" inputmode="decimal" step="any" min="0.1" value="1"></div>
          <div class="field"><label for="ch-unit">Unit</label><input id="ch-unit" name="unit" maxlength="20" value="times" list="nh-units"></div>
        </div>
        <div class="ha-add-actions"><button class="btn" type="submit">Save habit</button><button class="btn btn-ghost" type="button" data-cancel-add>Cancel</button></div></form></section>` : ''}`;
  }

  function habitsSqlError(err) {
    const msg = String((err && err.message) || err);
    return /habit_settings|row-level security|permission denied|not saved/i.test(msg)
      ? new Error(`Habit editing needs a one-off database update. Run ${HABITS_SQL} in the Supabase SQL Editor.`)
      : err;
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
        { k: 'Own habits', v: String(ctx.habits.length), s: 'Beyond your targets' },
      ])}
      <section class="card">${habitWeekHTML(ctx, day)}</section>
      ${coachHabitEditorHTML(ctx, day)}`,
    );
    const done = (msg) => {
      invalidate(id);
      toast(msg);
      return loadCtx(id, true).then((fresh) => renderCoachHabits(fresh, nav, title, sub, day));
    };
    root.querySelectorAll('[data-edit-habit]').forEach((button) => button.addEventListener('click', () => {
      const form = document.getElementById(button.getAttribute('aria-controls'));
      const opening = form.hidden;
      root.querySelectorAll('.ha-row:not([hidden])').forEach((openForm) => {
        openForm.hidden = true;
        openForm.closest('.ha-item').querySelector('[data-edit-habit]').setAttribute('aria-expanded', 'false');
      });
      form.hidden = !opening;
      button.setAttribute('aria-expanded', String(opening));
      if (opening) form.querySelector('input[name="name"]').focus();
    }));
    root.querySelectorAll('[data-cancel-edit]').forEach((button) => button.addEventListener('click', () => {
      const form = button.closest('.ha-row');
      form.reset();
      form.hidden = true;
      form.closest('.ha-item').querySelector('[data-edit-habit]').setAttribute('aria-expanded', 'false');
    }));
    const openAdd = root.querySelector('[data-open-add-habit]');
    if (openAdd) openAdd.addEventListener('click', () => {
      const form = document.getElementById('coach-add-habit');
      form.hidden = !form.hidden;
      openAdd.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) form.querySelector('input[name="name"]').focus();
    });
    const cancelAdd = root.querySelector('[data-cancel-add]');
    if (cancelAdd) cancelAdd.addEventListener('click', () => {
      const form = document.getElementById('coach-add-habit');
      form.reset();
      form.hidden = true;
      openAdd.setAttribute('aria-expanded', 'false');
    });
    root.querySelectorAll('form[data-builtin]').forEach((form) =>
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const key = form.dataset.builtin;
        const d = readForm(form);
        if (!d.name) return toast('Give the habit a name.', true);
        const tf = HABIT_TARGET_FIELDS[key];
        const update = {
          habit_settings: { ...(ctx.targets.habit_settings || {}), [key]: { name: d.name, category: d.category, hidden: !d.show } },
        };
        if (tf) {
          const v = d[tf.field];
          if (v === null) return toast('Set a daily target.', true);
          if (tf.type === 'number' && (!Number.isFinite(v) || v < 0)) return toast('Enter a target of 0 or more.', true);
          update[tf.field] = tf.field === 'steps_target' || tf.field === 'fibre_target_g' ? Math.round(v) : v;
        }
        withBusy(form.querySelector('[type=submit]'), async () => {
          const res = await sb.from('targets').update(update).eq('client_id', id).select('client_id');
          if (res.error || !res.data.length) throw habitsSqlError(res.error || 'not saved');
          await done(`${d.name} saved.`);
        });
      }),
    );
    root.querySelectorAll('form[data-habit]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = readForm(form);
        if (!d.name) return toast('Give the habit a name.', true);
        if (!d.target || d.target <= 0) return toast('Set a daily target above 0.', true);
        withBusy(form.querySelector('[type=submit]'), async () => {
          const res = await sb.from('client_habits')
            .update({ name: d.name, category: d.category, target: d.target, unit: d.unit || 'times', icon: HABIT_CATEGORIES[d.category] })
            .eq('id', form.dataset.habit).eq('user_id', id).select('id');
          if (res.error || !res.data.length) throw habitsSqlError(res.error || 'not saved');
          await done(`${d.name} saved.`);
        });
      });
      const remove = form.querySelector('[data-remove]');
      remove.addEventListener('click', () => {
        if (!window.confirm('Remove this habit and its history from the client’s tracker?')) return;
        withBusy(remove, async () => {
          const res = await sb.from('client_habits').delete().eq('id', form.dataset.habit).eq('user_id', id).select('id');
          if (res.error || !res.data.length) throw habitsSqlError(res.error || 'not saved');
          await done('Habit removed.');
        });
      });
    });
    const add = document.getElementById('coach-add-habit');
    if (add)
      add.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = readForm(add);
        if (!d.name) return toast('Name the habit.', true);
        if (!d.target || d.target <= 0) return toast('Set a daily target above 0.', true);
        withBusy(add.querySelector('[type=submit]'), async () => {
          const res = await sb.from('client_habits').insert({ ...d, unit: d.unit || 'times', user_id: id, icon: HABIT_CATEGORIES[d.category], sort_order: ctx.habits.length });
          if (res.error) throw habitsSqlError(res.error);
          await done('Habit added.');
        });
      });
  }

  // Coach check-ins inbox. Every row is one week's check-in for one client:
  // sent and waiting on the coach's reply (To do), open and due today, past
  // its due day and not sent (Overdue), open but due tomorrow (Open), or
  // replied to (Done). Nothing here is stored; it is worked out from
  // weekly_checkins, each client's start date and check-in day.
  const INBOX = { tab: 'todo', q: '', risk: '' };

  // A rough flag so the coach knows who to look at first. High: two or more
  // missed weeks, or a low score (energy, stress or digestion 4 or under,
  // sleep under 6 hours). Medium: one missed week or a score of 5 or 6.
  function checkinRisk(missed, c) {
    const low = (v, n) => v !== null && v !== undefined && Number(v) <= n;
    if (missed >= 2 || (c && (low(c.energy, 4) || low(c.stress, 4) || low(c.digestion, 4) || (c.sleep_hours !== null && Number(c.sleep_hours) < 6)))) return 'high';
    if (missed === 1 || (c && (low(c.energy, 6) || low(c.stress, 6) || low(c.digestion, 6) || (c.sleep_hours !== null && Number(c.sleep_hours) < 7)))) return 'medium';
    return 'low';
  }

  async function renderInbox(view) {
    const [clients, targets, checkins, formsDone, formNames] = await Promise.all([
      sb.from('profiles').select('id, full_name, email, start_date').eq('role', 'client'),
      sb.from('targets').select('client_id, checkin_day'),
      sb.from('weekly_checkins').select('user_id, week_number, submitted_at, updated_at, coach_feedback, sleep_hours, stress, energy, hunger, digestion, biggest_win, biggest_struggle'),
      sb.from('form_assignments').select('id, form_id, client_id, submitted_at, reviewed_at, flagged').eq('status', 'completed'),
      sb.from('forms').select('id, name'),
    ]).then((rs) => rs.map((r, i) => (i !== 0 && i !== 2 && r.error ? [] : must(r))));
    const formName = new Map(formNames.map((f) => [f.id, f.name]));
    const today = S.today();
    const now = Date.now();
    const dayOf = new Map(targets.map((t) => [t.client_id, t.checkin_day]));
    const byClient = new Map();
    checkins.forEach((c) => {
      if (!byClient.has(c.user_id)) byClient.set(c.user_id, new Map());
      byClient.get(c.user_id).set(c.week_number, c);
    });
    const days = (from) => Math.max(0, Math.floor((now - new Date(from).getTime()) / 86400000));
    const ageText = (n) => (n === 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`);
    const short = (iso) => niceDate(iso, { day: 'numeric', month: 'short' });
    const rows = [];
    const perClient = [];
    clients.forEach((p) => {
      const sent = byClient.get(p.id) || new Map();
      const name = p.full_name || p.email || 'Client';
      const cday = dayOf.has(p.id) ? dayOf.get(p.id) : 0;
      let missed = 0;
      const items = [];
      if (p.start_date) {
        for (let week = 1; week <= S.WEEKS; week++) {
          const win = S.checkinWindow(p.start_date, week, cday);
          if (!win || win.opens > today) break;
          const c = sent.get(week);
          if (c) items.push({ week, win, c, kind: c.coach_feedback ? 'done' : 'todo' });
          else if (win.due < today) { missed += 1; items.push({ week, win, kind: 'overdue' }); }
          else items.push({ week, win, kind: win.due === today ? 'today' : 'open' });
        }
      }
      // Sent check-ins outside the dated weeks (no start date yet) still count.
      sent.forEach((c, week) => {
        if (!items.some((it) => it.week === week)) items.push({ week, win: null, c, kind: c.coach_feedback ? 'done' : 'todo' });
      });
      const latest = [...sent.values()].sort((a, b) => b.week_number - a.week_number)[0];
      const risk = checkinRisk(missed, latest);
      items.forEach((it) => rows.push({ ...it, p, name, risk }));
      // Completed forms wait here too until marked reviewed on the response.
      formsDone.filter((a) => a.client_id === p.id).forEach((a) => rows.push({
        p, name, risk, win: null,
        kind: a.reviewed_at ? 'done' : 'todo',
        label: `Form · ${formName.get(a.form_id) || 'Form'}${a.flagged ? ' · Flagged' : ''}`,
        href: `#forms/${a.form_id}/responses/${a.id}`,
        c: { submitted_at: a.submitted_at, coach_feedback: a.reviewed_at, updated_at: a.reviewed_at },
      }));
      perClient.push({ p, name, sent, missed, latest, risk, expected: items.filter((it) => it.kind !== 'open' && it.kind !== 'today').length });
    });

    const todo = rows.filter((r) => r.kind === 'todo').sort((a, b) => a.c.submitted_at.localeCompare(b.c.submitted_at));
    const dueToday = rows.filter((r) => r.kind === 'today');
    const overdue = rows.filter((r) => r.kind === 'overdue');
    const open = rows.filter((r) => r.kind === 'open');
    const done = rows.filter((r) => r.kind === 'done');
    const weekAgo = new Date(now - 7 * 86400000).toISOString();
    const sentThisWeek = rows.filter((r) => r.c && !r.href && r.c.submitted_at >= weekAgo);
    const reviewedThisWeek = sentThisWeek.filter((r) => r.c.coach_feedback);
    const oldest = todo[0];

    const stat = (k, v, sub, extra) => `<div class="ci-stat${extra || ''}"><p class="k">${k}</p><p class="v">${v}</p><p class="s">${esc(sub)}</p></div>`;
    const stats = `<div class="ci-stats">
        ${stat('Waiting on you', todo.length, todo.length ? 'Check-ins and forms to review' : 'Nothing to review')}
        ${stat('Oldest waiting', oldest ? ageText(days(oldest.c.submitted_at)) : 'None', oldest ? oldest.name : 'Queue is clear')}
        ${stat('Due today', dueToday.length, dueToday.length ? 'Not sent yet' : 'Nothing due today')}
      </div><div class="ci-stats two">
        ${stat('Overdue', overdue.length, overdue.length ? 'Past the check-in day, not sent' : 'Nothing past due')}
        ${stat('Reviewed this week', reviewedThisWeek.length, `Of ${sentThisWeek.length} submitted in the last 7 days`)}
      </div>`;

    const tabs = `<nav class="crm-tabs" aria-label="Check-ins"><a href="#inbox"${view !== 'insights' ? ' aria-current="page"' : ''}>Inbox</a><a href="#inbox/insights"${view === 'insights' ? ' aria-current="page"' : ''}>Insights</a></nav>`;
    const actions = '';
    state.coachView = { section: 'inbox', actions: '<a class="btn btn-small ci-dark" href="#forms">Send form</a>' };

    if (view === 'insights') {
      const avg = (vals) => { const v = vals.filter((x) => x !== null && x !== undefined).map(Number); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–'; };
      const replyDays = [];
      const body = perClient.sort((a, b) => a.name.localeCompare(b.name)).map((x) => {
        const list = [...x.sent.values()];
        const replied = list.filter((c) => c.coach_feedback);
        replied.forEach((c) => replyDays.push((new Date(c.updated_at) - new Date(c.submitted_at)) / 86400000));
        const recent = list.sort((a, b) => b.week_number - a.week_number).slice(0, 4);
        const rate = x.expected ? `${Math.round((Math.min(list.length, x.expected) / x.expected) * 100)}%` : '–';
        return `<tr><td><a href="#client/${x.p.id}/checkins">${esc(x.name)}</a></td><td>${list.length} of ${x.expected}</td><td>${rate}</td>
          <td>${avg(recent.map((c) => c.energy))}</td><td>${avg(recent.map((c) => c.stress))}</td><td>${avg(recent.map((c) => c.sleep_hours))}</td>
          <td><span class="ci-risk ${x.risk}">${x.risk[0].toUpperCase() + x.risk.slice(1)}</span></td></tr>`;
      });
      const avgReply = replyDays.length ? replyDays.reduce((a, b) => a + b, 0) / replyDays.length : null;
      const totalExpected = perClient.reduce((a, x) => a + x.expected, 0);
      const totalSent = perClient.reduce((a, x) => a + Math.min(x.sent.size, x.expected), 0);
      shell('Check-ins', 'How check-ins are going across your clients', `${actions}${tabs}
        <div class="ci-stats">
          ${stat('Submission rate', totalExpected ? `${Math.round((totalSent / totalExpected) * 100)}%` : '–', `${totalSent} of ${totalExpected} check-ins that were due`)}
          ${stat('Average reply time', avgReply === null ? '–' : avgReply < 1 ? 'Same day' : `${avgReply.toFixed(1)} days`, 'From sent to your feedback')}
          ${stat('Clients at high risk', perClient.filter((x) => x.risk === 'high').length, 'Missed weeks or low scores')}
        </div>
        ${body.length ? `<div class="card table-card"><div class="table-wrap"><table class="crm-table"><thead><tr><th>Client</th><th>Sent</th><th>On record</th><th>Energy (last 4)</th><th>Stress (last 4, 10 = low)</th><th>Sleep h (last 4)</th><th>Risk</th></tr></thead><tbody>${body.join('')}</tbody></table></div></div>` : '<div class="card"><p>No clients yet.</p></div>'}
        <p class="hint">Risk is a rough flag. High means two or more missed check-ins, or a latest score of 4 or under (or under 6 hours of sleep). Medium means one missed check-in, or a latest score of 5 or 6 (or under 7 hours of sleep).</p>`);
      return;
    }

    const lists = { todo, today: dueToday, overdue, open, done };
    const TABS = [['todo', 'To do'], ['today', 'Due today'], ['overdue', 'Overdue'], ['open', 'Open'], ['done', 'Done']];
    const head = `${actions}${tabs}${stats}
      <div class="ci-filters">
        <label class="ci-search"><span class="sr-only">Search client or email</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Search client or email" value="${esc(INBOX.q)}" data-ci-q></label>
        <div class="ci-seg" role="tablist" aria-label="Show">${TABS.map(([k, l]) => `<button type="button" role="tab" data-ci-tab="${k}" aria-selected="${INBOX.tab === k}">${l} <b>${lists[k].length}</b></button>`).join('')}</div>
        <label class="ci-select"><span class="sr-only">Risk</span><select data-ci-risk><option value="">Risk: all</option><option value="high"${INBOX.risk === 'high' ? ' selected' : ''}>High</option><option value="medium"${INBOX.risk === 'medium' ? ' selected' : ''}>Medium</option><option value="low"${INBOX.risk === 'low' ? ' selected' : ''}>Low</option></select></label>
      </div>
      <div class="card table-card ci-table" data-ci-table></div>`;
    shell('Check-ins', todo.length ? `${todo.length} waiting on you` : 'Nothing waiting on you', head);

    const box = root.querySelector('[data-ci-table]');
    const PER = 10;
    let page = 0;
    const draw = () => {
      const q = INBOX.q.trim().toLowerCase();
      const list = lists[INBOX.tab].filter((r) => (!q || `${r.name} ${r.p.email || ''}`.toLowerCase().includes(q)) && (!INBOX.risk || r.risk === INBOX.risk));
      const pages = Math.max(1, Math.ceil(list.length / PER));
      page = Math.min(page, pages - 1);
      const shown = list.slice(page * PER, page * PER + PER);
      const rowHTML = (r) => {
        const age = r.kind === 'todo' ? ageText(days(r.c.submitted_at)) : r.kind === 'overdue' ? `${ageText(S.daysBetween(r.win.due, today))} late` : '–';
        const href = r.href || `#client/${r.p.id}/checkins`;
        return `<tr data-href="${href}" tabindex="0"><td><a href="${href}"><b>${esc(r.name)}</b></a><span class="ci-sub">${r.label ? esc(r.label) : `Week ${r.week}`}${r.p.email ? ` · ${esc(r.p.email)}` : ''}</span></td>
          <td>${r.win ? esc(short(r.win.due)) : '–'}</td>
          <td>${r.c ? esc(new Date(r.c.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })) : '<span class="ci-muted">Not yet</span>'}</td>
          <td>${r.c && r.c.coach_feedback ? esc(new Date(r.c.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })) : '<span class="ci-muted">–</span>'}</td>
          <td>${age}</td><td><span class="ci-risk ${r.risk}">${r.risk[0].toUpperCase() + r.risk.slice(1)}</span></td></tr>`;
      };
      const empty = {
        todo: ['Nothing to reply to', 'Weekly check-ins land here until you reply. Completed forms land here until you mark them reviewed.'],
        today: ['Nothing due today', 'Clients whose check-in day is today show here until they send it.'],
        overdue: ['Nothing overdue', 'Check-ins past their day that were never sent show here.'],
        open: ['Nothing open', 'Check-ins open the day before each client’s check-in day.'],
        done: ['No replies yet', 'Check-ins you have replied to, and forms you marked reviewed, show here.'],
      }[INBOX.tab];
      const filtered = lists[INBOX.tab].length && !list.length;
      box.innerHTML = `<div class="table-wrap"><table class="crm-table"><thead><tr><th>Client</th><th>Due</th><th>Submitted</th><th>Responded</th><th>Ageing</th><th>Risk</th></tr></thead>
        <tbody>${shown.map(rowHTML).join('')}</tbody></table></div>
        ${list.length ? '' : `<div class="ci-empty"><span class="ci-empty-icon" aria-hidden="true">${ICONS.checkin}</span><p class="t">${filtered ? 'No matches' : clients.length ? empty[0] : 'No clients yet'}</p><p>${filtered ? 'Try a different search or risk filter.' : clients.length ? empty[1] : 'Add a client in Supabase and their check-ins land here.'}</p></div>`}
        <div class="pager"><span>Showing ${list.length ? page * PER + 1 : 0}–${Math.min(list.length, page * PER + PER)} of ${list.length}</span><span class="pager-btns"><button type="button" class="btn btn-ghost btn-small" data-prev aria-label="Previous page"${page === 0 ? ' disabled' : ''}>‹</button><button type="button" class="btn btn-ghost btn-small" data-next aria-label="Next page"${page >= pages - 1 ? ' disabled' : ''}>›</button></span></div>`;
      box.querySelector('[data-prev]').addEventListener('click', () => { page -= 1; draw(); });
      box.querySelector('[data-next]').addEventListener('click', () => { page += 1; draw(); });
      box.querySelectorAll('tr[data-href]').forEach((tr) => {
        tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === tr) location.hash = tr.dataset.href; });
      });
    };
    root.querySelectorAll('[data-ci-tab]').forEach((b) => b.addEventListener('click', () => {
      INBOX.tab = b.dataset.ciTab;
      page = 0;
      root.querySelectorAll('[data-ci-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      draw();
    }));
    root.querySelector('[data-ci-q]').addEventListener('input', (e) => { INBOX.q = e.target.value; page = 0; draw(); });
    root.querySelector('[data-ci-risk]').addEventListener('change', (e) => { INBOX.risk = e.target.value; page = 0; draw(); });
    draw();
  }

  // ---------------------------------------------------------------- coach

  const ROSTER = { tab: 'active', q: '', day: '', eng: '', trend: '', tag: '', page: 0 };
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const PAY_SCHEDULES = [['none', 'Not set'], ['one_off', 'One-off'], ['three_payments', '3 payments'], ['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly']];
  const PAY_LABEL = Object.fromEntries(PAY_SCHEDULES);

  // Everything the Clients and Insights tabs need, worked out once.
  async function rosterData() {
    const since = S.addDays(S.today(), -35);
    const [clients, logs, checkins, days, admin, msgs] = await Promise.all([
      sb.from('profiles').select('*').eq('role', 'client').order('full_name'),
      sb.from('daily_logs').select('user_id, day, weight_kg').gte('day', since).order('day'),
      sb.from('weekly_checkins').select('user_id, week_number, submitted_at, coach_feedback'),
      sb.from('targets').select('client_id, checkin_day'),
      sb.from('client_admin').select('*'),
      sb.from('messages').select('client_id, sender_id, created_at, read_at').is('read_at', null),
    ]);
    [clients, logs, checkins].forEach(must);
    const dayOf = new Map((days.error ? [] : days.data).map((t) => [t.client_id, t.checkin_day]));
    const adminOf = new Map((admin.error ? [] : admin.data).map((a) => [a.client_id, a]));
    const now = S.today();
    const rows = clients.data.map((c) => {
      const mine = logs.data.filter((l) => l.user_id === c.id);
      const last = mine.length ? mine[mine.length - 1].day : null;
      const daysSince = last ? S.daysBetween(last, now) : null;
      const week7 = mine.filter((l) => S.daysBetween(l.day, now) < 7).length;
      const ad = adminOf.get(c.id) || { status: 'active', tags: [], payment_schedule: 'none' };
      const status = ad.status === 'inactive' ? 'inactive' : c.consent_at ? 'active' : 'invited';
      const week = S.currentWeek(c.start_date);
      const cday = dayOf.has(c.id) ? dayOf.get(c.id) : 0;
      // Weight: this week's average against the week before.
      const avg = (from, to) => { const w = mine.filter((l) => l.weight_kg !== null && S.daysBetween(l.day, now) >= from && S.daysBetween(l.day, now) < to).map((l) => Number(l.weight_kg)); return w.length ? w.reduce((x, y) => x + y, 0) / w.length : null; };
      const wNow = avg(0, 7);
      const wPrev = avg(7, 14);
      const change = wNow !== null && wPrev !== null ? wNow - wPrev : null;
      const trend = change === null ? '' : change <= -0.2 ? 'down' : change >= 0.2 ? 'up' : 'flat';
      const latestW = [...mine].reverse().find((l) => l.weight_kg !== null);
      let eng = 'new';
      if (status === 'invited') eng = 'invited';
      else if (week) eng = week7 >= 5 ? 'good' : week7 >= 3 ? 'watch' : 'behind';
      // Next check-in due from today on.
      let next = null;
      for (let wk = Math.max(1, week || 1); wk <= S.WEEKS && !next; wk++) {
        const win = S.checkinWindow(c.start_date, wk, cday);
        if (win && win.due >= now) next = win;
      }
      // Missed check-ins and unanswered messages, for the at-risk list.
      const sent = new Set(checkins.data.filter((x) => x.user_id === c.id).map((x) => x.week_number));
      let missedRun = 0;
      for (let wk = (week || 0); wk >= 1; wk--) {
        const win = S.checkinWindow(c.start_date, wk, cday);
        if (!win || win.due >= now) continue;
        if (sent.has(wk)) break;
        missedRun += 1;
      }
      const waiting = (msgs.error ? [] : msgs.data).filter((m) => m.client_id === c.id && m.sender_id !== c.id && S.daysBetween(m.created_at.slice(0, 10), now) >= 3).length;
      const signals = [];
      if (status === 'active' && week && (daysSince === null || daysSince >= 4)) signals.push(daysSince === null ? 'No logs yet' : `Stopped logging (${daysSince} days)`);
      if (missedRun >= 2) signals.push(`Missed ${missedRun} check-ins in a row`);
      else if (missedRun === 1) signals.push('Missed last check-in');
      if (waiting) signals.push('Left your message unanswered');
      if (eng === 'behind') signals.push('Engagement dropped');
      const risk = status !== 'active' ? '' : signals.length >= 2 || missedRun >= 2 ? 'high' : signals.length ? 'medium' : '';
      return { c, ad, name: c.full_name || c.email || 'Client', status, eng, trend, change, latestW, next, cday, week, last, daysSince, signals, risk };
    });
    return { rows, allTags: [...new Set(rows.flatMap((r) => r.ad.tags || []))].sort(), adminReady: !admin.error };
  }

  async function renderClients(view) {
    state.coachView = {
      section: 'clients',
      actions: `<button type="button" class="btn btn-ghost btn-small cl-how" data-how>How client invitations work</button><button type="button" class="btn btn-small ci-dark" data-add-client>+ Add Client</button>`,
    };
    const data = await rosterData();
    const tabs = `<nav class="crm-tabs" aria-label="Clients"><a href="#clients"${view !== 'insights' ? ' aria-current="page"' : ''}>Clients</a><a href="#clients/insights"${view === 'insights' ? ' aria-current="page"' : ''}>Insights</a></nav>`;
    if (view === 'insights') renderClientInsights(data, tabs);
    else renderRoster(data, tabs);
    root.querySelector('[data-add-client]').addEventListener('click', () => addClientModal(data));
    root.querySelector('[data-how]').addEventListener('click', howInvitesWork);
  }

  const ENG_LABEL = { good: 'Good', watch: 'Watch', behind: 'Behind', new: 'Not started', invited: 'Invited' };

  function renderRoster(data, tabs) {
    const { rows, allTags } = data;
    const count = (k) => rows.filter((r) => r.status === k).length;
    shell('Clients', 'Your roster, active and inactive, in one place', `${tabs}
      <div class="ci-filters">
        <label class="ci-search"><span class="sr-only">Search clients</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Search clients" value="${esc(ROSTER.q)}" data-r-q></label>
        <div class="ci-seg" role="tablist" aria-label="Status">${[['active', 'Active'], ['invited', 'Invited'], ['inactive', 'Inactive']].map(([k, l]) => `<button type="button" role="tab" data-r-tab="${k}" aria-selected="${ROSTER.tab === k}">${l} <b>${count(k)}</b></button>`).join('')}</div>
        <label class="ci-select"><span class="sr-only">Check-in day</span><select data-r="day"><option value="">Check-in day</option>${DAY_NAMES.map((d, i) => `<option value="${i}"${ROSTER.day === String(i) ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="ci-select"><span class="sr-only">Engagement</span><select data-r="eng"><option value="">Engagement</option>${['good', 'watch', 'behind', 'new'].map((k) => `<option value="${k}"${ROSTER.eng === k ? ' selected' : ''}>${ENG_LABEL[k]}</option>`).join('')}</select></label>
        <label class="ci-select"><span class="sr-only">Weight trend</span><select data-r="trend"><option value="">Weight trend</option>${[['down', 'Going down'], ['flat', 'Steady'], ['up', 'Going up']].map(([k, l]) => `<option value="${k}"${ROSTER.trend === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="ci-select"><span class="sr-only">Tags</span><select data-r="tag"${allTags.length ? '' : ' disabled'}><option value="">Tags</option>${allTags.map((t) => `<option${ROSTER.tag === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      </div>
      <div class="card table-card ci-table" data-r-table></div>`);
    const box = root.querySelector('[data-r-table]');
    const PER = 10;
    const draw = () => {
      const q = ROSTER.q.trim().toLowerCase();
      const list = rows.filter((r) => r.status === ROSTER.tab
        && (!q || `${r.name} ${r.c.email || ''} ${(r.ad.tags || []).join(' ')}`.toLowerCase().includes(q))
        && (ROSTER.day === '' || String(r.cday) === ROSTER.day)
        && (!ROSTER.eng || r.eng === ROSTER.eng)
        && (!ROSTER.trend || r.trend === ROSTER.trend)
        && (!ROSTER.tag || (r.ad.tags || []).includes(ROSTER.tag)));
      const pages = Math.max(1, Math.ceil(list.length / PER));
      ROSTER.page = Math.min(ROSTER.page, pages - 1);
      const shown = list.slice(ROSTER.page * PER, ROSTER.page * PER + PER);
      const arrow = { down: '↓', up: '↑', flat: '→' };
      const rowHTML = (r) => `<tr data-href="#client/${r.c.id}/overview" tabindex="0">
          <td><a href="#client/${r.c.id}/overview"><b>${esc(r.name)}</b></a><span class="ci-sub">${esc(r.c.email || '')}${r.week ? ` · Week ${r.week} of 12` : ''}</span></td>
          <td><span class="cl-eng ${r.eng}">${ENG_LABEL[r.eng]}</span></td>
          <td>${r.latestW ? `${fmt(r.latestW.weight_kg, 1)} kg${r.trend ? ` <span class="cl-trend ${r.trend}" title="Weekly average ${signed(r.change, 1)} kg">${arrow[r.trend]} ${signed(r.change, 1)}</span>` : ''}` : '<span class="ci-muted">–</span>'}</td>
          <td>${r.ad.payment_amount ? `$${esc(Number(r.ad.payment_amount).toLocaleString('en-AU'))}${r.ad.payment_schedule !== 'none' ? ` <span class="ci-sub">${esc(PAY_LABEL[r.ad.payment_schedule] || '')}</span>` : ''}` : r.ad.payment_schedule && r.ad.payment_schedule !== 'none' ? esc(PAY_LABEL[r.ad.payment_schedule]) : '<span class="ci-muted">–</span>'}</td>
          <td>${r.next ? `${esc(niceDate(r.next.due, { weekday: 'short', day: 'numeric', month: 'short' }))}` : `<span class="ci-muted">${r.c.start_date ? 'Program done' : 'No start date'}</span>`}</td>
          <td><span class="cl-tags">${(r.ad.tags || []).map((t) => `<span class="cl-tag">${esc(t)}</span>`).join('')}</span></td>
          <td class="cl-act">${r.status === 'invited' ? `<button type="button" class="btn btn-ghost btn-small" data-invite="${r.c.id}">Send invite</button>` : ''}
            ${data.adminReady ? `<button type="button" class="btn btn-ghost btn-small" data-status="${r.c.id}">${r.status === 'inactive' ? 'Make active' : 'Make inactive'}</button>` : ''}</td>
        </tr>`;
      const empty = rows.length
        ? { active: 'No active clients match.', invited: 'Nobody is waiting to sign in.', inactive: 'No inactive clients.' }[ROSTER.tab]
        : 'You have not added any clients yet.';
      box.innerHTML = `<div class="table-wrap"><table class="crm-table"><thead><tr><th>Name</th><th>Engagement</th><th>Weight</th><th>Payment</th><th>Next check-in</th><th>Tags</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${shown.map(rowHTML).join('')}</tbody></table></div>
        ${list.length ? '' : `<div class="ci-empty"><span class="ci-empty-icon" aria-hidden="true">${ICONS.profile}</span><p class="t">${esc(empty)}</p>${rows.length ? '' : '<button type="button" class="btn btn-ghost btn-small" data-add-client-empty>+ Add Client</button>'}</div>`}
        <div class="pager"><span>Showing ${list.length ? ROSTER.page * PER + 1 : 0}–${Math.min(list.length, ROSTER.page * PER + PER)} of ${list.length}</span><span class="pager-btns"><button type="button" class="btn btn-ghost btn-small" data-prev aria-label="Previous page"${ROSTER.page === 0 ? ' disabled' : ''}>‹</button><button type="button" class="btn btn-ghost btn-small" data-next aria-label="Next page"${ROSTER.page >= pages - 1 ? ' disabled' : ''}>›</button></span></div>`;
      box.querySelector('[data-prev]').addEventListener('click', () => { ROSTER.page -= 1; draw(); });
      box.querySelector('[data-next]').addEventListener('click', () => { ROSTER.page += 1; draw(); });
      const addEmpty = box.querySelector('[data-add-client-empty]');
      if (addEmpty) addEmpty.addEventListener('click', () => addClientModal(data));
      box.querySelectorAll('tr[data-href]').forEach((tr) => {
        tr.addEventListener('click', (e) => { if (!e.target.closest('a, button')) location.hash = tr.dataset.href; });
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === tr) location.hash = tr.dataset.href; });
      });
      box.querySelectorAll('[data-invite]').forEach((b) => b.addEventListener('click', () => {
        const r = rows.find((x) => x.c.id === b.dataset.invite);
        inviteModal({ id: r.c.id, full_name: r.name, email: r.c.email, phone: r.c.phone });
      }));
      box.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
        const r = rows.find((x) => x.c.id === b.dataset.status);
        const next = r.status === 'inactive' ? 'active' : 'inactive';
        if (next === 'inactive' && !window.confirm(`Move ${r.name} to Inactive? Their data and login are kept; you can make them active again.`)) return;
        try {
          must(await sb.from('client_admin').upsert({ client_id: r.c.id, status: next }, { onConflict: 'client_id' }));
          toast(next === 'inactive' ? `${r.name} moved to Inactive.` : `${r.name} is active again.`);
          route();
        } catch (err) {
          toast(friendlyError(err), true);
        }
      }));
    };
    root.querySelectorAll('[data-r-tab]').forEach((b) => b.addEventListener('click', () => {
      ROSTER.tab = b.dataset.rTab;
      ROSTER.page = 0;
      root.querySelectorAll('[data-r-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      draw();
    }));
    root.querySelector('[data-r-q]').addEventListener('input', (e) => { ROSTER.q = e.target.value; ROSTER.page = 0; draw(); });
    root.querySelectorAll('select[data-r]').forEach((sel) => sel.addEventListener('change', () => { ROSTER[sel.dataset.r] = sel.value; ROSTER.page = 0; draw(); }));
    draw();
  }

  function renderClientInsights(data, tabs) {
    const { rows } = data;
    const now = S.today();
    const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
    const joinedOn = (r) => (r.ad.invited_at || r.c.created_at || '').slice(0, 10);
    const leftOn = (r) => (r.status === 'inactive' && r.ad.inactive_at ? r.ad.inactive_at.slice(0, 10) : null);
    const from3 = monthsAgo(3);
    const active = rows.filter((r) => r.status === 'active');
    const joined3 = rows.filter((r) => joinedOn(r) >= from3).length;
    const left3 = rows.filter((r) => leftOn(r) && leftOn(r) >= from3).length;
    const activeAtStart = rows.filter((r) => joinedOn(r) < from3 && !(leftOn(r) && leftOn(r) < from3)).length;
    const tenureMonths = (r) => (r.c.start_date ? Math.max(0, S.daysBetween(r.c.start_date, leftOn(r) || now) / 30.44) : null);
    const tenures = active.map(tenureMonths).filter((x) => x !== null);
    const avgTenure = tenures.length ? tenures.reduce((a, b) => a + b, 0) / tenures.length : null;
    const old6 = rows.filter((r) => r.c.start_date && r.c.start_date <= monthsAgo(6));
    const kept6 = old6.filter((r) => r.status === 'active' || (leftOn(r) && tenureMonths(r) >= 6)).length;
    const atRisk = rows.filter((r) => r.risk);
    const stat = (k, v, sub) => `<div class="ci-stat"><p class="k">${k}</p><p class="v">${v}</p><p class="s">${esc(sub)}</p></div>`;
    // Joined and left per month, last 6 months.
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return d.toISOString().slice(0, 7); });
    const perMonth = months.map((m) => ({ m, j: rows.filter((r) => joinedOn(r).startsWith(m)).length, l: rows.filter((r) => (leftOn(r) || '').startsWith(m)).length }));
    const peak = Math.max(1, ...perMonth.map((x) => Math.max(x.j, x.l)));
    const bars = perMonth.map((x) => `<div class="cl-bar"><div class="cl-bar-pair"><span class="j" style="height:${(x.j / peak) * 100}%" title="${x.j} joined"></span><span class="l" style="height:${(x.l / peak) * 100}%" title="${x.l} left"></span></div><small>${new Date(`${x.m}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short' })}</small></div>`).join('');
    const buckets = [['<1 mo', 0, 1], ['1–3 mo', 1, 3], ['3–6 mo', 3, 6], ['6–12 mo', 6, 12], ['1 yr+', 12, Infinity]].map(([l, a, b]) => [l, tenures.filter((t) => t >= a && t < b).length]);
    const riskRows = atRisk.sort((a, b) => (a.risk === b.risk ? 0 : a.risk === 'high' ? -1 : 1)).map((r) => `<tr data-href="#client/${r.c.id}/overview" tabindex="0">
        <td><a href="#client/${r.c.id}/overview"><b>${esc(r.name)}</b></a></td>
        <td><span class="ci-risk ${r.risk === 'high' ? 'high' : 'medium'}">${r.risk === 'high' ? 'High' : 'Medium'}</span></td>
        <td><span class="cl-eng ${r.eng}">${ENG_LABEL[r.eng]}</span></td>
        <td>${r.signals.map((x) => `<span class="cl-tag">${esc(x)}</span>`).join(' ')}</td>
        <td>${r.last ? esc(r.daysSince === 0 ? 'Today' : r.daysSince === 1 ? 'Yesterday' : `${r.daysSince} days ago`) : '<span class="ci-muted">Never</span>'}</td>
        <td><a class="btn btn-ghost btn-small" href="#messages/${r.c.id}">Message</a></td></tr>`).join('');
    shell('Clients', 'How your roster is holding up', `${tabs}
      <div class="ci-stats cl-six">
        ${stat('Active clients', active.length, `Joined ${joined3}, left ${left3} in 3 months`)}
        ${stat('Churn rate', activeAtStart ? `${Math.round((left3 / activeAtStart) * 100)}%` : '–', activeAtStart ? `${left3} of ${activeAtStart} left in 3 months` : 'Not enough history yet')}
        ${stat('Average tenure', avgTenure === null ? '–' : avgTenure < 1 ? `${Math.round(avgTenure * 4.35)} wks` : `${avgTenure.toFixed(1)} mo`, 'Active clients, from their start date')}
        ${stat('New clients', `${(joined3 / 3).toFixed(joined3 % 3 ? 1 : 0)} / mo`, 'Average over the last 3 months')}
        ${stat('Retained', old6.length ? `${Math.round((kept6 / old6.length) * 100)}%` : '–', old6.length ? `At 6 months · ${kept6} of ${old6.length}` : 'Shows once clients reach 6 months')}
        ${stat('At risk', atRisk.length, atRisk.length ? `${atRisk.filter((r) => r.risk === 'high').length} high` : 'Nobody flagged')}
      </div>
      <div class="cl-grid">
        <section class="card cl-card"><div class="cl-card-h"><b>Joined and left per month</b><span class="cl-legend"><i class="j"></i>Joined <i class="l"></i>Left</span></div><p class="hint">Last 6 months</p>
          ${perMonth.some((x) => x.j || x.l) ? `<div class="cl-bars">${bars}</div>` : '<p class="cl-none">Nobody joined or left in this window.</p>'}</section>
        <section class="card cl-card"><div class="cl-card-h"><b>Why clients are flagged</b></div><p class="hint">${atRisk.length} at risk now</p>
          ${['Stopped logging', 'Missed', 'Left your message unanswered', 'Engagement dropped'].map((k) => { const n = atRisk.filter((r) => r.signals.some((x) => x.startsWith(k))).length; return `<div class="cl-sig"><span>${k === 'Missed' ? 'Missed check-ins' : k}</span><b>${n}</b></div>`; }).join('')}</section>
        <section class="card cl-card"><div class="cl-card-h"><b>Tenure of active clients</b></div><p class="hint">${tenures.length} active with a start date</p>
          <div class="cl-buckets">${buckets.map(([l, n]) => `<div><small>${l}</small><b>${n}</b></div>`).join('')}</div></section>
      </div>
      <section class="card cl-how-card"><b>How the at-risk list works</b>
        <p>Each active client is checked against four signals: stopped logging (4 days or more), missed check-ins, your message unanswered for 3 days or more, and fewer than 3 days logged this week. One signal lists them as Medium; two or more, or two missed check-ins in a row, as High. It is a rule of thumb from your own data, not a prediction.</p></section>
      <h2 class="cl-h2">Clients at risk of leaving <small>${atRisk.length} listed</small></h2>
      <div class="card table-card"><div class="table-wrap"><table class="crm-table"><thead><tr><th>Client</th><th>Likelihood</th><th>Engagement</th><th>Signals</th><th>Last active</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${riskRows}</tbody></table></div>
        ${atRisk.length ? '' : `<div class="ci-empty"><p class="t">Nobody looks like leaving.</p><p>No signal lists any of your ${active.length} active clients.</p></div>`}</div>`);
    root.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a, button')) location.hash = tr.dataset.href; }));
  }

  // A small modal on the coach side (same look as the Forms dialogs).
  function crmDialog(html) {
    const back = document.createElement('div');
    back.className = 'f-back';
    back.innerHTML = html;
    document.body.appendChild(back);
    const box = back.firstElementChild;
    const before = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (before && before.focus) before.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    const first = box.querySelector('input, select, textarea, button');
    if (first) first.focus();
    return { box, close };
  }

  function howInvitesWork() {
    crmDialog(`<div class="fm cl-modal cl-how-modal" role="dialog" aria-modal="true" aria-labelledby="how-h">
      <div class="fm-head"><h2 id="how-h">How client invitations work</h2><button type="button" class="fm-x" data-close aria-label="Close">✕</button></div>
      <ol class="cl-steps">
        <li><b>Add Client</b> creates their login with the email you enter. No Supabase steps.</li>
        <li><b>Send the invite.</b> Copy the message, or open it in WhatsApp, and send it to them. It has the app link and the email to sign in with.</li>
        <li><b>They sign in</b> with a code emailed to them, agree to the privacy notice and fill in their profile. Until then they sit under <b>Invited</b>.</li>
        <li>Any forms you picked are waiting on their Home screen the first time they open the app.</li>
      </ol>
      <p class="fm-help">Sign-in codes are emailed by Supabase, so Resend needs to be set up in Supabase before clients can sign in.</p>
      <div class="fm-foot"><button type="button" class="f-btn f-dark" data-close>Got it</button></div></div>`);
  }

  function inviteText(c) {
    const first = (c.full_name || '').split(' ')[0] || 'there';
    return `Hi ${first}, welcome to Rewired Coaching! Your coaching app is ready: ${location.origin}/app/\n\nSign in with ${c.email} and the code that gets emailed to you. Save it to your home screen so it works like an app.\n\nAny questions, message me here. ${COACH}`;
  }

  function inviteModal(c, fresh) {
    const text = inviteText(c);
    const digits = String(c.phone || '').replace(/[^\d]/g, '');
    const d = crmDialog(`<div class="fm cl-modal" role="dialog" aria-modal="true" aria-labelledby="inv-h">
      <div class="fm-head"><h2 id="inv-h">${fresh ? 'Client added' : 'Send invite'}</h2><button type="button" class="fm-x" data-close aria-label="Close">✕</button></div>
      <p class="cl-lead">${fresh ? `<b>${esc(c.full_name)}</b> has a login now. ` : ''}Send ${esc((c.full_name || '').split(' ')[0] || 'them')} this message so they can sign in.</p>
      <textarea class="cl-invite" rows="7" readonly>${esc(text)}</textarea>
      <div class="fm-foot cl-inv-foot">
        ${digits ? `<a class="f-btn" href="https://wa.me/${digits}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Open in WhatsApp</a>` : ''}
        <button type="button" class="f-btn f-dark" data-copy>Copy message</button>
      </div></div>`);
    d.box.querySelector('[data-copy]').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(text);
        e.target.textContent = 'Copied';
      } catch (err) {
        const ta = d.box.querySelector('textarea');
        ta.focus();
        ta.select();
        e.target.textContent = 'Press Ctrl+C to copy';
      }
    });
  }

  async function addClientModal(data, prospect = null) {
    const forms = await sb.from('forms').select('id, name, category, is_default, published_version_id, archived_at').order('name');
    const live = forms.error ? [] : forms.data.filter((f) => f.published_version_id && !f.archived_at);
    const formSelect = (cat, label, id) => {
      const list = live.filter((f) => f.category === cat);
      const def = list.find((f) => f.is_default);
      return `<label class="fb-field cl-f"><span>${label}</span><span class="fb-select"><select id="${id}"><option value="">None</option>${list.map((f) => `<option value="${f.id}"${def && def.id === f.id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select></span></label>`;
    };
    let tags = [...(prospect?.tags || [])];
    const d = crmDialog(`<form class="fm cl-modal cl-add" role="dialog" aria-modal="true" aria-labelledby="add-h" novalidate>
      <div class="fm-head"><h2 id="add-h" class="cl-title">Add Client</h2><button type="button" class="fm-x" data-close aria-label="Close">✕</button></div>
      <div class="cl-cols">
        <div>
          <p class="cl-k">Client</p>
          <div class="cl-two"><label class="fb-field cl-f"><span>First name</span><input id="ac-first" maxlength="60" autocomplete="off" placeholder="John" value="${esc(prospect?.first_name || '')}" required></label>
            <label class="fb-field cl-f"><span>Last name</span><input id="ac-last" maxlength="60" autocomplete="off" placeholder="Smith" value="${esc(prospect?.last_name || '')}"></label></div>
          <div class="cl-two"><label class="fb-field cl-f"><span>Email address</span><input id="ac-email" type="email" maxlength="254" autocomplete="off" placeholder="john@email.com" value="${esc(prospect?.email || '')}" required></label>
            <label class="fb-field cl-f"><span>Phone number</span><span class="cl-phone"><select id="ac-cc" aria-label="Country code"><option value="+61">🇦🇺 +61</option><option value="+64">🇳🇿 +64</option><option value="+44">🇬🇧 +44</option><option value="+1">🇺🇸 +1</option><option value="+91">🇮🇳 +91</option><option value="">Other</option></select><input id="ac-phone" type="tel" maxlength="20" autocomplete="off" placeholder="400 000 000" value="${esc(prospect?.phone || '')}"></span></label></div>
          <p class="cl-k">Payment</p>
          <div class="cl-two"><label class="fb-field cl-f"><span>Payment amount (AUD)</span><input id="ac-amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="750" value="${prospect?.deal_value ?? ''}"></label>
            <label class="fb-field cl-f"><span>Payment schedule</span><span class="fb-select"><select id="ac-sched">${PAY_SCHEDULES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></span></label></div>
          <p class="fm-help">For your records. It doesn’t charge the client.</p>
        </div>
        <div>
          <p class="cl-k">Check-ins</p>
          <label class="fb-field cl-f"><span>Check-in day</span><span class="fb-select"><select id="ac-day">${DAY_NAMES.map((n, i) => `<option value="${i}"${i === 0 ? ' selected' : ''}>${n}</option>`).join('')}</select></span></label>
          <p class="fm-help">Weekly. The check-in opens the day before.</p>
          <p class="cl-k">Forms</p>
          ${formSelect('Onboarding', 'Onboarding form', 'ac-f-onb')}
          ${formSelect('Contract', 'Contract', 'ac-f-con')}
          ${formSelect('Health screen', 'Health screen', 'ac-f-hs')}
          ${live.length ? '<p class="fm-help">Waiting on their Home screen when they first sign in.</p>' : '<p class="fm-help">Publish a form in Forms to send it here.</p>'}
        </div>
        <div>
          <p class="cl-k">Tags &amp; notes</p>
          <label class="fb-field cl-f"><span>Tags</span><span class="cl-tagbox"><span class="cl-tagchips"></span><input id="ac-tag" list="ac-tags" maxlength="40" placeholder="Type a tag, press Enter"></span></label>
          <datalist id="ac-tags">${data.allTags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
          <label class="fb-field cl-f"><span>Notes <small class="cl-count" data-count>0/2000</small></span><textarea id="ac-notes" rows="8" maxlength="2000" placeholder="Anything you want to remember about this client. Only you see this.">${esc(prospect?.notes || '')}</textarea></label>
        </div>
      </div>
      <p class="fm-err" role="alert"></p>
      <div class="fm-foot"><button type="button" class="f-btn" data-close>Cancel</button><button type="submit" class="f-btn f-dark" data-save disabled>Save</button></div>
    </form>`);
    const box = d.box;
    const $ = (id) => box.querySelector(`#${id}`);
    const save = box.querySelector('[data-save]');
    const err = box.querySelector('.fm-err');
    const valid = () => $('ac-first').value.trim() && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test($('ac-email').value.trim());
    box.addEventListener('input', () => { save.disabled = !valid(); });
    $('ac-notes').addEventListener('input', (e) => { box.querySelector('[data-count]').textContent = `${e.target.value.length}/2000`; });
    const drawTags = () => {
      box.querySelector('.cl-tagchips').innerHTML = tags.map((t, i) => `<span class="cl-tag">${esc(t)}<button type="button" data-untag="${i}" aria-label="Remove ${esc(t)}">✕</button></span>`).join('');
    };
    const addTag = () => {
      const t = $('ac-tag').value.trim().slice(0, 40);
      if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase()) && tags.length < 20) tags.push(t);
      $('ac-tag').value = '';
      drawTags();
    };
    $('ac-tag').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
      else if (e.key === 'Backspace' && !$('ac-tag').value && tags.length) { tags.pop(); drawTags(); }
    });
    $('ac-tag').addEventListener('change', addTag);
    box.querySelector('.cl-tagchips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-untag]');
      if (b) { tags.splice(Number(b.dataset.untag), 1); drawTags(); }
    });
    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!valid() || save.disabled) return;
      if ($('ac-tag').value.trim()) addTag();
      save.disabled = true;
      save.textContent = 'Adding…';
      err.textContent = '';
      const rawPhone = $('ac-phone').value.trim();
      const phone = rawPhone ? (rawPhone.startsWith('+') || !$('ac-cc').value ? rawPhone : `${$('ac-cc').value} ${rawPhone.replace(/^0/, '')}`) : '';
      try {
        const res = await (window.REWIRED_PREVIEW_FETCH || fetch)('/.netlify/functions/add-client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
          body: JSON.stringify({ first_name: $('ac-first').value.trim(), last_name: $('ac-last').value.trim(), email: $('ac-email').value.trim(), phone }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || (res.status === 404 ? 'Adding clients isn’t switched on yet. Add the Netlify keys and redeploy.' : 'Couldn’t add the client.'));
        const id = out.id;
        // The login exists now; the rest is saved as the coach.
        const problems = [];
        const amount = $('ac-amount').value;
        const ad = await sb.from('client_admin').upsert({
          client_id: id, tags, notes: $('ac-notes').value.trim() || null,
          payment_amount: amount === '' ? null : Number(amount), payment_schedule: $('ac-sched').value, invited_at: new Date().toISOString(),
        }, { onConflict: 'client_id' });
        if (ad.error) problems.push('tags, notes and payment');
        if (prospect) {
          const converted = await sb.from('prospects').update({ stage: 'converted', close_percentage: 100, converted_client_id: id, converted_at: new Date().toISOString() }).eq('id', prospect.id).select('id');
          if (converted.error || !converted.data?.length) problems.push('prospect conversion status');
        }
        const tg = await sb.from('targets').update({ checkin_day: Number($('ac-day').value) }).eq('client_id', id);
        if (tg.error) problems.push('check-in day');
        for (const fid of ['ac-f-onb', 'ac-f-con', 'ac-f-hs'].map((x) => $(x).value).filter(Boolean)) {
          const r = await sb.rpc('assign_form', { p_form: fid, p_clients: [id] });
          if (r.error) problems.push('a form');
        }
        d.close();
        if (problems.length) toast(`Client added, but ${[...new Set(problems)].join(', ')} didn’t save. Set them on their page.`, true);
        inviteModal({ id, full_name: out.full_name, email: out.email, phone }, true);
        ROSTER.tab = 'invited';
        route();
      } catch (ex) {
        err.textContent = friendlyError(ex);
        save.disabled = false;
        save.textContent = 'Save';
      }
    });
    drawTags();
    save.disabled = !valid();
    box.querySelector('[data-count]').textContent = `${$('ac-notes').value.length}/2000`;
  }

  async function convertProspect(prospect) {
    try {
      if (prospect.converted_client_id) { location.hash = `#client/${prospect.converted_client_id}/overview`; return; }
      if (prospect.email) {
        const existing = must(await sb.from('profiles').select('id,full_name,email').eq('role','client').eq('email',prospect.email.toLowerCase()).limit(1));
        if (existing.length) {
          const client = existing[0];
          const d = crmDialog(`<div class="fm"><div class="fm-head"><h2>Client already exists</h2><button type="button" data-close aria-label="Close">×</button></div><p>${esc(client.full_name || client.email)} already has a client account. Link this prospect to their existing account? Their current plans and logs stay as they are.</p><div class="fm-foot"><button type="button" class="f-btn" data-close>Cancel</button><button type="button" class="f-btn f-dark" data-link-prospect>Link existing client</button></div></div>`);
          d.box.querySelector('[data-link-prospect]').onclick = () => withBusy(d.box.querySelector('[data-link-prospect]'), async () => {
            const rows = must(await sb.from('prospects').update({stage:'converted',close_percentage:100,converted_client_id:client.id,converted_at:new Date().toISOString()}).eq('id',prospect.id).select('id'));
            if (!rows.length) throw new Error('Prospect could not be linked. Please retry.');
            d.close(); toast('Prospect linked to the existing client.'); route();
          });
          return;
        }
      }
      await addClientModal(await rosterData(), prospect);
    } catch (error) { toast(friendlyError(error), true); }
  }

  // Old links (#client/<id>/dashboard, /targets, /profile, /logs, /photos)
  // still land in the right place.
  const OLD_SECTIONS = { dashboard: 'overview', targets: 'nutrition', profile: 'settings', logs: 'overview', photos: 'physique', meals: 'nutrition' };

  async function renderClient(id, section, arg, arg2) {
    if (OLD_SECTIONS[section]) {
      if (section === 'targets') arg = 'builder';
      if (section === 'photos') [arg, arg2] = ['photos', arg];
      if (section === 'meals') arg = !arg || arg === 'current' ? 'builder' : arg;
      section = OLD_SECTIONS[section];
    }
    section = section || 'overview';
    // Overview, meal plan and food log always show the client's latest records.
    const ctx = await loadCtx(id, ['overview', 'phases', 'calendar', 'nutrition', 'foodlog', 'health-markers', 'sleep', 'activity', 'training'].includes(section));
    const p = ctx.profile;
    const week = S.currentWeek(p.start_date);
    const name = p.full_name || p.email;
    state.coachView = { clientId: id, clientName: name, section };
    if (section === 'overview' && arg) WUI.useProgramWeek(ctx, Number(arg));
    // Nutrition shows how the client eats beside "Week x of 12".
    if (section === 'nutrition') {
      const a = ctx.nutritionReady ? (ctx.assignments || []).filter((x) => x.starts_on <= S.today() && (!x.ends_on || x.ends_on >= S.today())).pop() : null;
      const plan = p.nutrition_tracking === 'Assigned meal plan' ? 'Meal plan' : p.nutrition_tracking ? 'Flexible macros' : 'Tracking not set';
      state.coachView.badges = [a && a.kind === 'macros' && plan === 'Meal plan' ? 'Meal plan · macro targets' : plan].concat(p.diet_requirement ? [p.diet_requirement] : []);
    }
    const label = (COACH_SECTIONS.find(([s]) => s === section) || [, 'Client settings'])[1];
    const title = label;
    const sub = name;
    const nav = '';

    if (section === 'overview') return renderCoachOverview(ctx, title, sub, Number(arg) || Math.max(WUI.programWeek(ctx), 1));
    if (section === 'phases') return PUI.render(ctx, title, sub, arg === 'roadmap' ? 'roadmap' : 'list', arg2);
    if (section === 'calendar') return CUI.calendar(ctx, title, sub, arg, arg2);
    if (section === 'physique') return renderCoachPhysique(ctx, nav, title, sub, arg, arg2);
    if (section === 'nutrition') return renderCoachNutrition(ctx, nav, title, sub, arg, arg2);
    if (section === 'goals') return renderCoachGoals(ctx, title, sub);
    if (section === 'activity') return WUI.activity(ctx, title, sub);
    if (section === 'sleep') return WUI.sleep(ctx, title, sub);
    if (section === 'health-markers') return WUI.health(ctx, title, sub);
    if (section === 'recovery') return renderCoachRecovery(ctx, nav, title, sub);
    if (section === 'habits') return renderCoachHabits(ctx, nav, title, sub, arg);
    if (section === 'checkins') return renderCoachCheckins(ctx, nav, title, sub);
    if (section === 'training') return TUI.render(ctx, title, sub, arg || 'workouts');
    if (section === 'supps') return renderCoachSupps(ctx, nav, title, sub);
    if (section === 'foodlog') return NUI.coachFoodLog(ctx, title, sub, arg);
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
      <p class="hint">Start date and targets are set under <a href="#client/${id}/goals">Goals</a>; macros and meal plans under <a href="#client/${id}/nutrition/builder">Nutrition → Nutrition builder</a>.</p>`,
    );
  }

  // Overview: the dashboard, with the week's daily logs as a column beside it.
  function renderCoachOverview(ctx, title, sub, week) {
    const note = `<details id="coach-note-panel" class="card coach-note">
        <summary><span class="note-mark" aria-hidden="true">R<i>.</i></span><span><b>Coach Notes</b><small>Open to view and manage the client's note</small></span><span class="coach-note-chevron" aria-hidden="true">⌄</span></summary>
        <div class="coach-note-content">
          <div data-note-display><p class="kicker">Note visible to ${esc((ctx.profile.full_name || 'the client').split(' ')[0])}</p><p class="coach-note-text" data-note-text></p><div class="row-actions"><button type="button" class="btn btn-small" data-note-edit></button><button type="button" class="btn btn-ghost btn-small" data-note-delete>Delete note</button></div></div>
          <form id="note-form" novalidate hidden><label class="kicker" for="t-coach_note">Coach note</label><textarea id="t-coach_note" name="coach_note" rows="4" maxlength="2000" placeholder="Write a note for your client.">${esc(ctx.targets.coach_note || '')}</textarea><div class="row-actions"><button class="btn btn-small" type="submit">Save note</button><button class="btn btn-ghost btn-small" type="button" data-note-cancel>Cancel</button></div></form>
        </div>
      </details>`;
    shell(title, sub, `<div class="ov-grid"><div class="ov-main">${note}${dashboardHTML(ctx, { coach: true })}</div>${dailyLogsColumn(ctx, week)}</div>`);
    const panel = document.getElementById('coach-note-panel');
    const nf = panel.querySelector('#note-form');
    const display = panel.querySelector('[data-note-display]');
    const text = panel.querySelector('[data-note-text]');
    const edit = panel.querySelector('[data-note-edit]');
    const remove = panel.querySelector('[data-note-delete]');
    let current = ctx.targets.coach_note || '';
    const showNote = () => {
      text.textContent = current || 'No note added yet.';
      text.classList.toggle('hint', !current);
      edit.textContent = current ? 'Edit note' : 'Add note';
      remove.hidden = !current;
      display.hidden = false;
      nf.hidden = true;
    };
    showNote();
    edit.addEventListener('click', () => {
      nf.elements.namedItem('coach_note').value = current;
      display.hidden = true;
      nf.hidden = false;
      nf.elements.namedItem('coach_note').focus();
    });
    nf.querySelector('[data-note-cancel]').addEventListener('click', showNote);
    const saveNote = async (value) => {
      const rows = must(await sb.from('targets').update({ coach_note: value || null }).eq('client_id', ctx.profile.id).select('client_id'));
      if (!rows.length) throw new Error('Not saved. Check you are signed in as the coach.');
      current = value;
      ctx.targets.coach_note = value || null;
      invalidate(ctx.profile.id);
      showNote();
      toast(value ? 'Coach note saved.' : 'Coach note deleted.');
    };
    nf.addEventListener('submit', (event) => {
      event.preventDefault();
      withBusy(nf.querySelector('[type="submit"]'), async () => {
        const value = nf.elements.namedItem('coach_note').value.trim();
        if (!value) throw new Error('Write a note, or use Delete note.');
        await saveNote(value);
      });
    });
    remove.addEventListener('click', () => {
      if (!confirm('Delete this coach note? The client will no longer see it.')) return;
      withBusy(remove, () => saveNote(''));
    });
    const pick = document.getElementById('dl-week');
    if (pick) pick.addEventListener('change', (e) => (location.hash = `#client/${ctx.profile.id}/overview/${e.target.value}`));
  }

  function dailyLogsColumn(ctx, week) {
    const p = ctx.profile;
    if (!p.start_date) return '<aside class="card daily-col"><p class="kicker">Daily logs</p><p>Set a start date under Goals first.</p></aside>';
    week = Math.min(Math.max(week, 1), 12);
    const t = ctx.targets;
    const dates = S.weekDates(p.start_date, week);
    const byDay = new Map(ctx.logs.map((l) => [l.day, l]));
    const now = S.today();
    const st = S.weekStats(ctx, week);
    const mealPlan = p.nutrition_tracking === 'Assigned meal plan';
    const chip = (v, text, status) => (v === null || v === undefined || v === '' ? '' : `<span class="dl-chip${status && status.level ? ` ${status.level}` : ''}">${text}</span>`);
    const days = dates
      .map((d) => {
        const l = byDay.get(d) || {};
        const m = macrosForDay(ctx, d) || {};
        const chips = [
          chip(l.weight_kg, `${fmt(l.weight_kg, 1)} kg`),
          chip(l.steps, `${fmt(l.steps)} steps`, S.habitStatus('steps', l.steps, t.steps_target)),
          chip(l.calories, `${fmt(l.calories)} kcal`, S.habitStatus('calories', l.calories, m.calories)),
          chip(l.protein_g, `P ${fmt(l.protein_g)}`, S.habitStatus('protein', l.protein_g, m.protein_g)),
          chip(l.carbs_g, `C ${fmt(l.carbs_g)}`),
          chip(l.fats_g, `F ${fmt(l.fats_g)}`),
          chip(l.fibre_g, `Fibre ${fmt(l.fibre_g)}`),
          chip(l.cardio_min, `${fmt(l.cardio_min)} min cardio`),
          chip(l.trained, l.trained === 'Yes' ? 'Trained' : esc(l.trained), trainedStatus(l.trained)),
          chip(l.water_l, `${fmt(l.water_l, 1)} L water`),
          chip(l.sleep_h, `${fmt(l.sleep_h, 1)} hrs sleep`),
          mealPlan ? chip(l.meal_plan, `Meal plan: ${esc(l.meal_plan)}`) : '',
        ].join('');
        const empty = d > now ? 'Upcoming' : 'Nothing logged';
        return `<li class="dl-day${chips ? '' : ' empty'}"><div class="dl-date"><b>${niceDate(d, { weekday: 'short' })}</b>${niceDate(d, { day: 'numeric', month: 'short' })}</div>
          <div>${chips ? `<div class="dl-chips">${chips}</div>` : `<span class="dl-none">${empty}</span>`}${l.notes ? `<p class="dl-note">${esc(l.notes)}</p>` : ''}</div></li>`;
      })
      .join('');
    return `<aside class="card daily-col" aria-label="Daily logs">
      <div class="dl-head"><p class="kicker">Daily logs</p><select id="dl-week" aria-label="Week">${weekOptions(12, week)}</select></div>
      ${targetsLine(ctx, dates[0])}
      <ul class="dl-days">${days}</ul>
      <p class="dl-sum">${st.logsCount}/7 days logged · ${st.sessions} session${st.sessions === 1 ? '' : 's'} · adherence ${pct(st.adherence)}</p>
    </aside>`;
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
    const day = checkinDay(ctx);
    const now = S.today();
    const next = p.start_date ? S.nextCheckin(p.start_date, day, now) : null;
    const nextText = !p.start_date ? 'Set a start date in Client settings to schedule check-ins.'
      : !next ? 'All 12 check-ins are behind them.'
        : `${S.checkinState(next, now) === 'open' ? 'Open now' : `Opens ${niceDate(next.opens, { weekday: 'long', day: 'numeric', month: 'short' })}`} · Week ${next.week}, due ${niceDate(next.due, { weekday: 'long', day: 'numeric', month: 'short' })}`;
    const picker = `<section class="card checkin-day-card">
        <div><p class="kicker">Check-in day</p>
        <p class="hint" style="margin:0">Their check-in opens 24 hours before this day and closes at the end of it. You get an email when they send it.</p></div>
        <label class="checkin-day-pick">Day<select id="checkin-day">${S.DAY_NAMES.map((d, i) => `<option value="${i}"${i === day ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
        <p class="checkin-next" id="checkin-next">${esc(nextText)}</p>
      </section>`;
    shell(title, sub, `${nav}${picker}${items || '<div class="card"><p>No check-ins yet.</p></div>'}`);
    root.querySelector('#checkin-day').addEventListener('change', async (e) => {
      const sel = e.target;
      const value = Number(sel.value);
      sel.disabled = true;
      try {
        const res = await sb.from('targets').update({ checkin_day: value }).eq('client_id', p.id).select('checkin_day');
        if (res.error && /checkin_day|column|schema cache/i.test(res.error.message || '')) {
          throw new Error('Run supabase/migrations/2026-10-26-checkin-day.sql in Supabase first, then try again.');
        }
        if (!must(res).length) throw new Error('Not saved. Check you are signed in as the coach.');
        invalidate(p.id);
        toast(`Check-in day set to ${S.DAY_NAMES[value]}.`);
        renderClient(p.id, 'checkins');
      } catch (err) {
        sel.value = String(day);
        toast(friendlyError(err), true);
      } finally {
        sel.disabled = false;
      }
    });
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
      location.hash = `#client/${ctx.profile.id}/physique/photos/${document.getElementById('pa').value}-${document.getElementById('pb').value}`;
    };
    document.getElementById('pa').addEventListener('change', go);
    document.getElementById('pb').addEventListener('change', go);
  }

  // ------------------------------------------------- coach: training builder
  // The coach saves one complete seven-day version at a time. A new start
  // date creates a new version; the old plan remains available in Supabase.
  // Exercises come from the coach's existing exercises table. The built-in
  // catalogue is never mixed into the new library or sent to client plans.
  const TRAINING_DAYS = 7;
  const DEFAULT_SESSIONS = ['Push', 'Pull', 'Legs', 'Rest day', 'Upper', 'Lower', 'Rest day'];

  async function loadExerciseLibrary(force) {
    if (state.exLib && !force) return state.exLib;
    const rows = [];
    for (let from = 0; ; from += 500) {
      const r = await sb.from('exercises').select('id,name,primary_muscles,secondary_muscles,equipment,is_custom').order('name').range(from, from + 499);
      if (r.error) {
        state.exLib = { ready: false, list: [], error: r.error };
        return state.exLib;
      }
      rows.push(...r.data);
      if (r.data.length < 500) break;
    }
    state.exLib = { ready: true, list: rows.map((row) => ({ id: row.id, name: row.name, primary: row.primary_muscles || [], secondary: row.secondary_muscles || [], equipment: row.equipment, custom: row.is_custom })) };
    return state.exLib;
  }

  // Older plans stored just a name: look the muscles up so the diagram works.
  function withMuscles(ex, list) {
    if (Array.isArray(ex.primary) && ex.primary.length) return ex;
    const hit = (list || X.LIBRARY).find((item) => X.normalise(item.name) === X.normalise(ex.name));
    return hit ? { ...ex, primary: hit.primary, secondary: hit.secondary, equipment: ex.equipment || hit.equipment } : ex;
  }

  function muscleChips(m) {
    return [...m.primary.map((k) => `<span class="mx-chip p">${esc(X.MUSCLES[k])}</span>`), ...m.secondary.map((k) => `<span class="mx-chip s">${esc(X.MUSCLES[k])}</span>`)].join('');
  }

  function pickLabel(ex) {
    if (!ex || !ex.name) return '<span class="tp-pick-name placeholder">Choose an exercise</span><small>Search the library or pick a muscle</small>';
    const muscles = (ex.primary || []).map((k) => X.MUSCLES[k]).filter(Boolean).join(', ');
    return `<span class="tp-pick-name">${esc(ex.name)}</span><small>${esc([muscles, ex.equipment].filter(Boolean).join(' · ') || 'Custom exercise')}</small>`;
  }

  function exerciseRowHTML(ex, index) {
    const e = ex || {};
    const rir = e.rir !== undefined ? Boolean(e.rir) : true;
    const num = (key, label, attrs, value) => `<label class="tp-num">${label}<input data-ex-field="${key}" type="number" inputmode="numeric" value="${esc(value ?? '')}" ${attrs}></label>`;
    const restValue = e.rest_seconds_min ?? e.rest_seconds_max ?? '';
    return `<div class="tp-ex" data-exercise data-ex="${esc(JSON.stringify({ exercise_id: e.exercise_id || null, name: e.name || '', primary: e.primary || [], secondary: e.secondary || [], equipment: e.equipment || null }))}">
      <div class="tp-ex-map" aria-hidden="true"><span class="tp-ex-num">${index + 1}</span>${X.bodyDiagram(e.primary, e.secondary, { small: true })}</div>
      <div class="tp-ex-main">
        <div class="tp-pick"><button type="button" class="tp-pick-btn" data-pick aria-haspopup="listbox" aria-expanded="false">${pickLabel(e)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
        <div class="tp-ex-fields">
          ${num('sets', 'Sets', 'min="1" max="20"', e.sets ?? 3)}
          ${num('reps_min', 'Reps from', 'min="1" max="100"', e.reps_min ?? 8)}
          ${num('reps_max', 'Reps to', 'min="1" max="100"', e.reps_max ?? 12)}
          <fieldset class="tp-rir"><legend>Reps in reserve</legend>
            <div class="tp-seg" role="group"><button type="button" data-rir="yes" aria-pressed="${rir}">Yes</button><button type="button" data-rir="no" aria-pressed="${!rir}">No</button></div>
          </fieldset>
          <label class="tp-num tp-rir-n"${rir ? '' : ' hidden'}>RIR<select data-ex-field="rir_target">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}"${(e.rir_target ?? 2) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          ${num('rest', 'Rest (sec)', 'min="0" max="1200" step="15" placeholder="e.g. 90"', restValue)}
        </div>
        <label class="tp-note">Coach cue<input data-ex-field="note" value="${esc(e.note || '')}" maxlength="500" placeholder="Optional, e.g. pause 1 sec at the bottom"></label>
      </div>
      <button type="button" class="tp-del" data-remove-ex aria-label="Delete exercise"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Delete</span></button>
    </div>`;
  }

  function dayExercises(day) {
    return [...day.querySelectorAll('[data-exercise]')].map((row) => JSON.parse(row.dataset.ex || '{}'));
  }

  function dayMapHTML(exercises) {
    const m = X.musclesOf(exercises);
    return `${X.bodyDiagram(m.primary, m.secondary)}<div class="mx-chips">${muscleChips(m) || '<span class="mx-empty">Add exercises to see the muscles this day trains.</span>'}</div>
      <div class="mx-legend"><span><i class="p"></i>Main focus</span><span><i class="s"></i>Also works</span></div>`;
  }

  function trainingDayHTML(row, list) {
    const exercises = (Array.isArray(row.exercises) ? row.exercises : []).map((ex) => withMuscles(ex, list));
    const rest = Boolean(row.is_rest_day);
    const sessionName = rest && /^rest( day)?$/i.test(row.session_name || '') ? '' : row.session_name || '';
    return `<section class="tp-day${rest ? ' is-rest' : ''}${row.cycle_day === 1 ? ' open' : ''}" data-training-day="${row.cycle_day}">
      <header class="tp-day-head">
        <button type="button" class="tp-day-toggle" data-toggle-day aria-expanded="${row.cycle_day === 1}">
          <span class="tp-day-num">Day ${row.cycle_day}</span>
          <span class="tp-day-sum" data-day-summary></span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <label class="tp-rest"><input type="checkbox" data-rest-day${rest ? ' checked' : ''}><span>Rest day</span></label>
      </header>
      <div class="tp-rest-block" aria-hidden="${!rest}"><strong>Rest day</strong><span>Walk, stretch and recover.</span></div>
      <div class="tp-day-body" data-exercise-controls>
        <label class="tp-session">Session name<input data-session-name value="${esc(sessionName)}" maxlength="120" placeholder="e.g. Push, Upper, Legs"></label>
        <div class="tp-day-grid">
          <div>
            <div class="tp-ex-list" data-exercise-list>${exercises.map(exerciseRowHTML).join('')}</div>
            <button class="tp-add" type="button" data-add-ex><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Add exercise</button>
          </div>
          <aside class="tp-day-map" data-day-map>${dayMapHTML(exercises)}</aside>
        </div>
        <label class="tp-session-note">Session note<textarea data-session-note maxlength="2000" placeholder="Optional: warm-up, tempo, anything for the whole session">${esc(row.session_note || '')}</textarea></label>
      </div>
    </section>`;
  }

  async function renderCoachTraining(ctx, nav, title, sub, newPlan) {
    const lib = await loadExerciseLibrary();
    const latestStart = ctx.training.length ? ctx.training[0].program_start_date : null;
    const latest = newPlan || !latestStart ? [] : ctx.training.filter((row) => row.program_start_date === latestStart);
    const sessions = DEFAULT_SESSIONS.map((name, i) => {
      const saved = latest.find((row) => row.cycle_day === i + 1);
      return saved ? { ...saved, exercises: [...(saved.exercises || [])] } : {
        cycle_day: i + 1, session_name: name, is_rest_day: /rest/i.test(name), exercises: [], session_note: '',
      };
    });
    const pending = state.pendingExercise;
    if (pending && pending.clientId === ctx.profile.id && pending.newPlan === Boolean(newPlan)) {
      const day = sessions.find((row) => row.cycle_day === pending.day);
      if (day && !day.is_rest_day) day.exercises = [...(day.exercises || []), pending.exercise];
      state.pendingExercise = null;
    }
    const start = newPlan && latestStart
      ? (S.today() > latestStart ? S.today() : S.addDays(latestStart, 1))
      : !latestStart ? (ctx.profile.start_date || S.today()) : latestStart;
    const programName = latest[0]?.program_name || '12 Week Rewired Premium Designer Coaching · Phase 1';
    const extraDays = latest.some((row) => row.cycle_day > TRAINING_DAYS);
    shell(title, sub, `${nav}
      <section class="card coach-editor-intro"><p class="kicker">Coach controls · Training</p>
        <h2>${newPlan ? 'Create a new training plan' : latest.length ? 'Edit training plan' : 'Assign a training plan'}</h2>
        <p>Seven days that repeat. Tick a rest day to block it out, or pick exercises from the library for a training day. Your client sees the plan as soon as you save.</p>
        ${extraDays ? '<p class="hint">This plan was set up as an eight-day cycle. Saving it here makes it a seven-day week.</p>' : ''}
        ${lib.ready ? '' : '<p class="hint">The exercise database could not be loaded. Check the connection before saving this training plan.</p>'}
        ${latest.length && !newPlan ? '<button class="btn btn-ghost btn-small" type="button" id="new-training-plan">Create a new program version</button>' : ''}
        ${newPlan ? '<button class="btn btn-ghost btn-small" type="button" id="cancel-training-plan">Back to current program</button>' : ''}
      </section>
      <form id="training-editor" class="card tp" novalidate>
        <div class="grid-2"><label>Program name<input name="program_name" value="${esc(programName)}" maxlength="160" required></label>
        <label>Start date<input name="program_start_date" type="date" value="${esc(start)}"${latest.length && !newPlan ? ' readonly' : ''} required></label></div>
        <p class="hint">To schedule a different start date, create a new program version.</p>
        <div class="tp-days">${sessions.map((row) => trainingDayHTML(row, lib.list)).join('')}</div>
        <div class="tp-save"><button class="btn" type="submit">Save training plan</button></div>
      </form>
      <form id="custom-exercise" class="card tp-custom-card" novalidate>
        <p class="kicker">Add custom exercise</p>
        <p class="hint" style="margin-top:0">Saved to your exercise library, so it shows in the dropdown for every client from now on.</p>
        <div class="tp-custom-grid">
          <label>Exercise name<input name="name" maxlength="120" placeholder="e.g. Seated cable hip abduction" required></label>
          <label>Main muscle<select name="primary" required><option value="">Choose a muscle</option>${Object.entries(X.MUSCLES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
          <label>Also works (optional)<select name="secondary"><option value="">None</option>${Object.entries(X.MUSCLES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
          <label>Equipment (optional)<select name="equipment"><option value="">Choose</option>${X.EQUIPMENT.map((e) => `<option>${esc(e)}</option>`).join('')}</select></label>
        </div>
        <div class="tp-custom-foot"><div class="tp-custom-map" data-custom-map aria-hidden="true">${X.bodyDiagram([], [], { small: true })}</div>
          <button class="btn" type="submit">Add to exercise library</button></div>
        <div class="tp-custom-list" data-custom-list></div>
      </form>
      ${ctx.workouts && ctx.workouts.length ? workoutHistoryHTML(ctx, 10) : ''}
      ${latest.length && !newPlan ? `<section class="coach-preview"><p class="kicker">Client preview</p>${trainingHTML(ctx)}</section>` : ''}`);

    if (root.querySelector('#new-training-plan')) root.querySelector('#new-training-plan').addEventListener('click', () => renderCoachTraining(ctx, nav, title, sub, true));
    if (root.querySelector('#cancel-training-plan')) root.querySelector('#cancel-training-plan').addEventListener('click', () => renderCoachTraining(ctx, nav, title, sub, false));
    const form = root.querySelector('#training-editor');

    const refreshDay = (day) => {
      const rest = day.querySelector('[data-rest-day]').checked;
      day.classList.toggle('is-rest', rest);
      day.querySelector('.tp-rest-block').setAttribute('aria-hidden', String(!rest));
      const exercises = dayExercises(day).filter((ex) => ex.name);
      day.querySelectorAll('[data-exercise]').forEach((row, i) => { row.querySelector('.tp-ex-num').textContent = i + 1; });
      day.querySelector('[data-day-map]').innerHTML = dayMapHTML(exercises);
      const name = day.querySelector('[data-session-name]').value.trim();
      const m = X.musclesOf(exercises);
      day.querySelector('[data-day-summary]').innerHTML = rest
        ? '<b>Rest day</b>'
        : `<b>${esc(name || 'Training day')}</b><small>${exercises.length} exercise${exercises.length === 1 ? '' : 's'}${m.primary.length ? ` · ${esc(m.primary.slice(0, 3).map((k) => X.MUSCLES[k]).join(', '))}` : ''}</small>`;
    };
    form.querySelectorAll('[data-training-day]').forEach(refreshDay);

    // ---- exercise picker: one panel, moved under whichever row opened it.
    const panel = document.createElement('div');
    panel.className = 'tp-panel';
    panel.hidden = true;
    panel.innerHTML = `<div class="tp-panel-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" placeholder="Search exercises, e.g. incline press" aria-label="Search exercises" autocomplete="off" data-q></div>
      <div class="tp-filters" role="group" aria-label="Filter by muscle"><button type="button" data-muscle="" aria-pressed="true">All</button>${Object.entries(X.MUSCLES).map(([k, v]) => `<button type="button" data-muscle="${k}" aria-pressed="false">${esc(v)}</button>`).join('')}</div>
      <div class="tp-panel-body"><div class="tp-results" role="listbox" aria-label="Exercises" data-results></div><div class="tp-preview" data-preview aria-hidden="true"></div></div>
      <div class="tp-custom" data-custom hidden></div>`;
    let openRow = null;
    let active = 0;
    let muscle = '';
    let shown = [];

    const optHTML = (ex, i) => `<button type="button" role="option" class="tp-opt${i === active ? ' active' : ''}" data-i="${i}" aria-selected="${i === active}">
        <span class="tp-opt-text"><b>${esc(ex.name)}</b><small>${esc((ex.primary || []).map((k) => X.MUSCLES[k]).join(', '))}${ex.equipment ? ` · ${esc(ex.equipment)}` : ''}</small></span></button>`;
    const preview = () => {
      const ex = shown[active];
      panel.querySelector('[data-preview]').innerHTML = ex
        ? `${X.bodyDiagram(ex.primary, ex.secondary)}<p><b>${esc(ex.name)}</b></p><div class="mx-chips">${muscleChips({ primary: ex.primary || [], secondary: (ex.secondary || []).filter((m) => !(ex.primary || []).includes(m)) })}</div>`
        : X.bodyDiagram([], []);
    };
    const setActive = (i, scroll) => {
      active = i;
      panel.querySelectorAll('.tp-opt[data-i]').forEach((b) => {
        const on = Number(b.dataset.i) === active;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
        if (on && scroll) b.scrollIntoView({ block: 'nearest' });
      });
      preview();
    };

    const renderResults = () => {
      const typed = panel.querySelector('[data-q]').value.trim();
      shown = X.search(lib.list, typed, muscle);
      // With no search and no filter, list by muscle group under headings.
      const grouped = !typed && !muscle;
      if (grouped) {
        const order = Object.keys(X.MUSCLES);
        shown.sort((a, b) => order.indexOf(X.groupOf(a)) - order.indexOf(X.groupOf(b)) || a.name.localeCompare(b.name));
      }
      let html = '';
      let lastGroup = null;
      shown.forEach((ex, i) => {
        if (grouped && X.groupOf(ex) !== lastGroup) {
          lastGroup = X.groupOf(ex);
          html += `<p class="tp-group">${esc(X.MUSCLES[lastGroup] || 'Other')}</p>`;
        }
        html += optHTML(ex, i);
      });
      const exact = lib.list.some((ex) => X.normalise(ex.name) === X.normalise(typed));
      if (!shown.length) html += `<p class="tp-none">No exercise matches “${esc(typed)}”.</p>`;
      if (typed && !exact) html += `<button type="button" class="tp-opt tp-new" data-new><span class="tp-plus">+</span><span class="tp-opt-text"><b>Add “${esc(typed)}” as a new exercise</b><small>Choose the muscles it works</small></span></button>`;
      panel.querySelector('[data-results]').innerHTML = html;
      preview();
    };

    const closePanel = () => {
      if (!openRow) return;
      openRow.querySelector('[data-pick]').setAttribute('aria-expanded', 'false');
      openRow.classList.remove('picking');
      panel.hidden = true;
      panel.querySelector('[data-custom]').hidden = true;
      openRow = null;
    };

    const openPanel = (row) => {
      if (openRow === row) { closePanel(); return; }
      closePanel();
      openRow = row;
      row.classList.add('picking');
      row.querySelector('.tp-pick').appendChild(panel);
      row.querySelector('[data-pick]').setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      const current = JSON.parse(row.dataset.ex || '{}');
      panel.querySelector('[data-q]').value = '';
      muscle = '';
      panel.querySelectorAll('[data-muscle]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.muscle === '')));
      active = 0;
      renderResults();
      const i = current.name ? shown.findIndex((ex) => ex.name === current.name) : -1;
      panel.querySelector('[data-q]').focus({ preventScroll: true });
      if (i >= 0) setActive(i, true);
    };

    const choose = (ex) => {
      const row = openRow;
      if (!row || !ex) return;
      const data = { exercise_id: ex.id || null, name: ex.name, primary: ex.primary || [], secondary: ex.secondary || [], equipment: ex.equipment || null };
      row.dataset.ex = JSON.stringify(data);
      row.querySelector('[data-pick]').innerHTML = `${pickLabel(data)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      row.querySelector('.tp-ex-map').innerHTML = `<span class="tp-ex-num"></span>${X.bodyDiagram(data.primary, data.secondary, { small: true })}`;
      closePanel();
      refreshDay(row.closest('[data-training-day]'));
      row.querySelector('[data-ex-field="sets"]').focus();
    };

    const showCustom = (name) => {
      const box = panel.querySelector('[data-custom]');
      box.hidden = false;
      box.innerHTML = `<p class="kicker">New exercise</p>
        <label>Name<input data-c-name value="${esc(name)}" maxlength="120"></label>
        <p class="tp-c-label">Main muscles</p><div class="tp-filters" data-c-primary>${Object.entries(X.MUSCLES).map(([k, v]) => `<button type="button" data-m="${k}" aria-pressed="false">${esc(v)}</button>`).join('')}</div>
        <p class="tp-c-label">Also works (optional)</p><div class="tp-filters" data-c-secondary>${Object.entries(X.MUSCLES).map(([k, v]) => `<button type="button" data-m="${k}" aria-pressed="false">${esc(v)}</button>`).join('')}</div>
        <label>Equipment<select data-c-eq><option value="">Choose</option>${X.EQUIPMENT.map((e) => `<option>${esc(e)}</option>`).join('')}</select></label>
        <div class="row-actions"><button type="button" class="btn btn-small" data-c-save>Add exercise</button><button type="button" class="btn btn-ghost btn-small" data-c-cancel>Cancel</button></div>`;
      box.querySelector('[data-c-name]').focus();
    };

    const saveCustom = async () => {
      const box = panel.querySelector('[data-custom]');
      const picked = (sel) => [...box.querySelectorAll(`${sel} [aria-pressed="true"]`)].map((b) => b.dataset.m);
      const name = box.querySelector('[data-c-name]').value.trim();
      const primary = picked('[data-c-primary]');
      const secondary = picked('[data-c-secondary]').filter((m) => !primary.includes(m));
      const equipment = box.querySelector('[data-c-eq]').value || null;
      if (!name) throw new Error('Give the exercise a name.');
      if (!primary.length) throw new Error('Pick at least one main muscle.');
      let ex = { name, primary, secondary, equipment, custom: true };
      if (lib.ready) {
        const saved = must(await sb.from('exercises').insert({ name, primary_muscles: primary, secondary_muscles: secondary, equipment, is_custom: true }).select('id').single());
        ex = { ...ex, id: saved.id };
      }
      lib.list.push(ex);
      lib.list.sort((a, b) => a.name.localeCompare(b.name));
      toast(lib.ready ? `${name} added to your exercise library.` : `${name} added to this plan.`);
      choose(ex);
    };

    panel.addEventListener('input', (e) => {
      if (e.target.matches('[data-q]')) { active = 0; renderResults(); }
    });
    panel.addEventListener('keydown', (e) => {
      if (!e.target.matches('[data-q]')) { if (e.key === 'Escape') { const row = openRow; closePanel(); row?.querySelector('[data-pick]').focus(); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!shown.length) return;
        setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length, true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (shown[active]) choose(shown[active]);
        else if (panel.querySelector('[data-new]')) showCustom(panel.querySelector('[data-q]').value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const row = openRow;
        closePanel();
        row?.querySelector('[data-pick]').focus();
      }
    });
    panel.addEventListener('mouseover', (e) => {
      const opt = e.target.closest('.tp-opt[data-i]');
      if (opt && Number(opt.dataset.i) !== active) setActive(Number(opt.dataset.i), false);
    });
    panel.addEventListener('click', (e) => {
      const filter = e.target.closest('[data-muscle]');
      if (filter) {
        muscle = filter.dataset.muscle;
        panel.querySelectorAll('[data-muscle]').forEach((b) => b.setAttribute('aria-pressed', String(b === filter)));
        active = 0;
        renderResults();
        panel.querySelector('[data-results]').scrollTop = 0;
        return;
      }
      const opt = e.target.closest('.tp-opt[data-i]');
      if (opt) { choose(shown[Number(opt.dataset.i)]); return; }
      if (e.target.closest('[data-new]')) { showCustom(panel.querySelector('[data-q]').value.trim()); return; }
      const m = e.target.closest('[data-m]');
      if (m) { m.setAttribute('aria-pressed', String(m.getAttribute('aria-pressed') !== 'true')); return; }
      if (e.target.closest('[data-c-cancel]')) { panel.querySelector('[data-custom]').hidden = true; return; }
      const save = e.target.closest('[data-c-save]');
      if (save) withBusy(save, saveCustom);
    });
    document.addEventListener('click', function outside(e) {
      if (!document.body.contains(form)) { document.removeEventListener('click', outside); return; }
      if (openRow && !e.target.closest('.tp-pick, [data-add-ex]')) closePanel();
    });

    form.addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-toggle-day]');
      if (toggle) {
        const day = toggle.closest('[data-training-day]');
        const open = !day.classList.contains('open');
        day.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        return;
      }
      const pick = e.target.closest('[data-pick]');
      if (pick) { openPanel(pick.closest('[data-exercise]')); return; }
      const add = e.target.closest('[data-add-ex]');
      if (add) {
        const day = add.closest('[data-training-day]');
        const list = day.querySelector('[data-exercise-list]');
        const prev = dayExercises(day).length;
        list.insertAdjacentHTML('beforeend', exerciseRowHTML({}, prev));
        refreshDay(day);
        openPanel(list.lastElementChild);
        return;
      }
      const remove = e.target.closest('[data-remove-ex]');
      if (remove) {
        const day = remove.closest('[data-training-day]');
        const row = remove.closest('[data-exercise]');
        if (openRow === row) closePanel();
        row.remove();
        refreshDay(day);
        return;
      }
      const rir = e.target.closest('[data-rir]');
      if (rir) {
        const row = rir.closest('[data-exercise]');
        const yes = rir.dataset.rir === 'yes';
        row.querySelectorAll('[data-rir]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.rir === 'yes') === yes)));
        row.querySelector('.tp-rir-n').hidden = !yes;
      }
    });
    form.addEventListener('change', (e) => {
      if (e.target.matches('[data-rest-day]')) {
        const day = e.target.closest('[data-training-day]');
        if (openRow && day.contains(openRow)) closePanel();
        if (!e.target.checked) {
          day.classList.add('open');
          day.querySelector('[data-toggle-day]').setAttribute('aria-expanded', 'true');
          if (!dayExercises(day).length) {
            day.querySelector('[data-exercise-list]').insertAdjacentHTML('beforeend', exerciseRowHTML({}, 0));
          }
        }
        refreshDay(day);
      }
    });
    form.addEventListener('input', (e) => {
      if (e.target.matches('[data-session-name]')) refreshDay(e.target.closest('[data-training-day]'));
    });

    // ---- "Add custom exercise" card under the plan.
    const cform = root.querySelector('#custom-exercise');
    const customList = () => {
      const mine = lib.list.filter((ex) => ex.custom);
      cform.querySelector('[data-custom-list]').innerHTML = mine.length
        ? `<p class="tp-c-label">Your custom exercises (${mine.length})</p><div class="mx-chips">${mine.map((ex) => `<span class="mx-chip s">${esc(ex.name)}</span>`).join('')}</div>`
        : '';
    };
    customList();
    cform.addEventListener('change', () => {
      const primary = cform.elements.primary.value;
      const secondary = cform.elements.secondary.value;
      cform.querySelector('[data-custom-map]').innerHTML = X.bodyDiagram(primary ? [primary] : [], secondary && secondary !== primary ? [secondary] : [], { small: true });
    });
    cform.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(cform.querySelector('[type="submit"]'), async () => {
        const name = cform.elements.name.value.trim().replace(/\s+/g, ' ');
        const primary = cform.elements.primary.value;
        const secondary = cform.elements.secondary.value;
        const equipment = cform.elements.equipment.value || null;
        if (!name) throw new Error('Give the exercise a name.');
        if (!primary) throw new Error('Choose the main muscle it targets.');
        if (lib.list.some((ex) => X.normalise(ex.name) === X.normalise(name))) throw new Error(`${name} is already in your library.`);
        if (!lib.ready) throw new Error('Run supabase/migrations/2026-10-26-exercises.sql in Supabase first, then try again.');
        const sec = secondary && secondary !== primary ? [secondary] : [];
        const saved = must(await sb.from('exercises').insert({ name, primary_muscles: [primary], secondary_muscles: sec, equipment, is_custom: true }).select('id').single());
        lib.list.push({ id: saved.id, name, primary: [primary], secondary: sec, equipment, custom: true });
        lib.list.sort((a, b) => a.name.localeCompare(b.name));
        cform.reset();
        cform.querySelector('[data-custom-map]').innerHTML = X.bodyDiagram([], [], { small: true });
        customList();
        toast(`${name} added. Pick it from the exercise dropdown on any day.`);
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      closePanel();
      withBusy(form.querySelector('[type="submit"]'), async () => {
        const name = form.elements.program_name.value.trim();
        const programStart = form.elements.program_start_date.value;
        if (!name || !programStart) throw new Error('Add a program name and start date.');
        const rows = [...form.querySelectorAll('[data-training-day]')].map((day) => {
          const cycleDay = Number(day.dataset.trainingDay);
          const rest = day.querySelector('[data-rest-day]').checked;
          const sessionName = rest ? 'Rest day' : day.querySelector('[data-session-name]').value.trim();
          const fail = (msg) => {
            day.classList.add('open');
            throw new Error(`Day ${cycleDay}: ${msg}`);
          };
          if (!sessionName) fail('add a session name, e.g. Push or Legs.');
          const exercises = rest ? [] : [...day.querySelectorAll('[data-exercise]')].map((item, i) => {
            const picked = JSON.parse(item.dataset.ex || '{}');
            const value = (key) => item.querySelector(`[data-ex-field="${key}"]`).value.trim();
            const number = (key, label, low, high, required) => {
              const raw = value(key);
              if (!raw) { if (required) fail(`add ${label} for exercise ${i + 1}.`); return null; }
              const n = Number(raw);
              if (!Number.isFinite(n) || n < low || n > high) fail(`check ${label} for exercise ${i + 1}.`);
              return n;
            };
            if (!picked.name) fail(`choose exercise ${i + 1} from the list, or delete it.`);
            const ex = {
              name: picked.name, primary: picked.primary || [], secondary: picked.secondary || [],
              sets: number('sets', 'sets', 1, 20, true),
              reps_min: number('reps_min', 'reps from', 1, 100, true), reps_max: number('reps_max', 'reps to', 1, 100, true),
              rir: item.querySelector('[data-rir="yes"]').getAttribute('aria-pressed') === 'true',
            };
            if (picked.exercise_id) ex.exercise_id = picked.exercise_id;
            if (picked.equipment) ex.equipment = picked.equipment;
            if (ex.reps_min > ex.reps_max) fail(`the rep range for ${picked.name} is reversed.`);
            if (ex.rir) ex.rir_target = Number(value('rir_target'));
            const restSec = number('rest', 'rest', 0, 1200, false);
            if (restSec !== null) { ex.rest_seconds_min = restSec; ex.rest_seconds_max = restSec; }
            if (value('note')) ex.note = value('note');
            return ex;
          });
          if (!rest && !exercises.length) fail('add an exercise or tick Rest day.');
          return { client_id: ctx.profile.id, program_start_date: programStart, cycle_day: cycleDay,
            program_name: name, session_name: sessionName, is_rest_day: rest, exercises,
            session_note: rest ? null : day.querySelector('[data-session-note]').value.trim() || null };
        });
        const saved = must(await sb.from('training_plan').upsert(rows, { onConflict: 'client_id,program_start_date,cycle_day' }).select('cycle_day'));
        if (saved.length !== TRAINING_DAYS) throw new Error('The full program was not saved. Please retry.');
        // An older eight-day version becomes a seven-day week.
        must(await sb.from('training_plan').delete().eq('client_id', ctx.profile.id).eq('program_start_date', programStart).gt('cycle_day', TRAINING_DAYS));
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

  const TRACKING = ['Macro-based / Flexible', 'Assigned meal plan'];
  const DIETS = ['Halal', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten free', 'Dairy free', 'Kosher'];

  function targetField(k, l, v, type, extra) {
    return `<div class="field"><label for="t-${k}">${l}</label><input id="t-${k}" name="${k}" type="${type || 'text'}"${
      type === 'number' ? ' inputmode="decimal" step="any"' : ''
    } value="${esc(v === null || v === undefined ? '' : v)}"${extra || ''}></div>`;
  }

  // Goals: program setup, the 12-week targets and the weekly average targets.
  function renderCoachGoals(ctx, title, sub) {
    const p = ctx.profile;
    const t = ctx.targets;
    const text = targetField;
    shell(
      title,
      sub,
      `<form id="plan-form" class="card" novalidate>
        <p class="kicker">Program setup</p>
        <div class="grid-2">
          ${text('start_date', 'Start date (a Monday)', p.start_date, 'date')}
          <div class="field"><label for="t-training_days_per_week">Training days a week</label>
            <select id="t-training_days_per_week" name="training_days_per_week" data-number><option value="">–</option>${[2, 3, 4, 5, 6]
              .map((n) => `<option${Number(p.training_days_per_week) === n ? ' selected' : ''}>${n}</option>`)
              .join('')}</select></div>
        </div>
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
        <p class="kicker" style="margin-top:12px">Weekly targets</p>
        <div class="grid-2">
          ${text('steps_target', 'Daily steps', t.steps_target, 'number')}
          ${text('sleep_target_h', 'Sleep (hours)', t.sleep_target_h, 'number')}
          ${text('water_target', 'Water', t.water_target)}
          ${text('fibre_target_g', 'Fibre (g)', t.fibre_target_g, 'number')}
          ${text('whole_foods_pct', 'Whole foods (%)', t.whole_foods_pct, 'number')}
        </div>
        <p class="hint">The coach note now lives on <a href="#client/${p.id}/overview">Overview</a>.</p>
        <button class="btn btn-small" type="submit">Save goals</button>
      </form>`,
    );
    const planForm = document.getElementById('plan-form');
    planForm.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(planForm.querySelector('button'), async () => {
        must(await sb.from('profiles').update(readForm(planForm)).eq('id', p.id));
        invalidate(p.id);
        toast('Setup saved.');
        renderClient(p.id, 'goals');
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
        toast('Goals saved.');
      });
    });
  }

  // Nutrition builder: how the client tracks, their diet requirements, the
  // weekly macro targets, and (for an assigned meal plan) the plan itself.
  function renderNutritionBuilder(ctx, tabs, title, sub, view, arg2) {
    const p = ctx.profile;
    const text = targetField;
    const mealPlan = p.nutrition_tracking === 'Assigned meal plan';
    const week = Math.max(S.currentWeek(p.start_date), 1);
    const current = S.macrosForWeek(ctx.macros, week) || {};
    const macroRows = ctx.macros
      .map((m) => `<tr><th scope="row">Week ${m.week_number}</th><td>${m.protein_g}</td><td>${m.carbs_g}</td><td>${m.fats_g}</td><td>${m.fibre_g}</td><td><b>${fmt(m.calories)}</b></td><td><button class="btn btn-ghost btn-small" type="button" data-del-macro="${m.week_number}">Remove</button></td></tr>`)
      .join('');
    const dietKnown = !p.diet_requirement || DIETS.includes(p.diet_requirement);
    const setup = `<form id="nut-setup" class="card" novalidate>
        <p class="kicker">Nutrition setup</p>
        <div class="grid-2">
          <div class="field"><label for="t-nutrition_tracking">Nutrition tracking</label>
            <select id="t-nutrition_tracking" name="nutrition_tracking"><option value="">–</option>${TRACKING.map((n) => `<option${p.nutrition_tracking === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="field"><label for="t-diet_requirement">Diet requirements</label>
            <select id="t-diet_requirement" name="diet_requirement"><option value="">None</option>${DIETS.concat(dietKnown ? [] : [p.diet_requirement]).map((n) => `<option${p.diet_requirement === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        </div>
        <p class="hint">${mealPlan ? 'On an assigned meal plan: build and assign it below.' : 'On flexible macros: set the weekly macro targets below. Pick "Assigned meal plan" to build set meals.'}</p>
        <button class="btn btn-small" type="submit">Save setup</button>
      </form>`;
    const macros = `<section class="card">
        <p class="kicker">Macro targets by week</p>
        <p class="hint" style="margin-top:0">${mealPlan ? 'Used when no meal plan is running. ' : ''}Set Monday's targets. Later weeks keep the latest numbers until you change them. Calories = protein×4 + carbs×4 + fats×9 + fibre×2.</p>
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
      </section>`;

    const bind = () => {
      const setupForm = document.getElementById('nut-setup');
      if (setupForm)
        setupForm.addEventListener('submit', (e) => {
          e.preventDefault();
          withBusy(setupForm.querySelector('button'), async () => {
            const d = readForm(setupForm);
            const res = await sb.from('profiles').update(d).eq('id', p.id).select('id');
            if (res.error && /diet_requirement/.test(res.error.message)) throw new Error('Diet requirements need a one-off database update. Run supabase/migrations/2026-10-28-diet-requirements.sql in the Supabase SQL Editor.');
            must(res);
            invalidate(p.id);
            toast('Nutrition setup saved.');
            renderClient(p.id, 'nutrition', 'builder');
          });
        });
      const mForm = document.getElementById('macro-form');
      if (!mForm) return;
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
          renderClient(p.id, 'nutrition', 'builder');
        });
      });
      root.querySelectorAll('[data-del-macro]').forEach((btn) => {
        btn.addEventListener('click', () =>
          withBusy(btn, async () => {
            must(await sb.from('macro_targets').delete().eq('client_id', p.id).eq('week_number', Number(btn.dataset.delMacro)));
            invalidate(p.id);
            renderClient(p.id, 'nutrition', 'builder');
          }),
        );
      });
    };
    // Flexible: setup then macros (plus any plan that is still assigned).
    // Meal plan: setup, the plan builder, then the fallback macros.
    return NUI.coachMeals(ctx, title, sub, view === 'builder' || view === 'targets' ? 'current' : view, {
      tabs,
      before: mealPlan ? setup : `${setup}${macros}`,
      after: mealPlan ? macros : '',
      showPlan: mealPlan,
      template: view === 'assign' ? arg2 : null,
      bind,
    });
  }

  NUI.init({
    sb, state, root, S, COACH, ICONS, esc, fmt, toast, friendlyError, readForm, withBusy, must, niceDate,
    shell, loadCtx, invalidate, sectionTabs, statCards, dotCell,
  });
  FUI.init({ sb, state, COACH, esc, fmt, friendlyError, must, shell, invalidate });
  EUI.init({ sb, state, root, X, esc, shell, toast, friendlyError, must, withBusy, loadExerciseLibrary });
  CUI.init({ sb, state, root, S, N: window.RewiredNutrition, esc, fmt, shell, toast, friendlyError, must, withBusy });
  PUI.init({ sb, state, root, S, CI, esc, shell, toast, friendlyError, must, invalidate });
  PRUI.init({ sb, state, root, S, CI, P: PR, esc, shell, toast, friendlyError, must, convert: convertProspect, request: window.REWIRED_PREVIEW_FETCH || fetch, previewMode: !!window.REWIRED_PREVIEW_FETCH });
  WUI.init({ sb, state, root, S, W, esc, fmt, shell, toast, friendlyError, must, withBusy, invalidate, rerender: route, refreshHabits: renderHabits });
  TUI.init({ sb, state, root, S, T, X, EUI, CI, esc, fmt, shell, toast, friendlyError, must, withBusy, invalidate, loadExerciseLibrary });
  MSG.init({ sb, state, COACH, esc, friendlyError, toast, shell });
  FILES.init({ sb, state, root, esc, friendlyError, toast, shell });

  // ---------------------------------------------------------------- router

  async function route() {
    const id = ++state.renderId;
    const lead = location.hash.match(/^#lead\/([^/?]+)/);
    if (lead) return PRUI.publicForm(lead[1]);
    if (!sb) return renderSetupNeeded();
    if (!state.session) return renderLogin();
    try {
      if (!state.me) await loadMe();
      if (id !== state.renderId) return;
      if (state.me.role === 'client' && state.workoutSession && !location.hash.startsWith('#training/log')) {
        const leavingWorkout = root.querySelector('#workout-log');
        if (leavingWorkout) {
          clearTimeout(state.workoutDraftTimer);
          await saveWorkoutDraft(leavingWorkout).catch(() => {});
        }
      }
      if (id !== state.renderId) return;
      const [path] = location.hash.replace(/^#/, '').split('?');
      const parts = path.split('/');

      if (state.me.role === 'coach') {
        if (parts[0] === 'prospects') return await PRUI.render(parts[1] === 'forms' ? 'forms' : 'list', parts[2]);
        if (parts[0] === 'client' && parts[1]) return await renderClient(parts[1], parts[2], parts[3], parts[4]);
        if (parts[0] === 'inbox') return await renderInbox(parts[1]);
        if (parts[0] === 'messages') return await MSG.coachInbox(parts[1]);
        if (parts[0] === 'files') return await FILES.coach(parts[1]);
        if (parts[0] === 'library') return await NUI.library(parts[1], parts[2], parts[3]);
        if (parts[0] === 'exercise-library') return await EUI.library();
        if (parts[0] === 'forms' && parts[1] && parts[2] === 'responses') return await FUI.responses(parts[1], parts[3]);
        if (parts[0] === 'forms' && parts[1]) return await FUI.builder(parts[1]);
        if (parts[0] === 'forms') return await FUI.library();
        if (parts[0] === 'clients') return await renderClients(parts[1]);
        return await renderClients();
      }

      if (!state.me.consent_at) return renderConsent();
      if (!state.me.full_name || !state.me.start_date) return renderOnboarding();
      switch (parts[0]) {
        case 'log':
          return await renderLog(parts[1]);
        case 'habits':
          return await renderHabits(parts[1], parts[2]);
        case 'meals':
          return await NUI.clientMeals(parts[1]);
        case 'recipes':
        case 'recipe':
        case 'recipe-import':
          return await NUI.library(parts[0], parts[1]);
        case 'hub':
          return await renderHub();
        case 'files':
          return await FILES.client(parts[1], parts[2], parts[3]);
        case 'coach-notes':
          return await renderClientCoachNotes();
        case 'calendar':
          return await CUI.calendar(await loadCtx(state.me.id, true), 'Calendar', 'Your coaching schedule', parts[1], parts[2]);
        case 'training':
          return parts[1] === 'log' ? await renderWorkoutLog(parts[2], Number(parts[3]) || undefined) : await renderTraining(parts[1]);
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
        case 'forms':
          return await FUI.clientList();
        case 'form':
          return await FUI.clientForm(parts[1]);
        case 'messages':
          return await MSG.clientThread();
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
  // never refreshed here, so unsaved edits cannot be lost. On Training the
  // client may be mid-workout (phone locked between sets), so the refresh
  // never touches a workout being typed and keeps the scroll position.
  async function refreshOpenClientPlan() {
    if (document.hidden || !state.me || state.me.role !== 'client' || !/^#(training|supps)(\/|$)/.test(location.hash)) return;
    const form = root.querySelector('#workout-log');
    if (form && (form.dataset.dirty || form.contains(document.activeElement))) return;
    const y = window.scrollY;
    const open = [...root.querySelectorAll('details')].map((el) => el.open);
    const id = state.renderId;
    try {
      if (location.hash.startsWith('#training/log') && state.trainingView) await renderWorkoutLog(state.trainingView.day, state.trainingView.cycleDay);
      else if (location.hash.startsWith('#training')) await renderTraining(location.hash.split('/')[1]);
      else await route();
    } catch (err) {
      return;
    }
    if (id + 1 < state.renderId) return;
    root.querySelectorAll('details').forEach((el, i) => {
      if (open[i] !== undefined) el.open = open[i];
    });
    window.scrollTo(0, y);
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
        clearTimeout(state.workoutDraftTimer);
        setActiveWorkout(null);
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
