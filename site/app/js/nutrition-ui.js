// Food database, meal plans and food logging screens for the coach and
// clients. Loaded after nutrition.js and ingredients.js and before app.js,
// which hands over its shared helpers with RewiredNutritionUI.init().
//
// The database enforces every rule (who may change what, plan versions,
// nutrition copied at logging time). These screens only make those rules
// easy to follow; nothing here is trusted for security.
(function () {
  'use strict';

  const N = window.RewiredNutrition;
  const I = window.RewiredIngredients;
  let h = null;
  let sb = null;
  let esc = null;
  let fmt = null;
  let S = null;

  function init(helpers) {
    h = helpers;
    ({ sb, esc, fmt, S } = helpers);
  }

  const me = () => h.state.me;
  const isCoach = () => me() && me().role === 'coach';

  // ---------------------------------------------------------------- data

  const START_DAYS = 14;
  const missingTable = (r) => r.error && /42P01|PGRST20[0-9]|does not exist|schema cache/i.test(`${r.error.code} ${r.error.message}`);

  // Plans and the last two weeks of logs. Older days load when opened.
  async function load(id) {
    const from = S.addDays(S.today(), -START_DAYS);
    const to = S.addDays(S.today(), 1);
    const [a, logs, entries] = await Promise.all([
      sb.from('plan_assignments').select('*').eq('client_id', id).order('version'),
      sb.from('meal_logs').select('*').eq('client_id', id).gte('day', from).lte('day', to),
      sb.from('food_log_entries').select('*').eq('client_id', id).gte('day', from).lte('day', to).order('created_at'),
    ]);
    if (missingTable(a) || missingTable(logs) || missingTable(entries)) {
      return { nutritionReady: false, assignments: [], mealLogs: [], foodEntries: [], foodRange: null };
    }
    return {
      nutritionReady: true,
      assignments: h.must(a),
      mealLogs: h.must(logs),
      foodEntries: h.must(entries),
      foodRange: [from, to],
    };
  }

  // Makes sure ctx holds the meal records for from..to.
  async function ensureRange(ctx, from, to) {
    if (!ctx.nutritionReady) return;
    const [a, b] = ctx.foodRange;
    if (from >= a && to <= b) return;
    const lo = from < a ? from : a;
    const hi = to > b ? to : b;
    const id = ctx.profile.id;
    const [logs, entries] = await Promise.all([
      sb.from('meal_logs').select('*').eq('client_id', id).gte('day', lo).lte('day', hi),
      sb.from('food_log_entries').select('*').eq('client_id', id).gte('day', lo).lte('day', hi).order('created_at'),
    ]);
    ctx.mealLogs = h.must(logs);
    ctx.foodEntries = h.must(entries);
    ctx.foodRange = [lo, hi];
  }

  // Daily targets: the assigned plan's (its own targets, or its total),
  // otherwise the weekly macro targets.
  function dayTarget(ctx, day) {
    const a = ctx.nutritionReady ? N.assignmentFor(ctx.assignments, day) : null;
    const t = a ? N.targetsFor(a, day) : null;
    if (t && t.calories) return t;
    const week = S.weekOf(ctx.profile.start_date, day) || Math.max(S.currentWeek(ctx.profile.start_date), 1);
    const m = S.macrosForWeek(ctx.macros, week);
    return m ? { calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fats_g: m.fats_g, fibre_g: m.fibre_g, from: 'weekly' } : null;
  }

  function report(ctx, day) {
    return N.dayReport({ assignments: ctx.assignments, day, mealLogs: ctx.mealLogs, entries: ctx.foodEntries });
  }

  // ------------------------------------------------------------- display

  const g = (v) => (v === null || v === undefined ? '–' : `${fmt(v, Number(v) < 10 && Number(v) % 1 ? 1 : 0)} g`);
  const kcal = (v) => N.formatKcal(v);
  const pcf = (n) => `P ${g(n.p)} · C ${g(n.c)} · F ${g(n.f)}`;
  const macroText = (n) => `${kcal(n.kcal)} · ${pcf(n)}${n.fibre !== null && n.fibre !== undefined ? ` · fibre ${g(n.fibre)}` : ''}`;

  function badges(f) {
    const q = N.QUALITY[f.quality] || { label: f.quality, hint: '' };
    const incomplete = f.complete === false || (f.complete === undefined && [f.kcal, f.protein_g, f.carbs_g, f.fat_g].some((v) => v === null));
    return `<span class="fbs"><span class="fb">${esc(N.SOURCES[f.source] || f.source)}</span><span class="fb q-${esc(f.quality)}" title="${esc(q.hint)}">${esc(q.label)}</span>${
      incomplete ? '<span class="fb warn" title="Some nutrition values are unknown">Incomplete</span>' : ''
    }${f.needs_review && !incomplete ? '<span class="fb warn">To check</span>' : ''}</span>`;
  }

  // "2 foods without full nutrition" warnings, so unknown never reads as zero.
  function unknownNote(total, who) {
    const n = total.incomplete;
    if (!n) return '';
    return `<p class="unknown-note">${n} food${n === 1 ? ' has' : 's have'} missing nutrition values, so ${who === 'coach' ? 'the real total is' : 'your real total is'} higher than shown. ${
      who === 'coach' ? 'They are in the review queue under Foods & plans.' : `${esc(h.COACH)} will check ${n === 1 ? 'it' : 'them'}.`
    }</p>`;
  }

  function macroTile(label, value, target, kind, unit) {
    const st = S.habitStatus(kind, value, target);
    const r = value !== null && value !== undefined && target ? Math.min(1, value / target) : 0;
    return `<div class="macro"><span class="mk">${label}</span><b>${value === null || value === undefined ? '–' : fmt(value)}<small> / ${target ? fmt(target) : '–'} ${unit}</small></b>
      <div class="pbar ${st.level || 'empty'}" aria-hidden="true"><span style="width:${Math.round(r * 100)}%"></span></div><span class="ms ${st.level || ''}">${esc(st.label || 'Not logged')}</span></div>`;
  }

  // Required notices for the data we show (AFCD licence clause 4A, ODbL).
  const AFCD_LIMITS =
    'There are limitations associated with food composition databases. Food composition data used in the database or databases may represent an average of the nutrient content of a particular sample of foods and ingredients, determined at a particular time. The nutrient composition of foods and ingredients can vary substantially between batches and brands because of a number of factors, including changes in season, processing practices and ingredient source, and methods of calculation.';
  function creditsHTML() {
    return `<details class="credits"><summary>Where the food data comes from</summary>
      <p><b>Australian Food Composition Database, Release 3</b>, Food Standards Australia New Zealand, used under the <a href="https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement" target="_blank" rel="noopener">FSANZ Data User Licence</a>. This information is based on Australian data, and Australian data may not be appropriate for use in other countries. ${AFCD_LIMITS}</p>
      <p><b>USDA FoodData Central</b>, U.S. Department of Agriculture, Agricultural Research Service (public domain, CC0).</p>
      <p><b>CoFID</b>: contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener">Open Government Licence v3.0</a>.</p>
      <p><b>Open Food Facts</b>: packaged foods from <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">openfoodfacts.org</a>, available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">Open Database License</a>. Label data typed in by volunteers, not checked by Rewired.</p>
      <p>"Self-reported" foods were typed in by hand. Home recipes are calculated from their ingredients.</p>
    </details>`;
  }

  async function authHeader() {
    const { data } = await sb.auth.getSession();
    const token = data && data.session ? data.session.access_token : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function callFunction(path, init) {
    const opts = init || {};
    let res;
    try {
      res = await fetch(`/.netlify/functions/${path}`, { ...opts, headers: { ...(opts.headers || {}), ...(await authHeader()) } });
    } catch (_) {
      throw new Error("You're offline. Try again when you have signal.");
    }
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      // not JSON: the functions are not deployed here
    }
    if (!body) throw new Error('This feature is not switched on yet. Ask your coach.');
    return { status: res.status, ok: res.ok, body };
  }

  function keepScroll(fn) {
    const y = window.scrollY;
    return Promise.resolve(fn()).then(() => window.scrollTo(0, y));
  }

  // ---------------------------------------------------------------- sheet

  function openSheet(title, body) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-head"><h2 id="sheet-title">${esc(title)}</h2><button type="button" class="sheet-x" data-close aria-label="Close">×</button></div>
      <div class="sheet-body">${body}</div></div>`;
    const closers = [];
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    function close() {
      if (!wrap.isConnected) return;
      wrap.remove();
      document.body.classList.remove('sheet-open');
      document.removeEventListener('keydown', onKey);
      closers.forEach((fn) => fn());
    }
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    document.body.classList.add('sheet-open');
    return { el: wrap, body: wrap.querySelector('.sheet-body'), close, onClose: (fn) => closers.push(fn) };
  }

  // ----------------------------------------------------------- food picker

  const COUNTRIES = [['AU', 'Australia'], ['NZ', 'New Zealand'], ['GB', 'United Kingdom'], ['IN', 'India'], ['US', 'United States'], ['CA', 'Canada'], ['SG', 'Singapore'], ['AE', 'United Arab Emirates']];
  const LIMITS = { kcal: 1000, p: 100, c: 130, f: 100, fibre: 100 };

  async function searchFoods(q, country, lim) {
    return h.must(await sb.rpc('food_search', { q, country: country || 'AU', lim: lim || 20 }));
  }

  // Search, barcode number or type it in, then choose an amount.
  // Resolves to { food, amount, portion } (amount in g or mL) or null.
  // opts.amount === false skips the amount step and resolves { food }.
  function pickFood(opts) {
    const o = { title: 'Add a food', country: 'AU', start: 'search', amount: true, ...opts };
    return new Promise((resolve) => {
      let done = false;
      const sheet = openSheet(o.title, `<div class="fp-tabs${o.macros ? ' four' : ''}" role="tablist">
          <button type="button" role="tab" data-tab="search">Search</button>
          <button type="button" role="tab" data-tab="barcode">Barcode number</button>
          <button type="button" role="tab" data-tab="create">Type it in</button>
          ${o.macros ? '<button type="button" role="tab" data-tab="macros">Macros only</button>' : ''}
        </div><div class="fp-pane"></div>`);
      sheet.onClose(() => {
        if (!done) resolve(null);
      });
      const finish = (v) => {
        done = true;
        sheet.close();
        resolve(v);
      };
      const pane = sheet.body.querySelector('.fp-pane');
      const tabs = sheet.body.querySelector('.fp-tabs');
      let lastQuery = '';

      function showTab(t, prefill) {
        tabs.hidden = false;
        tabs.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
        if (t === 'barcode') barcodePane(prefill);
        else if (t === 'create') createPane(prefill);
        else if (t === 'macros') macroPane();
        else searchPane();
      }
      tabs.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]');
        if (b) showTab(b.dataset.tab);
      });

      const chosen = (food) => (o.amount ? amountPane(food) : finish({ food }));

      function searchPane() {
        pane.innerHTML = `<input type="search" class="fp-q" placeholder="Search foods: paneer, basmati rice, Greek yoghurt…" aria-label="Search foods" autocomplete="off" value="${esc(lastQuery)}">
          <ul class="fp-results" aria-live="polite"></ul>
          <p class="hint">Foods from ${esc((COUNTRIES.find(([c]) => c === o.country) || [, 'your country'])[1])} come first. Can't find it? Try the barcode number or type it in.</p>`;
        const input = pane.querySelector('.fp-q');
        const list = pane.querySelector('.fp-results');
        let timer = null;
        let seq = 0;
        let hits = [];
        const run = async () => {
          const q = input.value.trim();
          lastQuery = q;
          const mine = ++seq;
          if (q.length < 2) {
            list.innerHTML = '';
            return;
          }
          list.innerHTML = '<li class="fp-none">Searching…</li>';
          try {
            hits = await searchFoods(q, o.country, 20);
          } catch (err) {
            if (mine === seq) list.innerHTML = `<li class="fp-none">${esc(h.friendlyError(err))}</li>`;
            return;
          }
          if (mine !== seq) return;
          list.innerHTML = hits.length
            ? hits
                .map(
                  (f, i) => `<li><button type="button" class="fp-hit" data-hit="${i}"><span class="fp-name"><b>${esc(f.name)}</b>${f.brand ? `<small>${esc(f.brand)}</small>` : ''}${badges(f)}</span>
                  <span class="fp-mac">${kcal(f.kcal)}<small>per 100 ${esc(f.basis)}</small></span></button></li>`,
                )
                .join('')
            : `<li class="fp-none">No match for "${esc(q)}". Try fewer words, or <button type="button" class="link-btn" data-goto-create>type it in</button>.</li>`;
        };
        input.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(run, 250);
        });
        list.addEventListener('click', (e) => {
          const b = e.target.closest('[data-hit]');
          if (b) return chosen(hits[Number(b.dataset.hit)]);
          if (e.target.closest('[data-goto-create]')) showTab('create', { name: input.value.trim() });
        });
        input.focus();
        if (lastQuery) run();
      }

      function barcodePane(prefill) {
        pane.innerHTML = `<form class="fp-form" novalidate>
            <label for="fp-code">Barcode number</label>
            <input id="fp-code" inputmode="numeric" autocomplete="off" placeholder="The 8 to 14 digits under the barcode" value="${esc((prefill && prefill.code) || '')}">
            <button type="submit" class="btn-dark wide">Look it up</button>
            <p class="hint" data-msg>Packaged foods come from Open Food Facts, a free database of product labels.</p>
          </form>`;
        const form = pane.querySelector('form');
        const msg = pane.querySelector('[data-msg]');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const code = form.querySelector('input').value.replace(/\D/g, '');
          if (!/^[0-9]{8,14}$/.test(code)) {
            msg.textContent = 'A barcode number has 8 to 14 digits.';
            return;
          }
          const btn = form.querySelector('button');
          btn.disabled = true;
          msg.textContent = 'Looking it up…';
          try {
            const local = await searchFoods(code, o.country, 5);
            if (local.length) return chosen(local[0]);
            const r = await callFunction(`food-barcode?code=${code}`);
            if (r.ok && r.body.food) return chosen(r.body.food);
            if (r.status === 404) {
              msg.innerHTML = `${esc(r.body.error || 'Not found.')} <button type="button" class="link-btn" data-goto-create>Type the label in</button>`;
              msg.querySelector('[data-goto-create]').addEventListener('click', () => showTab('create', { barcode: code }));
            } else msg.textContent = r.body.error || 'Barcode lookup is not available. Search by name instead.';
          } catch (err) {
            msg.textContent = h.friendlyError(err);
          } finally {
            btn.disabled = false;
          }
        });
        form.querySelector('input').focus();
      }

      function createPane(prefill) {
        const p = prefill || {};
        const coach = isCoach();
        const field = (k, l) => `<label class="fp-num"><span>${l}</span><input name="${k}" type="number" inputmode="decimal" min="0" step="any"></label>`;
        pane.innerHTML = `<form class="fp-form" novalidate>
            <label for="fp-name">Food name</label>
            <input id="fp-name" name="name" maxlength="200" required value="${esc(p.name || '')}" placeholder="e.g. Mum's besan laddoo">
            <div class="grid-2">
              <div><label for="fp-brand">Brand <span class="hint">(optional)</span></label><input id="fp-brand" name="brand" maxlength="120"></div>
              <div><label for="fp-bc">Barcode <span class="hint">(optional)</span></label><input id="fp-bc" name="barcode" inputmode="numeric" value="${esc(p.barcode || '')}"></div>
            </div>
            <fieldset class="fp-basis"><legend>Measured by</legend>
              <label><input type="radio" name="basis" value="g" checked> Weight (g)</label>
              <label><input type="radio" name="basis" value="mL"> Volume (mL)</label>
            </fieldset>
            <label for="fp-size">The values below are for</label>
            <div class="fp-amount-row"><input id="fp-size" name="size" type="number" inputmode="decimal" min="1" step="any" value="100"><span data-basis-unit>g</span></div>
            <p class="hint">Use the "per 100 g" column of a label, or one portion you weighed (for example 1 laddoo = 40 g).</p>
            <div class="fp-nums">
              <label class="fp-num"><span>Energy</span><span class="fp-energy"><input name="energy" type="number" inputmode="decimal" min="0" step="any"><select name="energy_unit" aria-label="Energy unit"><option value="kcal">kcal</option><option value="kJ">kJ</option></select></span></label>
              ${field('p', 'Protein (g)')}${field('c', 'Carbs (g)')}${field('f', 'Fat (g)')}${field('fibre', 'Fibre (g)')}
            </div>
            ${coach ? `<label for="fp-quality">These numbers are</label><select id="fp-quality" name="quality"><option value="label">From the product label</option><option value="estimate">My estimate</option></select>` : ''}
            <p class="hint">Don't know a value? Leave it blank. Blank means unknown, never zero${coach ? '' : `, and ${esc(h.COACH)} will check it`}.</p>
            <p class="form-msg" data-msg role="alert"></p>
            <button type="submit" class="btn-dark wide">Save food</button>
          </form>`;
        const form = pane.querySelector('form');
        form.addEventListener('change', (e) => {
          if (e.target.name === 'basis') pane.querySelector('[data-basis-unit]').textContent = e.target.value;
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const msg = form.querySelector('[data-msg]');
          const built = foodFromForm(form, o.country);
          if (built.error) {
            msg.textContent = built.error;
            return;
          }
          const btn = form.querySelector('button[type=submit]');
          btn.disabled = true;
          try {
            const food = h.must(await sb.from('foods').insert(built.row).select().single());
            o.defaultAmount = built.size;
            chosen(food);
          } catch (err) {
            msg.textContent = h.friendlyError(err);
          } finally {
            btn.disabled = false;
          }
        });
        form.querySelector('[name=name]').focus();
      }

      // Macros only: the client types the protein, carbs, fat and fibre of
      // what they ate and the Calories are worked out. Saved as a private,
      // self-reported food the caller retires once it is logged.
      function macroPane() {
        const field = (k, l) => `<label class="fp-num"><span>${l}</span><input name="${k}" type="number" inputmode="decimal" min="0" max="1000" step="any"></label>`;
        pane.innerHTML = `<form class="fp-form" novalidate>
            <label for="fp-mname">What did you eat? <span class="hint">(optional)</span></label>
            <input id="fp-mname" name="name" maxlength="120" value="${esc(o.macroName || '')}" placeholder="e.g. Chicken curry and rice">
            <div class="fp-nums">${field('p', 'Protein (g)')}${field('c', 'Carbs (g)')}${field('f', 'Fat (g)')}${field('fibre', 'Fibre (g)')}</div>
            <p class="fp-kcal" aria-live="polite"><span>Calories</span><b data-kcal>0 kcal</b></p>
            <p class="hint">Calories = protein × 4 + carbs × 4 + fat × 9 + fibre × 2. Enter the totals for the whole meal.</p>
            <p class="form-msg" data-msg role="alert"></p>
            <button type="submit" class="btn-dark wide">Add</button>
          </form>`;
        const form = pane.querySelector('form');
        const read = () => {
          const v = (k) => {
            const raw = form.querySelector(`[name=${k}]`).value.trim();
            return raw === '' ? 0 : Number(raw);
          };
          const m = { p: v('p'), c: v('c'), f: v('f'), fibre: v('fibre') };
          return { ...m, kcal: N.macroKcal(m) };
        };
        const update = () => {
          const m = read();
          form.querySelector('[data-kcal]').textContent = Number.isFinite(m.kcal) ? kcal(m.kcal) : '–';
        };
        form.addEventListener('input', update);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const msg = form.querySelector('[data-msg]');
          const m = read();
          if (['p', 'c', 'f', 'fibre'].some((k) => !Number.isFinite(m[k]) || m[k] < 0 || m[k] > 1000)) {
            msg.textContent = 'Each amount must be between 0 and 1000 g.';
            return;
          }
          if (!(m.p + m.c + m.f + m.fibre > 0)) {
            msg.textContent = 'Enter at least one of protein, carbs, fat or fibre.';
            return;
          }
          const name = (form.querySelector('[name=name]').value.trim() || o.macroName || 'Meal').slice(0, 120);
          const built = N.macroOnlyFood(m);
          const btn = form.querySelector('button[type=submit]');
          btn.disabled = true;
          try {
            const food = h.must(await sb.from('foods').insert({
              name, brand: MACRO_ONLY, basis: 'g', countries: [o.country || 'AU'],
              kcal: built.per100.kcal, protein_g: built.per100.p, carbs_g: built.per100.c, fat_g: built.per100.f, fibre_g: built.per100.fibre,
              source: 'client', quality: 'self_reported', shared: false, needs_review: false,
              notes: { macro_only: { protein_g: m.p, carbs_g: m.c, fat_g: m.f, fibre_g: m.fibre, kcal: Math.round(m.kcal) } },
            }).select().single());
            finish({ food, amount: built.amount, macroOnly: true });
          } catch (err) {
            msg.textContent = h.friendlyError(err);
          } finally {
            btn.disabled = false;
          }
        });
        form.querySelector('[name=p]').focus();
      }

      function amountPane(food) {
        tabs.hidden = true;
        const units = N.entryUnitsFor(food.basis);
        const portions = (Array.isArray(food.portions) ? food.portions : []).filter((x) => x && Number(x.amount) > 0);
        const start = o.defaultAmount || (portions[0] ? Number(portions[0].amount) : 100);
        let portion = portions[0] && !o.defaultAmount ? { label: portions[0].label, count: 1 } : null;
        pane.innerHTML = `<button type="button" class="link-btn fp-back" data-back>‹ Choose another food</button>
          <div class="fp-food"><b>${esc(food.name)}</b>${food.brand ? `<small>${esc(food.brand)}</small>` : ''}${badges(food)}
            <p class="hint">Per 100 ${esc(food.basis)}: ${esc(macroText(N.per100Of(food)))}</p></div>
          ${portions.length ? `<div class="chips">${portions.map((x, i) => `<button type="button" class="chip" data-portion="${i}">${esc(x.label)} · ${esc(N.formatAmount(x.amount, food.basis))}</button>`).join('')}</div>` : ''}
          <label for="fp-amt">How much?</label>
          <div class="fp-amount-row"><input id="fp-amt" type="number" inputmode="decimal" min="0" step="any" value="${start}"><select id="fp-unit" aria-label="Unit">${units.map((u) => `<option>${u}</option>`).join('')}</select></div>
          <p class="fp-preview" aria-live="polite"></p>
          ${food.complete === false ? '<p class="unknown-note">Some values are missing for this food. They count as unknown, not zero.</p>' : ''}
          <p class="form-msg" data-msg role="alert"></p>
          <button type="button" class="btn-dark wide" data-add>${esc(o.addLabel || 'Add')}</button>`;
        const amt = pane.querySelector('#fp-amt');
        const unit = pane.querySelector('#fp-unit');
        const preview = () => {
          const b = N.toBase(amt.value, unit.value, food.basis);
          pane.querySelector('.fp-preview').textContent = b.error ? '' : `${N.formatAmount(b.amount, b.unit)}: ${macroText(N.forAmount(N.per100Of(food), b.amount))}`;
        };
        pane.addEventListener('input', (e) => {
          if (e.target === amt) portion = null;
          preview();
        });
        unit.addEventListener('change', preview);
        pane.addEventListener('click', (e) => {
          if (e.target.closest('[data-back]')) return showTab('search');
          const pb = e.target.closest('[data-portion]');
          if (pb) {
            const x = portions[Number(pb.dataset.portion)];
            amt.value = x.amount;
            unit.value = food.basis;
            portion = { label: x.label, count: 1 };
            preview();
          }
          if (e.target.closest('[data-add]')) {
            const b = N.toBase(amt.value, unit.value, food.basis);
            if (b.error) {
              pane.querySelector('[data-msg]').textContent = b.error;
              return;
            }
            finish({ food, amount: b.amount, portion });
          }
        });
        preview();
        amt.focus();
        amt.select();
      }

      showTab(o.start);
    });
  }

  // Turns the "type it in" form into a foods row, per 100 g or mL.
  function foodFromForm(form, country) {
    const d = h.readForm(form);
    if (!d.name) return { error: 'Add the food name.' };
    const basis = d.basis === 'mL' ? 'mL' : 'g';
    const size = Number(d.size);
    if (!(size > 0) || size > 5000) return { error: `Enter the amount the values are for, in ${basis}.` };
    const energy = d.energy === null ? null : d.energy_unit === 'kJ' ? d.energy / 4.184 : d.energy;
    const scale = (v) => (v === null ? null : Math.round((v * 100 * 100) / size) / 100);
    const per = { kcal: scale(energy), p: scale(d.p), c: scale(d.c), f: scale(d.f), fibre: scale(d.fibre) };
    for (const [k, v] of Object.entries(per)) {
      if (v !== null && (v < 0 || v > LIMITS[k])) {
        return { error: `That works out to ${fmt(v)} ${k === 'kcal' ? 'kcal' : 'g'} per 100 ${basis}, which isn't possible. Check the amount and the numbers.` };
      }
    }
    if (d.barcode && !/^[0-9]{6,14}$/.test(d.barcode)) return { error: 'A barcode is 6 to 14 digits.' };
    const notes = {};
    // Energy far from what the macros add up to usually means a typo.
    if ([per.kcal, per.p, per.c, per.f].every((v) => v !== null)) {
      const fromMacros = per.p * 4 + per.c * 4 + per.f * 9;
      if (Math.abs(fromMacros - per.kcal) > Math.max(40, per.kcal * 0.25)) notes.energy_check = `Energy ${Math.round(per.kcal)} kcal vs ${Math.round(fromMacros)} kcal from macros`;
    }
    if (size !== 100) notes.entered_for = `${size} ${basis}`;
    const coach = isCoach();
    const row = {
      name: d.name.slice(0, 200), brand: d.brand, barcode: d.barcode, basis, countries: [country || 'AU'],
      kcal: per.kcal, protein_g: per.p, carbs_g: per.c, fat_g: per.f, fibre_g: per.fibre,
      source: coach ? 'coach' : 'client', quality: coach ? d.quality || 'label' : 'self_reported',
      shared: coach, notes: Object.keys(notes).length ? notes : null,
      needs_review: !coach || Boolean(notes.energy_check),
    };
    return { row, size };
  }

  // ------------------------------------------------------ meal card (shared)

  const STATUS_CHIP = { as_planned: 'good', adjusted: 'warn', replaced: 'warn', skipped: 'muted' };

  function statusLabel(log) {
    if (!log) return '';
    if (log.status === 'replaced') return log.scope === 'meal' ? 'Ate a different meal' : 'Swapped a food';
    return N.STATUS[log.status];
  }

  function itemRow(name, sub, n, extra) {
    const known = n.kcal !== null && n.kcal !== undefined;
    return `<li><span class="fi-name"><b>${esc(name)}</b><small>${sub}</small>${extra || ''}</span>
      <span class="fi-mac">${known ? kcal(n.kcal) : '<span class="unknown">kcal unknown</span>'}<small>${esc(pcf(n))}</small></span></li>`;
  }

  function plannedItemsHTML(meal) {
    return (meal.items || [])
      .map((it) => itemRow(it.name, `${esc(N.formatAmount(it.amount, it.unit))}${it.portion && it.portion.label ? ` · ${esc(it.portion.label)}` : ''}${it.brand ? ` · ${esc(it.brand)}` : ''}`, N.itemNutrition(it)))
      .join('');
  }

  function entryRows(entries, plannedItems) {
    const name = (id) => ((plannedItems || []).find((i) => i.id === id) || {}).name;
    return entries
      .map((e) => {
        const swapped = e.kind === 'substitute' && e.replaces ? `<small class="swap">instead of ${esc(name(e.replaces) || 'a planned food')}</small>` : '';
        const tag = e.quality === 'self_reported' ? ' · <span class="fb q-self_reported">Self-reported</span>' : e.needs_review ? ' · <span class="fb warn">Incomplete</span>' : '';
        return itemRow(e.name, `${esc(N.formatAmount(e.amount, e.unit))}${tag}`, N.entryNutrition(e), swapped);
      })
      .join('');
  }

  function mealCardHTML(m, opts) {
    const o = opts || {};
    const meal = m.meal;
    const head = `<div class="ml-head"><div>${mealTitleHTML(o.names, `plan:${meal.id}`, meal.name, Boolean(o.canLog))}<small>${meal.time ? `${esc(meal.time)} · ` : ''}Planned ${kcal(m.planned.kcal)}</small></div>
      ${m.log ? `<span class="ml-chip ${STATUS_CHIP[m.log.status]}">${esc(statusLabel(m.log))}</span>` : ''}</div>`;
    let body;
    if (!m.log) body = `<ul class="fi-list">${plannedItemsHTML(meal)}</ul>${meal.note ? `<p class="ml-note">${esc(meal.note)}</p>` : ''}`;
    else if (m.log.status === 'skipped') body = `<p class="ml-sum">Skipped. Nothing from this meal counts towards today.</p>`;
    else {
      const diff = m.actual.kcal - m.planned.kcal;
      body = `<p class="ml-sum">Ate ${kcal(m.actual.kcal)}${m.log.status !== 'as_planned' && Math.abs(diff) >= 1 ? ` <span class="delta">${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} vs plan</span>` : ''}</p>
        <ul class="fi-list">${entryRows(m.entries, meal.items)}</ul>
        ${m.log.status !== 'as_planned' ? `<details class="ml-planned"><summary>What was planned</summary><ul class="fi-list">${plannedItemsHTML(m.log.planned || meal)}</ul></details>` : ''}`;
    }
    if (m.log && m.log.note) body += `<p class="ml-note">“${esc(m.log.note)}”</p>`;
    let actions = '';
    if (o.canLog && !m.log) {
      actions = `<div class="ml-actions">
        <button type="button" class="btn-dark" data-act="as_planned">Ate as planned</button>
        <button type="button" class="ml-btn" data-act="replaced">Something different</button>
        <button type="button" class="ml-btn" data-act="adjusted">Different amount</button>
        <button type="button" class="ml-btn" data-act="skipped">Skipped</button></div>`;
    } else if (o.canLog) {
      actions = `<div class="ml-actions"><button type="button" class="ml-btn" data-act="change">Change</button><button type="button" class="ml-btn" data-act="undo">Undo</button></div>`;
    }
    return `<section class="meal-card ml${m.log ? ` logged ${m.log.status}` : ''}" data-meal="${esc(meal.id)}">${head}${body}${actions}<div class="ml-editor" hidden></div></section>`;
  }

  function entryListHTML(entries, canEdit) {
    if (!entries.length) return '';
    return `<ul class="fi-list">${entries
      .map((e) => {
        const n = N.entryNutrition(e);
        const macroOnly = e.brand === MACRO_ONLY;
        const tag = macroOnly ? '<span class="fb q-macro">Macros only</span>' : e.quality === 'self_reported' ? ' · <span class="fb q-self_reported">Self-reported</span>' : e.needs_review ? ' · <span class="fb warn">Incomplete</span>' : '';
        return `<li data-entry="${e.id}"><span class="fi-name"><b>${esc(e.name)}</b><small>${macroOnly ? '' : esc(N.formatAmount(e.amount, e.unit))}${tag}</small></span>
          <span class="fi-mac">${n.kcal === null ? '<span class="unknown">kcal unknown</span>' : kcal(n.kcal)}<small>${esc(pcf(n))}${macroOnly && n.fibre ? ` · Fibre ${fmt(n.fibre)}` : ''}</small></span>
          ${canEdit ? `<span class="fi-tools">${macroOnly ? '' : '<button type="button" class="ml-btn small" data-entry-edit>Edit</button>'}<button type="button" class="ml-btn small x" data-entry-del aria-label="Remove ${esc(e.name)}">×</button></span>` : ''}</li>`;
      })
      .join('')}</ul>`;
  }

  // ------------------------------------------------------------ client: meals

  const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

  // Foods saved from "Macros only" carry this brand so their log entries can
  // show the macros instead of a weight.
  const MACRO_ONLY = 'Macros only';

  // Clients can rename their meals. profiles.meal_names maps a meal key
  // (a food log slot such as "Breakfast", or "plan:<meal id>") to their name.
  const mealNameOf = (names, key, fallback) => {
    const v = names && typeof names[key] === 'string' ? names[key].trim() : '';
    return v || fallback;
  };
  const PENCIL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  function mealTitleHTML(names, key, fallback, renamable) {
    const name = mealNameOf(names, key, fallback);
    return `<h3 data-title-for="${esc(key)}">${esc(name)}${renamable ? ` <button type="button" class="ml-rename" data-rename="${esc(key)}" data-default="${esc(fallback)}" aria-label="Rename ${esc(name)}">${PENCIL}</button>` : ''}</h3>${!renamable && name !== fallback ? `<small class="ml-orig">Was ${esc(fallback)}</small>` : ''}`;
  }

  // Extra meals a client adds themself (overate, or ate a meal that isn't on
  // the plan). Stored as ordinary food log entries whose slot is "Meal: <name>".
  const EXTRA_MEAL = 'Meal: ';
  const isExtraMeal = (e) => typeof e.slot === 'string' && e.slot.startsWith(EXTRA_MEAL);
  const extraMealName = (slot) => slot.slice(EXTRA_MEAL.length);

  function extraMealsHTML(entries, canLog, opts = {}, names) {
    const meals = [];
    for (const e of entries.filter(isExtraMeal)) {
      let m = meals.find((x) => x.slot === e.slot);
      if (!m) meals.push((m = { slot: e.slot, list: [] }));
      m.list.push(e);
    }
    const cards = meals.map((m) => {
      const sum = N.sum(m.list.map(N.entryNutrition));
      const label = mealNameOf(names, m.slot, extraMealName(m.slot));
      return `<div class="meal-card fl-slot extra-meal" data-slot="${esc(m.slot)}"><div class="ml-head"><div>${mealTitleHTML(names, m.slot, extraMealName(m.slot), canLog)}<small>${kcal(sum.kcal)}</small></div>${opts.tag ? '<span class="xm-tag">Added by client</span>' : ''}</div>
        ${entryListHTML(m.list, canLog)}${canLog ? `<button type="button" class="add-row" data-add-extra="${esc(m.slot)}" data-label="${esc(label)}">+ Add to ${esc(label.toLowerCase())}</button>` : ''}</div>`;
    }).join('');
    const next = `Extra meal ${meals.length + 1}`;
    const add = canLog ? `<div class="xm-new">
        <button type="button" class="add-row" data-new-meal>+ Add another meal</button>
        <form class="xm-form" data-new-meal-form hidden novalidate>
          <label>Meal name<input type="text" maxlength="30" value="${esc(next)}" data-meal-name></label>
          <div class="xm-actions"><button type="button" class="ml-btn" data-new-meal-cancel>Cancel</button><button type="submit" class="btn">Add food</button></div>
        </form></div>` : '';
    return { count: meals.length, html: cards + add };
  }

  async function clientMeals(dayParam) {
    const now = S.today();
    const tomorrow = S.addDays(now, 1);
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam <= tomorrow ? dayParam : now;
    const ctx = await h.loadCtx(me().id);
    const p = ctx.profile;
    const country = p.country || 'AU';
    await ensureRange(ctx, day, day);
    const target = dayTarget(ctx, day);
    const week = S.weekOf(p.start_date, day) || Math.max(S.currentWeek(p.start_date), 1);
    const label = day === now ? 'Today' : day === tomorrow ? 'Tomorrow' : day === S.addDays(now, -1) ? 'Yesterday' : h.niceDate(day);
    const canLog = ctx.nutritionReady && day <= now;
    const header = `<div class="daybar">
        <a class="btn btn-ghost" href="#meals/${S.addDays(day, -1)}" aria-label="Previous day">‹</a>
        <h2>${esc(label)}<div class="hint">${h.niceDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</div></h2>
        ${day < tomorrow ? `<a class="btn btn-ghost" href="#meals/${S.addDays(day, 1)}" aria-label="Next day">›</a>` : '<span style="width:48px"></span>'}
      </div>`;

    if (!ctx.nutritionReady) {
      const log = ctx.logs.find((l) => l.day === day) || {};
      return h.shell('Meal plan', `Week ${week} of 12`, `${header}${target ? `<div class="macro-grid">${macroTile('Calories', log.calories, target.calories, 'calories', 'kcal')}${macroTile('Protein', log.protein_g, target.protein_g, 'protein', 'g')}</div>` : ''}
        <div class="plan-empty"><span class="qt-ic" aria-hidden="true">${h.ICONS.meals}</span><div><b>Meal logging is on its way</b><p>${esc(h.COACH)} is setting it up. Until then, log your daily totals in the check-in.</p></div></div>
        <a class="btn-dark wide" href="#log/${day}">Open the daily check-in</a>`, 'meals');
    }

    const r = report(ctx, day);
    const a = r.assignment;
    const t = r.actualTotal;
    const kst = S.habitStatus('calories', t.items ? t.kcal : null, target && target.calories);
    let main;
    const names = p.meal_names || {};
    const xm = extraMealsHTML(r.extras, canLog, {}, names);
    if (r.isPlan) {
      const meals = r.meals.map((m) => mealCardHTML(m, { canLog, names })).join('');
      const earlier = r.earlier.length
        ? `<section><h2 class="sec-title">Logged on an earlier plan</h2><p class="sec-sub">${esc(h.COACH)} updated your plan after you logged these. They still count.</p>${r.earlier.map((m) => mealCardHTML(m, {})).join('')}</section>`
        : '';
      main = `<section><h2 class="sec-title">Your meals</h2><p class="sec-sub">${esc(a.name)} · set by ${esc(h.COACH)}. Tap what happened at each meal.</p>
          ${r.meals.length ? `<div class="ml-list">${meals}</div>` : `<div class="plan-empty"><div><b>No set meals today</b><p>Your plan has nothing set for ${esc(N.WEEKDAY_NAMES[N.weekdayKey(day)])}. Log what you eat below.</p></div></div>`}</section>
        ${earlier}
        ${xm.html ? `<section><h2 class="sec-title">Extra meals</h2><p class="sec-sub">Ate more than planned, or had a meal that isn't on your plan? Add it as its own meal.</p>${xm.html}</section>` : ''}
        <section><h2 class="sec-title">Extras and snacks</h2><p class="sec-sub">Anything you ate that isn't in the plan.</p>
          <div class="meal-card fl-slot" data-slot="Extras">${entryListHTML(r.extras.filter((e) => !isExtraMeal(e)), canLog)}${canLog ? '<button type="button" class="add-row" data-add-extra="Extras">+ Add food or snack</button>' : r.extras.some((e) => !isExtraMeal(e)) ? '' : '<p class="hint">Nothing logged.</p>'}</div></section>`;
    } else {
      const bySlot = (s) => r.extras.filter((e) => !isExtraMeal(e) && (SLOTS.includes(e.slot) ? e.slot : 'Snacks') === s);
      main = `<section><h2 class="sec-title">Food log</h2><p class="sec-sub">${a ? `Daily targets from ${esc(h.COACH)}: ${esc(a.name)}.` : 'Log what you eat and land close to your targets.'}</p>
        ${SLOTS.map((s) => {
          const list = bySlot(s);
          const sum = N.sum(list.map(N.entryNutrition));
          const label = mealNameOf(names, s, s);
          return `<div class="meal-card fl-slot" data-slot="${s}"><div class="ml-head"><div>${mealTitleHTML(names, s, s, canLog)}${list.length ? `<small>${kcal(sum.kcal)}</small>` : ''}</div></div>
            ${entryListHTML(list, canLog)}${canLog ? `<button type="button" class="add-row" data-add-extra="${s}" data-label="${esc(label)}">+ Add to ${esc(label.toLowerCase())}</button>` : ''}</div>`;
        }).join('')}${xm.html}</section>`;
    }

    h.shell(
      'Meal plan',
      `Week ${week} of 12`,
      `${header}
      <section class="score left">
        <p class="label">${day === now ? 'Eaten today' : day > now ? 'Planned' : 'Eaten'}</p>
        <div class="big-num">${fmt(day > now ? r.plannedTotal.kcal : t.kcal)}<span> kcal</span></div>
        <p class="label">${target ? `of ${fmt(target.calories)} kcal target${target.from === 'plan' ? ' (your plan’s total)' : ''}` : 'No calorie target yet'}${kst.label && t.items && day <= now ? ` · <b class="ms ${kst.level}">${esc(kst.label)}</b>` : ''}</p>
      </section>
      ${unknownNote(t)}
      ${target ? `<div class="macro-grid">
        ${macroTile('Protein', t.items ? t.p : null, target.protein_g, 'protein', 'g')}
        ${macroTile('Carbs', t.items ? t.c : null, target.carbs_g, 'calories', 'g')}
        ${macroTile('Fats', t.items ? t.f : null, target.fats_g, 'calories', 'g')}
        ${macroTile('Fibre', t.items ? t.fibre : null, target.fibre_g || ctx.targets.fibre_target_g, 'fibre', 'g')}
      </div>` : ''}
      ${a && a.coach_note ? `<div class="note-card"><span class="note-mark" aria-hidden="true">R<i>.</i></span><div><p class="kicker">From ${esc(h.COACH)}</p><p>${esc(a.coach_note)}</p></div></div>` : ''}
      ${day > now ? '<p class="hint">You can log these meals on the day.</p>' : ''}
      ${main}
      <p class="hint"><a href="#recipes">My recipes</a>: save a dish you cook often and log it in one tap.</p>
      ${creditsHTML()}`,
      'meals',
    );
    bindClientMeals(ctx, r, day, country);
  }

  async function logMeal(day, assignmentId, mealId, status, items, scope, note) {
    h.must(await sb.rpc('log_meal', { p_day: day, p_assignment: assignmentId, p_meal_id: mealId, p_status: status, p_items: items || null, p_scope: scope || null, p_note: note || null }));
  }

  function bindClientMeals(ctx, r, day, country) {
    const root = h.root;
    const refresh = () => keepScroll(async () => {
      h.invalidate(me().id);
      await clientMeals(day);
    });
    const run = (button, fn, done) =>
      h.withBusy(button, async () => {
        await fn();
        await refresh();
        if (done) h.toast(done);
      });
    const mealOf = (card) => r.meals.find((m) => m.meal.id === card.dataset.meal) || r.earlier.find((m) => m.meal && m.meal.id === card.dataset.meal);

    root.querySelectorAll('.ml').forEach((card) => {
      card.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const m = mealOf(card);
        const act = b.dataset.act;
        const assignmentId = m.log ? m.log.assignment_id : r.assignment.id;
        if (act === 'as_planned') return run(b, () => logMeal(day, assignmentId, m.meal.id, 'as_planned'), `${m.meal.name}: logged as planned.`);
        if (act === 'skipped') return run(b, () => logMeal(day, assignmentId, m.meal.id, 'skipped'), `${m.meal.name}: marked as skipped.`);
        if (act === 'undo') return run(b, async () => h.must(await sb.rpc('clear_meal_log', { p_meal_log: m.log.id })), `${m.meal.name}: record removed.`);
        if (act === 'adjusted') return openAdjust(card, m, assignmentId);
        if (act === 'replaced') return openReplace(card, m, assignmentId);
        if (act === 'change') return openChange(card, m, assignmentId);
      });
    });

    function editor(card, html) {
      const box = card.querySelector('.ml-editor');
      card.querySelectorAll('.ml-actions').forEach((x) => (x.hidden = true));
      box.hidden = false;
      box.innerHTML = `${html}<label class="ml-note-field">Note for ${esc(h.COACH)} <span class="hint">(optional)</span><input data-note maxlength="500"></label>
        <p class="form-msg" data-msg role="alert"></p>
        <div class="row-actions"><button type="button" class="btn-dark" data-save>Save</button><button type="button" class="ml-btn" data-cancel>Cancel</button></div>`;
      box.querySelector('[data-cancel]').addEventListener('click', () => {
        box.hidden = true;
        box.innerHTML = '';
        card.querySelectorAll('.ml-actions').forEach((x) => (x.hidden = false));
      });
      return box;
    }

    function openChange(card, m, assignmentId) {
      const box = editor(card, `<p class="ml-q">What happened at ${esc(m.meal.name)}?</p><div class="ml-actions">
        <button type="button" class="btn-dark" data-pick="as_planned">Ate as planned</button>
        <button type="button" class="ml-btn" data-pick="replaced">Something different</button>
        <button type="button" class="ml-btn" data-pick="adjusted">Different amount</button>
        <button type="button" class="ml-btn" data-pick="skipped">Skipped</button></div>`);
      box.querySelector('[data-save]').hidden = true;
      box.querySelector('.ml-note-field').hidden = true;
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b) return;
        const act = b.dataset.pick;
        if (act === 'as_planned' || act === 'skipped') return run(b, () => logMeal(day, assignmentId, m.meal.id, act), `${m.meal.name} updated.`);
        if (act === 'adjusted') return openAdjust(card, m, assignmentId);
        return openReplace(card, m, assignmentId);
      });
    }

    function openAdjust(card, m, assignmentId) {
      const logged = (id) => (m.log && m.log.status === 'adjusted' ? m.entries.find((e) => e.planned_item_id === id) : null);
      const items = m.meal.items || [];
      const box = editor(card, `<p class="ml-q">How much did you have? Put 0 for anything you didn't eat.</p>
        <ul class="adj-list">${items
          .map((it) => {
            const prev = logged(it.id);
            const v = m.log && m.log.status === 'adjusted' ? (prev ? Number(prev.amount) : 0) : Number(it.amount);
            return `<li><span class="fi-name"><b>${esc(it.name)}</b><small>Planned ${esc(N.formatAmount(it.amount, it.unit))}</small></span>
              <span class="adj-amt"><input type="number" inputmode="decimal" min="0" step="any" value="${v}" data-item="${esc(it.id)}" aria-label="Amount of ${esc(it.name)}"><span>${esc(it.unit)}</span></span></li>`;
          })
          .join('')}</ul><p class="ml-sum" data-total></p>`);
      const total = () => {
        const list = items.map((it) => N.forAmount(it.per100, Number(box.querySelector(`[data-item="${CSS.escape(it.id)}"]`).value) || 0));
        box.querySelector('[data-total]').textContent = `Total ${kcal(N.sum(list).kcal)} (planned ${kcal(m.planned.kcal)})`;
      };
      box.addEventListener('input', total);
      total();
      if (m.log) box.querySelector('[data-note]').value = m.log.note || '';
      box.querySelector('[data-save]').addEventListener('click', (e) => {
        const msg = box.querySelector('[data-msg]');
        const out = [];
        for (const it of items) {
          const v = Number(box.querySelector(`[data-item="${CSS.escape(it.id)}"]`).value);
          if (Number.isNaN(v) || v < 0) return (msg.textContent = 'Amounts must be 0 or more.');
          if (v > 5000) return (msg.textContent = 'Amounts must be under 5 kg or 5 L.');
          if (v > 0) out.push({ planned_item_id: it.id, amount: Math.round(v * 10) / 10 });
        }
        if (!out.length) return (msg.textContent = 'Nothing eaten? Use Skipped instead.');
        run(e.target, () => logMeal(day, assignmentId, m.meal.id, 'adjusted', out, null, box.querySelector('[data-note]').value.trim()), `${m.meal.name}: amounts saved.`);
      });
    }

    function openReplace(card, m, assignmentId) {
      const items = m.meal.items || [];
      const prev = m.log && m.log.status === 'replaced' ? m.log : null;
      let scope = prev ? prev.scope : items.length > 1 ? 'food' : 'meal';
      // Whole meal: a list of foods. One food: which planned item, and what instead.
      let foods = prev && prev.scope === 'meal' ? m.entries.map((e) => ({ food: { id: e.food_id, name: e.name, basis: e.unit }, amount: Number(e.amount), entry: e })) : [];
      const sub = prev && prev.scope === 'food' ? m.entries.find((e) => e.kind === 'substitute') : null;
      let swap = sub ? { replaces: sub.replaces, food: { id: sub.food_id, name: sub.name, basis: sub.unit }, amount: Number(sub.amount), entry: sub } : { replaces: items[0] && items[0].id };
      const box = editor(card, `<div class="seg" role="radiogroup" aria-label="What changed">
          <label><input type="radio" name="scope-${esc(m.meal.id)}" value="food"${scope === 'food' ? ' checked' : ''}${items.length ? '' : ' disabled'}> Swapped one food</label>
          <label><input type="radio" name="scope-${esc(m.meal.id)}" value="meal"${scope === 'meal' ? ' checked' : ''}> A different meal</label>
        </div><div data-scope-body></div>`);
      if (prev) box.querySelector('[data-note]').value = prev.note || '';
      const body = box.querySelector('[data-scope-body]');
      const draw = () => {
        if (scope === 'food') {
          body.innerHTML = `<p class="ml-q">Which food did you swap?</p>
            <div class="radio-list">${items.map((it) => `<label><input type="radio" name="rep-${esc(m.meal.id)}" value="${esc(it.id)}"${swap.replaces === it.id ? ' checked' : ''}> ${esc(it.name)} <small>${esc(N.formatAmount(it.amount, it.unit))}</small></label>`).join('')}</div>
            <p class="ml-q">What did you have instead?</p>
            ${swap.food ? `<ul class="fi-list"><li><span class="fi-name"><b>${esc(swap.food.name)}</b><small>${esc(N.formatAmount(swap.amount, swap.food.basis))}</small></span></li></ul>` : ''}
            <button type="button" class="add-row" data-choose>${swap.food ? 'Choose a different food' : '+ Choose the food'}</button>
            <p class="hint">The rest of the meal is logged as planned.</p>`;
        } else {
          body.innerHTML = `<p class="ml-q">What did you eat?</p>
            <ul class="fi-list">${foods.map((x, i) => `<li><span class="fi-name"><b>${esc(x.food.name)}</b><small>${esc(N.formatAmount(x.amount, x.food.basis))}</small></span><span class="fi-tools"><button type="button" class="ml-btn small x" data-remove="${i}" aria-label="Remove ${esc(x.food.name)}">×</button></span></li>`).join('')}</ul>
            <button type="button" class="add-row" data-add-food>+ Add a food</button>`;
        }
      };
      draw();
      box.addEventListener('change', (e) => {
        if (e.target.name === `scope-${m.meal.id}`) {
          scope = e.target.value;
          draw();
        } else if (e.target.name === `rep-${m.meal.id}`) swap.replaces = e.target.value;
      });
      box.addEventListener('click', async (e) => {
        if (e.target.closest('[data-choose]')) {
          const planned = items.find((it) => it.id === swap.replaces);
          const pick = await pickFood({ title: planned ? `Instead of ${planned.name}` : 'What you ate', country, defaultAmount: planned && planned.unit ? Number(planned.amount) : undefined, addLabel: 'Use this food' });
          if (pick) {
            swap = { replaces: swap.replaces, food: pick.food, amount: pick.amount };
            draw();
          }
        }
        if (e.target.closest('[data-add-food]')) {
          const pick = await pickFood({ title: `${m.meal.name}: what you ate`, country });
          if (pick) {
            foods.push(pick);
            draw();
          }
        }
        const rm = e.target.closest('[data-remove]');
        if (rm) {
          foods.splice(Number(rm.dataset.remove), 1);
          draw();
        }
      });
      box.querySelector('[data-save]').addEventListener('click', (e) => {
        const msg = box.querySelector('[data-msg]');
        const note = box.querySelector('[data-note]').value.trim();
        let out;
        if (scope === 'food') {
          if (!swap.replaces) return (msg.textContent = 'Choose the planned food you swapped.');
          if (!swap.food) return (msg.textContent = 'Choose what you had instead.');
          out = items.filter((it) => it.id !== swap.replaces).map((it) => ({ planned_item_id: it.id, amount: Number(it.amount) }));
          out.push({ food_id: swap.food.id, amount: swap.amount, replaces: swap.replaces });
        } else {
          if (!foods.length) return (msg.textContent = 'Add what you ate, or use Skipped.');
          out = foods.map((x) => ({ food_id: x.food.id, amount: x.amount, replaces: null }));
        }
        run(e.target, () => logMeal(day, assignmentId, m.meal.id, 'replaced', out, scope, note), `${m.meal.name}: saved.`);
      });
    }

    // Extras, snacks and the macro-only food log.
    root.querySelectorAll('[data-add-extra]').forEach((b) =>
      b.addEventListener('click', async () => {
        const slot = b.dataset.addExtra;
        const label = b.dataset.label || (slot.startsWith(EXTRA_MEAL) ? extraMealName(slot) : slot);
        addToSlot(b, slot, slot === 'Extras' ? 'Add an extra' : `Add to ${label.toLowerCase()}`, slot === 'Extras' ? 'Snack' : label);
      }),
    );
    async function addToSlot(button, slot, title, macroName) {
      const pick = await pickFood({ title, country, macros: true, macroName });
      if (!pick) return;
      run(button, async () => {
        h.must(await sb.from('food_log_entries').insert({
          day, slot, food_id: pick.food.id, amount: pick.amount,
          // The database copies these from the food; sent only to satisfy the column rules.
          name: pick.food.name, source: pick.food.source, quality: pick.food.quality, unit: pick.food.basis,
        }));
        // A macros-only food is a one-off: keep it out of future searches.
        if (pick.macroOnly) await sb.from('foods').update({ retired_at: new Date().toISOString() }).eq('id', pick.food.id);
      }, `${pick.food.name} added.`);
    }

    // Rename a meal (client only). Saved to profiles.meal_names.
    root.querySelectorAll('[data-rename]').forEach((b) =>
      b.addEventListener('click', () => {
        const key = b.dataset.rename;
        const fallback = b.dataset.default;
        const title = b.closest('h3');
        const current = mealNameOf(ctx.profile.meal_names, key, fallback);
        const box = document.createElement('form');
        box.className = 'ml-rename-form';
        box.noValidate = true;
        box.innerHTML = `<input type="text" maxlength="30" value="${esc(current)}" aria-label="Meal name">
          <button type="submit" class="ml-btn small primary">Save</button>
          ${current !== fallback ? `<button type="button" class="ml-btn small" data-reset>Reset to ${esc(fallback)}</button>` : ''}
          <button type="button" class="ml-btn small" data-cancel>Cancel</button>`;
        title.hidden = true;
        title.after(box);
        const input = box.querySelector('input');
        input.focus();
        input.select();
        const save = (button, value) => {
          const next = { ...(ctx.profile.meal_names || {}) };
          const v = (value || '').replace(/\s+/g, ' ').trim().slice(0, 30);
          if (!v || v === fallback) delete next[key];
          else next[key] = v;
          run(button, async () => {
            const res = await sb.from('profiles').update({ meal_names: next }).eq('id', me().id);
            if (res.error && /meal_names/.test(res.error.message || '')) throw new Error(`Renaming meals switches on once ${h.COACH} finishes the app update.`);
            h.must(res);
            ctx.profile.meal_names = next;
            if (h.state.me && h.state.me.id === ctx.profile.id) h.state.me.meal_names = next;
          }, v && v !== fallback ? `Renamed to ${v}.` : `Back to ${fallback}.`);
        };
        box.addEventListener('submit', (e) => {
          e.preventDefault();
          save(box.querySelector('[type=submit]'), input.value);
        });
        box.addEventListener('click', (e) => {
          if (e.target.closest('[data-reset]')) save(e.target, '');
          if (e.target.closest('[data-cancel]')) {
            box.remove();
            title.hidden = false;
          }
        });
      }),
    );
    const newMeal = root.querySelector('[data-new-meal]');
    const newMealForm = root.querySelector('[data-new-meal-form]');
    if (newMeal && newMealForm) {
      const nameInput = newMealForm.querySelector('[data-meal-name]');
      newMeal.addEventListener('click', () => {
        newMeal.hidden = true;
        newMealForm.hidden = false;
        nameInput.focus();
        nameInput.select();
      });
      newMealForm.querySelector('[data-new-meal-cancel]').addEventListener('click', () => {
        newMealForm.hidden = true;
        newMeal.hidden = false;
      });
      newMealForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = nameInput.value.replace(/\s+/g, ' ').trim().slice(0, 30);
        if (!name) return h.toast('Give the meal a name.', true);
        addToSlot(newMealForm.querySelector('[type="submit"]'), EXTRA_MEAL + name, `Add to ${name.toLowerCase()}`);
      });
    }
    root.querySelectorAll('[data-entry]').forEach((li) => {
      const entry = ctx.foodEntries.find((e) => e.id === li.dataset.entry);
      const del = li.querySelector('[data-entry-del]');
      const edit = li.querySelector('[data-entry-edit]');
      if (del) del.addEventListener('click', () => run(del, async () => h.must(await sb.from('food_log_entries').delete().eq('id', entry.id)), `${entry.name} removed.`));
      if (edit)
        edit.addEventListener('click', () => {
          const tools = li.querySelector('.fi-tools');
          tools.innerHTML = `<span class="adj-amt"><input type="number" inputmode="decimal" min="0" step="any" value="${Number(entry.amount)}" aria-label="New amount"><span>${esc(entry.unit)}</span></span><button type="button" class="ml-btn small" data-ok>Save</button>`;
          const input = tools.querySelector('input');
          input.focus();
          input.select();
          tools.querySelector('[data-ok]').addEventListener('click', (e) => {
            const v = Number(input.value);
            if (!(v > 0) || v > 5000) return h.toast('Enter an amount between 0 and 5000.', true);
            run(e.target, async () => h.must(await sb.from('food_log_entries').update({ amount: v }).eq('id', entry.id)), 'Amount updated.');
          });
        });
    });
  }

  // For the daily check-in: food totals come from the food log when it has entries.
  function checkinFoodHTML(ctx, day) {
    const log = ctx.logs.find((l) => l.day === day) || {};
    if (!log.food_from_log) return null;
    const unknown = Number(log.food_unknown_items) || 0;
    return `<div class="from-log"><p>From your food log</p>
      <div class="targets"><span><b>${fmt(log.calories)}</b> kcal</span><span><b>${fmt(log.protein_g)}</b>g protein</span><span><b>${fmt(log.carbs_g)}</b>g carbs</span><span><b>${fmt(log.fats_g)}</b>g fats</span><span><b>${fmt(log.fibre_g)}</b>g fibre</span></div>
      ${unknown ? `<p class="unknown-note">${unknown} food${unknown === 1 ? ' has' : 's have'} missing values, so the real total is higher.</p>` : ''}
      <a href="#meals/${day}">Change what you ate ›</a></div>`;
  }

  function hasMealPlan(ctx, day) {
    const a = ctx.nutritionReady ? N.assignmentFor(ctx.assignments, day) : null;
    return Boolean(a && a.kind === 'meal_plan');
  }

  // ------------------------------------------------------ plan preview (coach)

  function planPreviewHTML(plan, selectedDay) {
    if (!plan || !plan.days) return '';
    const weekly = plan.schedule === 'weekly';
    const key = weekly ? selectedDay || N.weekdayKey(S.today()) : 'all';
    const d = plan.days.find((x) => x.day === key) || plan.days[0];
    const tot = N.sum((d.meals || []).map(N.mealPlanned).map((t) => ({ kcal: t.kcal, p: t.p, c: t.c, f: t.f, fibre: t.fibre })));
    return `${weekly ? `<div class="chips" role="tablist">${plan.days.map((x) => `<button type="button" class="chip" data-preview-day="${x.day}" aria-selected="${x.day === d.day}">${esc(N.WEEKDAY_NAMES[x.day].slice(0, 3))}</button>`).join('')}</div>` : ''}
      ${(d.meals || [])
        .map((meal) => `<section class="meal-view"><div class="mv-head"><h3>${esc(meal.name)}${meal.time ? ` <small>${esc(meal.time)}</small>` : ''}</h3><span>${kcal(N.mealPlanned(meal).kcal)}</span></div>
          <ul class="fi-list">${plannedItemsHTML(meal) || '<li><span class="hint">No foods yet</span></li>'}</ul></section>`)
        .join('') || '<p class="hint">No meals on this day.</p>'}
      <div class="mv-total"><span>${weekly ? `${esc(N.WEEKDAY_NAMES[d.day])} total` : 'Daily total'}</span><b>${esc(macroText(tot))}</b></div>
      ${tot.incomplete ? `<p class="unknown-note">${tot.incomplete} food${tot.incomplete === 1 ? ' has' : 's have'} missing values; the total is higher than shown.</p>` : ''}`;
  }

  function bindPreviewDays(container, plan) {
    container.addEventListener('click', (e) => {
      const b = e.target.closest('[data-preview-day]');
      if (b) container.innerHTML = planPreviewHTML(plan, b.dataset.previewDay);
    });
  }

  function targetsLineHTML(t) {
    if (!t || t.protein_g === null || t.protein_g === undefined) return '';
    return `<div class="targets"><span><b>${fmt(t.calories)}</b> kcal</span><span><b>${t.protein_g}</b>g protein</span><span><b>${t.carbs_g}</b>g carbs</span><span><b>${t.fats_g}</b>g fats</span>${t.fibre_g ? `<span><b>${t.fibre_g}</b>g fibre</span>` : ''}</div>`;
  }

  const KIND = { meal_plan: 'Meal plan', macros: 'Daily macro targets' };

  // ------------------------------------------------------ coach: client plan

  // The client's assigned plan, inside Nutrition → Nutrition builder.
  // opts.tabs: the Nutrition tabs; opts.before: the builder's setup cards
  // (shown above the plan); opts.showPlan: false for flexible-macro clients
  // with nothing assigned; opts.bind: wires up opts.before once drawn.
  async function coachMeals(ctx, title, sub, arg, opts) {
    opts = opts || {};
    const id = ctx.profile.id;
    const tabs = opts.tabs || '';
    const before = opts.before || '';
    const done = () => opts.bind && opts.bind();
    if (!ctx.nutritionReady) {
      h.shell(title, sub, `${tabs}${before}<div class="card"><p class="kicker">One step first</p><p>Run <b>supabase/migrations/2026-10-25-nutrition.sql</b> in the Supabase SQL Editor, then reload this page.</p></div>`);
      return done();
    }
    const view = arg === 'assign' ? 'assign' : arg === 'history' || /^v\d+$/.test(arg || '') ? 'history' : 'current';
    if (view === 'assign') return coachAssign(ctx, title, sub, tabs, opts.template);
    if (view === 'history') return coachHistory(ctx, title, sub, tabs, arg);

    const today = S.today();
    const cur = N.assignmentFor(ctx.assignments, today);
    const next = ctx.assignments.filter((x) => x.starts_on > today && (!x.ends_on || x.ends_on >= x.starts_on)).sort((x, y) => y.version - x.version)[0];
    const weekly = S.macrosForWeek(ctx.macros, Math.max(S.currentWeek(ctx.profile.start_date), 1));
    const curCard = cur
      ? `<section class="card plan-card"><p class="kicker">Version ${cur.version} · ${esc(KIND[cur.kind])} · since ${h.niceDate(cur.starts_on)}${cur.ends_on ? ` · ends ${h.niceDate(cur.ends_on)}` : ''}</p>
          <h2>${esc(cur.name)}</h2>
          ${cur.protein_g !== null ? targetsLineHTML(cur) : '<p class="hint">Daily targets: the plan’s own totals.</p>'}
          ${cur.coach_note ? `<p class="plan-note">${esc(cur.coach_note)}</p>` : ''}
          <div class="row-actions"><a class="btn btn-small" href="#client/${id}/nutrition/assign">Assign a new version</a><button type="button" class="btn btn-ghost btn-small" data-end>End this plan</button><a class="btn btn-ghost btn-small" href="#client/${id}/nutrition/history">History</a></div>
          <form class="end-form" hidden novalidate><label for="end-day">Last day of this plan</label><input id="end-day" type="date" value="${today}" min="${S.addDays(today, -1)}"><div class="row-actions"><button type="submit" class="btn btn-small">End plan</button></div>
            <p class="hint">${esc(ctx.profile.full_name || 'The client')} goes back to the weekly macro targets${weekly ? ` (${fmt(weekly.calories)} kcal)` : ''}. Their logs and this version stay in the history.</p></form>
        </section>`
      : `<div class="plan-empty"><span class="qt-ic" aria-hidden="true">${h.ICONS.meals}</span><div><b>No meal plan or daily targets assigned</b><p>${weekly ? `The weekly macro targets apply (${fmt(weekly.calories)} kcal). ` : ''}<a href="#client/${id}/nutrition/assign">Assign a template or daily macro targets</a>.</p></div></div>`;
    const build = `<div class="build-plan card"><div><p class="kicker">Meal plan builder</p><p>Build a plan for ${esc(ctx.profile.full_name || 'this client')} from the food database${ctx.profile.diet_requirement ? ` (${esc(ctx.profile.diet_requirement)})` : ''}, then assign it here.</p></div>
        <div class="row-actions"><button type="button" class="btn btn-small" data-build-plan>Build a new meal plan</button><a class="btn btn-ghost btn-small" href="#client/${id}/nutrition/assign">Assign an existing template</a></div></div>`;
    const showPlan = opts.showPlan !== false || cur || next;
    h.shell(
      title,
      sub,
      `${tabs}${before}${showPlan ? `<h2 class="crm-sub">${opts.showPlan === false ? 'Assigned plan' : 'Meal plan'}</h2>${curCard}${opts.showPlan === false ? '' : build}` : ''}
      ${next ? `<div class="note-card"><span class="note-mark" aria-hidden="true">R<i>.</i></span><div><p class="kicker">Coming up</p><p>Version ${next.version}, <b>${esc(next.name)}</b>, starts ${h.niceDate(next.starts_on)}.</p></div></div>` : ''}
      ${showPlan && cur && cur.kind === 'meal_plan' ? `<h2 class="crm-sub">What ${esc(ctx.profile.full_name || 'the client')} sees</h2><div id="plan-preview">${planPreviewHTML(cur.plan)}</div>` : ''}
      ${opts.after || ''}`,
    );
    done();
    const buildBtn = h.root.querySelector('[data-build-plan]');
    if (buildBtn) buildBtn.addEventListener('click', () => h.withBusy(buildBtn, async () => {
      const name = `${(ctx.profile.full_name || 'Client').split(' ')[0]}'s plan`;
      const notes = ctx.profile.diet_requirement ? `Diet: ${ctx.profile.diet_requirement}` : null;
      const row = h.must(await sb.from('plan_templates').insert({ name, notes, plan: N.planForSave(N.emptyPlan('daily')) }).select().single());
      location.hash = `#library/template/${row.id}/${id}`;
    }));
    const pv = h.root.querySelector('#plan-preview');
    if (pv) bindPreviewDays(pv, cur.plan);
    const endBtn = h.root.querySelector('[data-end]');
    if (endBtn) {
      const form = h.root.querySelector('.end-form');
      endBtn.addEventListener('click', () => (form.hidden = !form.hidden));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        h.withBusy(form.querySelector('button'), async () => {
          h.must(await sb.rpc('end_nutrition', { p_client: id, p_last_day: form.querySelector('input').value }));
          h.invalidate(id);
          h.toast('Plan ended. It stays in the history.');
          location.hash = `#client/${id}/nutrition/history`;
        });
      });
    }
  }

  async function coachAssign(ctx, title, sub, tabs, preselect) {
    const id = ctx.profile.id;
    const today = S.today();
    const latest = ctx.assignments[ctx.assignments.length - 1];
    const minStart = latest && latest.starts_on > S.addDays(today, -1) ? latest.starts_on : S.addDays(today, -1);
    const templates = h.must(await sb.from('plan_templates').select('id, name, notes, plan, updated_at').is('archived_at', null).order('name'));
    const cur = N.assignmentFor(ctx.assignments, today);
    const weekly = S.macrosForWeek(ctx.macros, Math.max(S.currentWeek(ctx.profile.start_date), 1)) || {};
    const pre = cur && cur.protein_g !== null ? cur : weekly;
    const num = (k, l, v) => `<div class="field"><label for="as-${k}">${l}</label><input id="as-${k}" name="${k}" type="number" inputmode="numeric" min="0" step="1" value="${esc(v === null || v === undefined ? '' : v)}"></div>`;
    const avg = (plan) => {
      const days = plan.days || [];
      const t = days.map((d) => N.sum((d.meals || []).map(N.mealPlanned).map((x) => ({ kcal: x.kcal, p: x.p, c: x.c, f: x.f, fibre: x.fibre }))));
      return t.length ? { kcal: t.reduce((s, x) => s + x.kcal, 0) / t.length, p: t.reduce((s, x) => s + x.p, 0) / t.length } : null;
    };
    h.shell(
      title,
      sub,
      `${tabs}<form id="assign-form" class="card" novalidate>
        <p class="kicker">New version ${latest ? latest.version + 1 : 1}${ctx.profile.diet_requirement ? ` · Diet: ${esc(ctx.profile.diet_requirement)}` : ''}</p>
        <fieldset class="seg"><legend class="sr-only">Type</legend>
          <label><input type="radio" name="kind" value="meal_plan"${templates.length ? ' checked' : ' disabled'}> Meal plan from a template</label>
          <label><input type="radio" name="kind" value="macros"${templates.length ? '' : ' checked'}> Daily macro targets only</label>
        </fieldset>
        <div data-for="meal_plan">
          <div class="field"><label for="as-template">Template</label><select id="as-template" name="template">${templates.map((t) => `<option value="${t.id}"${t.id === preselect ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          <p class="hint" data-tpl-info></p><p class="hint"><a href="#library/templates">Create or edit templates in Foods &amp; plans</a></p></div>
        </div>
        ${templates.length ? '' : '<p class="hint">No templates yet. <a href="#library/templates">Create one in Foods &amp; plans</a> to assign set meals.</p>'}
        <div class="grid-2">
          <div class="field"><label for="as-name">Name the client sees</label><input id="as-name" name="name" maxlength="120"></div>
          <div class="field"><label for="as-start">Starts on</label><input id="as-start" name="starts_on" type="date" value="${minStart > today ? minStart : today}" min="${minStart}"></div>
        </div>
        <p class="kicker" style="margin-top:8px">Daily targets <span class="hint" data-targets-optional>(optional with a meal plan: leave blank to use the plan’s totals)</span></p>
        <div class="grid-2">${num('protein_g', 'Protein (g)', pre.protein_g)}${num('carbs_g', 'Carbs (g)', pre.carbs_g)}${num('fats_g', 'Fats (g)', pre.fats_g)}${num('fibre_g', 'Fibre (g)', pre.fibre_g)}</div>
        <p class="hint" data-kcal></p>
        <div class="field"><label for="as-note">Note for ${esc(ctx.profile.full_name || 'the client')}</label><textarea id="as-note" name="note" maxlength="1000" placeholder="e.g. Swap roti for rice on training days if you prefer."></textarea></div>
        <p class="hint">${latest ? `Version ${latest.version} ends the day before this one starts and stays in the history with every meal logged against it.` : 'This becomes version 1.'} Assigned plans never change when you edit a template.</p>
        <button type="submit" class="btn">Assign</button>
      </form>`,
    );
    const form = h.root.querySelector('#assign-form');
    const sync = () => {
      const d = h.readForm(form);
      form.querySelector('[data-for="meal_plan"]').hidden = d.kind !== 'meal_plan';
      form.querySelector('[data-targets-optional]').hidden = d.kind !== 'meal_plan';
      const t = templates.find((x) => x.id === d.template);
      if (t && d.kind === 'meal_plan') {
        const a = avg(t.plan);
        form.querySelector('[data-tpl-info]').textContent = `${t.plan.schedule === 'weekly' ? 'Weekly plan' : 'Same every day'}${a ? ` · about ${fmt(a.kcal)} kcal and ${fmt(a.p)} g protein a day` : ''}`;
      }
      const nameInput = form.querySelector('[name=name]');
      if (!nameInput.dataset.touched) nameInput.value = d.kind === 'meal_plan' && t ? t.name : 'Daily macro targets';
      const kc = (d.protein_g || 0) * 4 + (d.carbs_g || 0) * 4 + (d.fats_g || 0) * 9 + (d.fibre_g || 0) * 2;
      form.querySelector('[data-kcal]').textContent = d.protein_g !== null ? `= ${fmt(kc)} kcal a day (protein×4 + carbs×4 + fats×9 + fibre×2)` : '';
    };
    form.querySelector('[name=name]').addEventListener('input', (e) => (e.target.dataset.touched = '1'));
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    sync();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = h.readForm(form);
      const set = ['protein_g', 'carbs_g', 'fats_g'].filter((k) => d[k] !== null).length;
      if (set && set < 3) return h.toast('Add protein, carbs and fats, or leave all three blank.', true);
      if (d.kind === 'macros' && !set) return h.toast('Daily macro targets need protein, carbs and fats.', true);
      if (d.kind === 'meal_plan' && !d.template) return h.toast('Choose a template.', true);
      if (!d.starts_on) return h.toast('Choose a start date.', true);
      h.withBusy(form.querySelector('button[type=submit]'), async () => {
        const row = h.must(await sb.rpc('assign_nutrition', {
          p_client: id, p_kind: d.kind, p_name: d.name, p_starts_on: d.starts_on, p_plan: null,
          p_template: d.kind === 'meal_plan' ? d.template : null,
          p_targets: set ? { protein_g: d.protein_g, carbs_g: d.carbs_g, fats_g: d.fats_g, fibre_g: d.fibre_g } : null,
          p_note: d.note,
        }));
        h.invalidate(id);
        h.toast(`Version ${row.version} assigned from ${h.niceDate(row.starts_on)}.`);
        location.hash = `#client/${id}/nutrition/builder`;
      });
    });
  }

  const AUDIT_TABLES = { plan_assignments: 'Plan', meal_logs: 'Meal', food_log_entries: 'Food log', macro_targets: 'Weekly macros', targets: 'Targets', foods: 'Food', recipes: 'Recipe' };

  function auditText(row) {
    const n = row.new_row || {};
    const o = row.old_row || {};
    const x = row.action === 'DELETE' ? o : n;
    switch (row.table_name) {
      case 'plan_assignments':
        if (row.action === 'INSERT') return `Version ${n.version} assigned: ${esc(n.name)} from ${h.niceDate(n.starts_on)}`;
        if (row.action === 'UPDATE') return `Version ${n.version} ${n.ends_on ? `ends ${h.niceDate(n.ends_on)}` : 'reopened'}`;
        return `Version ${o.version} deleted`;
      case 'meal_logs':
        return row.action === 'DELETE' ? `${esc(o.meal_name)} on ${h.niceDate(o.day)}: record undone` : `${esc(x.meal_name)} on ${h.niceDate(x.day)}: ${esc(statusLabel(x))}`;
      case 'food_log_entries':
        if (x.meal_log_id) return '';
        return `${row.action === 'INSERT' ? 'Added' : row.action === 'DELETE' ? 'Removed' : 'Changed'} ${esc(x.name)} (${esc(N.formatAmount(x.amount, x.unit))}) on ${h.niceDate(x.day)}`;
      case 'macro_targets':
        return `Weekly macros from week ${x.week_number} ${row.action === 'DELETE' ? 'removed' : `set to ${fmt(x.calories)} kcal`}`;
      case 'targets':
        return 'Targets updated';
      default:
        return `${AUDIT_TABLES[row.table_name] || row.table_name} ${row.action.toLowerCase()}`;
    }
  }

  async function coachHistory(ctx, title, sub, tabs, arg) {
    const id = ctx.profile.id;
    const shown = /^v\d+$/.test(arg || '') ? ctx.assignments.find((a) => a.version === Number(arg.slice(1))) : null;
    const audit = await sb.from('audit_log').select('id, at, actor, table_name, action, old_row, new_row').eq('client_id', id).order('at', { ascending: false }).limit(60);
    const auditRows = (audit.data || [])
      .map((r) => ({ r, text: auditText(r) }))
      .filter((x) => x.text)
      .slice(0, 30)
      .map(({ r, text }) => `<tr><td>${new Date(r.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td><td>${r.actor === id ? esc(ctx.profile.full_name || 'Client') : 'Coach'}</td><td class="wrap-text">${text}</td></tr>`);
    const rows = ctx.assignments
      .slice()
      .reverse()
      .map((a) => {
        const replacedEarly = a.ends_on && a.ends_on < a.starts_on;
        return `<tr${shown && shown.id === a.id ? ' class="on"' : ''}><td><b>${a.version}</b></td><td class="wrap-text">${esc(a.name)}</td><td>${esc(KIND[a.kind])}</td>
          <td>${h.niceDate(a.starts_on)}</td><td>${replacedEarly ? 'Replaced before it began' : a.ends_on ? h.niceDate(a.ends_on) : 'Open'}</td>
          <td>${a.calories ? `${fmt(a.calories)} kcal` : 'Plan totals'}</td><td>${a.kind === 'meal_plan' ? `<a href="#client/${id}/nutrition/v${a.version}">View</a>` : ''}</td></tr>`;
      });
    h.shell(
      title,
      sub,
      `${tabs}
      ${rows.length ? `<div class="card table-card"><div class="table-wrap"><table class="crm-table"><thead><tr><th>Version</th><th>Name</th><th>Type</th><th>From</th><th>To</th><th>Targets</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>` : '<div class="card"><p>Nothing assigned yet.</p></div>'}
      ${shown ? `<h2 class="crm-sub">Version ${shown.version}: ${esc(shown.name)}</h2>${targetsLineHTML(shown)}<div id="plan-preview">${planPreviewHTML(shown.plan)}</div>` : ''}
      <h2 class="crm-sub">Change history</h2>
      ${auditRows.length ? `<div class="card table-card"><div class="table-wrap"><table class="crm-table"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${auditRows.join('')}</tbody></table></div></div>` : '<div class="card"><p class="hint">No changes recorded yet.</p></div>'}`,
    );
    const pv = h.root.querySelector('#plan-preview');
    if (pv) bindPreviewDays(pv, shown.plan);
  }

  // ------------------------------------------------- coach: current nutrition
  // What the client is set to eat: one day, or the week ahead from a date.
  // mode: undefined (today), 'YYYY-MM-DD' (that day) or 'week' / 'week-YYYY-MM-DD'.
  function coachCurrent(ctx, title, sub, tabs, mode) {
    const id = ctx.profile.id;
    const today = S.today();
    const m = /^(week)?-?(\d{4}-\d{2}-\d{2})?$/.exec(mode || '') || [];
    const week = m[1] === 'week';
    const from = m[2] || today;
    const pick = week ? 'week' : m[2] ? 'date' : 'today';
    const days = week ? Array.from({ length: 7 }, (_, i) => S.addDays(from, i)) : [from];
    const names = ctx.profile.meal_names || {};
    const macroLine = (n) => `P ${fmt(n.p)} · C ${fmt(n.c)} · F ${fmt(n.f)}${n.fibre ? ` · fibre ${fmt(n.fibre)}` : ''}`;

    const perDay = days.map((d) => {
      const a = ctx.nutritionReady ? N.assignmentFor(ctx.assignments, d) : null;
      const meals = a && a.kind === 'meal_plan' ? N.planMeals(a.plan, d) : [];
      const total = N.sum(meals.map(N.mealPlanned).map((x) => ({ kcal: x.kcal, p: x.p, c: x.c, f: x.f, fibre: x.fibre })));
      return { d, a, meals, total, target: dayTarget(ctx, d) };
    });

    const dayHTML = ({ d, a, meals, total, target }) => {
      const head = `<div class="cn-day-head"><h3>${d === today ? 'Today' : h.niceDate(d, { weekday: 'long' })}<small>${h.niceDate(d, { day: 'numeric', month: 'long' })}</small></h3>
        <div class="cn-tot">${meals.length ? `<b>${kcal(total.kcal)}</b><span>${macroLine(total)}</span>` : target ? `<b>${fmt(target.calories)} kcal</b><span>P ${fmt(target.protein_g)} · C ${fmt(target.carbs_g)} · F ${fmt(target.fats_g)}</span>` : '<span>No targets set</span>'}</div></div>`;
      const plan = a ? `${esc(KIND[a.kind])}: ${esc(a.name)} (version ${a.version})` : 'Weekly macro targets';
      const body = meals.length
        ? `<ul class="cn-meals">${meals.map((meal) => {
            const n = N.mealPlanned(meal);
            return `<li><details${week ? '' : ' open'}><summary><span class="cn-meal">${esc(mealNameOf(names, `plan:${meal.id}`, meal.name))}${meal.time ? ` <small>${esc(meal.time)}</small>` : ''}</span><span class="cn-mk"><b>${kcal(n.kcal)}</b> ${macroLine(n)}</span></summary>
              <ul class="fi-list">${plannedItemsHTML(meal) || '<li><span class="hint">No foods</span></li>'}</ul></details></li>`;
          }).join('')}</ul>`
        : `<p class="hint cn-flex">${a && a.kind === 'meal_plan' ? 'No meals planned on this day.' : 'No set meals: the client eats to these targets and logs what they eat.'}${d <= today ? ` <a href="#client/${id}/foodlog/${d}">See what was logged ›</a>` : ''}</p>`;
      const off = target && meals.length && target.from === 'targets' && Math.abs(total.kcal - target.calories) > target.calories * 0.05
        ? `<p class="unknown-note">Planned meals add up to ${kcal(total.kcal)}, against a ${fmt(target.calories)} kcal target.</p>` : '';
      return `<section class="card cn-day">${head}<p class="cn-plan">${plan}</p>${body}${off}${total.incomplete ? `<p class="unknown-note">${total.incomplete} food${total.incomplete === 1 ? ' has' : 's have'} missing values, so the totals are higher than shown.</p>` : ''}</section>`;
    };

    let summary = '';
    if (week) {
      const planned = perDay.filter((x) => x.meals.length);
      const avg = (k) => (planned.length ? planned.reduce((s2, x) => s2 + x.total[k], 0) / planned.length : null);
      const tg = perDay.map((x) => x.target).filter(Boolean);
      summary = h.statCards([
        { k: 'Days with set meals', v: `${planned.length} / 7`, s: planned.length ? '' : 'Flexible macros all week' },
        { k: 'Average planned calories', v: planned.length ? `${fmt(avg('kcal'))} kcal` : '–', s: tg.length ? `Target about ${fmt(tg.reduce((s2, x) => s2 + (x.calories || 0), 0) / tg.length)} kcal` : '' },
        { k: 'Average protein', v: planned.length ? `${fmt(avg('p'))} g` : '–', s: tg.length ? `Target about ${fmt(tg.reduce((s2, x) => s2 + (x.protein_g || 0), 0) / tg.length)} g` : '' },
        { k: 'Average carbs · fats', v: planned.length ? `${fmt(avg('c'))} · ${fmt(avg('f'))} g` : '–' },
      ]);
    }

    h.shell(
      title,
      sub,
      `${tabs}
      <div class="card cn-bar">
        <div class="field"><label for="cn-view">View</label><select id="cn-view"><option value="today"${pick === 'today' ? ' selected' : ''}>Today</option><option value="date"${pick === 'date' ? ' selected' : ''}>Choose a date</option><option value="week"${pick === 'week' ? ' selected' : ''}>Week ahead</option></select></div>
        <div class="field"${pick === 'today' ? ' hidden' : ''}><label for="cn-date">${week ? 'Starting' : 'Date'}</label><input id="cn-date" type="date" value="${from}"></div>
      </div>
      ${ctx.nutritionReady ? '' : '<div class="card muted-box">Meal plans switch on once supabase/migrations/2026-10-25-nutrition.sql has been run.</div>'}
      ${summary}
      <div class="${week ? 'cn-week' : ''}">${perDay.map(dayHTML).join('')}</div>`,
    );
    const go = () => {
      const v = h.root.querySelector('#cn-view').value;
      const d = h.root.querySelector('#cn-date').value || today;
      location.hash = `#client/${id}/nutrition/current/${v === 'today' ? '' : v === 'week' ? `week-${d}` : d}`.replace(/\/$/, '');
    };
    h.root.querySelector('#cn-view').addEventListener('change', go);
    h.root.querySelector('#cn-date').addEventListener('change', go);
  }

  // ------------------------------------------------------ coach: food log

  async function coachFoodLog(ctx, title, sub, arg) {
    const id = ctx.profile.id;
    if (!ctx.nutritionReady) {
      return h.shell(title, sub, '<div class="card"><p class="kicker">One step first</p><p>Run <b>supabase/migrations/2026-10-25-nutrition.sql</b> in the Supabase SQL Editor, then reload this page.</p></div>');
    }
    const now = S.today();
    const day = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) && arg <= now ? arg : now;
    const days = Array.from({ length: 7 }, (_, i) => S.addDays(day, i - 6));
    await ensureRange(ctx, days[0], day);
    const r = report(ctx, day);
    const names = ctx.profile.meal_names || {};
    const target = dayTarget(ctx, day);
    const t = r.actualTotal;
    const ad = r.adherence;
    const weekRows = days
      .slice()
      .reverse()
      .map((d) => {
        const x = report(ctx, d);
        const tg = dayTarget(ctx, d);
        const tt = x.actualTotal;
        const st = S.habitStatus('calories', tt.items ? tt.kcal : null, tg && tg.calories);
        const pst = S.habitStatus('protein', tt.items ? tt.p : null, tg && tg.protein_g);
        return `<tr${d === day ? ' class="on"' : ''}><td><a href="#client/${id}/foodlog/${d}">${h.niceDate(d)}</a></td>
          <td>${h.dotCell(st, tt.items ? `${fmt(tt.kcal)} / ${tg ? fmt(tg.calories) : '–'}` : '–')}</td>
          <td>${h.dotCell(pst, tt.items ? `${fmt(tt.p)} / ${tg ? fmt(tg.protein_g) : '–'} g` : '–')}</td>
          <td>${x.isPlan ? `${x.adherence.onPlan} of ${x.adherence.planned}${x.adherence.counts.open ? ` <small>(${x.adherence.counts.open} not logged)</small>` : ''}` : '–'}</td>
          <td>${tt.incomplete || ''}</td><td>${x.selfReported || ''}</td></tr>`;
      });
    const flags = [t.incomplete ? `${t.incomplete} missing values` : '', r.selfReported ? `${r.selfReported} self-reported` : ''].filter(Boolean).join(' · ');
    h.shell(
      title,
      sub,
      `<div class="daybar">
        <a class="btn btn-ghost" href="#client/${id}/foodlog/${S.addDays(day, -1)}" aria-label="Previous day">‹</a>
        <h2>${day === now ? 'Today' : h.niceDate(day)}<div class="hint">${h.niceDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</div></h2>
        ${day < now ? `<a class="btn btn-ghost" href="#client/${id}/foodlog/${S.addDays(day, 1)}" aria-label="Next day">›</a>` : '<span style="width:48px"></span>'}
      </div>
      ${h.statCards([
        { k: 'Eaten', v: t.items ? `${fmt(t.kcal)} kcal` : '–', s: target ? `Target ${fmt(target.calories)} kcal${r.isPlan ? ` · planned ${fmt(r.plannedTotal.kcal)}` : ''}` : 'No target' },
        { k: 'Protein', v: t.items ? `${fmt(t.p)} g` : '–', s: target ? `Target ${fmt(target.protein_g)} g` : '' },
        { k: 'Meals on plan', v: r.isPlan ? `${ad.onPlan} of ${ad.planned}` : '–', s: r.isPlan ? `${ad.counts.as_planned} as planned · ${ad.counts.adjusted} amount · ${ad.counts.replaced} swapped · ${ad.counts.skipped} skipped` : r.assignment ? 'Macro targets only' : 'No plan assigned' },
        { k: 'Carbs · fats · fibre', v: t.items ? `${fmt(t.c)} · ${fmt(t.f)} · ${fmt(t.fibre)}` : '–', s: flags || (target ? `Targets ${fmt(target.carbs_g)} · ${fmt(target.fats_g)} · ${fmt(target.fibre_g)} g` : '') },
      ])}
      ${unknownNote(t, 'coach')}
      ${r.isPlan ? `<h2 class="crm-sub">Planned vs eaten</h2><div class="ml-grid">${r.meals.map((m) => mealCardHTML(m, { names })).join('')}${r.earlier.map((m) => mealCardHTML(m, { names })).join('')}</div>` : ''}
      ${(() => { const xm = extraMealsHTML(r.extras, false, { tag: true }, names); return xm.count ? `<h2 class="crm-sub">Extra meals</h2><div class="ml-grid">${xm.html}</div>` : ''; })()}
      ${r.isPlan ? `<h2 class="crm-sub">Extras and snacks</h2>
      <div class="meal-card">${entryListHTML(r.extras.filter((e) => !isExtraMeal(e)), false) || '<p class="hint">Nothing logged.</p>'}</div>` : `<h2 class="crm-sub">Food log</h2><div class="ml-grid">${SLOTS.map((s) => {
        const list = r.extras.filter((e) => !isExtraMeal(e) && (SLOTS.includes(e.slot) ? e.slot : 'Snacks') === s);
        return `<div class="meal-card fl-slot"><div class="ml-head"><div>${mealTitleHTML(names, s, s, false)}<small>${list.length ? kcal(N.sum(list.map(N.entryNutrition)).kcal) : 'Nothing logged'}</small></div></div>${entryListHTML(list, false)}</div>`;
      }).join('')}</div>`}
      <h2 class="crm-sub">Last 7 days</h2>
      <div class="card table-card"><div class="table-wrap"><table class="crm-table"><thead><tr><th>Day</th><th>Calories</th><th>Protein</th><th>Meals on plan</th><th>Missing values</th><th>Self-reported</th></tr></thead><tbody>${weekRows.join('')}</tbody></table></div></div>
      <p class="hint">Adherence counts meals logged as planned, plus "different amount" meals within 10% of the planned Calories. Totals only include what was logged.</p>`,
    );
  }

  // ------------------------------------------------------ library (coach)

  function libTabs(current) {
    return `<nav class="crm-tabs" aria-label="Library">${[['templates', 'Meal plan templates'], ['recipes', 'Recipes'], ['foods', 'Foods']]
      .map(([k, l]) => `<a href="#library/${k}"${k === current ? ' aria-current="page"' : ''}>${l}</a>`)
      .join('')}</nav>`;
  }

  function libShell(title, sub, body) {
    h.state.coachView = { section: 'library' };
    h.shell(title, sub, body);
  }

  async function library(view, arg, forClient) {
    if (!isCoach()) return clientRecipes(view, arg);
    const ready = await sb.from('plan_templates').select('id').limit(1);
    if (missingTable(ready)) return libShell('Foods & plans', '', '<div class="card"><p class="kicker">One step first</p><p>Run <b>supabase/migrations/2026-10-25-nutrition.sql</b> in the Supabase SQL Editor, then reload this page.</p></div>');
    if (view === 'template' && arg) return templateEditor(arg, forClient);
    if (view === 'recipe' && arg) return recipeEditor(arg, '#library');
    if (view === 'recipe-import') return recipeImport('#library');
    if (view === 'recipes') return recipeList('#library');
    if (view === 'foods') return foodLibrary(arg);
    return templateList();
  }

  async function templateList() {
    const rows = h.must(await sb.from('plan_templates').select('*').order('archived_at', { nullsFirst: true }).order('name'));
    const card = (t) => {
      const days = t.plan.days || [];
      const meals = days[0] ? days[0].meals.length : 0;
      const tot = days.map((d) => N.sum(d.meals.map(N.mealPlanned).map((x) => ({ kcal: x.kcal, p: x.p, c: x.c, f: x.f, fibre: x.fibre }))));
      const avgK = tot.length ? tot.reduce((s, x) => s + x.kcal, 0) / tot.length : 0;
      return `<li class="lib-card${t.archived_at ? ' archived' : ''}"><a href="#library/template/${t.id}"><b>${esc(t.name)}</b>
        <small>${t.plan.schedule === 'weekly' ? 'Weekly plan' : 'Same every day'} · ${meals} meals${avgK ? ` · about ${fmt(avgK)} kcal a day` : ''}</small>
        <small>Updated ${new Date(t.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}${t.archived_at ? ' · Archived' : ''}</small></a></li>`;
    };
    libShell(
      'Foods & plans',
      'Templates are starting points. Assigning one copies it to the client, so later edits never change their plan.',
      `${libTabs('templates')}
      <div class="row-actions"><button type="button" class="btn" data-new="daily">New template: same every day</button><button type="button" class="btn btn-ghost" data-new="weekly">New weekly template</button></div>
      ${rows.length ? `<ul class="lib-grid">${rows.map(card).join('')}</ul>` : '<div class="card"><p>No templates yet. Start one above, then assign it from a client’s Meal plan section.</p></div>'}`,
    );
    h.root.querySelectorAll('[data-new]').forEach((b) =>
      b.addEventListener('click', () =>
        h.withBusy(b, async () => {
          const row = h.must(await sb.from('plan_templates').insert({ name: b.dataset.new === 'weekly' ? 'New weekly plan' : 'New plan', plan: N.planForSave(N.emptyPlan(b.dataset.new)) }).select().single());
          location.hash = `#library/template/${row.id}`;
        }),
      ),
    );
  }

  async function templateEditor(id, forClient) {
    const t = h.must(await sb.from('plan_templates').select('*').eq('id', id).single());
    // Opened from a client's Nutrition builder: show who it's for and the way back.
    const client = forClient ? (await sb.from('profiles').select('id, full_name, diet_requirement, nutrition_tracking').eq('id', forClient).maybeSingle()).data : null;
    const plan = JSON.parse(JSON.stringify(t.plan));
    let day = plan.days[0].day;
    let name = t.name;
    let notes = t.notes || '';
    libShell(
      'Edit template',
      '',
      `${libTabs('templates')}
      ${client ? `<div class="build-for card"><div><p class="kicker">Building for ${esc(client.full_name || 'client')}</p>
        <p>${client.diet_requirement ? `Diet requirement: <b>${esc(client.diet_requirement)}</b>. Pick foods that fit it.` : 'No diet requirements set.'} Changes save as you go.</p></div>
        <div class="row-actions"><a class="btn btn-small" href="#client/${client.id}/nutrition/assign/${id}">Assign to ${esc((client.full_name || 'client').split(' ')[0])} ›</a><a class="btn btn-ghost btn-small" href="#client/${client.id}/nutrition/builder">Back</a></div></div>` : ''}
      <div class="tp-head card">
        <input class="tp-name" id="tp-name" value="${esc(name)}" maxlength="120" aria-label="Template name">
        <textarea id="tp-notes" rows="2" maxlength="2000" placeholder="Notes for you (who it suits, swaps you allow…)">${esc(notes)}</textarea>
        <p class="mp-save" id="tp-save" role="status">All changes saved</p>
      </div>
      <div class="tp-days" id="tp-days"></div>
      <div class="mp-totals" id="tp-totals"></div>
      <div id="tp-meals" class="tp-meals"></div>
      <button type="button" class="btn-dark wide" id="tp-add-meal">+ Add a meal</button>
      <div class="row-actions">
        <button type="button" class="btn btn-ghost btn-small" id="tp-dup">Duplicate</button>
        <button type="button" class="btn btn-ghost btn-small" id="tp-archive">${t.archived_at ? 'Restore from archive' : 'Archive'}</button>
      </div>
      <p class="hint">Saving copies each food’s current nutrition into the template. Plans already assigned to clients never change; assign the template again to give a client a new version.</p>`,
    );
    const $ = (s) => h.root.querySelector(s);
    const saveEl = $('#tp-save');
    let timer = null;
    let chain = Promise.resolve();
    const save = () => {
      clearTimeout(timer);
      saveEl.textContent = 'Saving…';
      saveEl.className = 'mp-save';
      timer = setTimeout(() => {
        chain = chain.then(async () => {
          try {
            h.must(await sb.from('plan_templates').update({ name: name.trim() || 'Untitled plan', notes: notes.trim() || null, plan: N.planForSave(plan) }).eq('id', id).select('id').single());
            saveEl.textContent = 'All changes saved';
          } catch (err) {
            saveEl.textContent = `Not saved: ${h.friendlyError(err)}`;
            saveEl.className = 'mp-save bad';
          }
        });
      }, 700);
    };
    const curDay = () => plan.days.find((d) => d.day === day);

    const drawDays = () => {
      $('#tp-days').innerHTML = `<div class="seg"><label><input type="radio" name="sched" value="daily"${plan.schedule === 'daily' ? ' checked' : ''}> Same every day</label><label><input type="radio" name="sched" value="weekly"${plan.schedule === 'weekly' ? ' checked' : ''}> Different by weekday</label></div>
        ${plan.schedule === 'weekly' ? `<div class="chips">${plan.days.map((d) => `<button type="button" class="chip" data-day="${d.day}" aria-selected="${d.day === day}">${N.WEEKDAY_NAMES[d.day].slice(0, 3)}</button>`).join('')}<button type="button" class="link-btn" data-copy-day>Copy ${N.WEEKDAY_NAMES[day]} to every day</button></div>` : ''}`;
    };
    const drawTotals = () => {
      const tot = N.sum(curDay().meals.map(N.mealPlanned).map((x) => ({ kcal: x.kcal, p: x.p, c: x.c, f: x.f, fibre: x.fibre })));
      const cell = (l, v, u) => `<div class="mp-t"><span>${l}</span><b>${fmt(v)}<small> ${u}</small></b></div>`;
      $('#tp-totals').innerHTML = `${cell(plan.schedule === 'weekly' ? `${N.WEEKDAY_NAMES[day]} total` : 'Daily total', tot.kcal, 'kcal')}${cell('Protein', tot.p, 'g')}${cell('Carbs', tot.c, 'g')}${cell('Fats', tot.f, 'g')}${cell('Fibre', tot.fibre, 'g')}
        ${tot.incomplete ? `<p class="unknown-note">${tot.incomplete} food${tot.incomplete === 1 ? ' has' : 's have'} missing values, so the totals are higher than shown.</p>` : ''}`;
      curDay().meals.forEach((m) => {
        const el = h.root.querySelector(`[data-meal="${CSS.escape(m.id)}"] .meal-sum`);
        if (el) el.textContent = macroText(N.mealPlanned(m));
      });
    };
    const itemHTML = (it) => `<li class="tp-item" data-item="${esc(it.id)}"><span class="fi-name"><b>${esc(it.name)}</b>${it.brand ? `<small>${esc(it.brand)}</small>` : ''}${badges({ source: it.source, quality: it.quality, complete: it.complete })}</span>
      <span class="adj-amt"><input type="number" inputmode="decimal" min="0" step="any" value="${Number(it.amount)}" data-amount aria-label="Amount of ${esc(it.name)}"><span>${esc(it.unit)}</span></span>
      <span class="fi-mac" data-mac></span><button type="button" class="ml-btn small x" data-del-item aria-label="Remove ${esc(it.name)}">×</button></li>`;
    const drawItemMacs = () =>
      curDay().meals.forEach((m) =>
        m.items.forEach((it) => {
          const el = h.root.querySelector(`[data-meal="${CSS.escape(m.id)}"] [data-item="${CSS.escape(it.id)}"] [data-mac]`);
          if (el) {
            const n = N.itemNutrition(it);
            el.innerHTML = `${n.kcal === null ? '<span class="unknown">kcal unknown</span>' : kcal(n.kcal)}<small>${esc(pcf(n))}</small>`;
          }
        }),
      );
    const drawMeals = () => {
      $('#tp-meals').innerHTML = curDay()
        .meals.map((m) => `<section class="meal-card" data-meal="${esc(m.id)}">
          <div class="meal-head"><input class="meal-name" value="${esc(m.name)}" maxlength="60" aria-label="Meal name" data-field="name">
            <input type="time" class="tp-time" value="${esc(m.time || '')}" aria-label="Time of ${esc(m.name)}" data-field="time">
            <button type="button" class="mi-btn" data-del-meal>Remove</button></div>
          <span class="meal-sum"></span>
          <ul class="fi-list">${m.items.map(itemHTML).join('')}</ul>
          <button type="button" class="add-row" data-add-food>+ Add food to ${esc(m.name)}</button>
          <input class="tp-note" value="${esc(m.note || '')}" maxlength="300" placeholder="Note on this meal (optional)" data-field="note" aria-label="Note on ${esc(m.name)}">
        </section>`)
        .join('');
      drawItemMacs();
      drawTotals();
    };
    const redraw = () => {
      drawDays();
      drawMeals();
    };

    $('#tp-name').addEventListener('input', (e) => {
      name = e.target.value;
      save();
    });
    $('#tp-notes').addEventListener('input', (e) => {
      notes = e.target.value;
      save();
    });
    $('#tp-days').addEventListener('change', (e) => {
      if (e.target.name !== 'sched') return;
      const to = e.target.value;
      if (to === plan.schedule) return;
      const src = curDay();
      if (to === 'weekly') {
        plan.days = N.WEEKDAYS.map((d) => ({ day: d, meals: cloneMeals(src.meals) }));
        day = 'mon';
      } else {
        if (!window.confirm(`Keep ${N.WEEKDAY_NAMES[day]}'s meals for every day? The other days are removed.`)) {
          e.target.checked = false;
          return drawDays();
        }
        plan.days = [{ day: 'all', meals: src.meals }];
        day = 'all';
      }
      plan.schedule = to;
      redraw();
      save();
    });
    $('#tp-days').addEventListener('click', (e) => {
      const b = e.target.closest('[data-day]');
      if (b) {
        day = b.dataset.day;
        return redraw();
      }
      if (e.target.closest('[data-copy-day]')) {
        if (!window.confirm(`Replace every other day with ${N.WEEKDAY_NAMES[day]}'s meals?`)) return;
        const src = curDay();
        plan.days = plan.days.map((d) => (d.day === day ? d : { day: d.day, meals: cloneMeals(src.meals) }));
        save();
        h.toast(`${N.WEEKDAY_NAMES[day]} copied to every day.`);
      }
    });
    const mealOf = (el) => curDay().meals.find((m) => m.id === el.closest('[data-meal]').dataset.meal);
    $('#tp-meals').addEventListener('input', (e) => {
      if (!e.target.closest('[data-meal]')) return;
      const m = mealOf(e.target);
      if (e.target.dataset.field) {
        const v = e.target.value.trim();
        if (e.target.dataset.field === 'name') m.name = v || 'Meal';
        else m[e.target.dataset.field] = v || null;
        return save();
      }
      if (e.target.matches('[data-amount]')) {
        const it = m.items.find((x) => x.id === e.target.closest('[data-item]').dataset.item);
        const v = Number(e.target.value);
        if (!(v > 0) || v > 5000) return;
        it.amount = Math.round(v * 10) / 10;
        it.portion = null;
        drawItemMacs();
        drawTotals();
        save();
      }
    });
    $('#tp-meals').addEventListener('click', async (e) => {
      if (!e.target.closest('[data-meal]')) return;
      const m = mealOf(e.target);
      if (e.target.closest('[data-add-food]')) {
        const pick = await pickFood({ title: `Add to ${m.name}`, country: 'AU' });
        if (!pick) return;
        const f = pick.food;
        m.items.push({ id: N.newId('i'), food_id: f.id, amount: pick.amount, unit: f.basis, portion: pick.portion, name: f.name, brand: f.brand, source: f.source, quality: f.quality, complete: f.complete, per100: N.per100Of(f) });
        drawMeals();
        return save();
      }
      if (e.target.closest('[data-del-item]')) {
        const iid = e.target.closest('[data-item]').dataset.item;
        m.items = m.items.filter((x) => x.id !== iid);
        drawMeals();
        return save();
      }
      if (e.target.closest('[data-del-meal]')) {
        if (m.items.length && !window.confirm(`Remove ${m.name} and its foods?`)) return;
        curDay().meals = curDay().meals.filter((x) => x.id !== m.id);
        drawMeals();
        return save();
      }
    });
    $('#tp-add-meal').addEventListener('click', () => {
      const meals = curDay().meals;
      if (meals.length >= 12) return h.toast('A day has up to 12 meals.', true);
      meals.push({ id: N.newId('m'), name: `Meal ${meals.length + 1}`, time: null, items: [] });
      drawMeals();
      save();
      h.root.querySelector(`[data-meal="${CSS.escape(meals[meals.length - 1].id)}"] .meal-name`).select();
    });
    $('#tp-dup').addEventListener('click', (e) =>
      h.withBusy(e.target, async () => {
        await chain;
        const row = h.must(await sb.from('plan_templates').insert({ name: `${name.trim() || 'Plan'} (copy)`.slice(0, 120), notes: notes.trim() || null, plan: N.planForSave(plan) }).select().single());
        h.toast('Copy made.');
        location.hash = `#library/template/${row.id}`;
      }),
    );
    $('#tp-archive').addEventListener('click', (e) =>
      h.withBusy(e.target, async () => {
        h.must(await sb.from('plan_templates').update({ archived_at: t.archived_at ? null : new Date().toISOString() }).eq('id', id).select('id').single());
        h.toast(t.archived_at ? 'Restored.' : 'Archived. Clients keep their plans.');
        location.hash = '#library/templates';
      }),
    );
    redraw();
  }

  function cloneMeals(meals) {
    return meals.map((m) => ({ ...m, id: N.newId('m'), items: m.items.map((it) => ({ ...it, id: N.newId('i') })) }));
  }

  // --------------------------------------------------------------- recipes

  // Coach recipe pages live under #library/…, a client's under #….
  const at = (base, path) => (base === '#' ? `#${path}` : `${base}/${path}`);

  async function recipeList(base) {
    const coach = isCoach();
    const rows = h.must(await sb.from('recipes').select('*, food:foods!recipes_food_id_fkey(kcal, protein_g, carbs_g, fat_g, complete, portions, needs_review)').eq('owner_id', me().id).order('name'));
    const card = (r) => {
      const f = r.food || {};
      const serving = Array.isArray(f.portions) && f.portions[0] ? Number(f.portions[0].amount) : null;
      const per = serving && f.kcal !== null && f.kcal !== undefined ? (f.kcal * serving) / 100 : null;
      return `<li class="lib-card"><a href="${at(base, `recipe/${r.id}`)}"><b>${esc(r.name)}</b>
        <small>${fmt(r.servings, r.servings % 1 ? 1 : 0)} serving${Number(r.servings) === 1 ? '' : 's'}${per !== null ? ` · ${fmt(per)} kcal a serving` : f.complete === false ? ' · some values unknown' : ''}</small>
        <small>${r.source_name ? `From ${esc(r.source_name)}` : r.source_url ? 'Imported from a link' : 'Your recipe'}${f.needs_review ? ' · needs checking' : ''}</small></a></li>`;
    };
    const body = `${coach ? libTabs('recipes') : ''}
      <div class="row-actions"><button type="button" class="btn" data-new-recipe>New recipe</button><a class="btn btn-ghost" href="${at(base, 'recipe-import')}">Import from a link</a></div>
      ${rows.length ? `<ul class="lib-grid">${rows.map(card).join('')}</ul>` : `<div class="card"><p>No recipes yet. ${coach ? 'Recipes you save can be added to meal plans like any food.' : 'Save a dish you cook often and log it in one tap.'}</p></div>`}
      <p class="hint">Import reads the one page you give it. Nutrition is worked out from the ingredients you confirm; the original link and author are kept.</p>`;
    if (coach) libShell('Foods & plans', 'Recipes work like foods: per serving, per 100 g, or a weighed portion.', body);
    else h.shell('My recipes', '', body, 'meals');
    h.root.querySelector('[data-new-recipe]').addEventListener('click', (e) =>
      h.withBusy(e.target, async () => {
        const row = h.must(await sb.from('recipes').insert({ name: 'New recipe', servings: 1 }).select().single());
        location.hash = at(base, `recipe/${row.id}`);
      }),
    );
  }

  async function recipeEditor(id, base) {
    const r = h.must(await sb.from('recipes').select('*').eq('id', id).single());
    const rawItems = h.must(await sb.from('recipe_items').select('*, food:foods!recipe_items_food_id_fkey(*)').eq('recipe_id', id).order('position'));
    const mine = r.owner_id === me().id;
    const items = rawItems.map((x) => ({ food: x.food, amount: Number(x.amount), original_text: x.original_text, prep: x.prep, match: x.match }));
    const coach = isCoach();
    const body = `${coach ? libTabs('recipes') : ''}
      <form id="rc-form" class="card" novalidate>
        <div class="field"><label for="rc-name">Recipe name</label><input id="rc-name" name="name" maxlength="120" value="${esc(r.name)}"${mine ? '' : ' disabled'}></div>
        <div class="grid-2">
          <div class="field"><label for="rc-serv">Servings</label><input id="rc-serv" name="servings" type="number" inputmode="decimal" min="0.5" step="any" value="${Number(r.servings)}"${mine ? '' : ' disabled'}></div>
          <div class="field"><label for="rc-cooked">Cooked weight (g) <span class="hint">optional</span></label><input id="rc-cooked" name="cooked_weight_g" type="number" inputmode="decimal" min="1" step="any" value="${r.cooked_weight_g === null ? '' : Number(r.cooked_weight_g)}"${mine ? '' : ' disabled'}>
            <p class="hint">Weigh the whole pot after cooking for accurate per-100 g values. Water lost in cooking changes them.</p></div>
        </div>
        ${r.source_url ? `<p class="rc-source">Imported from <a href="${esc(r.source_url)}" target="_blank" rel="noopener nofollow">${esc(r.source_name || new URL(r.source_url).hostname)}</a>${r.source_author ? ` · by ${esc(r.source_author)}` : ''}${r.imported_at ? ` · ${new Date(r.imported_at).toLocaleDateString('en-AU')}` : ''}. Method and photos stay on the original page.</p>` : ''}
        <h3 class="rc-h">Ingredients</h3>
        <ul class="fi-list" id="rc-items"></ul>
        ${mine ? '<button type="button" class="add-row" data-add-ing>+ Add an ingredient</button>' : ''}
        <div class="field"><label for="rc-notes">Notes</label><textarea id="rc-notes" name="notes" maxlength="2000"${mine ? '' : ' disabled'}>${esc(r.notes || '')}</textarea></div>
        <div id="rc-totals"></div>
        <div class="rc-portion"><label for="rc-g">Nutrition for a weighed portion</label><div class="fp-amount-row"><input id="rc-g" type="number" inputmode="decimal" min="0" step="any" placeholder="e.g. 320"><span>g</span></div><p class="hint" id="rc-gout"></p></div>
        ${mine ? '<p class="form-msg" data-msg role="alert"></p><div class="row-actions"><button type="submit" class="btn">Save recipe</button><button type="button" class="btn btn-ghost" data-del-recipe>Delete</button></div>' : `<p class="hint">This is ${esc(h.COACH)}'s recipe. You can log it, but only ${esc(h.COACH)} can change it.</p>`}
      </form>`;
    if (coach) libShell('Edit recipe', '', body);
    else h.shell('Recipe', '', body, 'meals');
    const form = h.root.querySelector('#rc-form');
    const list = h.root.querySelector('#rc-items');
    const calc = () => {
      const d = h.readForm(form);
      return N.recipeNutrition(items.map((x) => ({ per100: N.per100Of(x.food), amount: x.amount })), d.servings || r.servings, d.cooked_weight_g);
    };
    const drawTotals = () => {
      const c = calc();
      const row = (l, n) => `<tr><th scope="row">${l}</th><td>${n.kcal === null ? '<span class="unknown">unknown</span>' : kcal(n.kcal)}</td><td>${g(n.p)}</td><td>${g(n.c)}</td><td>${g(n.f)}</td><td>${g(n.fibre)}</td></tr>`;
      h.root.querySelector('#rc-totals').innerHTML = items.length
        ? `<div class="table-wrap"><table class="rc-table"><thead><tr><th></th><th>Energy</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fibre</th></tr></thead><tbody>
          ${row('Whole recipe', c.total)}${row(`Per serving${c.servingWeight ? ` (${N.formatAmount(c.servingWeight, 'g')})` : ''}`, c.perServing)}${row('Per 100 g', c.per100)}</tbody></table></div>
          <p class="hint">Based on ${N.formatAmount(c.weight, 'g')} ${form.querySelector('[name=cooked_weight_g]').value ? 'cooked weight' : 'of ingredients (no cooked weight given)'}. A value is shown only when every ingredient has it.</p>`
        : '<p class="hint">Add ingredients to see the nutrition.</p>';
      const gIn = Number(h.root.querySelector('#rc-g').value);
      h.root.querySelector('#rc-gout').textContent = gIn > 0 ? `${N.formatAmount(gIn, 'g')}: ${macroText(N.forAmount(c.per100, gIn))}` : '';
    };
    const draw = () => {
      list.innerHTML = items
        .map((x, i) => `<li data-i="${i}"><span class="fi-name"><b>${esc(x.food.name)}</b>${x.original_text ? `<small>“${esc(x.original_text)}”${x.prep ? ` · ${esc(x.prep)}` : ''}</small>` : x.prep ? `<small>${esc(x.prep)}</small>` : ''}${badges(x.food)}${x.match === 'uncertain' ? '<small class="swap">Match not confirmed</small>' : ''}</span>
          <span class="adj-amt"><input type="number" inputmode="decimal" min="0" step="any" value="${x.amount}" data-amount aria-label="Amount of ${esc(x.food.name)}"${mine ? '' : ' disabled'}><span>${esc(x.food.basis)}</span></span>
          ${mine ? `<span class="fi-tools">${x.match === 'uncertain' ? '<button type="button" class="ml-btn small" data-confirm>Confirm</button>' : ''}<button type="button" class="ml-btn small x" data-del aria-label="Remove ${esc(x.food.name)}">×</button></span>` : ''}</li>`)
        .join('');
      drawTotals();
    };
    form.addEventListener('input', (e) => {
      if (e.target.matches('[data-amount]')) {
        const v = Number(e.target.value);
        if (v > 0) items[Number(e.target.closest('[data-i]').dataset.i)].amount = v;
      }
      drawTotals();
    });
    form.addEventListener('click', async (e) => {
      const li = e.target.closest('[data-i]');
      if (li && e.target.closest('[data-del]')) {
        items.splice(Number(li.dataset.i), 1);
        return draw();
      }
      if (li && e.target.closest('[data-confirm]')) {
        items[Number(li.dataset.i)].match = 'confirmed';
        return draw();
      }
      if (e.target.closest('[data-add-ing]')) {
        const pick = await pickFood({ title: 'Add an ingredient', country: (me() && me().country) || 'AU' });
        if (pick) {
          items.push({ food: pick.food, amount: pick.amount, original_text: null, prep: null, match: 'confirmed' });
          draw();
        }
      }
      if (e.target.closest('[data-del-recipe]')) {
        if (!window.confirm(`Delete ${r.name}? Meals already logged keep their numbers.`)) return;
        h.withBusy(e.target, async () => {
          h.must(await sb.from('recipes').delete().eq('id', id));
          location.hash = at(base, 'recipes');
        });
      }
    });
    if (mine) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = h.readForm(form);
        const msg = form.querySelector('[data-msg]');
        if (!d.name) return (msg.textContent = 'Add a name.');
        if (!(d.servings > 0)) return (msg.textContent = 'Servings must be more than 0.');
        if (items.some((x) => !(x.amount > 0) || x.amount > 20000)) return (msg.textContent = 'Each ingredient needs an amount.');
        h.withBusy(form.querySelector('button[type=submit]'), async () => {
          h.must(await sb.from('recipes').update({ name: d.name, servings: d.servings, cooked_weight_g: d.cooked_weight_g, notes: d.notes }).eq('id', id).select('id').single());
          h.must(await sb.from('recipe_items').delete().eq('recipe_id', id));
          if (items.length) {
            h.must(await sb.from('recipe_items').insert(items.map((x, i) => ({ recipe_id: id, position: i, food_id: x.food.id, amount: x.amount, original_text: x.original_text, prep: x.prep, match: x.match }))));
          }
          h.toast(items.some((x) => x.match === 'uncertain') ? 'Saved. Confirm the remaining matches so the numbers can be trusted.' : 'Recipe saved.');
          await recipeEditor(id, base);
        });
      });
    }
    draw();
  }

  async function recipeImport(base) {
    const coach = isCoach();
    const country = (me() && me().country) || 'AU';
    const body = `${coach ? libTabs('recipes') : ''}
      <form id="ri-form" class="card" novalidate>
        <label for="ri-url">Recipe page link</label>
        <input id="ri-url" type="url" inputmode="url" placeholder="https://…" autocomplete="off">
        <p class="hint">Works with recipe sites that publish standard recipe data. Only this one page is read. You check every ingredient before anything is saved.</p>
        <button type="submit" class="btn">Read the recipe</button>
        <p class="form-msg" data-msg role="alert"></p>
      </form>
      <div id="ri-result"></div>`;
    if (coach) libShell('Import a recipe', '', body);
    else h.shell('Import a recipe', '', body, 'meals');
    const form = h.root.querySelector('#ri-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = form.querySelector('input').value.trim();
      const msg = form.querySelector('[data-msg]');
      msg.textContent = '';
      if (!/^https?:\/\//i.test(url)) {
        msg.textContent = 'Paste the full link, starting with https://';
        return;
      }
      h.withBusy(form.querySelector('button'), async () => {
        const res = await callFunction('recipe-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, country }) });
        if (!res.ok) {
          msg.textContent = res.body.error || 'Could not read that page.';
          return;
        }
        reviewImport(res.body, base, country);
      });
    });
  }

  // Every line is checked by a person before the recipe is saved.
  function reviewImport(data, base, country) {
    const box = h.root.querySelector('#ri-result');
    const lines = data.ingredients.map((ing) => {
      const food = ing.candidates[0] || null;
      return { ing, food, amount: amountFor(ing, food), skip: !food && /to taste|no amount/i.test(ing.reason || ''), checked: ing.match === 'confirmed' };
    });
    const portionsOf = (f) => (f && Array.isArray(f.portions) ? f.portions.filter((x) => x && Number(x.amount) > 0) : []);
    const draw = () => {
      box.innerHTML = `<section class="card">
        <div class="grid-2"><div class="field"><label for="ri-name">Recipe name</label><input id="ri-name" value="${esc(data.recipe.name || '')}" maxlength="120"></div>
          <div class="field"><label for="ri-serv">Servings</label><input id="ri-serv" type="number" inputmode="decimal" min="0.5" step="any" value="${esc(data.recipe.servings || 1)}"></div></div>
        <p class="rc-source">From <a href="${esc(data.recipe.source_url)}" target="_blank" rel="noopener nofollow">${esc(data.recipe.source_name || new URL(data.recipe.source_url).hostname)}</a>${data.recipe.source_author ? ` · by ${esc(data.recipe.source_author)}` : ''}</p>
        <ol class="ri-lines">${lines
          .map((l, i) => {
            const opts = l.ing.candidates.map((c) => `<option value="${c.id}"${l.food && l.food.id === c.id ? ' selected' : ''}>${esc(c.name)}${c.brand ? ` (${esc(c.brand)})` : ''} · ${esc(N.SOURCES[c.source] || c.source)}${c.complete ? '' : ' · incomplete'}</option>`);
            if (l.food && !l.ing.candidates.some((c) => c.id === l.food.id)) opts.unshift(`<option value="${l.food.id}" selected>${esc(l.food.name)}</option>`);
            const ps = portionsOf(l.food);
            const needsCheck = !l.skip && l.ing.match !== 'confirmed';
            return `<li class="ri-line${l.skip ? ' skip' : ''}${needsCheck && !l.checked ? ' todo' : ''}" data-i="${i}">
              <p class="ri-orig">“${esc(l.ing.original)}”${l.ing.reason ? ` <small>${esc(l.ing.reason)}</small>` : ''}</p>
              <div class="ri-row">
                <select data-food aria-label="Matching food"${l.skip ? ' disabled' : ''}>${opts.join('')}<option value="">${l.ing.candidates.length ? 'None of these' : 'No match found'}</option></select>
                <button type="button" class="ml-btn small" data-search${l.skip ? ' disabled' : ''}>Search…</button>
                <span class="adj-amt"><input type="number" inputmode="decimal" min="0" step="any" value="${l.amount === null ? '' : l.amount}" data-amt aria-label="Amount"${l.skip ? ' disabled' : ''}><span>${esc(l.food ? l.food.basis : 'g')}</span></span>
                ${ps.length && !l.skip ? `<select data-portion aria-label="Use a portion"><option value="">Portion…</option>${ps.map((x, j) => `<option value="${j}">${esc(x.label)} (${esc(N.formatAmount(x.amount, l.food.basis))})</option>`).join('')}</select>` : ''}
              </div>
              <div class="ri-row">
                <label><input type="checkbox" data-skip${l.skip ? ' checked' : ''}> Leave out</label>
                ${needsCheck && !l.skip ? `<label class="ri-check"><input type="checkbox" data-checked${l.checked ? ' checked' : ''}> I've checked this match and amount</label>` : ''}
              </div></li>`;
          })
          .join('')}</ol>
        <p class="form-msg" data-msg role="alert"></p>
        <button type="button" class="btn" data-save-import>Save recipe</button>
        <p class="hint">Volumes (cups, spoons) and counted items ("2 onions") need a weight. Use a portion or weigh it. Nothing is guessed.</p>
      </section>`;
    };
    draw();
    box.addEventListener('change', (e) => {
      const li = e.target.closest('[data-i]');
      if (!li) return;
      const l = lines[Number(li.dataset.i)];
      if (e.target.matches('[data-food]')) {
        l.food = l.ing.candidates.find((c) => c.id === e.target.value) || (l.food && l.food.id === e.target.value ? l.food : null);
        l.amount = amountFor(l.ing, l.food);
        l.checked = false;
        draw();
      } else if (e.target.matches('[data-portion]') && e.target.value !== '') {
        const x = portionsOf(l.food)[Number(e.target.value)];
        l.amount = Math.round((l.ing.quantity || 1) * Number(x.amount) * 10) / 10;
        draw();
      } else if (e.target.matches('[data-skip]')) {
        l.skip = e.target.checked;
        draw();
      } else if (e.target.matches('[data-checked]')) {
        l.checked = e.target.checked;
        li.classList.toggle('todo', !l.checked);
      }
    });
    box.addEventListener('input', (e) => {
      if (!e.target.matches('[data-amt]')) return;
      const l = lines[Number(e.target.closest('[data-i]').dataset.i)];
      const v = Number(e.target.value);
      l.amount = v > 0 ? Math.round(v * 10) / 10 : null;
    });
    box.addEventListener('click', async (e) => {
      const li = e.target.closest('[data-i]');
      if (li && e.target.closest('[data-search]')) {
        const l = lines[Number(li.dataset.i)];
        const pick = await pickFood({ title: `Match “${l.ing.name}”`, country, amount: false });
        if (pick) {
          l.food = pick.food;
          l.amount = amountFor(l.ing, l.food);
          l.checked = false;
          draw();
        }
      }
      if (!e.target.closest('[data-save-import]')) return;
      const msg = box.querySelector('[data-msg]');
      const use = lines.filter((l) => !l.skip);
      const bad = use.findIndex((l) => !l.food || !(l.amount > 0) || (l.ing.match !== 'confirmed' && !l.checked));
      if (!use.length) return (msg.textContent = 'Keep at least one ingredient.');
      if (bad >= 0) {
        const l = use[bad];
        msg.textContent = `Check “${l.ing.original}”: ${!l.food ? 'choose a food or leave it out' : !(l.amount > 0) ? 'add the amount' : 'tick the box once you have checked it'}.`;
        box.querySelector(`[data-i="${lines.indexOf(l)}"]`).scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const servings = Number(box.querySelector('#ri-serv').value) || 1;
      h.withBusy(e.target, async () => {
        const rec = h.must(await sb.from('recipes').insert({
          name: (box.querySelector('#ri-name').value.trim() || 'Imported recipe').slice(0, 120), servings,
          source_url: data.recipe.source_url, source_name: data.recipe.source_name ? String(data.recipe.source_name).slice(0, 200) : null,
          source_author: data.recipe.source_author ? String(data.recipe.source_author).slice(0, 200) : null, imported_at: new Date().toISOString(),
        }).select().single());
        h.must(await sb.from('recipe_items').insert(use.map((l, i) => ({
          recipe_id: rec.id, position: i, food_id: l.food.id, amount: l.amount,
          original_text: l.ing.original.slice(0, 300), prep: l.ing.prep ? l.ing.prep.slice(0, 80) : null, match: 'confirmed',
        }))));
        h.toast('Recipe saved.');
        location.hash = at(base, `recipe/${rec.id}`);
      });
    });
  }

  // Grams or mL for an ingredient line, only when no guess is needed.
  function amountFor(ing, food) {
    if (!food) return null;
    if (food.basis === 'mL' && ing.mL) return ing.mL;
    if (food.basis === 'g' && ing.grams) return ing.grams;
    return null;
  }

  // ----------------------------------------------------------------- foods

  async function foodLibrary(q) {
    const review = h.must(await sb.from('foods').select('*').eq('needs_review', true).is('retired_at', null).order('created_at', { ascending: false }).limit(60));
    const ids = [...new Set(review.map((f) => f.created_by).filter(Boolean))];
    const people = ids.length ? h.must(await sb.from('profiles').select('id, full_name, email, role').in('id', ids)) : [];
    const who = (id) => {
      const p = people.find((x) => x.id === id);
      return p ? (p.role === 'coach' ? 'You' : p.full_name || p.email) : '–';
    };
    const sources = h.must(await sb.from('food_sources').select('*').order('id'));
    const runs = (await sb.from('import_runs').select('source, dataset, status, rows_upserted, finished_at, started_at').order('started_at', { ascending: false }).limit(8)).data || [];
    const reviewRows = review.map((f) => `<li class="rv" data-food="${f.id}">
        <div class="rv-top"><span class="fi-name"><b>${esc(f.name)}</b><small>${esc(who(f.created_by))} · ${new Date(f.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}${f.notes && f.notes.energy_check ? ` · ${esc(f.notes.energy_check)}` : ''}${f.notes && f.notes.entered_for ? ` · typed for ${esc(f.notes.entered_for)}` : ''}</small>${badges(f)}</span>
          ${f.source === 'recipe' ? `<a class="ml-btn small" href="#library/recipe/${esc((f.notes && f.notes.recipe_id) || '')}">Open recipe</a>` : '<button type="button" class="ml-btn small" data-review>Check values</button>'}</div>
        <p class="hint">Per 100 ${esc(f.basis)}: ${esc(macroText(N.per100Of(f)))}</p>
        <form class="rv-form" hidden novalidate><div class="rv-grid">${[['kcal', 'kcal'], ['protein_g', 'Protein g'], ['carbs_g', 'Carbs g'], ['fat_g', 'Fat g'], ['fibre_g', 'Fibre g']]
          .map(([k, l]) => `<label>${l}<input name="${k}" type="number" inputmode="decimal" min="0" step="any" value="${f[k] === null ? '' : Number(f[k])}"></label>`)
          .join('')}</div><p class="hint">Per 100 ${esc(f.basis)}. Leave a value blank if it is still unknown.</p>
          <div class="row-actions"><button type="submit" class="btn btn-small">Save and mark checked</button></div></form></li>`);
    libShell(
      'Foods & plans',
      'Every food keeps its source. Lab data first, then labels, then estimates.',
      `${libTabs('foods')}
      <div class="row-actions"><button type="button" class="btn" data-add-food>Add a food</button></div>
      <section class="card"><label for="fl-q">Search the food database</label><input id="fl-q" type="search" value="${esc(q || '')}" placeholder="e.g. toor dal, chicken thigh, 9300633…" autocomplete="off"><div id="fl-results"></div></section>
      <h2 class="crm-sub">To check (${review.length})</h2>
      <p class="hint">Foods clients typed in, foods with missing values, and recipes with unconfirmed ingredients. Logged meals keep the numbers they were logged with; your corrections apply from now on.</p>
      ${review.length ? `<ul class="rv-list">${reviewRows.join('')}</ul>` : '<div class="card"><p class="hint">Nothing to check.</p></div>'}
      <h2 class="crm-sub">Sources and licences</h2>
      <div class="card table-card"><div class="table-wrap"><table class="crm-table"><thead><tr><th>Source</th><th>Licence</th><th>Attribution</th></tr></thead><tbody>${sources
        .map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${s.licence_url ? `<a href="${esc(s.licence_url)}" target="_blank" rel="noopener">${esc(s.licence)}</a>` : esc(s.licence)}${s.share_alike ? ' <span class="fb warn">Share-alike</span>' : ''}</td><td class="wrap-text">${esc(s.attribution)}${s.notes ? `<br><small>${esc(s.notes)}</small>` : ''}</td></tr>`)
        .join('')}</tbody></table></div></div>
      ${runs.length ? `<h2 class="crm-sub">Recent imports</h2><div class="card table-card"><div class="table-wrap"><table class="crm-table"><thead><tr><th>Source</th><th>Dataset</th><th>Status</th><th>Rows</th><th>Finished</th></tr></thead><tbody>${runs
        .map((x) => `<tr><td>${esc(N.SOURCES[x.source] || x.source)}</td><td>${esc(x.dataset || '–')}</td><td>${esc(x.status)}</td><td>${fmt(x.rows_upserted)}</td><td>${x.finished_at ? new Date(x.finished_at).toLocaleString('en-AU') : '–'}</td></tr>`)
        .join('')}</tbody></table></div></div>` : ''}
      ${creditsHTML()}`,
    );
    const input = h.root.querySelector('#fl-q');
    const out = h.root.querySelector('#fl-results');
    let timer = null;
    let seq = 0;
    const run = async () => {
      const v = input.value.trim();
      const mine = ++seq;
      if (v.length < 2) {
        out.innerHTML = '';
        return;
      }
      const hits = await searchFoods(v, 'AU', 30).catch((err) => (out.innerHTML = `<p class="hint">${esc(h.friendlyError(err))}</p>`, null));
      if (!hits || mine !== seq) return;
      out.innerHTML = hits.length
        ? `<div class="table-wrap"><table class="crm-table"><thead><tr><th>Food</th><th>Source</th><th>Per 100</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fibre</th></tr></thead><tbody>${hits
            .map((f) => `<tr><td class="wrap-text"><b>${esc(f.name)}</b>${f.brand ? `<br><small>${esc(f.brand)}</small>` : ''}${f.barcode ? `<br><small>${esc(f.barcode)}</small>` : ''}</td><td>${badges(f)}</td><td>${esc(f.basis)}</td><td>${f.kcal === null ? '–' : fmt(f.kcal)}</td><td>${g(f.protein_g)}</td><td>${g(f.carbs_g)}</td><td>${g(f.fat_g)}</td><td>${g(f.fibre_g)}</td></tr>`)
            .join('')}</tbody></table></div>`
        : `<p class="hint">No match for "${esc(v)}". The sample database is small; see the import guide to load the full datasets.</p>`;
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    });
    if (q) run();
    h.root.querySelector('[data-add-food]').addEventListener('click', async () => {
      const pick = await pickFood({ title: 'Add a food', start: 'create', amount: false });
      if (pick) h.toast(`${pick.food.name} saved. It can now be used in plans and recipes.`);
    });
    h.root.querySelectorAll('.rv').forEach((li) => {
      const btn = li.querySelector('[data-review]');
      const form = li.querySelector('.rv-form');
      if (!btn) return;
      btn.addEventListener('click', () => (form.hidden = !form.hidden));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = h.readForm(form);
        const lim = { kcal: 1000, protein_g: 100, carbs_g: 130, fat_g: 100, fibre_g: 100 };
        for (const [k, v] of Object.entries(d)) if (v !== null && (v < 0 || v > lim[k])) return h.toast(`${k.replace('_g', '')} per 100 can't be ${v}.`, true);
        h.withBusy(form.querySelector('button'), async () => {
          h.must(await sb.from('foods').update({ ...d, needs_review: false }).eq('id', li.dataset.food).select('id').single());
          h.toast('Checked.');
          await foodLibrary(input.value.trim());
        });
      });
    });
  }

  // Clients reach their own recipes from the meal plan tab.
  async function clientRecipes(view, arg) {
    if (view === 'recipe' && arg) return recipeEditor(arg, '#');
    if (view === 'recipe-import') return recipeImport('#');
    return recipeList('#');
  }

  window.RewiredNutritionUI = {
    init, load, ensureRange, dayTarget, hasMealPlan, pickFood,
    clientMeals, checkinFoodHTML, coachMeals, coachCurrent, coachFoodLog, library, COUNTRIES,
  };
})();
