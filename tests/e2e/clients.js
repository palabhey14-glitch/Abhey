// Browser tests for the coach's Clients page: the roster (Active, Invited,
// Inactive, filters), Insights, Add Client (login made by the Netlify
// function, records saved as the coach), the invite message, and what the
// API refuses a client.
//   sh setup.sh && sh start.sh && node clients.js
'use strict';
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { jwt } = require('./server.js');

const BASE = 'http://localhost:8830';
const OUT = process.env.E2E_OUT || `${__dirname}/out`;
const COACH = '00000000-0000-0000-0000-00000000000c';
const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b2';
const EMAIL = { [COACH]: 'coaching@abheyrewired.com', [A]: 'arjun@example.com', [B]: 'bilal@example.com' };
const token = (id) => jwt({ sub: id, role: 'authenticated', email: EMAIL[id], aud: 'authenticated' });
const sql = (q) => execSync(`psql -h ${process.env.PGHOST || '/var/lib/postgresql/rwtest'} -p ${process.env.PGPORT || 5499} -U postgres -d rw -tAq -c "${q.replace(/"/g, '\\"')}"`).toString().trim();

let passed = 0;
const failures = [];
function check(cond, what, detail) {
  if (cond) { passed += 1; console.log(`  ok  ${what}`); } else { failures.push(what); console.log(`  FAIL ${what}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ''}`); }
}

