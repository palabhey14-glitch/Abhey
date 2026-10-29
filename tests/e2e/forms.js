// Browser tests for Forms: the coach's library, New Form, the builder, the
// live preview, publishing, sending, the client's form (save, resume,
// submit) and the coach's review, plus direct API calls that must be refused.
//   sh setup.sh && sh start.sh && node forms.js
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
  page.on('dialog', (d) => d.accept());
  return page;
}

async function go(page, hash) {
  if (page.url().startsWith(`${BASE}/app/`)) await page.evaluate((h) => (location.hash = h), hash);
  else await page.goto(`${BASE}/app/${hash}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}

async function api(id, method, pathq, body) {
  const r = await fetch(`${BASE}/rest/v1${pathq}`, {
    method,
    headers: { apikey: 'x', authorization: `Bearer ${token(id)}`, 'content-type': 'application/json', prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (_) { /* empty */ }
  return { status: r.status, data };
}

const settle = (page) => page.waitForFunction(() => /Saved/.test((document.querySelector('.fb-save') || {}).textContent || ''), null, { timeout: 8000 });
const draftOf = (id) => JSON.parse(sql(`select draft from forms where id = '${id}'`));

(async () => {
  sql('update forms set published_version_id = null');
  sql('delete from form_responses; delete from form_assignments; delete from form_versions; delete from forms');
  const browser = await chromium.launch();

  // ------------------------------------------------ library and New Form
  console.log('Coach: Forms in the menu, empty library, New Form');
  const coach = await session(browser, COACH);
  await go(coach, '#clients');
  const rail = await coach.locator('.crm-rail').innerText();
  check(/Forms/.test(rail), 'Forms is in the coach menu');
  await coach.click('.crm-rail a[href="#forms"]');
  await coach.waitForSelector('.fl-empty');
  check(await coach.locator('.crm-rail a[href="#forms"]').getAttribute('aria-current') === 'page', 'Forms is highlighted');
  check(/No forms yet/.test(await coach.locator('.fl-empty').innerText()), 'empty state leads to the first form');
  await coach.screenshot({ path: `${OUT}/forms-1-empty.png` });

  await coach.click('.fl-empty [data-new]');
  const modal = coach.locator('.fm');
  check(await modal.isVisible(), 'New Form opens');
  check((await coach.locator('#fm-h').innerText()).toUpperCase() === 'NEW FORM', 'heading reads NEW FORM');
  check(await coach.evaluate(() => document.activeElement.id) === 'fm-name', 'focus starts in the name field');
  check(await coach.getAttribute('#fm-name', 'placeholder') === 'Name this form', 'name placeholder');
  const cats = await coach.$$eval('#fm-cat option', (o) => o.map((x) => x.textContent));
  check(JSON.stringify(cats) === JSON.stringify(['Onboarding', 'Health screen', 'Contract', 'Feedback', 'Other']), 'exactly the five categories', cats);
  check(await coach.inputValue('#fm-cat') === 'Onboarding', 'defaults to Onboarding');
  check(await coach.isDisabled('[data-create]'), 'Create Form is disabled without a name');
  check(/4 sections · 9 questions/.test(await coach.locator('[data-start="onboarding"]').innerText()), 'template card shows its real counts');
  check(await coach.getAttribute('[data-start="blank"]', 'aria-checked') === 'true', 'Blank is selected first');
  await coach.click('[data-start="onboarding"]');
  check(await coach.getAttribute('[data-start="onboarding"]', 'aria-checked') === 'true' && await coach.getAttribute('[data-start="blank"]', 'aria-checked') === 'false', 'only one start option at a time');
  await coach.selectOption('#fm-cat', 'Contract');
  check(await coach.locator('[data-start="onboarding"]').count() === 0, 'changing category drops a template that no longer fits');
  check(await coach.getAttribute('[data-start="blank"]', 'aria-checked') === 'true', 'and goes back to Blank');
  check(await coach.locator('[data-start="contract"]').count() === 1, 'Contract offers the coaching agreement template');
  await coach.selectOption('#fm-cat', 'Health screen');
  check(/6 sections/.test(await coach.locator('[data-start="health"]').innerText()), 'Health screen offers its template');
  await coach.selectOption('#fm-cat', 'Feedback');
  check(/No feedback templates yet/.test(await coach.locator('.fm-starts').innerText()), 'honest empty template slot');
  await coach.selectOption('#fm-cat', 'Onboarding');
  await coach.click('[data-start="onboarding"]');
  await coach.fill('#fm-name', 'Onboarding');
  const tagInput = coach.locator('.fm-tags input');
  await tagInput.fill('new');
  await tagInput.press('Enter');
  await coach.locator('.fm-tags input').fill('NEW');
  await coach.locator('.fm-tags input').press('Enter');
  await coach.locator('.fm-tags input').fill('VIP');
  await coach.locator('.fm-tags input').press('Enter');
  check(await coach.locator('.ftp-chip').count() === 2, 'tags: new and VIP, no duplicate NEW', await coach.locator('.ftp-chip').allInnerTexts());
  await coach.fill('#fm-desc', 'Five minutes before your kickoff call');
  check(await coach.locator('.fm-count').innerText() === '37/200', 'live character count');
  check(/clients see this under the form name/.test(await coach.locator('.fm-help').innerText()), 'description helper text');
  await coach.screenshot({ path: `${OUT}/forms-2-new-form.png` });
  // A failed create keeps what was typed.
  await coach.route('**/rest/v1/forms*', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
  await coach.click('[data-create]');
  await coach.waitForFunction(() => document.querySelector('.fm-err').textContent.length > 0);
  check(await coach.inputValue('#fm-name') === 'Onboarding' && await coach.locator('.ftp-chip').count() === 2, 'a failed create keeps the entered values');
  await coach.unroute('**/rest/v1/forms*');
  await coach.dblclick('[data-create]');
  await coach.waitForSelector('.fb-top');
  await coach.waitForTimeout(400);
  check(Number(sql("select count(*) from forms where name = 'Onboarding'")) === 1, 'double-click creates one form');
  const formId = sql("select id from forms where name = 'Onboarding'");
  check(coach.url().endsWith(`#forms/${formId}`), 'the builder opens straight away');
  const d0 = draftOf(formId);
  check(d0.sections.length === 4 && d0.sections.reduce((n, s) => n + s.questions.length, 0) === 9, 'template copy has 4 sections and 9 questions');
  check(sql(`select tags from forms where id = '${formId}'`) === '{new,VIP}', 'tags saved');
  const outline = await coach.locator('.fb-outline').innerText();
  check(/Welcome screen/.test(outline) && /Your goals/.test(outline) && /Training history/.test(outline) && /Availability/.test(outline) && /Measurements/.test(outline) && /Thank-you screen/.test(outline), 'outline: welcome, 4 sections, thank-you');
  check(/Ready to publish/.test(await coach.locator('.fb-health').innerText()), 'template is ready to publish');
  await coach.screenshot({ path: `${OUT}/forms-3-builder.png` });

  // A second copy of the template is independent.
  await go(coach, '#forms');
  await coach.click('.fl-top [data-new]');
  await coach.fill('#fm-name', 'Second onboarding');
  await coach.click('[data-start="onboarding"]');
  await coach.click('[data-create]');
  await coach.waitForSelector('.fb-top');
  const form2 = sql("select id from forms where name = 'Second onboarding'");
  await coach.click('.fb-q-head >> nth=0');
  await coach.fill('#lbl-' + draftOf(form2).sections[0].questions[0].id, 'Changed in the copy');
  await settle(coach);
  check(draftOf(formId).sections[0].questions[0].label === 'What are your main goals?', 'editing one copy leaves the other alone');
  check(draftOf(form2).sections[0].questions[0].id !== d0.sections[0].questions[0].id, 'copies have their own ids');

  // Blank form: welcome, one empty section, thank-you, and publishing refused.
  await go(coach, '#forms');
  await coach.click('.fl-top [data-new]');
  await coach.fill('#fm-name', 'Quick feedback');
  await coach.selectOption('#fm-cat', 'Feedback');
  await coach.click('[data-create]');
  await coach.waitForSelector('.fb-top');
  const blankId = sql("select id from forms where name = 'Quick feedback'");
  const bd = draftOf(blankId);
  check(bd.welcome.enabled && bd.sections.length === 1 && bd.sections[0].questions.length === 0 && bd.thanks.title, 'blank form: welcome, one empty section, thank-you');
  await coach.click('[data-act="publish"]');
  await coach.waitForTimeout(400);
  check(/to fix/.test(await coach.locator('.fb-health').innerText()), 'publishing a blank form is refused');
  check(/has no questions/.test(await coach.locator('.fb-health').innerText()), 'and says which section is empty');
  check(sql(`select count(*) from form_versions where form_id = '${blankId}'`) === '0', 'no version was made');

  // ------------------------------------------------ builder edits persist
  console.log('Coach: builder edits');
  await coach.click(".fb-types [data-type=\"yesno\"]");
  check(/1 selected · Yes \/ No/.test(await coach.locator('.fb-pick-row').innerText()), 'picking a type only selects it');
  check(sql(`select jsonb_array_length(draft->'sections'->0->'questions') from forms where id = '${blankId}'`) === '0', 'nothing added until Add Question');
  await coach.click('[data-act="add-picked"]');
  const qYes = draftOf(blankId).sections[0].questions[0] || {};
  await coach.waitForSelector(`#lbl-${qYes.id || 'none'}`).catch(() => {});
  await coach.fill(`#lbl-${(await coach.evaluate(() => document.activeElement.id)).replace('lbl-', '')}`, 'Did you enjoy this week?');
  await coach.click('[data-act="add-q-menu"]');
  await coach.click('.fb-addmenu [data-type="single"]');
  let lbl = await coach.evaluate(() => document.activeElement.id);
  await coach.fill(`#${lbl}`, 'Best session?');
  const singleId = lbl.replace('lbl-', '');
  await coach.click(`[data-act="add-opt"][data-qid="${singleId}"]`);
  await coach.keyboard.type('Legs');
  await coach.click(`[data-act="paste-opts"][data-qid="${singleId}"]`);
  await coach.fill(`[data-paste="${singleId}"] textarea`, '- Push\n- Pull\nLegs');
  await coach.click(`[data-act="paste-add"][data-qid="${singleId}"]`);
  await settle(coach);
  let d = draftOf(blankId);
  let q = d.sections[0].questions[1];
  check(q.options.map((o) => o.label).join(',') === 'Option 1,Option 2,Legs,Push,Pull', 'options added and pasted, no repeats', q.options.map((o) => o.label));
  // Reorder an option with the keyboard.
  await coach.focus(`[data-act="grip-opt"][data-oid="${q.options[4].id}"]`);
  await coach.keyboard.press('ArrowUp');
  await settle(coach);
  check(draftOf(blankId).sections[0].questions[1].options[3].label === 'Pull', 'arrow keys reorder options');
  // Duplicate, move, delete with undo.
  await coach.click(`[data-act="dup-q"][data-qid="${singleId}"]`);
  await settle(coach);
  d = draftOf(blankId);
  check(d.sections[0].questions.length === 3 && d.sections[0].questions[2].label === 'Best session?' && d.sections[0].questions[2].id !== singleId, 'duplicate makes a new question with its own id');
  const dupId = d.sections[0].questions[2].id;
  await coach.click(`[data-act="up-q"][data-qid="${dupId}"]`);
  await settle(coach);
  check(draftOf(blankId).sections[0].questions[1].id === dupId, 'move up');
  await coach.click(`[data-act="del-q"][data-qid="${dupId}"]`);
  await settle(coach);
  check(draftOf(blankId).sections[0].questions.length === 2, 'delete');
  await coach.click('.f-toast button:has-text("Undo")');
  await settle(coach);
  check(draftOf(blankId).sections[0].questions.some((x) => x.id === dupId), 'undo brings it back');
  // New section, rename, move a question into it.
  await coach.click('.fb-outline [data-act="add-section"]');
  await coach.keyboard.type('Next week');
  await settle(coach);
  d = draftOf(blankId);
  check(d.sections.length === 2 && d.sections[1].title === 'Next week', 'add and rename a section');
  await coach.click(`.fb-o [data-sid="${d.sections[0].id}"]`);
  await coach.click(`.fb-q-head[data-qid="${dupId}"]`);
  await coach.selectOption(`[data-act-change="move-to"][data-qid="${dupId}"]`, d.sections[1].id);
  await settle(coach);
  d = draftOf(blankId);
  check(d.sections[1].questions.map((x) => x.id).join() === dupId && d.sections[0].questions.length === 2, 'move a question to another section');
  // Welcome and thank-you are editable.
  await coach.click('[data-act="select-welcome"]');
  await coach.fill('[data-bind="w:title"]', 'Weekly feedback');
  await coach.fill('[data-bind="w:button"]', 'Let’s go');
  await coach.click('[data-act="select-thanks"]');
  await coach.fill('[data-bind="t:title"]', 'Cheers');
  await settle(coach);
  d = draftOf(blankId);
  check(d.welcome.title === 'Weekly feedback' && d.welcome.button === 'Let’s go' && d.thanks.title === 'Cheers', 'welcome and thank-you edits saved');
  check(/Ready to publish/.test(await coach.locator('.fb-health').innerText()), 'now ready to publish');
  // A failed save is shown and recovers.
  await coach.route('**/rest/v1/forms*', (r) => (r.request().method() === 'PATCH' ? r.abort() : r.continue()));
  await coach.fill('[data-bind="t:text"]', 'Thanks for the update.');
  await coach.waitForSelector('.fb-save.bad', { timeout: 6000 });
  check(/Unable to save/.test(await coach.locator('.fb-top').innerText()), 'save failure is shown');
  await coach.unroute('**/rest/v1/forms*');
  await coach.click('[data-act="retry-save"]');
  await settle(coach);
  check(draftOf(blankId).thanks.text === 'Thanks for the update.', 'retry saves the change');

  // ------------------------------------------------ live preview
  console.log('Coach: live preview');
  await go(coach, `#forms/${formId}`);
  const writes = [];
  coach.on('request', (r) => { if (/rpc\/(save_form|submit_form|assign_form)|form_responses|form_assignments/.test(r.url()) && r.method() !== 'GET') writes.push(r.url()); });
  await coach.click('.fb-top [data-act="preview"]');
  await coach.waitForSelector('.fb-pv .fr');
  check(await coach.locator('.fb-pv.phone .fb-phone').isVisible(), 'preview opens in Phone');
  check(/Preview · answers here are never saved or sent/.test(await coach.locator('.fb-pv .fr-save').innerText()), 'preview says nothing is saved');
  await coach.click('.fb-pv [data-next]');
  check(/Your goals · Question 1 of 2/i.test(await coach.locator('.fb-pv .fr-k').innerText()), 'first question with its progress');
  check(/What are your main goals\?/.test(await coach.locator('.fb-pv .fr-q').innerText()), 'first question matches the template');
  check(await coach.locator('.fb-pv .fr-opt').count() === 6, 'six choices including Other');
  await coach.click('.fb-pv [data-next]');
  check(/required/.test(await coach.locator('.fb-pv .fr-err').innerText()), 'required question blocks Continue');
  await coach.screenshot({ path: `${OUT}/forms-4-preview-phone.png` });
  await coach.click('.fb-pv .fr-opt:has-text("Build muscle")');
  await coach.click('.fb-pv [data-next]');
  check(await coach.waitForFunction(() => /Question 2 of 2/.test((document.querySelector('.fb-pv .fr-k') || {}).textContent || ''), null, { timeout: 3000 }).then(() => true, () => false), 'Continue moves on');
  await coach.click('.fb-pv [data-prev]');
  check(await coach.locator('.fb-pv .fr-opt:has-text("Build muscle") input').isChecked(), 'Back keeps the answer');
  await coach.click('.fb-pv [data-device="desktop"]');
  check(await coach.locator('.fb-pv.desktop .fr-desktop').isVisible(), 'Desktop mode');
  check(await coach.locator('.fb-pv .fr-opt:has-text("Build muscle") input').isChecked(), 'switching size keeps progress and answers');
  check(/press Enter/.test(await coach.locator('.fb-pv .fr-actions').innerText()), 'desktop shows the Enter hint');
  await coach.screenshot({ path: `${OUT}/forms-5-preview-desktop.png` });
  // Draft edits show straight away, before they're saved.
  await coach.click('.fb-pv [data-device="phone"]');
  const q1id = d0.sections[0].questions[0].id;
  await coach.click(`.fb-q-head[data-qid="${q1id}"]`);
  await coach.fill(`#lbl-${q1id}`, 'What are your main goals right now?');
  await coach.waitForTimeout(250);
  check(/right now/.test(await coach.locator('.fb-pv .fr-q').innerText()), 'preview shows the unsaved edit immediately');
  check(await coach.locator('.fb-pv .fr-opt:has-text("Build muscle") input').isChecked(), 'and keeps the answer');
  await coach.fill(`#lbl-${q1id}`, 'What are your main goals?');
  // Jump with the section picker.
  await coach.click('.fb-pv [data-act="pv-menu"]');
  const picks = await coach.locator('.fb-pv-list li').allInnerTexts();
  check(picks.join('|') === 'Welcome screen|Your goals|Training history|Availability|Measurements|Thank-you screen', 'picker lists welcome, sections, thank-you', picks);
  await coach.click('.fb-pv-list li:has-text("Measurements")');
  check(/Measurements · Question 1 of 2/i.test(await coach.locator('.fb-pv .fr-k').innerText()), 'jump to a section');
  check(await coach.locator('.fb-pv-list li[aria-selected="true"]').innerText() === 'Measurements', 'picker marks the current section');
  await coach.click('.fb-pv [data-next]');
  await coach.click('.fb-pv [data-next]');
  check(/Answer the required questions|required/.test(await coach.locator('.fb-pv .fr-err').innerText()) || /Question/.test(await coach.locator('.fb-pv .fr-k').innerText()), 'Submit in preview checks earlier required answers');
  check(writes.length === 0, 'preview made no assignment, save or submit calls', writes);
  await coach.click('.fb-pv [aria-label="Close preview"]');
  check(await coach.locator('.fb-pv').count() === 0, 'preview closes back to editing');
  await settle(coach);
  check(Number(sql('select count(*) from form_responses')) === 0 && Number(sql('select count(*) from form_assignments')) === 0, 'nothing was written by the preview');

  // ------------------------------------------------ publish and send
  console.log('Coach: publish and send');
  await coach.click('[data-act="publish"]');
  await coach.waitForFunction(() => /Ready/.test(document.querySelector('.fb-status').textContent));
  check(sql(`select count(*) from form_versions where form_id = '${formId}'`) === '1', 'publish makes version 1');
  await coach.click('.fb-top [data-act="send"]');
  await coach.waitForSelector('.fs-search input');
  await coach.focus('.fs-search input');
  await coach.waitForSelector('.fs-opt');
  const names = await coach.locator('.fs-opt b').allInnerTexts();
  check(names.includes('Arjun Mehta') && names.includes('Bilal Khan') && !names.includes('Abhey'), 'only clients are listed', names);
  check(await coach.locator('.fs input[type=checkbox]').count() === 0, 'no tick boxes in the send window');
  await coach.fill('.fs-search input', 'arj');
  check((await coach.locator('.fs-opt b').allInnerTexts()).join() === 'Arjun Mehta', 'search narrows the clients');
  await coach.keyboard.press('Enter');
  check(/Arjun Mehta/.test(await coach.locator('.fs-chips').innerText()), 'Enter adds the client as a chip');
  check(/Send to 1 client/.test(await coach.locator('[data-send]').innerText()), 'the button counts them');
  await coach.click('[data-send]');
  await coach.waitForSelector('.fs', { state: 'detached' });
  check(sql(`select count(*) from form_assignments where client_id = '${A}' and form_id = '${formId}'`) === '1', 'sent to Arjun');
  await coach.click('.fb-top [data-act="send"]');
  await coach.waitForSelector('.fs-search input');
  await coach.focus('.fs-search input');
  await coach.waitForSelector('.fs-opt');
  check(await coach.locator('.fs-opt.off:has-text("Arjun")').count() === 1, 'Arjun can’t be sent a second open copy');
  check(/Already has it/.test(await coach.locator('.fs-opt:has-text("Arjun")').innerText()), 'and the list says why');
  await coach.locator('.fs-opt:has-text("Arjun")').dispatchEvent('click');
  check(await coach.locator('.fs-chip').count() === 0, 'clicking him adds nothing');
  await coach.keyboard.press('Escape');
  check(await coach.locator('.fs-results').isHidden(), 'Escape closes the client list first');
  await coach.keyboard.press('Escape');
  await coach.waitForSelector('.fs', { state: 'detached' });
  // Edit after sending, then publish version 2.
  await coach.click(`.fb-q-head[data-qid="${q1id}"]`).catch(() => {});
  await coach.fill(`#lbl-${q1id}`, 'What are your goals now?');
  await settle(coach);
  check(/Unpublished changes/.test(await coach.locator('.fb-status').innerText()), 'edits after publishing are flagged');
  await coach.click('[data-act="publish"]');
  await coach.waitForFunction(() => /Ready/.test(document.querySelector('.fb-status').textContent));
  check(sql(`select count(*) from form_versions where form_id = '${formId}'`) === '2', 'version 2 published');
  check(sql(`select v.version from form_assignments a join form_versions v on v.id = a.version_id where a.client_id = '${A}'`) === '1', 'Arjun keeps version 1');

  // ------------------------------------------------ client fills it in
  console.log('Client: Home, save, resume, submit');
  const arjun = await session(browser, A, true);
  await go(arjun, '#home');
  await arjun.waitForSelector('.cf-home');
  check(/Onboarding/.test(await arjun.locator('.cf-home').innerText()) && /Not started/.test(await arjun.locator('.cf-home').innerText()), 'Home shows the form as Not started');
  await arjun.screenshot({ path: `${OUT}/forms-6-client-home.png`, fullPage: false });
  await arjun.click('.cf-home .cf-row');
  await arjun.waitForSelector('.fr-client');
  check(/Welcome to Rewired/.test(await arjun.locator('.fr-card').innerText()), 'welcome screen first');
  check(/Your answers save as you go/.test(await arjun.locator('.fr-save').innerText()), 'tells the client answers save');
  await arjun.click('[data-next]');
  check(/What are your main goals\?/.test(await arjun.locator('.fr-q').innerText()), 'client sees version 1 wording');
  await arjun.screenshot({ path: `${OUT}/forms-7-client-question.png` });
  await arjun.click('.fr-opt:has-text("Other")');
  await arjun.click('[data-next]');
  check(/Other box/.test(await arjun.locator('.fr-err').innerText()), 'Other needs its text');
  await arjun.fill('[data-other]', 'Sleep better');
  await arjun.click('.fr-opt:has-text("Lose body fat")');
  await arjun.click('[data-next]');
  await arjun.fill('textarea.fr-text', 'Visible abs and more energy at work');
  await arjun.waitForFunction(() => /Saved/.test(document.querySelector('.fr-save').textContent), null, { timeout: 6000 });
  check(sql(`select status from form_assignments where client_id = '${A}'`) === 'in_progress', 'now In progress');
  const saved = JSON.parse(sql(`select answers from form_responses where client_id = '${A}'`));
  check(/abs/.test(Object.values(saved).join(' ')) && Object.values(saved).some((v) => v === 'Sleep better'), 'answers saved to the database');
  // Save failure shows and retries.
  await arjun.route('**/rest/v1/rpc/save_form_answers', (r) => r.abort());
  await arjun.fill('textarea.fr-text', 'Visible abs, more energy at work');
  await arjun.waitForSelector('.fr-save.bad', { timeout: 6000 });
  check(/Couldn’t save/.test(await arjun.locator('.fr-save').innerText()), 'save failure is shown with Retry');
  await arjun.unroute('**/rest/v1/rpc/save_form_answers');
  await arjun.click('[data-retry-save]');
  await arjun.waitForFunction(() => /Saved/.test(document.querySelector('.fr-save').textContent), null, { timeout: 6000 });
  check(/more energy/.test(sql(`select answers::text from form_responses where client_id = '${A}'`)), 'retry saves it');
  // Leave and come back.
  await arjun.click('.fr-close');
  await arjun.waitForSelector('.cf-home');
  check(/In progress/.test(await arjun.locator('.cf-home').innerText()), 'Home shows In progress');
  await arjun.reload();
  await arjun.waitForLoadState('networkidle');
  await arjun.click('.cf-home .cf-row');
  await arjun.waitForSelector('.fr-client');
  check(/How long have you been training/.test(await arjun.locator('.fr-q').innerText()), 'resumes at the first unanswered question');
  await arjun.click('[data-prev]');
  check(await arjun.inputValue('textarea.fr-text') === 'Visible abs, more energy at work', 'earlier answers are kept');
  await arjun.click('[data-next]');
  // Enter continues from a single-line field but not from a long answer.
  await arjun.click('.fr-opt:has-text("1 to 3 years")');
  await arjun.click('[data-next]');
  await arjun.click('.fr-pick:has-text("4")');
  await arjun.click('[data-next]');
  await arjun.fill('textarea.fr-text', 'Football');
  await arjun.press('textarea.fr-text', 'Enter');
  check(/enjoy most/.test(await arjun.locator('.fr-q').innerText()), 'Enter in a long answer doesn’t jump ahead');
  await arjun.click('[data-next]');
  await arjun.click('.fr-opt:has-text("4")');
  await arjun.click('[data-next]');
  await arjun.click('.fr-opt:has-text("Hotel gym")');
  await arjun.click('[data-next]');
  await arjun.fill('input.fr-text', '82.5');
  await arjun.press('input.fr-text', 'Enter');
  check(/Height/.test(await arjun.locator('.fr-q').innerText()), 'Enter continues from a number field');
  // Height left blank (optional). Double tap Submit.
  const submits = [];
  arjun.on('request', (r) => { if (/submit_form_assignment/.test(r.url())) submits.push(1); });
  await arjun.dblclick('[data-next]');
  await arjun.waitForSelector('.fr-thanks');
  check(/Thank you/.test(await arjun.locator('.fr-thanks').innerText()), 'thank-you screen after submitting');
  check(submits.length === 1, 'double tap sends once', submits.length);
  check(sql(`select status from form_assignments where client_id = '${A}'`) === 'completed', 'Completed');
  await arjun.screenshot({ path: `${OUT}/forms-8-client-thanks.png` });
  await go(arjun, '#home');
  check(await arjun.locator('.cf-home').count() === 0, 'nothing left to fill in on Home');
  check(arjun.errors.length === 0, 'no client errors', arjun.errors);

  // ------------------------------------------------ coach reviews
  console.log('Coach: responses against the right version');
  await go(coach, `#forms/${formId}/responses`);
  check(/Completed/.test(await coach.locator('.fl-table').innerText()) && /v1/.test(await coach.locator('.fl-table').innerText()), 'response listed as Completed, version 1');
  await coach.click('a:has-text("View answers")');
  await coach.waitForSelector('.fr-review');
  const review = await coach.locator('main').innerText();
  check(/What are your main goals\?/.test(review) && !/goals now/.test(review), 'review uses the wording Arjun answered');
  check(/Lose body fat, Other: Sleep better/.test(review), 'choices and Other text');
  check(/Not answered/.test(review), 'skipped optional question says Not answered');
  check(/4 of 5/.test(review), 'scale answer');
  await coach.screenshot({ path: `${OUT}/forms-9-review.png` });

  // ------------------------------------------------ permissions
  console.log('API: what each person may not do');
  const assignId = sql(`select id from form_assignments where client_id = '${A}'`);
  sql(`select 1`);
  const bReads = await api(B, 'GET', `/form_assignments?select=*&id=eq.${assignId}`);
  check(bReads.status === 200 && bReads.data.length === 0, 'Bilal can’t see Arjun’s assignment');
  const bResp = await api(B, 'GET', '/form_responses?select=*');
  check(bResp.data.length === 0, 'or his answers');
  const bForms = await api(B, 'GET', '/forms?select=*');
  check(bForms.data.length === 0, 'clients can’t read the coach’s forms');
  const bSave = await api(B, 'POST', '/rpc/save_form_answers', { p_assignment: assignId, p_answers: {}, p_seq: 99 });
  check(bSave.status >= 400, 'Bilal can’t save into Arjun’s form');
  const bAssign = await api(B, 'POST', '/rpc/assign_form', { p_form: formId, p_clients: [B] });
  check(bAssign.status >= 400, 'a client can’t send forms');
  const aEdit = await api(A, 'POST', '/rpc/save_form_answers', { p_assignment: assignId, p_answers: {}, p_seq: 999 });
  check(aEdit.status >= 400, 'answers are locked after submitting');
  const aInsert = await api(A, 'POST', '/form_assignments', { form_id: formId, version_id: sql(`select published_version_id from forms where id = '${formId}'`), client_id: A });
  check(aInsert.status >= 400, 'assignments can’t be made directly');
  // Coach can't read answers before a client submits.
  await api(COACH, 'POST', '/rpc/assign_form', { p_form: formId, p_clients: [B] });
  const bAssignId = sql(`select id from form_assignments where client_id = '${B}' and form_id = '${formId}'`);
  await api(B, 'POST', '/rpc/save_form_answers', { p_assignment: bAssignId, p_answers: { [q1id]: [] }, p_seq: 1 });
  const early = await api(COACH, 'GET', `/form_responses?select=*&assignment_id=eq.${bAssignId}`);
  check(early.data.length === 0, 'coach sees answers only after submit');

  // ------------------------------------------------ archive, filters
  console.log('Coach: library filters and archive');
  await go(coach, '#forms');
  await coach.waitForSelector('.fl-table');
  check(await coach.locator('.fl-table tbody tr').count() === 3, 'three forms listed');
  await coach.fill('[data-search]', 'quick');
  check(await coach.locator('.fl-table tbody tr').count() === 1, 'search by name');
  await coach.fill('[data-search]', '');
  await coach.selectOption('[data-filter="category"]', 'Feedback');
  check(await coach.locator('.fl-table tbody tr').count() === 1, 'category filter');
  await coach.selectOption('[data-filter="category"]', '');
  await coach.selectOption('[data-filter="status"]', 'published');
  check(await coach.locator('.fl-table tbody tr').count() === 1, 'status filter');
  await coach.selectOption('[data-filter="status"]', '');
  await coach.selectOption('[data-filter="tag"]', 'VIP');
  check(await coach.locator('.fl-table tbody tr').count() === 1, 'tag filter');
  await coach.selectOption('[data-filter="tag"]', '');
  const row = coach.locator(`tr[data-id="${formId}"]`);
  check(/2/.test(await row.locator('td').nth(2).innerText()), 'Sent to counts clients');
  await coach.screenshot({ path: `${OUT}/forms-10-library.png` });
  await row.locator('[data-menu]').click();
  const menuItems = await coach.locator('.fl-menu [data-act]').allInnerTexts();
  check(['Send a form', 'Copy form', 'Make default'].every((t, i) => menuItems[i] === t), 'row menu starts Send a form, Copy form, Make default', menuItems);
  check(/Ready/.test(await row.innerText()), 'published form shows Ready');
  await coach.click('.fl-menu [data-act="default"]');
  await coach.waitForSelector(`tr[data-id="${formId}"] .fl-default`);
  check(sql(`select count(*) from forms where is_default`) === '1', 'Make default marks one form');
  await coach.locator(`tr[data-id="${formId}"] [data-addtag]`).click();
  await coach.fill('.fl-tagpop input', 'Priority');
  await coach.keyboard.press('Enter');
  await coach.click('.fl-tagpop [data-ok]');
  await coach.waitForTimeout(600);
  check(/Priority/.test(sql(`select array_to_string(tags, ',') from forms where id = '${formId}'`)), 'Add Tag saves from the list');
  await coach.locator(`tr[data-id="${formId}"] [data-menu]`).click();
  await coach.click('.fl-menu [data-act="archive"]');
  await coach.waitForTimeout(600);
  check(await coach.locator(`tr[data-id="${formId}"]`).count() === 0, 'archived form leaves the list');
  check(sql(`select count(*) from form_assignments where form_id = '${formId}'`) === '2' && sql(`select count(*) from form_responses where submitted_at is not null`) === '1', 'archiving keeps assignments and answers');
  await coach.selectOption('[data-filter="status"]', 'archived');
  check(await coach.locator(`tr[data-id="${formId}"]`).count() === 1, 'Archived filter shows it');
  // The grouped side menu and the Check-ins dashboard.
  check(await coach.locator('.crm-group').allTextContents().then((g) => g.join(',') === 'Workspace,Content'), 'side menu groups');
  await go(coach, '#inbox');
  await coach.waitForSelector('.ci-stats');
  check(await coach.locator('.ci-stat').count() === 5, 'check-ins dashboard shows five stat cards');
  check(await coach.locator('[data-ci-tab]').count() === 5, 'check-ins dashboard tabs');
  await coach.screenshot({ path: `${OUT}/checkins-inbox.png` });
  await go(coach, '#inbox/insights');
  check(/Submission rate/i.test(await coach.locator('.crm-main').innerText()), 'check-ins Insights opens');
  // Existing coach screens still work.
  await go(coach, `#client/${A}/overview`);
  check(await coach.locator('.crm-head h1').innerText() === 'Overview', 'client Overview still opens');
  check(coach.errors.length === 0, 'no coach errors', coach.errors);

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join('\n'));
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
