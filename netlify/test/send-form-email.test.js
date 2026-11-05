// Run with: node netlify/test/send-form-email.test.js
'use strict';
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.URL = 'https://rewiredbyabhey.com';
delete process.env.RESEND_API_KEY;

const fn = require('../functions/send-form-email');

const COACH = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const FORM = '33333333-3333-4333-8333-333333333333';
const A1 = '44444444-4444-4444-8444-444444444444';

function fakeFetch({ role = 'coach', resendOk = true } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return init.headers.Authorization === 'Bearer good' ? ok({ id: COACH }) : ok({}, 401);
    if (u.includes('/rest/v1/profiles?id=eq.')) return ok([{ role }]);
    if (u.includes('/rest/v1/form_assignments?')) {
      assert.match(u, new RegExp(`assigned_by=eq.${COACH}`));
      return ok(u.includes(A1) ? [{ id: A1, form_id: FORM, client_id: CLIENT }] : []);
    }
    if (u.includes('/rest/v1/forms?')) return ok([{ id: FORM, name: 'Onboarding <form>' }]);
    if (u.includes('/rest/v1/profiles?id=in.')) return ok([{ id: CLIENT, full_name: 'Chul Test', email: 'client@example.com' }]);
    if (u === 'https://api.resend.com/emails') return resendOk ? ok({ id: 're_1' }) : ok({ message: 'The abheyrewired.com domain is not verified.' }, 403);
    throw new Error(`unexpected ${u}`);
  };
  f.calls = calls;
  return f;
}

const ev = (body, token = 'good') => ({ httpMethod: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const parse = (r) => ({ status: r.statusCode, ...JSON.parse(r.body) });

(async () => {
  // Method and auth
  assert.equal((await fn._handler({ httpMethod: 'GET', headers: {} }, {}, fakeFetch())).statusCode, 405);
  assert.equal((await fn._handler(ev({ assignment_ids: [A1] }, 'bad'), {}, fakeFetch())).statusCode, 401);
  assert.equal((await fn._handler(ev({ assignment_ids: [A1] }), {}, fakeFetch({ role: 'client' }))).statusCode, 403);

  // Input checks
  assert.equal((await fn._handler(ev({ assignment_ids: [] }), {}, fakeFetch())).statusCode, 400);
  assert.equal((await fn._handler(ev({ assignment_ids: ['nope'] }), {}, fakeFetch())).statusCode, 400);

  // No key set: clear message, nothing sent
  let f = fakeFetch();
  let r = parse(await fn._handler(ev({ assignment_ids: [A1] }), {}, f));
  assert.equal(r.status, 503);
  assert.match(r.error, /RESEND_API_KEY/);
  assert.ok(!f.calls.some((c) => c.url.includes('resend')));

  process.env.RESEND_API_KEY = 're_test';

  // Happy path
  f = fakeFetch();
  r = parse(await fn._handler(ev({ assignment_ids: [A1, A1] }), {}, f));
  assert.equal(r.status, 200);
  assert.equal(r.sent, 1);
  assert.deepEqual(r.failed, []);
  const mail = f.calls.find((c) => c.url === 'https://api.resend.com/emails');
  const payload = JSON.parse(mail.init.body);
  assert.equal(payload.from, 'Rewired Coaching <coaching@abheyrewired.com>');
  assert.equal(payload.reply_to, 'coaching@abheyrewired.com');
  assert.deepEqual(payload.to, ['client@example.com']);
  assert.match(payload.subject, /Abhey sent you a form: Onboarding <form>/);
  assert.ok(payload.html.includes(`https://rewiredbyabhey.com/app/#form/${A1}`));
  assert.ok(payload.html.includes('Onboarding &lt;form&gt;'), 'form name is escaped in HTML');
  assert.ok(payload.text.includes('Hi Chul,'));
  assert.equal(mail.init.headers['Idempotency-Key'], `form-assignment-${A1}`);
  assert.equal(mail.init.headers.Authorization, 'Bearer re_test');

  // Someone else's or unknown assignment: nothing sent
  f = fakeFetch();
  r = parse(await fn._handler(ev({ assignment_ids: ['55555555-5555-4555-8555-555555555555'] }), {}, f));
  assert.equal(r.sent, 0);
  assert.ok(!f.calls.some((c) => c.url.includes('resend')));

  // Resend refuses (e.g. domain not verified): reason is passed back
  r = parse(await fn._handler(ev({ assignment_ids: [A1] }), {}, fakeFetch({ resendOk: false })));
  assert.equal(r.status, 502);
  assert.match(r.error, /not verified/);

  console.log('send-form-email tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
