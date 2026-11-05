// Minimal SMTP client for Netlify functions: implicit TLS (port 465), AUTH
// PLAIN, plain-text + HTML emails. No dependencies. Built for Google
// Workspace (smtp.gmail.com with an app password) but works with any
// standard SMTP server.
'use strict';
const tls = require('node:tls');
const { randomBytes } = require('node:crypto');

const clean = (s) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim();
const ADDR = /^[^\s@<>"(),;:\\]+@[^\s@<>"(),;:\\]+\.[^\s@<>"(),;:\\]+$/;

// "Name <a@b.com>" or "a@b.com" -> "a@b.com"
function addressOf(s) {
  const m = String(s || '').match(/<([^<>]+)>\s*$/);
  return (m ? m[1] : String(s || '')).trim();
}

// RFC 2047 encoding for non-ASCII header text.
function headerText(s) {
  const t = clean(s);
  return /^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`;
}

function b64(s) {
  return Buffer.from(String(s), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
}

function buildMessage({ from, to, replyTo, subject, text, html }) {
  const boundary = `rw_${randomBytes(12).toString('hex')}`;
  const domain = addressOf(from).split('@')[1] || 'localhost';
  const lines = [
    `From: ${clean(from)}`,
    `To: ${clean(to)}`,
    ...(replyTo ? [`Reply-To: ${clean(replyTo)}`] : []),
    `Subject: ${headerText(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html),
    `--${boundary}--`,
    '',
  ];
  // Dot-stuffing: a line starting with "." gets a second one.
  return lines.join('\r\n').replace(/\r\n\./g, '\r\n..');
}

// Opens one connection that can send several emails.
// opts: { host, port, user, pass, timeout, connect }  (connect is for tests)
function open(opts) {
  const { host = 'smtp.gmail.com', port = 465, user, pass, timeout = 15000 } = opts;
  const connect = opts.connect || ((o, cb) => tls.connect({ host: o.host, port: o.port, servername: o.host }, cb));
  return new Promise((resolve, reject) => {
    let buf = '';
    let lines = [];
    let waiter = null;
    let failed = null;
    const sock = connect({ host, port }, () => {});
    sock.setEncoding('utf8');
    sock.setTimeout(timeout, () => fail(new Error('Email server timed out.')));
    sock.on('error', (e) => fail(e));
    sock.on('close', () => fail(new Error('Email server closed the connection.')));

    function fail(e) {
      if (failed) return;
      failed = e;
      if (waiter) { const w = waiter; waiter = null; w.reject(e); }
      sock.destroy();
    }
    sock.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        lines.push(line);
        if (/^\d{3}(?: |$)/.test(line)) {
          const reply = { code: Number(line.slice(0, 3)), text: lines.join('\n') };
          lines = [];
          if (waiter) { const w = waiter; waiter = null; w.resolve(reply); }
        }
      }
    });
    const read = () => new Promise((res, rej) => {
      if (failed) return rej(failed);
      waiter = { resolve: res, reject: rej };
    });
    async function cmd(line, ok, label) {
      const p = read();
      if (line !== null) sock.write(`${line}\r\n`);
      const r = await p;
      if (!ok.includes(r.code)) {
        const err = new Error(`${label || 'Email server'} refused: ${r.text.replace(/\s+/g, ' ').slice(0, 200)}`);
        err.code = r.code;
        throw err;
      }
      return r;
    }

    (async () => {
      await cmd(null, [220], 'Greeting');
      await cmd('EHLO rewired-coaching', [250], 'EHLO');
      await cmd(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64')}`, [235], 'Sign-in');
      resolve({
        async send(msg) {
          const to = addressOf(msg.to);
          if (!ADDR.test(to)) throw new Error('That email address doesn’t look right.');
          await cmd(`MAIL FROM:<${addressOf(msg.from)}>`, [250], 'Sender');
          await cmd(`RCPT TO:<${to}>`, [250, 251], 'Recipient');
          await cmd('DATA', [354], 'DATA');
          await cmd(`${buildMessage(msg)}\r\n.`, [250], 'Message');
        },
        async reset() {
          try { await cmd('RSET', [250], 'RSET'); } catch (_) { /* the next send reports it */ }
        },
        async close() {
          try { await cmd('QUIT', [221], 'QUIT'); } catch (_) { /* closing anyway */ }
          sock.destroy();
        },
      });
    })().catch((e) => { fail(e); reject(e); });
  });
}

module.exports = { open, buildMessage, addressOf, headerText };
