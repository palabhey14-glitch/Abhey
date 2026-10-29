// Local stand-in for Netlify + Supabase: serves site/, proxies /rest/v1 to a
// real PostgREST on the scratch database, fakes the few /auth/v1 calls the app
// makes, and runs the real Netlify functions. Port 8830.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '../..');
const SITE = path.join(REPO, 'site');
const SECRET = 'e2e-secret-e2e-secret-e2e-secret-0123456789';
const PORT = 8830;
const BASE = `http://localhost:${PORT}`;

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400, ...payload });
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [hd, bd, sig] = String(token || '').split('.');
  if (!sig) return null;
  const want = crypto.createHmac('sha256', SECRET).update(`${hd}.${bd}`).digest('base64url');
  if (want !== sig) return null;
  return JSON.parse(Buffer.from(bd, 'base64url').toString());
}
const ANON = jwt({ role: 'anon' });
const SERVICE = jwt({ role: 'service_role' });
exports.jwt = jwt;
exports.ANON = ANON;

process.env.SUPABASE_URL = BASE;
process.env.SUPABASE_ANON_KEY = ANON;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;

const FIXTURES = path.join(__dirname, 'fixtures');
const calls = { off: 0, recipe: 0 };
// Outbound requests from the functions: Open Food Facts and recipe pages are
// answered from fixtures; calls back to this server go through.
async function fakeFetch(url, opts) {
  const u = String(url);
  if (u.startsWith('https://world.openfoodfacts.org/')) {
    calls.off += 1;
    const code = u.match(/product\/(\d+)/)[1];
    const file = path.join(FIXTURES, `off-${code}.json`);
    if (!fs.existsSync(file)) return new Response(JSON.stringify({ status: 'failure' }), { status: 404 });
    return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return fetch(url, opts);
}
const { safeFetch } = require(path.join(REPO, 'netlify/lib/safe-fetch'));
async function fakeSafeFetch(url) {
  // recipes.example is a stand-in site; everything else gets the real checks
  // (which refuse localhost, private ranges and so on).
  if (/^https:\/\/recipes\.example\//.test(url)) {
    calls.recipe += 1;
    return { url, status: 200, body: fs.readFileSync(path.join(FIXTURES, 'recipe.html'), 'utf8') };
  }
  return safeFetch(url);
}
const functions = {
  'food-barcode': (ev) => require(path.join(REPO, 'netlify/functions/food-barcode'))._handler(ev, {}, fakeFetch),
  'recipe-import': (ev) => require(path.join(REPO, 'netlify/functions/recipe-import'))._handler(ev, {}, { fetch: fakeFetch, safeFetch: fakeSafeFetch }),
  'add-client': (ev) => require(path.join(REPO, 'netlify/functions/add-client'))._handler(ev, {}, fetch),
};
// Supabase's admin "create user", against the scratch database's auth.users.
function adminCreateUser(body) {
  const { execFileSync } = require('child_process');
  const email = String(body.email || '').replace(/'/g, "''");
  const q = `insert into auth.users (id, email) select gen_random_uuid(), '${email}' where not exists (select 1 from auth.users where lower(email) = lower('${email}')) returning id`;
  return execFileSync('psql', ['-h', process.env.PGHOST || '/var/lib/postgresql/rwtest', '-p', process.env.PGPORT || '5499', '-U', 'postgres', '-d', 'rw', '-tAq', '-c', q]).toString().trim();
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  try {
    if (url.pathname === '/__calls') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(calls));
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const body = await readBody(req);
      const headers = { ...req.headers };
      delete headers.host;
      delete headers['content-length'];
      const r = await fetch(`http://127.0.0.1:3009${url.pathname.slice(8)}${url.search}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const out = Buffer.from(await r.arrayBuffer());
      const h = {};
      r.headers.forEach((v, k) => {
        if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k)) h[k] = v;
      });
      h['access-control-allow-origin'] = '*';
      res.writeHead(r.status, h);
      return res.end(out);
    }
    if (url.pathname === '/auth/v1/user') {
      const claims = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!claims || !claims.sub) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end('{"msg":"bad jwt"}');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id: claims.sub, email: claims.email, aud: 'authenticated', role: 'authenticated' }));
    }
    if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
      if (req.headers.apikey !== SERVICE) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end('{"msg":"service key needed"}');
      }
      const id = adminCreateUser(JSON.parse((await readBody(req)).toString()));
      res.writeHead(id ? 200 : 422, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(id ? { id } : { msg: 'A user with this email address has already been registered' }));
    }
    if (url.pathname.startsWith('/auth/v1/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{}');
    }
    if (url.pathname.startsWith('/.netlify/functions/')) {
      const name = url.pathname.split('/')[3];
      const fn = functions[name];
      if (!fn) {
        res.writeHead(404);
        return res.end('not found');
      }
      const body = await readBody(req);
      const out = await fn({ httpMethod: req.method, headers: req.headers, queryStringParameters: Object.fromEntries(url.searchParams), body: body.toString() });
      res.writeHead(out.statusCode, out.headers);
      return res.end(out.body);
    }
    if (url.pathname === '/app/config.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(`window.REWIRED_CONFIG = { supabaseUrl: '${BASE}', supabaseAnonKey: '${ANON}', coachName: 'Abhey' };`);
    }
    let file = path.join(SITE, decodeURIComponent(url.pathname));
    if (!file.startsWith(SITE)) throw new Error('bad path');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end(String(err));
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`e2e server on ${BASE}`));
exports.server = server;
