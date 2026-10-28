// Browser tests for the coach dashboard tools and the Training scroll fix:
// Overview's Daily logs column, Physique → Photos, Client view (read-only),
// coach habit editing, and a workout being typed surviving the background refresh.
//   sh setup.sh && sh start.sh && node coach-tools.js
'use strict';
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { jwt } = require('./server.js');

const BASE = 'http://localhost:8830';
const OUT = process.env.E2E_OUT || `${__dirname}/out`;
const COACH = '00000000-0000-0000-0000-00000000000c';
const A = '00000000-0000-0000-0000-0000000000a1';
const EMAIL = { [COACH]: 'coaching@abheyrewired.com', [A]: 'arjun@example.com' };
const token = (id) => jwt({ sub: id, role: 'authenticated', email: EMAIL[id], aud: 'authenticated' });
const sql = (q) => execSync(`psql -h /var/lib/postgresql/rwtest -p 5499 -U postgres -d rw -tAq -c "${q.replace(/"/g, '\\"')}"`).toString().trim();

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
  await page.waitForTimeout(200);
}

function seed() {
  const ex = (name) => ({ name, sets: 3, reps_min: 8, reps_max: 12, rest_seconds_min: 90 });
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const rest = d === 4 || d === 7;
    const list = rest ? [] : ['Bench press', 'Incline dumbbell press', 'Cable fly', 'Overhead press', 'Lateral raise', 'Triceps pushdown'].map(ex);
    return `('${A}', current_date - 3, ${d}, 'Recomp block', '${rest ? 'Rest day' : `Session ${d}`}', ${rest}, '${JSON.stringify(list)}'::jsonb)`;
  });
  sql(`delete from training_plan where client_id = '${A}'`);
  sql(`insert into training_plan (client_id, program_start_date, cycle_day, program_name, session_name, is_rest_day, exercises) values ${days.join(',')}`);
  sql(`insert into daily_logs (user_id, day, weight_kg, steps, calories, protein_g, trained, notes) values
    ('${A}', current_date - 1, 82.4, 9400, 2150, 165, 'Yes', 'Felt strong on bench'),
    ('${A}', current_date, 82.1, 6100, null, null, null, null)
    on conflict (user_id, day) do update set weight_kg = excluded.weight_kg, steps = excluded.steps, notes = excluded.notes`);
  sql(`delete from client_habits where user_id = '${A}'`);
  sql(`insert into client_habits (user_id, name, category, unit, target) values ('${A}', 'Read before bed', 'Mindset', 'pages', 10)`);
  sql(`update targets set habit_settings = '{}'::jsonb, steps_target = 10000 where client_id = '${A}'`);
}

