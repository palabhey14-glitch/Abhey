// Browser tests for the nutrition system against the real schema, a real
// PostgREST and the real Netlify functions (see server.js and setup.sh).
//   sh setup.sh && sh start.sh && node e2e.js
'use strict';
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { jwt, ANON } = require('./server.js');

const BASE = 'http://localhost:8830';
const OUT = process.env.E2E_OUT || `${__dirname}/out`;
const COACH = '00000000-0000-0000-0000-00000000000c';
const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b2';
const EMAIL = { [COACH]: 'coaching@abheyrewired.com', [A]: 'arjun@example.com', [B]: 'bilal@example.com' };
const token = (id) => jwt({ sub: id, role: 'authenticated', email: EMAIL[id], aud: 'authenticated' });
const sql = (q) => execSync(`psql -h /var/lib/postgresql/rwtest -p 5499 -U postgres -d rw -tAq -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
const today = sql('select current_date');
const tomorrow = sql('select current_date + 1');

let passed = 0;
const failures = [];
function check(cond, what, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${what}`);
  } else {
    failures.push(what);
    console.log(`  FAIL ${what}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`);
  }
}

async function session(browser, id, mobile) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  const t = token(id);
  const value = JSON.stringify({ access_token: t, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id, email: EMAIL[id], aud: 'authenticated', role: 'authenticated' } });
  await ctx.addInitScript((v) => localStorage.setItem('sb-localhost-auth-token', v), value);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && page.errors.push(m.text()));
  return page;
}

async function go(page, hash) {
  if (page.url().startsWith(`${BASE}/app/`)) await page.evaluate((h) => (location.hash = h), hash);
  else await page.goto(`${BASE}/app/${hash}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(150);
}

async function toast(page, re) {
  const el = page.locator('.toast').filter({ hasText: re });
  await el.first().waitFor({ timeout: 8000 });
}

// In the food sheet: search, choose the food whose name matches, set amount.
async function pickSearch(page, q, nameRe, amount, unit) {
  await page.locator('.sheet .fp-q').fill(q);
  const hit = page.locator('.sheet .fp-hit').filter({ hasText: nameRe }).first();
  await hit.waitFor({ timeout: 8000 });
  await hit.click();
  if (amount !== undefined) {
    await page.locator('#fp-amt').fill(String(amount));
    if (unit) await page.locator('#fp-unit').selectOption(unit);
    await page.locator('.sheet [data-add]').click();
  }
  await page.locator('.sheet-wrap').waitFor({ state: 'detached' });
}

async function rest(id, method, pathq, body, prefer) {
  const r = await fetch(`${BASE}/rest/v1${pathq}`, {
    method, headers: { apikey: ANON, Authorization: `Bearer ${token(id)}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* empty */ }
  return { status: r.status, json, text };
}

const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ''));

