// POST /.netlify/functions/send-form-email  { assignment_ids: [uuid, ...] }
// Coach only. Called by the dashboard straight after the coach presses Send in
// Forms. Emails each client a short note with a link to the form in their app,
// sent from coaching@abheyrewired.com through Google Workspace (Gmail SMTP).
//
// Netlify settings it reads:
//   SMTP_PASSWORD    required. A Google app password for SMTP_USER.
//   SMTP_USER        optional. Defaults to coaching@abheyrewired.com.
//   SMTP_HOST        optional. Defaults to smtp.gmail.com (port 465, TLS).
//   FORM_EMAIL_FROM  optional. Defaults to "Rewired Coaching <coaching@abheyrewired.com>".
//   COACH_NAME       optional. Defaults to "Abhey".
//   APP_URL          optional. Defaults to Netlify's own URL setting, then the caller's origin.
// Plus the Supabase settings every function uses (see netlify/lib/supabase.js).
'use strict';
const { json, requireUser, rest } = require('../lib/supabase');
const smtp = require('../lib/smtp');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 50;
const FROM = 'Rewired Coaching <coaching@abheyrewired.com>';
const REPLY_TO = 'coaching@abheyrewired.com';
// Only copies sent in the last few minutes, so a replayed request can't
// email a client again days later.
const FRESH_MINUTES = 15;

function setting(name) {
  if (process.env[name]) return process.env[name].trim();
  const key = Object.keys(process.env).find((k) => k.trim().toUpperCase() === name);
  return key && process.env[key] ? process.env[key].trim() : '';
}

const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function appBase(event) {
  const explicit = setting('APP_URL') || setting('URL');
  if (explicit) return explicit.replace(/\/+$/, '').replace(/\/app$/, '');
  const h = event.headers || {};
  const origin = h.origin || h.Origin;
  if (origin && /^https?:\/\/[^/]+$/i.test(origin)) return origin;
  return 'https://rewiredbyabhey.com';
}

