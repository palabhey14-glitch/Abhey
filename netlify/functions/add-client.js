// POST /.netlify/functions/add-client  { first_name, last_name, email, phone }
// Coach only. Creates the client's Supabase login (no password; they sign in
// with an emailed code), so the coach never has to open Supabase to add
// someone. The new-user trigger makes their profile and targets row; this
// fills in their name and phone. Everything else (check-in day, forms, tags)
// the coach's browser saves afterwards under the coach's own permissions.
'use strict';
const { env, json, requireUser, rest } = require('../lib/supabase');

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

// Same rule as netlify/lib/supabase.js: a new secret key goes in apikey only.
function serviceHeaders(key) {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

async function handler(event, _context, fetchImpl = fetch) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST' });
    const { user, token } = await requireUser(event, fetchImpl);
    const me = await rest(`/profiles?id=eq.${user.id}&select=role`, { token }, fetchImpl);
    if (!me || !me[0] || me[0].role !== 'coach') return json(403, { error: 'Only the coach can add clients.' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Send the details as JSON.' }); }
    const first = String(body.first_name || '').trim();
    const last = String(body.last_name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    if (!first || first.length > 60 || last.length > 60) return json(400, { error: 'Add a first name (up to 60 characters).' });
    if (!EMAIL.test(email) || email.length > 254) return json(400, { error: 'That email address doesn’t look right.' });
    if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone)) return json(400, { error: 'That phone number doesn’t look right.' });
    const fullName = `${first} ${last}`.trim();

    const { url, service } = env();
    if (!service) return json(500, { error: 'Adding clients needs SUPABASE_SERVICE_ROLE_KEY in Netlify. See the setup steps.' });
    const res = await fetchImpl(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { ...serviceHeaders(service), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, email_confirm: true, user_metadata: { full_name: fullName } }),
    });
    const created = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(created.msg || created.message || created.error_description || created.error || '');
      if (res.status === 422 || /already/i.test(msg)) return json(409, { error: 'That email already has a login. Find them in your client list.' });
      return json(502, { error: 'Supabase didn’t create the login. Check the Netlify keys and try again.' });
    }
    const id = created.id || (created.user && created.user.id);
    if (!id) return json(502, { error: 'Supabase didn’t return the new login.' });

    await rest(`/profiles?id=eq.${id}`, { method: 'PATCH', body: { full_name: fullName, phone: phone || null }, service: true, prefer: 'return=minimal' }, fetchImpl);
    return json(200, { id, email, full_name: fullName });
  } catch (err) {
    return json(err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
  }
}

exports.handler = (event, context) => handler(event, context);
exports._handler = handler;
