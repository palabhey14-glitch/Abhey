// Browser tests for lead forms copied from Content > Forms: the Start from
// picker (coach forms and built-in templates), the copy notes, publishing,
// a prospect filling the public link on a phone, the email notice sent to
// the "lead-form-submitted" Netlify form, and the New leads badge.
//   sh setup.sh, apply the prospects migration, sh start.sh, then node lead-from-forms.js
// Expects a coach form named "Onboarding- Dave Lakov" in the scratch database.
'use strict';
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const { jwt } = require('./server.js');

const BASE = 'http://localhost:8830';
const OUT = process.env.E2E_OUT || `${__dirname}/out`;
const COACH = '00000000-0000-0000-0000-00000000000c';
const sql = (q) => execSync(`psql -h ${process.env.PGHOST || '/var/lib/postgresql/rwtest'} -p ${process.env.PGPORT || 5499} -U postgres -d rw -tAq -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
let passed = 0; const failures = [];
const check = (c, what, d) => { if (c) { passed++; console.log(`  ok  ${what}`); } else { failures.push(what); console.log(`  FAIL ${what}${d !== undefined ? ` (${JSON.stringify(d)})` : ''}`); } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  sql('truncate public.prospects, public.prospect_submission_limits, public.prospect_lead_forms cascade');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  const t = jwt({ sub: COACH, role: 'authenticated', email: 'coaching@abheyrewired.com', aud: 'authenticated' });
  const value = JSON.stringify({ access_token: t, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: COACH, email: 'coaching@abheyrewired.com', aud: 'authenticated', role: 'authenticated' } });
  await ctx.addInitScript((v) => localStorage.setItem('sb-localhost-auth-token', v), value);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/app/?coach#prospects/forms`); await page.waitForLoadState('networkidle');
  await page.click('[data-pr-new-form]');
  await page.waitForSelector('dialog [name=source] optgroup', { state: 'attached' });
  const opts = await page.$$eval('dialog [name=source] option', (o) => o.map((x) => x.textContent));
  check(opts.includes('Onboarding- Dave Lakov'), 'Start from lists the coach form', opts);
  check(['Rewired onboarding template', 'Rewired coaching agreement', 'Rewired health screen'].every((n) => opts.includes(n)), 'Start from lists every Forms template', opts);
  const val = await page.$eval('dialog [name=source]', (s) => [...s.options].find((o) => o.textContent === 'Onboarding- Dave Lakov').value);
  await page.selectOption('dialog [name=source]', val);
  check(await page.inputValue('dialog [name=title]') === 'Onboarding- Dave Lakov', 'Form name fills from the chosen form');
  await page.fill('dialog [name=title]', 'Rewired onboarding');
  await page.screenshot({ path: `${OUT}/lead-new-modal.png` });
  await page.click('dialog [type=submit]');
  await page.waitForSelector('.pr-copy-note');
  const qs = await page.$$eval('[data-pr-question]', (c) => c.length);
  check(qs === 13, '9 questions and 4 page breaks copied', qs);
  check((await page.textContent('.pr-copy-note')).includes('follow-up'), 'Copy note explains the show-if change');
  await page.screenshot({ path: `${OUT}/lead-builder.png` });
  await page.click('[data-pr-publish]'); await page.waitForTimeout(600);
  const token = sql("select public_token from public.prospect_lead_forms where title='Rewired onboarding' and accepting");
  check(!!token, 'Published with a link');

  // Health screen template is 31 items: over the old 20 limit.
  await page.goto(`${BASE}/app/?coach#prospects/forms`); await page.waitForLoadState('networkidle');
  await page.click('[data-pr-new-form]'); await page.waitForSelector('dialog [name=source] optgroup', { state: 'attached' });
  await page.selectOption('dialog [name=source]', 'tpl:health'); await page.click('dialog [type=submit]');
  await page.waitForSelector('.pr-copy-note'); await page.click('[data-pr-publish]'); await page.waitForTimeout(600);
  check(sql("select count(*) from public.prospect_lead_forms where title='Rewired health screen' and accepting") === '1', 'Health screen template publishes (31 items)');

  // A prospect on a phone, no login.
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await pc.newPage(); let notice = null;
  pp.on('pageerror', (e) => errors.push(String(e)));
  await pp.route(`${BASE}/`, async (r) => { if (r.request().method() === 'POST') { notice = new URLSearchParams(r.request().postData()); return r.fulfill({ status: 200, body: 'ok' }); } return r.continue(); });
  await pp.goto(`${BASE}/app/#lead/${token}`); await pp.waitForSelector('.pr-public-form');
  await pp.screenshot({ path: `${OUT}/lead-public-1.png`, fullPage: true });
  await pp.fill('[name=first_name]', 'Sam'); await pp.fill('[name=last_name]', 'Prospect'); await pp.fill('[name=email]', 'sam@example.com'); await pp.fill('[name=phone]', '0400 000 000');
  const cur = '[data-pr-lead-page]:not([hidden])';
  const next = async () => { await pp.click(`${cur} [data-pr-page-next]`); await pp.waitForTimeout(150); };
  await next();
  await pp.fill(`${cur} textarea`, 'Lose the belly and look good at my wedding.'); await next();
  await pp.selectOption(`${cur} select`, '1 to 3 years');
  await pp.screenshot({ path: `${OUT}/lead-public-3.png`, fullPage: true });
  await pp.fill(`${cur} textarea`, 'Weights and football');
  await pp.check(`${cur} input[value="Build muscle"]`); await pp.check(`${cur} input[value="Lose body fat"]`);
  await next();
  await pp.selectOption(`${cur} select`, '4'); await pp.check(`${cur} input[value="Gym"]`); await next();
  const nums = await pp.$$(`${cur} input[type=number]`); await nums[0].fill('84'); await nums[1].fill('178');
  await pp.click('[type=submit]'); await pp.waitForSelector('.pr-public-success'); await pp.waitForTimeout(300);
  await pp.screenshot({ path: `${OUT}/lead-public-done.png` });
  check(sql("select count(*) from public.prospects where email='sam@example.com' and stage='new'") === '1', 'Submission saved as a New lead');
  check(notice && notice.get('form-name') === 'lead-form-submitted', 'Email notice posted to the Netlify form');
  const ans = notice ? notice.get('answers') : '';
  check(ans.includes('What would success look like') && ans.includes('Lose the belly') && ans.includes('Lose body fat, Build muscle') && ans.includes('84'), 'Notice carries the answers', ans);
  fs.writeFileSync(`${OUT}/lead-email-preview.txt`, notice ? [...notice].map(([k, v]) => `${k}: ${v}`).join('\n') : '');

  await page.goto(`${BASE}/app/?coach#prospects`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400);
  check(await page.textContent('[data-pr-badge]') === '1' && !(await page.$eval('[data-pr-badge]', (b) => b.hidden)), 'Prospects menu shows 1 new lead');
  await page.screenshot({ path: `${OUT}/lead-prospects-list.png` });
  await page.click('text=Sam Prospect'); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/lead-prospect-detail.png` });
  check(!errors.length, 'No page errors', errors);
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`); process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
