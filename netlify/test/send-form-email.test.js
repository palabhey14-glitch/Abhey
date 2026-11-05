// Run with: node netlify/test/send-form-email.test.js
'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');

process.env.SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.URL = 'https://rewiredbyabhey.com';
delete process.env.SMTP_PASSWORD;
delete process.env.SMTP_USER;

const fn = require('../functions/send-form-email');
const smtp = require('../lib/smtp');

const COACH = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const FORM = '33333333-3333-4333-8333-333333333333';
const A1 = '44444444-4444-4444-8444-444444444444';

function fakeFetch({ role = 'coach' } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return init.headers.Authorization === 'Bearer good' ? ok({ id: COACH }) : ok({}, 401);
    if (u.includes('/rest/v1/profiles?id=eq.')) return ok([{ role }]);
    if (u.includes('/rest/v1/form_assignments?')) {
      assert.match(u, new RegExp(`assigned_by=eq.${COACH}`));
      assert.match(u, /assigned_at=gte\./, 'only recently sent copies');
      return ok(u.includes(A1) ? [{ id: A1, form_id: FORM, client_id: CLIENT }] : []);
    }
    if (u.includes('/rest/v1/forms?')) return ok([{ id: FORM, name: 'Onboarding <form>' }]);
    if (u.includes('/rest/v1/profiles?id=in.')) return ok([{ id: CLIENT, full_name: 'Chul Test', email: 'client@example.com' }]);
    throw new Error(`unexpected ${u}`);
  };
  f.calls = calls;
  return f;
}

function fakeSmtp({ openError, sendError } = {}) {
  const log = { opened: null, sent: [], closed: false };
  const open = async (opts) => {
    log.opened = opts;
    if (openError) throw new Error(openError);
    return {
      async send(m) { if (sendError) throw new Error(sendError); log.sent.push(m); },
      async reset() {},
      async close() { log.closed = true; },
    };
  };
  open.log = log;
  return open;
}

const ev = (body, token = 'good') => ({ httpMethod: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const parse = (r) => ({ status: r.statusCode, ...JSON.parse(r.body) });

// A scripted SMTP server on localhost for the real protocol.
function smtpServer({ authOk = true } = {}) {
  const got = { lines: [], data: '' };
  const server = net.createServer((s) => {
    let buf = '';
    let inData = false;
    s.write('220 fake ESMTP\r\n');
    s.on('data', (c) => {
      buf += c.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; s.write('250 2.0.0 OK queued\r\n'); } else got.data += `${line}\n`;
          continue;
        }
        got.lines.push(line);
        if (line.startsWith('EHLO')) s.write('250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 SMTPUTF8\r\n');
        else if (line.startsWith('AUTH PLAIN')) s.write(authOk ? '235 2.7.0 Accepted\r\n' : '535 5.7.8 Username and Password not accepted\r\n');
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO') || line === 'RSET') s.write('250 OK\r\n');
        else if (line === 'DATA') { inData = true; s.write('354 Go ahead\r\n'); }
        else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
        else s.write('500 what\r\n');
      }
    });
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ server, got, port: server.address().port })));
}

