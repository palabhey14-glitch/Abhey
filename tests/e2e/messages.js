// Browser tests for Messages: the coach's inbox, a client's own
// conversation, read receipts, unread badges, and what the API refuses.
//   sh setup.sh && sh start.sh && node messages.js
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
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  const t = token(id);
  const value = JSON.stringify({ access_token: t, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id, email: EMAIL[id], aud: 'authenticated', role: 'authenticated' } });
  await ctx.addInitScript((v) => localStorage.setItem('sb-localhost-auth-token', v), value);
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
  sql('delete from messages');
  const browser = await chromium.launch();

  console.log('Coach: Messages in the menu, empty state');
  const coach = await session(browser, COACH);
  await go(coach, '#clients');
  check(await coach.locator('.crm-rail a[href="#messages"]').count() === 1, 'Messages is in the Workspace menu');
  await coach.click('.crm-rail a[href="#messages"]');
  await coach.waitForSelector('.msg-people');
  const people = await coach.locator('.msg-person b').allInnerTexts();
  check(people.includes('Arjun Mehta') && people.includes('Bilal Khan') && !people.includes('Abhey'), 'every client is listed, not the coach', people);
  check(/Pick a client/.test(await coach.locator('.msg-pane').innerText()), 'asks to pick a client');

  console.log('Coach: write to Arjun');
  await coach.click('.msg-person:has-text("Arjun")');
  await coach.waitForSelector('.msg-compose textarea');
  check(/Start the conversation with Arjun/.test(await coach.locator('.msg-list').innerText()), 'empty conversation says who can see it');
  check(await coach.isDisabled('.msg-send'), 'Send is off with nothing typed');
  await coach.fill('.msg-compose textarea', 'Hey Arjun, how did legs go?');
  await coach.keyboard.press('Enter');
  await coach.waitForFunction(() => document.querySelectorAll('.msg.mine').length === 1 && !/Sending/.test(document.querySelector('.msg.mine').textContent));
  check(sql(`select count(*) from messages where client_id = '${A}' and sender_id = '${COACH}'`) === '1', 'Enter sends it, saved as from the coach');
  await coach.screenshot({ path: `${OUT}/msg-coach.png` });

  console.log('Client: unread badge, read, reply');
  const arjun = await session(browser, A, true);
  await go(arjun, '#home');
  check(await arjun.locator('.tabs a[href="#messages"]').count() === 1, 'Messages tab on the client app');
  await arjun.waitForFunction(() => { const b = document.querySelector('.tabs [data-msg-badge]'); return b && !b.hidden; });
  check((await arjun.locator('.tabs [data-msg-badge]').innerText()) === '1', 'unread badge shows 1');
  await arjun.click('.tabs a[href="#messages"]');
  await arjun.waitForSelector('.msg.theirs');
  check(/how did legs go/.test(await arjun.locator('.msg.theirs').innerText()), 'Arjun sees the coach message');
  await arjun.waitForFunction(() => document.querySelector('.tabs [data-msg-badge]').hidden);
  check(sql(`select read_at is not null from messages where client_id = '${A}'`) === 't', 'opening it marks it read');
  await arjun.fill('.msg-compose textarea', 'Smashed it 💪\nKnee felt fine.');
  await arjun.click('.msg-send');
  await arjun.waitForFunction(() => document.querySelectorAll('.msg.mine').length === 1 && !/Sending/.test(document.querySelector('.msg.mine').textContent));
  check(sql(`select body from messages where sender_id = '${A}'`) === 'Smashed it 💪\nKnee felt fine.', 'reply saved with its line break');
  await arjun.screenshot({ path: `${OUT}/msg-client.png`, fullPage: false });

  console.log('Coach: live update and Seen');
  await coach.waitForSelector('.msg.theirs', { timeout: 15000 });
  check(/Smashed it/.test(await coach.locator('.msg.theirs').innerText()), 'the reply appears in the coach’s open conversation');
  check(/Seen/.test(await coach.locator('.msg.mine').innerText()), 'the coach sees Seen on their message');
  await go(coach, '#messages');
  check(/You: |Smashed/.test(await coach.locator('.msg-person:has-text("Arjun")').innerText()), 'the list shows the latest message');

  console.log('API: what each person may not do');
  const bRead = await api(B, 'GET', `/messages?client_id=eq.${A}`);
  check(bRead.status === 200 && bRead.data.length === 0, 'Bilal cannot read Arjun’s conversation', bRead);
  const bWrite = await api(B, 'POST', '/messages', { client_id: A, body: 'hi' });
  check(bWrite.status >= 400, 'Bilal cannot write into Arjun’s conversation', bWrite.status);
  const fake = await api(A, 'POST', '/messages', { client_id: A, body: 'fake', sender_id: COACH });
  check(fake.status >= 400, 'a client cannot send as the coach', fake.status);
  const edit = await api(A, 'PATCH', `/messages?client_id=eq.${A}`, { body: 'edited' });
  check(edit.status >= 400 || (Array.isArray(edit.data) && !edit.data.length), 'messages cannot be edited', edit.status);

  check(!coach.errors.length && !arjun.errors.length, 'no script errors', coach.errors.concat(arjun.errors));
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(` - ${f}`));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