(async () => {
  seed();
  const browser = await chromium.launch();

  // ------------------------------------------------ coach, desktop
  console.log('Coach: Overview, Physique → Photos, Client view');
  const coach = await session(browser, COACH);
  await go(coach, `#client/${A}/logs`);
  check(await coach.locator('.crm-head h1').innerText() === 'Overview', 'old Daily logs link opens Overview');
  check(await coach.locator('.daily-col').isVisible(), 'Daily logs column is on Overview');
  check(await coach.locator('.daily-col .dl-day').count() === 7, 'column lists the 7 days of the week');
  check(/Felt strong on bench/.test(await coach.locator('.daily-col').innerText()), 'notes show in the column');
  check(/82\.4 kg/.test(await coach.locator('.daily-col').innerText()), 'weights show in the column');
  const nav = await coach.locator('.crm-sections').innerText();
  check(!/Daily logs|Gallery/.test(nav), 'Daily logs and Gallery are gone from the menu', nav);
  const box = await coach.locator('.daily-col').boundingBox();
  const main = await coach.locator('.ov-main').boundingBox();
  check(box.x > main.x + main.width - 1, 'Daily logs sits as a column to the right on desktop');
  await coach.screenshot({ path: `${OUT}/coach-overview.png`, fullPage: false });
  await coach.selectOption('#dl-week', '1');
  await coach.waitForTimeout(400);
  check(coach.url().endsWith('/overview/1'), 'week picker changes the week');

  await go(coach, `#client/${A}/photos`);
  check(/Photos/.test(await coach.locator('.crm-tabs [aria-current]').innerText()), 'old Gallery link opens Physique → Photos');
  check(await coach.locator('.crm-tabs a').count() === 3, 'Physique has Bodyweight, Measurements and Photos');
  check(await coach.locator('.crm-head h1').innerText() === 'Physique', 'Photos sits under Physique');

  await go(coach, `#client/${A}/training`);
  await coach.click('[data-client-view]');
  const frame = coach.frameLocator('.client-view iframe');
  await frame.locator('.tabs').waitFor({ timeout: 10000 });
  check(/Training/.test(await frame.locator('.topbar .title').innerText()), 'Client view opens the client Training screen');
  await coach.screenshot({ path: `${OUT}/coach-client-view.png` });
  await frame.locator('.tabs a[href="#habits"]').click();
  await frame.locator('.habit-list').waitFor();
  check(/Read before bed/.test(await frame.locator('.habit-list').innerText()), 'Client view shows the client’s own habits');
  const before = sql(`select coalesce(steps::text, 'null') from daily_logs where user_id = '${A}' and day = current_date`);
  await frame.locator('.habit[data-key="steps"] .habit-row').click();
  await frame.locator('.habit[data-key="steps"] input').fill('12345');
  await frame.locator('.habit[data-key="steps"] [type=submit]').click();
  await frame.locator('.toast').filter({ hasText: /preview/i }).first().waitFor({ timeout: 5000 });
  check(sql(`select coalesce(steps::text, 'null') from daily_logs where user_id = '${A}' and day = current_date`) === before, 'Client view cannot save anything');
  await coach.click('[data-cv-close]');
  check(await coach.locator('.client-view').count() === 0, 'Client view closes');
  check(await coach.evaluate(() => Boolean(localStorage.getItem('sb-localhost-auth-token'))), 'coach is still signed in after Client view');

  // ------------------------------------------------ coach edits habits
  console.log('Coach: edit habits');
  await go(coach, `#client/${A}/habits`);
  const steps = coach.locator('form[data-builtin="steps"]');
  await steps.locator('[name=name]').fill('Morning walk steps');
  await steps.locator('[name=steps_target]').fill('8000');
  await steps.locator('[type=submit]').click();
  await coach.locator('.toast').filter({ hasText: /saved/ }).first().waitFor({ timeout: 5000 });
  check(sql(`select steps_target||'/'||(habit_settings->'steps'->>'name') from targets where client_id = '${A}'`) === '8000/Morning walk steps', 'steps renamed and target saved');
  const fibre = coach.locator('form[data-builtin="fibre"]');
  await fibre.locator('[name=show]').uncheck();
  await fibre.locator('[type=submit]').click();
  await coach.waitForTimeout(600);
  check(sql(`select habit_settings->'fibre'->>'hidden' from targets where client_id = '${A}'`) === 'true', 'fibre hidden');
  const own = coach.locator('form[data-habit]').first();
  await own.locator('[name=name]').fill('Read 10 pages');
  await own.locator('[name=target]').fill('12');
  await own.locator('[type=submit]').click();
  await coach.waitForTimeout(600);
  check(sql(`select name||'/'||target::int from client_habits where user_id = '${A}'`) === 'Read 10 pages/12', 'client habit edited by the coach');
  await coach.fill('#ch-name', 'Sunlight walk');
  await coach.selectOption('#ch-cat', 'Lifestyle');
  await coach.click('#coach-add-habit [type=submit]');
  await coach.waitForTimeout(700);
  check(sql(`select count(*) from client_habits where user_id = '${A}' and name = 'Sunlight walk'`) === '1', 'coach adds a habit for the client');
  await coach.screenshot({ path: `${OUT}/coach-habits.png`, fullPage: true });
  check(coach.errors.length === 0, 'no script errors for the coach', coach.errors);

  // ------------------------------------------------ client, phone
  console.log('Client: habits update, training scroll');
  const client = await session(browser, A, true);
  await go(client, '#habits');
  const list = await client.locator('.habit-list').innerText();
  check(/Morning walk steps/.test(list) && /8,000/.test(list), 'client sees the renamed steps habit and new target', list);
  check(!/Fibre/.test(list), 'client no longer sees the hidden fibre habit');
  check(/Read 10 pages/.test(list) && /Sunlight walk/.test(list), 'client sees the coach’s habit edits');

  await go(client, '#training');
  const input = client.locator('[data-wl-ex="4"] [data-kg]').first();
  await input.scrollIntoViewIfNeeded();
  await input.tap();
  await input.fill('22.5');
  const y = await client.evaluate(() => window.scrollY);
  check(y > 300, 'scrolled down to a later exercise', y);
  await client.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await client.waitForTimeout(1200);
  check(Math.abs((await client.evaluate(() => window.scrollY)) - y) < 5, 'phone waking up does not jump to the top while logging');
  check((await client.locator('[data-wl-ex="4"] [data-kg]').first().inputValue()) === '22.5', 'typed sets are kept');
  await client.evaluate(() => document.activeElement && document.activeElement.blur());
  await client.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await client.waitForTimeout(1200);
  check((await client.locator('[data-wl-ex="4"] [data-kg]').first().inputValue()) === '22.5', 'typed sets are kept after the field loses focus');

  await go(client, '#home');
  await go(client, '#training');
  await client.evaluate(() => window.scrollTo(0, 700));
  await client.waitForTimeout(150);
  const y2 = await client.evaluate(() => window.scrollY);
  await client.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await client.waitForTimeout(1500);
  check(Math.abs((await client.evaluate(() => window.scrollY)) - y2) < 5, 'background refresh keeps the scroll position', [y2, await client.evaluate(() => window.scrollY)]);
  await client.screenshot({ path: `${OUT}/client-training.png` });
  check(client.errors.length === 0, 'no script errors for the client', client.errors);

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
