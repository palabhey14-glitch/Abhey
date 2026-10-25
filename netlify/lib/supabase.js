// Server-side Supabase helpers for Netlify functions. Keys come from the
// Netlify environment and never reach the browser.
'use strict';

function env() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) throw Object.assign(new Error('Server is missing SUPABASE_URL or SUPABASE_ANON_KEY'), { status: 500 });
  return { url, anon, service };
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function bearer(event) {
  const h = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// Confirms the caller is signed in to this Supabase project.
async function requireUser(event, fetchImpl = fetch) {
  const token = bearer(event);
  if (!token) throw Object.assign(new Error('Sign in first'), { status: 401 });
  const { url, anon } = env();
  const res = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw Object.assign(new Error('Sign in again'), { status: 401 });
  const user = await res.json();
  return { user, token };
}

// PostgREST call, as the user (RLS applies) or with the service key.
async function rest(path, { method = 'GET', body, token, service, prefer } = {}, fetchImpl = fetch) {
  const e = env();
  const key = service ? e.service : e.anon;
  if (service && !key) throw Object.assign(new Error('Server is missing SUPABASE_SERVICE_ROLE_KEY'), { status: 500 });
  const res = await fetchImpl(`${e.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${service ? key : token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Database error ${res.status}: ${text.slice(0, 200)}`), { status: 502 });
  return text ? JSON.parse(text) : null;
}

module.exports = { env, json, bearer, requireUser, rest };