async function session(browser, id, mobile) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const t = token(id);
  const value = JSON.stringify({ access_token: t, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id, email: EMAIL[id], aud: 'authenticated', role: 'authenticated' } });
  await ctx.addInitScript((v) => localStorage.setItem('sb-localhost-auth-token', v), value);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  return page;
}
async function go(page, hash) {
  if (page.url().startsWith(`${BASE}/app/`)) await page.evaluate((h) => (location.hash = h), hash);
  else await page.goto(`${BASE}/app/${hash}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}
async function api(id, method, pathq, body) {
  const r = await fetch(`${BASE}/rest/v1${pathq}`, { method, headers: { apikey: 'x', authorization: `Bearer ${token(id)}`, 'content-type': 'application/json', prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await r.json(); } catch (_) { /* empty */ }
  return { status: r.status, data };
}

(async () => {
  // Clean slate: no extra clients, no records, one published default Health screen form.
  sql("delete from form_assignments; delete from client_admin; delete from auth.users where email like 'new%@example.com'");
  sql("update forms set published_version_id = null where name = 'E2E Health'; delete from form_versions where form_id in (select id from forms where name = 'E2E Health'); delete from forms where name = 'E2E Health'");
  const draft = { sections: [{ id: 's1', title: 'Health', questions: [{ id: 'q1', type: 'number', label: 'Weight (kg)', required: false, min: 30, max: 300 }] }], thanks: { title: 'Thanks', text: 'Done' } };
  const made = await api(COACH, 'POST', '/forms', { name: 'E2E Health', category: 'Health screen', draft: {} });
  const formId = made.data && made.data[0] && made.data[0].id;
  await api(COACH, 'PATCH', `/forms?id=eq.${formId}`, { draft, draft_rev: 1, is_default: true });
  const pub = await api(COACH, 'POST', '/rpc/publish_form', { p_form: formId, p_rev: 1 });
  check(pub.status === 200, 'test form published', pub);
  sql(`insert into client_admin (client_id, tags, payment_amount, payment_schedule) values ('${A}', '{VIP,Recomp}', 750, 'three_payments')`);

  const browser = await chromium.launch();
  const coach = await session(browser, COACH);

  console.log('Clients roster');
  await go(coach, '#clients');
  await coach.waitForSelector('[data-r-table] table');
  check(await coach.locator('.crm-tabs a').allInnerTexts().then((t) => t.join('|')) === 'Clients|Insights', 'two pages: Clients and Insights');
  const names = await coach.locator('[data-r-table] tbody tr b').allInnerTexts();
  check(names.includes('Arjun Mehta') && names.includes('Bilal Khan') && !names.includes('Abhey'), 'active clients listed, not the coach', names);
  const arjunRow = coach.locator('tbody tr:has-text("Arjun Mehta")');
  check(/\$750/.test(await arjunRow.innerText()) && /3 payments|Three/i.test(await arjunRow.innerText()), 'payment shows on the row', await arjunRow.innerText());
  check((await arjunRow.locator('.cl-tag').allInnerTexts()).join(',') === 'VIP,Recomp', 'tags show on the row');
  await coach.fill('[data-r-q]', 'bilal');
  check((await coach.locator('[data-r-table] tbody tr').count()) === 1, 'search narrows the list');
  await coach.fill('[data-r-q]', '');
  await coach.selectOption('select[data-r="tag"]', 'VIP');
  const tagged = await coach.locator('[data-r-table] tbody tr b').allInnerTexts();
  check(tagged.length === 1 && tagged[0] === 'Arjun Mehta', 'tag filter works', tagged);
  await coach.selectOption('select[data-r="tag"]', '');
  await coach.click('[data-r-tab="invited"]');
  check(/Nobody is waiting to sign in/.test(await coach.locator('[data-r-table]').innerText()), 'Invited is empty to start');
  await coach.click('[data-r-tab="active"]');
  await coach.screenshot({ path: `${OUT}/clients-roster.png` });

  console.log('How invitations work');
  await coach.click('[data-how]');
  await coach.waitForSelector('.cl-how-modal');
  check(/creates their login/.test(await coach.locator('.cl-how-modal').innerText()), 'explains the steps');
  await coach.keyboard.press('Escape');
  check(await coach.locator('.cl-how-modal').count() === 0, 'Escape closes it');

  console.log('Add Client');
  await coach.click('[data-add-client]');
  await coach.waitForSelector('.cl-add');
  check(await coach.isDisabled('[data-save]'), 'Save is off until name and email are in');
  check(await coach.locator('#ac-f-hs').inputValue() === formId, 'default Health screen form is picked');
  await coach.screenshot({ path: `${OUT}/clients-add.png` });
  await coach.fill('#ac-first', 'Nina');
  await coach.fill('#ac-last', 'Patel');
  await coach.fill('#ac-email', 'newnina@example.com');
  await coach.fill('#ac-phone', '0412 345 678');
  await coach.fill('#ac-amount', '750');
  await coach.selectOption('#ac-sched', 'three_payments');
  await coach.selectOption('#ac-day', '3');
  await coach.fill('#ac-tag', 'Recomp');
  await coach.keyboard.press('Enter');
  await coach.fill('#ac-tag', 'recomp');
  await coach.keyboard.press('Enter');
  await coach.fill('#ac-tag', 'Halal');
  await coach.keyboard.press('Enter');
  check((await coach.locator('.cl-tagchips .cl-tag').count()) === 2, 'tags de-duplicate ignoring case');
  await coach.fill('#ac-notes', 'Shift worker, trains at night.');
  check((await coach.locator('[data-count]').innerText()) === '30/2000', 'notes counter counts');
  await coach.click('[data-save]');
  await coach.waitForSelector('.cl-invite, .cl-add .fm-err:not(:empty)', { timeout: 10000 });
  if (await coach.locator('.cl-add .fm-err:not(:empty)').count()) console.log('   save error:', await coach.locator('.cl-add .fm-err').innerText());
  const id = sql("select id from auth.users where email = 'newnina@example.com'");
  check(!!id, 'the login is created in Supabase');
  check(sql(`select full_name || '|' || coalesce(phone,'') || '|' || role from profiles where id = '${id}'`) === 'Nina Patel|+61 412 345 678|client', 'profile has name, phone and client role');
  check(sql(`select array_to_string(tags, ',') || '|' || payment_amount || '|' || payment_schedule || '|' || status || '|' || (invited_at is not null) from client_admin where client_id = '${id}'`) === 'Recomp,Halal|750.00|three_payments|active|true', 'records saved (tags, payment, invited)');
  check(sql(`select notes from client_admin where client_id = '${id}'`) === 'Shift worker, trains at night.', 'notes saved');
  check(sql(`select checkin_day from targets where client_id = '${id}'`) === '3', 'check-in day saved');
  check(sql(`select count(*) from form_assignments where client_id = '${id}' and form_id = '${formId}'`) === '1', 'the Health screen form is waiting for them');
  const invite = await coach.locator('.cl-invite').inputValue();
  check(/Hi Nina/.test(invite) && /newnina@example\.com/.test(invite) && /\/app\//.test(invite), 'invite message names them, the email and the app link');
  const wa = await coach.locator('.cl-inv-foot a').getAttribute('href');
  check(/^https:\/\/wa\.me\/61412345678\?text=/.test(wa || ''), 'Open in WhatsApp goes to their number', wa);
  await coach.screenshot({ path: `${OUT}/clients-invite.png` });
  await coach.keyboard.press('Escape');
  await coach.waitForSelector('[data-r-table] table');
  check(await coach.locator('[data-r-tab="invited"]').getAttribute('aria-selected') === 'true', 'list switches to Invited');
  check(/Nina Patel/.test(await coach.locator('[data-r-table]').innerText()), 'Nina is under Invited');

  console.log('Add the same email again');
  await coach.click('[data-add-client]');
  await coach.waitForSelector('.cl-add');
  await coach.fill('#ac-first', 'Nina');
  await coach.fill('#ac-email', 'NewNina@example.com');
  await coach.click('[data-save]');
  await coach.waitForFunction(() => /already has a login/.test(document.querySelector('.cl-add .fm-err').textContent));
  check(true, 'a second login for the same email is refused with a clear message');
  check(sql("select count(*) from auth.users where lower(email) = 'newnina@example.com'") === '1', 'still one login');
  await coach.keyboard.press('Escape');

  console.log('Make inactive');
  await coach.click('[data-r-tab="active"]');
  coach.once('dialog', (d) => d.accept());
  await coach.click('tbody tr:has-text("Bilal Khan") [data-status]');
  await coach.waitForTimeout(600);
  await coach.waitForSelector('[data-r-table] table');
  check(sql(`select status || '|' || (inactive_at is not null) from client_admin where client_id = '${B}'`) === 'inactive|true', 'Bilal is inactive with a date');
  await coach.click('[data-r-tab="inactive"]');
  check(/Bilal Khan/.test(await coach.locator('[data-r-table]').innerText()), 'Bilal is listed under Inactive');
  check(!/Bilal Khan/.test(await coach.locator('[data-r-tab="active"]').innerText()), 'and not counted as active');

  console.log('Insights');
  await coach.click('.crm-tabs a[href="#clients/insights"]');
  await coach.waitForSelector('.cl-six');
  check((await coach.locator('.cl-six .ci-stat').count()) === 6, 'six stat cards');
  check(/Active clients\s*1\b/i.test(await coach.locator('.cl-six').innerText()), 'one active client (Arjun)', await coach.locator('.cl-six').innerText());
  check(await coach.locator('.cl-bars .cl-bar').count() === 6, 'six months of joined and left');
  check(/Clients at risk of leaving/.test(await coach.locator('main, body').first().innerText()), 'at-risk table is there');
  await coach.screenshot({ path: `${OUT}/clients-insights.png`, fullPage: true });

  console.log('Phone width');
  const phone = await session(browser, COACH, true);
  await go(phone, '#clients');
  await phone.waitForSelector('[data-r-table] table');
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, 'no sideways scroll on a phone', overflow);
  await phone.screenshot({ path: `${OUT}/clients-phone.png` });
  await phone.click('[data-add-client]');
  await phone.waitForSelector('.cl-add');
  await phone.screenshot({ path: `${OUT}/clients-add-phone.png` });

  console.log('What the API refuses');
  const peek = await api(A, 'GET', '/client_admin?select=*');
  check(peek.status === 200 && Array.isArray(peek.data) && peek.data.length === 0, 'a client reads none of the coach records', peek);
  const write = await api(A, 'POST', '/client_admin', { client_id: A, notes: 'hi' });
  check(write.status >= 400, 'a client cannot write coach records', write.status);
  const fn = await fetch(`${BASE}/.netlify/functions/add-client`, { method: 'POST', headers: { authorization: `Bearer ${token(A)}`, 'content-type': 'application/json' }, body: JSON.stringify({ first_name: 'X', email: 'newx@example.com' }) });
  check(fn.status === 403, 'a client cannot add clients', fn.status);
  check(sql("select count(*) from auth.users where email = 'newx@example.com'") === '0', 'and no login was made');

  check(coach.errors.length === 0 && phone.errors.length === 0, 'no script errors', [...coach.errors, ...phone.errors]);
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
