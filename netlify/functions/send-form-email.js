// POST /.netlify/functions/send-form-email  { assignment_ids: [uuid, ...] }
// Coach only. Called by the dashboard straight after the coach presses Send in
// Forms. Emails each client a short note with a link to the form in their app,
// sent through Resend from coaching@abheyrewired.com.
//
// Netlify settings it reads:
//   RESEND_API_KEY   required. From resend.com, with abheyrewired.com verified.
//   FORM_EMAIL_FROM  optional. Defaults to "Rewired Coaching <coaching@abheyrewired.com>".
//   COACH_NAME       optional. Defaults to "Abhey".
//   APP_URL          optional. Defaults to Netlify's own URL setting, then the caller's origin.
// Plus the Supabase settings every function uses (see netlify/lib/supabase.js).
'use strict';
const { json, requireUser, rest } = require('../lib/supabase');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 50;
const FROM = 'Rewired Coaching <coaching@abheyrewired.com>';
const REPLY_TO = 'coaching@abheyrewired.com';

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

async function handler(event, _context, fetchImpl = fetch) {
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

    const apiKey = setting('RESEND_API_KEY');
    if (!apiKey) return json(503, { error: 'Form emails need RESEND_API_KEY in Netlify. See docs/form-emails.md.' });

    // Only open copies this coach sent. Anything else is skipped quietly.
    const assigns = await rest(`/form_assignments?id=in.(${ids.join(',')})&assigned_by=eq.${user.id}&submitted_at=is.null&cancelled_at=is.null&select=id,form_id,client_id`, { service: true }, fetchImpl) || [];
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
    for (const a of assigns) {
      const form = formById.get(a.form_id);
      const person = personById.get(a.client_id);
      if (!form || !person || !person.email) { failed.push({ id: a.id, error: 'Client has no email address.' }); continue; }
      const firstName = String(person.full_name || '').trim().split(/\s+/)[0] || 'there';
      const link = `${base}/app/#form/${a.id}`;
      const mail = buildEmail({ firstName, formName: form.name, coach, link, base });
      try {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            // One email per sent copy, even if the request is retried.
            'Idempotency-Key': `form-assignment-${a.id}`,
          },
          body: JSON.stringify({ from, to: [person.email], reply_to: REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text }),
        });
        if (res.ok) { sent += 1; continue; }
        const out = await res.json().catch(() => ({}));
        const msg = String(out.message || out.error || `Resend error ${res.status}`).slice(0, 200);
        failed.push({ id: a.id, email: person.email, error: msg });
      } catch (err) {
        failed.push({ id: a.id, email: person.email, error: 'Couldn’t reach Resend.' });
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
