// A small stand-in for PostgREST, for machines where the PostgREST binary
// isn't available. It speaks the part of the PostgREST API the app uses
// (column lists, eq/neq/gt/gte/lt/lte/in/is/cs filters, order, limit,
// single-object reads, insert/update/upsert/delete with representation,
// and /rpc calls) and runs every request on the scratch database as the
// "authenticated" role with the caller's JWT claims, so row level security
// and grants are the real ones. Embedded resources are not supported.
//   NODE_PATH=<dir with pg> node tests/e2e/pgrst-lite.js   (port 3009)
'use strict';
const http = require('http');
const crypto = require('crypto');
const { Pool, types } = require('pg');

// Return dates and times of day as text, the way PostgREST does.
[1082, 1083].forEach((oid) => types.setTypeParser(oid, (v) => v));

const SECRET = 'e2e-secret-e2e-secret-e2e-secret-0123456789';
const pool = new Pool({ host: process.env.PGHOST || '/var/lib/postgresql/rwtest', port: Number(process.env.PGPORT || 5499), user: 'postgres', database: 'rw', max: 5 });

function claimsOf(auth) {
  const [hd, bd, sig] = String(auth || '').replace(/^Bearer /, '').split('.');
  if (!sig) return { role: 'anon' };
  const want = crypto.createHmac('sha256', SECRET).update(`${hd}.${bd}`).digest('base64url');
  if (want !== sig) throw Object.assign(new Error('JWT invalid'), { status: 401, code: 'PGRST301' });
  return JSON.parse(Buffer.from(bd, 'base64url').toString());
}

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { status: 400, code: 'PGRST100' });
  return `"${s}"`;
};

function cols(select) {
  if (!select || select === '*') return '*';
  if (/[()!]/.test(select)) throw Object.assign(new Error('embedded resources are not supported by pgrst-lite'), { status: 400, code: 'PGRST100' });
  return select.split(',').map((c) => ident(c.trim())).join(', ');
}

// PostgREST list syntax: (a,"b c",d)
function list(v) {
  const inner = v.replace(/^\(/, '').replace(/\)$/, '');
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of inner) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur || inner.length) out.push(cur);
  return out;
}

function where(params, args) {
  const parts = [];
  for (const [k, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = raw.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|in|is|cs|like|ilike)\.(.*)$/s);
    if (!m) throw Object.assign(new Error(`unsupported filter ${k}=${raw}`), { status: 400, code: 'PGRST100' });
    const [, not, op, v] = m;
    const col = ident(k);
    let sql;
    if (op === 'in') {
      args.push(list(v));
      sql = `${col}::text = any($${args.length}::text[])`;
    } else if (op === 'is') {
      sql = `${col} is ${v === 'null' ? 'null' : v === 'true' ? 'true' : v === 'false' ? 'false' : 'unknown'}`;
    } else if (op === 'cs') {
      args.push(v.startsWith('{') ? v : v);
      sql = `${col} @> $${args.length}`;
    } else {
      const sym = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' }[op];
      args.push(op.includes('like') ? v.replace(/\*/g, '%') : v);
      sql = `${col} ${sym} $${args.length}`;
    }
    parts.push(not ? `not (${sql})` : sql);
  }
  return parts.length ? ` where ${parts.join(' and ')}` : '';
}