function buildEmail({ firstName, formName, coach, link, base }) {
  const subject = `${coach} sent you a form: ${formName}`;
  const text = [
    `Hi ${firstName},`,
    '',
    `${coach} has sent you "${formName}" to fill in.`,
    '',
    `Open it here: ${link}`,
    '',
    'Sign in with this email address and the code we email you. The form is also on your Home screen in the Rewired app.',
    '',
    `Questions? Reply to this email.`,
    `${coach}, Rewired Coaching`,
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#0b2545;">
<tr><td style="padding:28px 28px 8px;"><img src="${escHtml(base)}/assets/email/logo-full.png" alt="Rewired Coaching" height="32" style="display:block;height:32px;border:0;"></td></tr>
<tr><td style="padding:12px 28px 0;font-size:16px;line-height:24px;">
<p style="margin:0 0 14px;">Hi ${escHtml(firstName)},</p>
<p style="margin:0 0 20px;">${escHtml(coach)} has sent you <b>${escHtml(formName)}</b> to fill in.</p>
<p style="margin:0 0 24px;"><a href="${escHtml(link)}" style="display:inline-block;background:#0b2545;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Open the form</a></p>
<p style="margin:0 0 14px;font-size:14px;line-height:21px;color:#4a5568;">Sign in with this email address and the code we email you. The form is also on your Home screen in the Rewired app.</p>
<p style="margin:0 0 28px;font-size:14px;line-height:21px;color:#4a5568;">Questions? Just reply to this email.<br>${escHtml(coach)}, Rewired Coaching</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

async function handler(event, _context, fetchImpl = fetch, smtpOpen = smtp.open) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST' });
    const { user, token } = await requireUser(event, fetchImpl);
    const me = await rest(`/profiles?id=eq.${user.id}&select=role`, { token }, fetchImpl);
    if (!me || !me[0] || me[0].role !== 'coach') return json(403, { error: 'Only the coach can send forms.' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Send the details as JSON.' }); }
    const ids = [...new Set(Array.isArray(body.assignment_ids) ? body.assignment_ids.map(String) : [])];
    if (!ids.length) return json(400, { error: 'No forms to email.' });
    if (ids.length > MAX || ids.some((id) => !UUID.test(id))) return json(400, { error: 'Those form links don’t look right.' });

    const pass = setting('SMTP_PASSWORD').replace(/\s+/g, '');
    if (!pass) return json(503, { error: 'Form emails need SMTP_PASSWORD (a Google app password) in Netlify. See docs/form-emails.md.' });
    const smtpUser = setting('SMTP_USER') || REPLY_TO;

    // Only open copies this coach sent. Anything else is skipped quietly.
    const assigns = await rest(`/form_assignments?id=in.(${ids.join(',')})&assigned_by=eq.${user.id}&submitted_at=is.null&cancelled_at=is.null&assigned_at=gte.${encodeURIComponent(new Date(Date.now() - FRESH_MINUTES * 60000).toISOString())}&select=id,form_id,client_id`, { service: true }, fetchImpl) || [];
    if (!assigns.length) return json(200, { sent: 0, failed: [] });
    const formIds = [...new Set(assigns.map((a) => a.form_id))];
    const clientIds = [...new Set(assigns.map((a) => a.client_id))];
    const [forms, people] = await Promise.all([
      rest(`/forms?id=in.(${formIds.join(',')})&coach_id=eq.${user.id}&select=id,name`, { service: true }, fetchImpl),
      rest(`/profiles?id=in.(${clientIds.join(',')})&role=eq.client&select=id,full_name,email`, { service: true }, fetchImpl),
    ]);
    const formById = new Map((forms || []).map((f) => [f.id, f]));
    const personById = new Map((people || []).map((p) => [p.id, p]));

    const base = appBase(event);
    const coach = setting('COACH_NAME') || 'Abhey';
    const from = setting('FORM_EMAIL_FROM') || FROM;
    let sent = 0;
    const failed = [];
    const jobs = [];
    for (const a of assigns) {
      const form = formById.get(a.form_id);
      const person = personById.get(a.client_id);
      if (!form || !person || !person.email) { failed.push({ id: a.id, error: 'Client has no email address.' }); continue; }
      const firstName = String(person.full_name || '').trim().split(/\s+/)[0] || 'there';
      const link = `${base}/app/#form/${a.id}`;
      jobs.push({ a, person, mail: buildEmail({ firstName, formName: form.name, coach, link, base }) });
    }
    if (jobs.length) {
      let conn;
      try {
        conn = await smtpOpen({ host: setting('SMTP_HOST') || 'smtp.gmail.com', port: Number(setting('SMTP_PORT')) || 465, user: smtpUser, pass });
      } catch (err) {
        const msg = /Sign-in|535|534/.test(String(err.message))
          ? 'Google refused the sign-in. Check SMTP_PASSWORD is an app password for coaching@abheyrewired.com.'
          : 'Couldn’t reach the Google email server.';
        for (const j of jobs) failed.push({ id: j.a.id, email: j.person.email, error: msg });
      }
      if (conn) {
        for (const j of jobs) {
          try {
            await conn.send({ from, to: j.person.email, replyTo: REPLY_TO, subject: j.mail.subject, text: j.mail.text, html: j.mail.html });
            sent += 1;
          } catch (err) {
            failed.push({ id: j.a.id, email: j.person.email, error: String(err.message || 'Email failed.').slice(0, 200) });
            await conn.reset();
          }
        }
        await conn.close();
      }
    }
    return json(failed.length && !sent ? 502 : 200, { sent, failed, ...(failed.length && !sent ? { error: failed[0].error } : {}) });
  } catch (err) {
    return json(err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
  }
}

exports.handler = (event, context) => handler(event, context);
exports._handler = handler;
exports._buildEmail = buildEmail;