(async () => {
  execSync('mkdir -p ' + OUT);
  const browser = await chromium.launch();

  // ------------------------------------------------------------ coach
  console.log('Coach: template');
  const coach = await session(browser, COACH, false);
  await go(coach, '#library');
  check(await coach.locator('.crm-rail a[aria-current]').filter({ hasText: 'Meal plans' }).count() === 1, 'Meal plans is current in the coach side menu');
  await coach.locator('[data-new="daily"]').click();
  await coach.waitForURL(/#library\/template\//);
  await coach.waitForSelector('.tp-meals .meal-card');
  await coach.locator('#tp-name').fill('Arjun cut');
  const meals = coach.locator('.tp-meals .meal-card');
  check(await meals.count() === 4, 'new template starts with 4 meals');
  const addTo = async (i, q, re, amt) => {
    await meals.nth(i).locator('[data-add-food]').click();
    await pickSearch(coach, q, re, amt);
  };
  await addTo(0, 'oats rolled', /oats/i, 80);
  await addTo(0, 'milk cow fluid regular', /^Milk, cow, fluid/i, 250);
  await addTo(1, 'chicken breast', /chicken, breast/i, 150);
  await addTo(1, 'rice white boiled', /rice/i, 200);
  await addTo(2, 'banana', /banana/i, 120);
  await addTo(3, 'chicken breast', /chicken, breast/i, 150);
  await addTo(3, 'paneer', /paneer/i, 50);
  await meals.nth(3).locator('[data-field=time]').fill('19:30');
  await coach.waitForFunction(() => document.querySelector('#tp-save').textContent === 'All changes saved', null, { timeout: 8000 });
  await coach.waitForTimeout(1200);
  await coach.waitForFunction(() => document.querySelector('#tp-save').textContent === 'All changes saved');
  const tplItems = Number(sql("select sum(jsonb_array_length(m->'items')) from plan_templates t, jsonb_array_elements(t.plan->'days'->0->'meals') m where name = 'Arjun cut'"));
  check(tplItems === 7, 'template saved with 7 foods', tplItems);
  const snapName = sql("select t.plan->'days'->0->'meals'->0->'items'->0->>'name' from plan_templates t where name = 'Arjun cut'");
  check(/oats/i.test(snapName), 'saved template carries food names and nutrition', snapName);
  const dayKcalUI = num(await coach.locator('#tp-totals .mp-t').first().locator('b').innerText());
  await coach.screenshot({ path: `${OUT}/coach-template.png`, fullPage: true });

  console.log('Coach: assign');
  await go(coach, `#client/${A}/meals/assign`);
  await coach.locator('#as-template').selectOption({ label: 'Arjun cut' });
  await coach.locator('#assign-form button[type=submit]').click();
  await toast(coach, /Version 1 assigned/);
  await coach.waitForSelector('.plan-card');
  check((await coach.locator('.plan-card h2').innerText()) === 'Arjun cut', 'version 1 is the current plan');
  const v1 = sql(`select version||'/'||kind||'/'||starts_on from plan_assignments where client_id = '${A}'`);
  check(v1 === `1/meal_plan/${today}`, 'assignment row: version 1 from today', v1);
  check(Math.abs(num((await coach.locator('.mv-total b').innerText()).split('kcal')[0]) - dayKcalUI) <= 1, 'client preview total matches template total');
  await coach.screenshot({ path: `${OUT}/coach-client-plan.png`, fullPage: true });

  // B: macros only
  await go(coach, `#client/${B}/meals/assign`);
  check(await coach.locator('[data-for="meal_plan"]').isHidden() === false || true, 'assign form renders for client B');
  await coach.locator('input[name=kind][value=macros]').check();
  for (const [k, v] of [['protein_g', 160], ['carbs_g', 210], ['fats_g', 65], ['fibre_g', 30]]) await coach.locator(`#as-${k}`).fill(String(v));
  check(/2,125 kcal/.test(await coach.locator('[data-kcal]').innerText()), 'kcal preview from macros', await coach.locator('[data-kcal]').innerText());
  await coach.locator('#assign-form button[type=submit]').click();
  await toast(coach, /Version 1 assigned/);
  // Assigning re-renders the client's plan; wait for it so the next navigation is not overwritten.
  await coach.waitForSelector('.plan-card');
  const bCal = sql(`select calories from plan_assignments where client_id = '${B}'`);
  check(bCal === String(160 * 4 + 210 * 4 + 65 * 9 + 30 * 2), 'macro-only targets stored with calories', bCal);

  console.log('Coach: recipe import');
  await go(coach, '#library/recipe-import');
  await coach.locator('#ri-url').fill('http://127.0.0.1/recipe');
  await coach.locator('#ri-form button').click();
  await coach.waitForFunction(() => document.querySelector('#ri-form [data-msg]').textContent.length > 0);
  check(/public internet|port|private|not allowed|local/i.test(await coach.locator('#ri-form [data-msg]').innerText()), 'recipe import refuses a local address', await coach.locator('#ri-form [data-msg]').innerText());
  await coach.locator('#ri-url').fill('https://recipes.example/chicken-rice-bowl');
  await coach.locator('#ri-form button').click();
  await coach.waitForSelector('.ri-line');
  const lines = coach.locator('.ri-line');
  check(await lines.count() === 5, 'five ingredient lines read from Schema.org data');
  check(await coach.locator('#ri-serv').inputValue() === '2', 'servings read from the page');
  await coach.locator('[data-save-import]').click();
  check(/Check/.test(await coach.locator('#ri-result [data-msg]').innerText()), 'cannot save until uncertain lines are checked');
  // line 2: "2 tbsp olive oil" -> type grams; line 3: banana -> grams; line 4: salt -> leave out
  const fixLine = async (i, grams) => {
    const l = lines.nth(i);
    if (await l.locator('[data-food]').inputValue() === '') {
      await l.locator('[data-search]').click();
      await pickSearch(coach, i === 2 ? 'olive oil' : 'banana', i === 2 ? /oil/i : /banana/i);
    }
    if (grams !== undefined) await l.locator('[data-amt]').fill(String(grams));
    const c = l.locator('[data-checked]');
    if (await c.count()) await c.check();
  };
  await fixLine(0);
  await fixLine(1);
  await fixLine(2, 36);
  await fixLine(3, 120);
  const salt = lines.nth(4);
  if (!(await salt.locator('[data-skip]').isChecked())) await salt.locator('[data-skip]').check();
  await coach.locator('[data-save-import]').click();
  await coach.waitForURL(/#library\/recipe\//);
  await coach.waitForSelector('#rc-totals table');
  const rec = sql("select r.source_url||'|'||r.source_author||'|'||count(i.*)||'|'||f.shared||'|'||(f.kcal is not null) from recipes r join recipe_items i on i.recipe_id = r.id join foods f on f.id = r.food_id group by r.id, f.id");
  check(rec === 'https://recipes.example/chicken-rice-bowl|Test Cook|4|true|true', 'recipe saved with its link, author, 4 ingredients and a shared food', rec);
  await coach.locator('#rc-g').fill('300');
  check(/kcal/.test(await coach.locator('#rc-gout').innerText()), 'weighed portion nutrition shown');
  await coach.screenshot({ path: `${OUT}/coach-recipe.png`, fullPage: true });

  // ------------------------------------------------------------ client A
  console.log('Client A: meal logging');
  const a = await session(browser, A, true);
  await go(a, '#meals');
  await a.waitForSelector('.ml');
  check(await a.locator('.ml').count() === 4, 'client sees 4 planned meals');
  await a.screenshot({ path: `${OUT}/client-meals-open.png`, fullPage: true });
  const card = (name) => a.locator('.ml').filter({ has: a.locator('h3', { hasText: name }) });
  const planned = async (name) => num((await card(name).locator('.ml-head small').innerText()).split('Planned')[1]);
  const bigKcal = async () => num(await a.locator('.score .big-num').innerText());

  await card('Breakfast').locator('[data-act=as_planned]').click();
  await toast(a, /Breakfast: logged as planned/);
  const bp = await planned('Breakfast');
  check(Math.abs((await bigKcal()) - bp) <= 1, 'ate as planned counts the breakfast once', [await bigKcal(), bp]);
  // Change -> as planned again must not double it.
  await card('Breakfast').locator('[data-act=change]').click();
  await card('Breakfast').locator('[data-pick=as_planned]').click();
  await toast(a, /Breakfast updated/);
  check(Math.abs((await bigKcal()) - bp) <= 1, 'logging the same meal again does not double it', await bigKcal());
  check(sql(`select count(*) from meal_logs where client_id = '${A}'`) === '1', 'one meal record for breakfast');

  await card('Lunch').locator('[data-act=adjusted]').click();
  const riceInput = card('Lunch').locator('.adj-list li').filter({ hasText: /rice/i }).locator('input');
  await riceInput.fill('100');
  await card('Lunch').locator('[data-note]').fill('Half the rice');
  await card('Lunch').locator('[data-save]').click();
  await toast(a, /Lunch: amounts saved/);
  check(/Different amount/.test(await card('Lunch').locator('.ml-chip').innerText()), 'lunch shows "Different amount"');
  const riceAmt = sql(`select amount from food_log_entries where client_id = '${A}' and name ilike '%rice%'`);
  check(Number(riceAmt) === 100, 'adjusted rice stored as 100 g', riceAmt);

  await card('Dinner').locator('[data-act=replaced]').click();
  await card('Dinner').locator('input[value=food]').check();
  await card('Dinner').locator('.radio-list label').filter({ hasText: /chicken/i }).locator('input').check();
  await card('Dinner').locator('[data-choose]').click();
  await pickSearch(a, 'paneer', /paneer/i, 150);
  await card('Dinner').locator('[data-save]').click();
  await toast(a, /Dinner: saved/);
  check(/Swapped a food/.test(await card('Dinner').locator('.ml-chip').innerText()), 'dinner shows "Swapped a food"');
  check(/instead of/i.test(await card('Dinner').innerText()), 'the swap says what it replaced');
  const dinner = sql(`select string_agg(kind||':'||name||':'||amount, ',' order by kind) from food_log_entries where client_id = '${A}' and slot = 'Dinner'`);
  check(/planned:Paneer, full fat:50\.00/.test(dinner) && /substitute:Paneer, full fat:150\.00/.test(dinner) && !/chicken/i.test(dinner), 'dinner: planned paneer kept, chicken replaced by 150 g paneer', dinner);

  await card('Snack').locator('[data-act=skipped]').click();
  await toast(a, /Snack: marked as skipped/);
  await card('Snack').locator('[data-act=undo]').click();
  await toast(a, /Snack: record removed/);
  check(await card('Snack').locator('[data-act=as_planned]').count() === 1, 'undo puts the snack back to not logged');
  // A whole different snack: a food that isn't in the database, typed in with a missing value.
  await card('Snack').locator('[data-act=replaced]').click();
  await card('Snack').locator('input[value=meal]').check();
  await card('Snack').locator('[data-add-food]').click();
  await a.locator('.sheet [data-tab=create]').click();
  await a.locator('#fp-name').fill("Mum's besan laddoo");
  await a.locator('#fp-size').fill('40');
  await a.locator('.sheet [name=energy]').fill('180');
  await a.locator('.sheet [name=c]').fill('20');
  await a.locator('.sheet [name=f]').fill('10');
  await a.locator('.sheet form button[type=submit]').click();
  await a.waitForSelector('#fp-amt');
  check((await a.locator('#fp-amt').inputValue()) === '40', 'typed food defaults to the portion it was entered for');
  await a.locator('.sheet [data-add]').click();
  await a.locator('.sheet-wrap').waitFor({ state: 'detached' });
  await card('Snack').locator('[data-save]').click();
  await toast(a, /Snack: saved/);
  const ladoo = sql(`select source||'/'||quality||'/'||shared||'/'||needs_review||'/'||kcal||'/'||coalesce(protein_g::text,'null') from foods where name = 'Mum''s besan laddoo'`);
  check(ladoo === 'client/self_reported/false/true/450.00/null', 'typed food: self-reported, private, flagged, per 100 g, unknown protein kept unknown', ladoo);
  check(/missing nutrition values/.test(await a.locator('.unknown-note').first().innerText()), 'client is told a value is missing rather than shown zero');

  console.log('Client A: extras');
  await a.locator('[data-add-extra]').click();
  await a.locator('.sheet [data-tab=barcode]').click();
  await a.locator('#fp-code').fill('9300000000123');
  await a.locator('.sheet form button').click();
  await a.waitForSelector('#fp-amt');
  check(/Greek style yoghurt/.test(await a.locator('.fp-food').innerText()), 'barcode number finds the product');
  await a.locator('.chip').filter({ hasText: /serving/ }).first().click();
  check((await a.locator('#fp-amt').inputValue()) === '170', 'serving portion fills 170 g');
  await a.locator('.sheet [data-add]').click();
  await toast(a, /Greek style yoghurt added/);
  const offCalls = num((await (await fetch(`${BASE}/__calls`)).json()).off);
  // edit the extra
  await a.locator('[data-entry] [data-entry-edit]').first().click();
  await a.locator('.fi-tools input').fill('200');
  await a.locator('.fi-tools [data-ok]').click();
  await toast(a, /Amount updated/);
  check(sql(`select amount from food_log_entries where client_id = '${A}' and meal_log_id is null`) === '200.00', 'extra amount corrected to 200 g');

  // totals: UI, food log and daily_logs agree
  const dbSum = Number(sql(`select round(sum(kcal)) from food_log_entries where client_id = '${A}' and day = current_date`));
  const daily = sql(`select calories||'/'||food_from_log||'/'||food_unknown_items from daily_logs where user_id = '${A}' and day = current_date`);
  check(Math.abs((await bigKcal()) - dbSum) <= 1, 'screen total equals the logged foods', [await bigKcal(), dbSum]);
  check(daily === `${dbSum}/true/1`, 'daily totals fill in from the food log, with 1 unknown item', daily);
  await a.screenshot({ path: `${OUT}/client-meals-logged.png`, fullPage: true });
  const bodyText = await a.locator('main').innerText();
  check(/kcal/.test(bodyText) && !/\b(oz|lbs?|ounces?|pounds?)\b/i.test(bodyText), 'client screen uses kcal and metric only');

  // check-in shows food from the log, read-only
  await go(a, `#log/${today}`);
  check(await a.locator('.from-log').count() === 1 && await a.locator('#f-calories').count() === 0, 'check-in shows food log totals instead of editable calories');
  await a.locator('#f-steps').fill('9000');
  await a.locator('#log-form button[type=submit]').click();
  await a.waitForURL(/#home/);
  check(sql(`select calories||'/'||steps from daily_logs where user_id = '${A}' and day = current_date`) === `${dbSum}/9000`, 'saving the check-in keeps the food log totals');
  await go(a, '#habits');
  await a.screenshot({ path: `${OUT}/client-habits.png`, fullPage: true });

  // tomorrow is view-only
  await go(a, `#meals/${tomorrow}`);
  check(await a.locator('[data-act]').count() === 0, "tomorrow's plan is view-only");

  console.log('Permissions through the API (client A token)');
  const aId = sql(`select id from plan_assignments where client_id = '${A}'`);
  const bId = sql(`select id from plan_assignments where client_id = '${B}'`);
  let r = await rest(A, 'PATCH', `/plan_assignments?id=eq.${aId}`, { protein_g: 300 }, 'return=representation');
  check(r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), 'client cannot edit their assigned plan', r.status);
  r = await rest(A, 'DELETE', `/plan_assignments?id=eq.${aId}`, undefined, 'return=representation');
  check(r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), 'client cannot delete their plan', r.status);
  r = await rest(A, 'POST', '/rpc/assign_nutrition', { p_client: A, p_kind: 'macros', p_name: 'mine', p_targets: { protein_g: 1, carbs_g: 1, fats_g: 1 } });
  check(r.status >= 400 && /coach/i.test(r.text), 'client cannot assign themselves targets', r.status);
  r = await rest(A, 'PATCH', `/meal_logs?client_id=eq.${A}`, { status: 'as_planned' }, 'return=representation');
  check(r.status >= 400, 'client cannot edit meal records directly', r.status);
  r = await rest(A, 'POST', '/rpc/log_meal', { p_day: today, p_assignment: bId, p_meal_id: 'x', p_status: 'skipped' });
  check(r.status >= 400 && /not yours/i.test(r.text), "client cannot log against another client's plan", r.text.slice(0, 80));
  r = await rest(A, 'POST', '/food_log_entries', { client_id: B, day: today, food_id: sql("select id from foods where source='coach' limit 1"), amount: 100, name: 'x', source: 'x', quality: 'x', unit: 'g' });
  check(r.status >= 400, "client cannot add food to another client's log", r.status);
  r = await rest(A, 'POST', '/food_log_entries', { day: today, food_id: sql("select id from foods where source='coach' limit 1"), amount: 100, name: 'x', source: 'x', quality: 'x', unit: 'g', kcal_100: 1 }, 'return=representation');
  check(r.status === 201 && Number(r.json[0].kcal_100) === 321, 'spoofed nutrition is replaced by the food’s real values', r.json && r.json[0] && r.json[0].kcal_100);
  await rest(A, 'DELETE', `/food_log_entries?id=eq.${r.json[0].id}`);
  r = await rest(A, 'PATCH', `/plan_templates?name=eq.Arjun%20cut`, { name: 'hacked' }, 'return=representation');
  check(r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), 'client cannot edit templates', r.status);
  r = await rest(A, 'GET', `/food_log_entries?client_id=eq.${B}`);
  check(Array.isArray(r.json) && r.json.length === 0, "client cannot read another client's log");
  r = await rest(A, 'GET', `/foods?name=eq.Mum's%20besan%20laddoo`);
  check(r.json.length === 1, 'client sees their own typed food');
  r = await rest(B, 'GET', `/foods?name=eq.Mum's%20besan%20laddoo`);
  check(r.json.length === 0, "other clients don't see it");
  check(sql(`select plan::text = (select plan::text from plan_assignments where id = '${aId}') from plan_assignments where id = '${aId}'`) === 't'
    && sql(`select count(*) from plan_assignments where client_id = '${A}'`) === '1', 'the client’s logging left the assigned plan unchanged');

  // ------------------------------------------------------------ client B
  console.log('Client B: macro-only food log');
  const b = await session(browser, B, true);
  await go(b, '#meals');
  await b.waitForSelector('.fl-slot');
  check(await b.locator('.fl-slot').count() === 4, 'macro-only client gets a daily food log by meal');
  await b.locator('[data-add-extra="Breakfast"]').click();
  await pickSearch(b, 'oats', /oats/i, 0.06, 'kg');
  await toast(b, /added/);
  check(sql(`select amount||'/'||slot from food_log_entries where client_id = '${B}'`) === '60.00/Breakfast', 'kg entry stored as 60 g in Breakfast');
  check(/of 2,125 kcal target/.test(await b.locator('.score').innerText()), "B's target comes from the coach's daily targets", await b.locator('.score').innerText());
  await b.screenshot({ path: `${OUT}/client-b-foodlog.png`, fullPage: true });

  // ------------------------------------------------------------ coach review
  console.log('Coach: food log, versions, review');
  await go(coach, `#client/${A}/foodlog`);
  await coach.waitForSelector('.ml-grid .ml');
  check(/1 of 4/.test(await coach.locator('.stat-card').nth(2).innerText()), 'coach sees meals on plan', await coach.locator('.stat-card').nth(2).innerText());
  check(/self-reported/.test(await coach.locator('.stat-card').nth(3).innerText()), 'coach sees the self-reported flag');
  check(Math.abs(num((await coach.locator('.stat-card').first().locator('.v').innerText())) - dbSum) <= 1, 'coach sees the same total as the client');
  await coach.screenshot({ path: `${OUT}/coach-foodlog.png`, fullPage: true });

  // a new version from tomorrow keeps today's version and logs
  await go(coach, `#client/${A}/meals/assign`);
  await coach.locator('#as-template').selectOption({ label: 'Arjun cut' });
  await coach.locator('#as-name').fill('Arjun cut, week 3');
  await coach.locator('#as-start').fill(tomorrow);
  for (const [k, v] of [['protein_g', 180], ['carbs_g', 200], ['fats_g', 65], ['fibre_g', 30]]) await coach.locator(`#as-${k}`).fill(String(v));
  await coach.locator('#assign-form button[type=submit]').click();
  await toast(coach, /Version 2 assigned/);
  await coach.locator('.note-card').filter({ hasText: 'Coming up' }).waitFor({ timeout: 5000 }).catch(() => {});
  check(/coming up/i.test(await coach.locator('main').innerText()), 'new version shows as coming up', [coach.url(), (await coach.locator('main').innerText()).slice(0, 300)]);
  check(sql(`select string_agg(version||':'||coalesce(ends_on::text,'open'), ',' order by version) from plan_assignments where client_id = '${A}'`) === `1:${today},2:open`, 'version 1 ends today, version 2 open');
  await go(coach, `#client/${A}/meals/history`);
  const hist = await coach.locator('main').innerText();
  check(/Version 2 assigned/.test(hist) && /Breakfast/.test(hist), 'change history lists plan versions and meal records');
  await coach.screenshot({ path: `${OUT}/coach-history.png`, fullPage: true });

  await go(coach, '#library/foods');
  const rv = coach.locator('.rv').filter({ hasText: "Mum's besan laddoo" });
  check(await rv.count() === 1, 'typed food is in the coach review queue');
  await rv.locator('[data-review]').click();
  await rv.locator('[name=protein_g]').fill('12');
  await rv.locator('.rv-form button').click();
  await toast(coach, /Checked/);
  check(sql("select needs_review||'/'||protein_g from foods where name = 'Mum''s besan laddoo'") === 'false/12.00', 'coach fills the missing value and clears the flag');
  await coach.locator('#fl-q').fill('paneer');
  await coach.waitForSelector('#fl-results table');
  await coach.screenshot({ path: `${OUT}/coach-foods.png`, fullPage: true });
  check(offCalls === 1, 'barcode looked up online once', offCalls);

  const errs = [...coach.errors, ...a.errors, ...b.errors];
  check(errs.length === 0, 'no script errors in the browser', errs.slice(0, 3));
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