(async () => {
  // Method and auth
  assert.equal((await fn._handler({ httpMethod: 'GET', headers: {} }, {}, fakeFetch(), fakeSmtp())).statusCode, 405);
  assert.equal((await fn._handler(ev({ assignment_ids: [A1] }, 'bad'), {}, fakeFetch(), fakeSmtp())).statusCode, 401);
  assert.equal((await fn._handler(ev({ assignment_ids: [A1] }), {}, fakeFetch({ role: 'client' }), fakeSmtp())).statusCode, 403);

  // Input checks
  assert.equal((await fn._handler(ev({ assignment_ids: [] }), {}, fakeFetch(), fakeSmtp())).statusCode, 400);
  assert.equal((await fn._handler(ev({ assignment_ids: ['nope'] }), {}, fakeFetch(), fakeSmtp())).statusCode, 400);

  // No password set: clear message, nothing sent
  let s = fakeSmtp();
  let r = parse(await fn._handler(ev({ assignment_ids: [A1] }), {}, fakeFetch(), s));
  assert.equal(r.status, 503);
  assert.match(r.error, /SMTP_PASSWORD/);
  assert.equal(s.log.opened, null);

  process.env.SMTP_PASSWORD = 'abcd efgh ijkl mnop'; // Google shows it with spaces

  // Happy path
  s = fakeSmtp();
  r = parse(await fn._handler(ev({ assignment_ids: [A1, A1] }), {}, fakeFetch(), s));
  assert.equal(r.status, 200);
  assert.equal(r.sent, 1);
  assert.deepEqual(r.failed, []);
  assert.deepEqual(s.log.opened, { host: 'smtp.gmail.com', port: 465, user: 'coaching@abheyrewired.com', pass: 'abcdefghijklmnop' });
  assert.equal(s.log.closed, true);
  const m = s.log.sent[0];
  assert.equal(m.from, 'Rewired Coaching <coaching@abheyrewired.com>');
  assert.equal(m.replyTo, 'coaching@abheyrewired.com');
  assert.equal(m.to, 'client@example.com');
  assert.match(m.subject, /Abhey sent you a form: Onboarding <form>/);
  assert.ok(m.html.includes(`https://rewiredbyabhey.com/app/#form/${A1}`));
  assert.ok(m.html.includes('Onboarding &lt;form&gt;'), 'form name is escaped in HTML');
  assert.ok(m.text.includes('Hi Chul,'));

  // Someone else's, old or unknown copy: nothing sent
  s = fakeSmtp();
  r = parse(await fn._handler(ev({ assignment_ids: ['55555555-5555-4555-8555-555555555555'] }), {}, fakeFetch(), s));
  assert.equal(r.sent, 0);
  assert.equal(s.log.opened, null);

  // Google refuses the sign-in: clear reason passed back
  r = parse(await fn._handler(ev({ assignment_ids: [A1] }), {}, fakeFetch(), fakeSmtp({ openError: 'Sign-in refused: 535 5.7.8' })));
  assert.equal(r.status, 502);
  assert.match(r.error, /app password/);

  // A send fails: reason passed back
  r = parse(await fn._handler(ev({ assignment_ids: [A1] }), {}, fakeFetch(), fakeSmtp({ sendError: 'Recipient refused: 550 no such user' })));
  assert.equal(r.status, 502);
  assert.match(r.error, /550/);

  // Real SMTP conversation against the local server
  const t = await smtpServer();
  const conn = await smtp.open({ host: '127.0.0.1', port: t.port, user: 'coaching@abheyrewired.com', pass: 'pw', connect: (o, cb) => net.connect(o.port, o.host, cb) });
  await conn.send({ from: 'Rewired Coaching <coaching@abheyrewired.com>', to: 'client@example.com', replyTo: 'coaching@abheyrewired.com', subject: 'Hi\r\nBcc: evil@x.com café', text: '.dot line\nhello', html: '<p>hi</p>' });
  await conn.send({ from: 'Rewired Coaching <coaching@abheyrewired.com>', to: 'two@example.com', subject: 'Second', text: 'b', html: '<p>b</p>' });
  await conn.close();
  t.server.close();
  assert.ok(t.got.lines.includes(`AUTH PLAIN ${Buffer.from('\0coaching@abheyrewired.com\0pw').toString('base64')}`));
  assert.ok(t.got.lines.includes('MAIL FROM:<coaching@abheyrewired.com>'));
  assert.ok(t.got.lines.includes('RCPT TO:<client@example.com>'));
  assert.ok(t.got.lines.includes('RCPT TO:<two@example.com>'), 'one connection sends several emails');
  assert.ok(t.got.lines.includes('QUIT'));
  assert.ok(!/^Bcc:/m.test(t.got.data), 'no header injection through the subject');
  assert.match(t.got.data, /^Subject: =\?UTF-8\?B\?/m, 'non-ASCII subject is encoded');
  assert.match(t.got.data, /^Reply-To: coaching@abheyrewired\.com$/m);
  const textPart = t.got.data.split('Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: base64\n\n')[1].split('\n--')[0].replace(/\n/g, '');
  assert.equal(Buffer.from(textPart, 'base64').toString('utf8'), '.dot line\nhello');

  // Wrong password against the local server
  const t2 = await smtpServer({ authOk: false });
  await assert.rejects(smtp.open({ host: '127.0.0.1', port: t2.port, user: 'u', pass: 'bad', connect: (o, cb) => net.connect(o.port, o.host, cb) }), /Sign-in refused: 535/);
  t2.server.close();

  assert.equal(smtp.addressOf('Name <a@b.com>'), 'a@b.com');
  assert.equal(smtp.addressOf('a@b.com'), 'a@b.com');

  console.log('send-form-email tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