function orderBy(order) {
  if (!order) return '';
  return ` order by ${order.split(',').map((o) => {
    const [c, dir, nulls] = o.split('.');
    return `${ident(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`;
  }).join(', ')}`;
}

async function run(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)`, [claims.role === 'authenticated' ? 'authenticated' : 'anon', JSON.stringify(claims)]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (err) {
    await c.query('rollback').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

function pgError(err) {
  const status = err.status || (err.code === '42501' ? (/row-level security/.test(err.message) ? 403 : 401) : err.code === '23505' ? 409 : err.code === 'P0001' || /^P0/.test(err.code || '') ? 400 : 400);
  return { status, body: { code: err.code || 'PGRST000', message: err.message, details: err.detail || null, hint: err.hint || null } };
}

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString();
  const url = new URL(req.url, 'http://x');
  const send = (status, body, headers) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...(headers || {}) });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  try {
    const claims = claimsOf(req.headers.authorization);
    const prefer = String(req.headers.prefer || '');
    const single = /vnd\.pgrst\.object/.test(String(req.headers.accept || ''));
    const path = url.pathname.replace(/^\/+/, '');
    const params = [...url.searchParams];
    const sel = url.searchParams.get('select');

    const finish = (rows) => {
      if (single) {
        if (rows.length !== 1) return send(406, { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned`, details: `The result contains ${rows.length} rows` });
        return send(200, rows[0]);
      }
      return send(req.method === 'POST' && !path.startsWith('rpc/') ? 201 : 200, rows);
    };

    if (path.startsWith('rpc/')) {
      const fn = ident(path.slice(4));
      const body = raw ? JSON.parse(raw) : {};
      const names = Object.keys(body);
      const args = names.map((n) => (body[n] !== null && typeof body[n] === 'object' && !Array.isArray(body[n]) ? JSON.stringify(body[n]) : body[n]));
      const call = `${fn}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')})`;
      const out = await run(claims, async (c) => {
        const info = await c.query(`select p.proretset, t.typtype, t.typname from pg_proc p join pg_type t on t.oid = p.prorettype where p.proname = $1 and p.pronamespace = 'public'::regnamespace limit 1`, [path.slice(4)]);
        const meta = info.rows[0] || {};
        if (meta.proretset) return (await c.query(`select * from ${call}`, args)).rows;
        // A single composite row comes back as one object, as in PostgREST.
        if (meta.typtype === 'c') return (await c.query(`select * from ${call}`, args)).rows[0] || null;
        const r = await c.query(`select ${call} as v`, args);
        return meta.typname === 'void' ? null : r.rows[0].v;
      });
      if (single) return finish(Array.isArray(out) ? out : [out]);
      return send(200, out);
    }

    const table = ident(path);
    const args = [];
    if (req.method === 'GET' || req.method === 'HEAD') {
      const limit = url.searchParams.get('limit');
      const offset = url.searchParams.get('offset');
      const sql = `select ${cols(sel)} from public.${table}${where(params, args)}${orderBy(url.searchParams.get('order'))}${limit ? ` limit ${Number(limit)}` : ''}${offset ? ` offset ${Number(offset)}` : ''}`;
      const rows = (await run(claims, (c) => c.query(sql, args))).rows;
      return finish(rows);
    }
    const ret = /return=representation/.test(prefer) ? ` returning ${cols(sel)}` : '';
    if (req.method === 'POST') {
      let body = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(body)) body = [body];
      const keys = [...new Set(body.flatMap((r) => Object.keys(r)))];
      const conflict = url.searchParams.get('on_conflict');
      const rows = await run(claims, async (c) => {
        const out = [];
        for (const r of body) {
          const a = keys.filter((k) => k in r).map((k) => (r[k] !== null && typeof r[k] === 'object' && !Array.isArray(r[k]) ? JSON.stringify(r[k]) : (Array.isArray(r[k]) && r[k].some((x) => x && typeof x === 'object') ? JSON.stringify(r[k]) : r[k])));
          const ks = keys.filter((k) => k in r);
          let sql = `insert into public.${table} (${ks.map(ident).join(', ')}) values (${ks.map((_, i) => `$${i + 1}`).join(', ')})`;
          if (conflict) {
            sql += /ignore-duplicates/.test(prefer)
              ? ` on conflict (${conflict.split(',').map(ident).join(', ')}) do nothing`
              : ` on conflict (${conflict.split(',').map(ident).join(', ')}) do update set ${ks.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`;
          }
          out.push(...(await c.query(sql + (ret || ' returning *'), a)).rows);
        }
        return out;
      });
      return ret ? finish(rows) : send(201);
    }
    if (req.method === 'PATCH') {
      const body = JSON.parse(raw || '{}');
      const ks = Object.keys(body);
      const a = ks.map((k) => (body[k] !== null && typeof body[k] === 'object' && !Array.isArray(body[k]) ? JSON.stringify(body[k]) : body[k]));
      const sets = ks.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ');
      const w = where(params, a);
      const rows = (await run(claims, (c) => c.query(`update public.${table} set ${sets}${w}${ret}`, a))).rows;
      return ret ? finish(rows) : send(204);
    }
    if (req.method === 'DELETE') {
      const w = where(params, args);
      const rows = (await run(claims, (c) => c.query(`delete from public.${table}${w}${ret}`, args))).rows;
      return ret ? finish(rows) : send(204);
    }
    return send(405, { message: 'method not allowed' });
  } catch (err) {
    const e = pgError(err);
    return send(e.status, e.body);
  }
}).listen(3009, '127.0.0.1', () => console.log('pgrst-lite on 3009'));
