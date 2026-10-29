// Run with: node netlify/test/functions.test.js
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { safeFetch, isBlockedAddress, checkUrl } = require('../lib/safe-fetch');
const { extractRecipe } = require('../lib/recipe-jsonld');
const barcode = require('../functions/food-barcode');
const recipeImport = require('../functions/recipe-import');

process.env.SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

(async () => {
  // Address checks
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2002:a00:1::1', 'not-an-ip']) {
    assert.equal(isBlockedAddress(ip), true, `${ip} must be blocked`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(isBlockedAddress(ip), false, `${ip} is public`);
  for (const bad of ['file:///etc/passwd', 'ftp://example.com/x', 'http://user:pw@example.com/', 'http://example.com:8080/', 'http://localhost/', 'http://printer.local/', 'gopher://x', 'not a url']) {
    assert.throws(() => checkUrl(bad), /./, bad);
  }
  assert.equal(checkUrl('https://www.example.com/recipe').host, 'www.example.com');

  // A local server stands in for the internet; names resolve through a fake DNS.
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},
    {"@type":["Recipe","NewsArticle"],"name":"Chicken &amp; rice","recipeYield":["4","4 serves"],"author":{"@type":"Person","name":"Sam Cook"},
    "recipeIngredient":["500 g chicken thigh fillets, diced","300g basmati rice","1 tbsp olive oil","Salt, to taste"],
    "recipeInstructions":[{"text":"Secret method"}],"image":"https://x/y.jpg"}]}</script></head><body>Hi</body></html>`;
  const server = http.createServer((req, res) => {
    if (req.url === '/recipe') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
    if (req.url === '/r1') return res.writeHead(302, { Location: '/recipe' }).end();
    if (req.url === '/loop') return res.writeHead(302, { Location: '/loop' }).end();
    if (req.url === '/to-private') return res.writeHead(302, { Location: `http://evil.test:${port}/recipe` }).end();
    if (req.url === '/big') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('x'.repeat(3 * 1024 * 1024));
    if (req.url === '/pdf') return res.writeHead(200, { 'Content-Type': 'application/pdf' }).end('%PDF');
    if (req.url === '/slow') return setTimeout(() => res.writeHead(200, { 'Content-Type': 'text/html' }).end('late'), 1500);
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const DNS = { 'good.test': ['127.0.0.1'], 'evil.test': ['10.0.0.5'], 'rebind.test': ['127.0.0.1', '192.168.0.10'] };
  const opts = {
    allowPorts: [port],
    lookup: (host, _o, cb) => (DNS[host] ? cb(null, DNS[host].map((address) => ({ address, family: 4 }))) : cb(new Error('ENOTFOUND'))),
    // The test server lives on 127.0.0.1, so allow exactly that one address.
    isBlocked: (ip) => ip !== '127.0.0.1' && isBlockedAddress(ip),
  };
  const base = `http://good.test:${port}`;
  let page = await safeFetch(`${base}/r1`, opts);
  assert.match(page.body, /Chicken &amp; rice/, 'follows a redirect');
  await assert.rejects(safeFetch(`${base}/loop`, opts), /redirects too many/);
  await assert.rejects(safeFetch(`${base}/to-private`, opts), /not on the public internet/, 'redirect to a private address refused');
  await assert.rejects(safeFetch(`http://rebind.test:${port}/recipe`, opts), /not on the public internet/, 'any private answer refuses the name');
  await assert.rejects(safeFetch(`${base}/big`, opts), /too large/);
  await assert.rejects(safeFetch(`${base}/pdf`, opts), /not a web page/);
  await assert.rejects(safeFetch(`${base}/slow`, { ...opts, timeoutMs: 300 }), /too long/);
  await assert.rejects(safeFetch(`http://127.0.0.1:${port}/recipe`, { allowPorts: [port] }), /not on the public internet/, 'real rules block loopback');
  await assert.rejects(safeFetch('http://169.254.169.254/latest/meta-data/'), /not on the public internet/, 'cloud metadata blocked');
  server.close();

  // JSON-LD extraction keeps attribution, drops method and images
  const r = extractRecipe(html, 'https://www.example.com/chicken-rice');
  assert.equal(r.name, 'Chicken & rice');
  assert.equal(r.servings, 4);
  assert.equal(r.author, 'Sam Cook');
  assert.equal(r.publisher, 'example.com');
  assert.equal(r.ingredients.length, 4);
  assert.equal(JSON.stringify(r).includes('Secret method'), false);
  assert.equal(JSON.stringify(r).includes('y.jpg'), false);
  assert.equal(extractRecipe('<html>no data</html>', 'https://x.com'), null);

  // Fake Supabase + Open Food Facts for the functions
  const calls = [];
  const fakeFetch = (routes) => async (url, init = {}) => {
    calls.push({ url, init });
    for (const [re, fn] of routes) if (re.test(url)) return fn(url, init);
    throw new Error(`unexpected fetch ${url}`);
  };
  const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  const authOk = [/\/auth\/v1\/user$/, (_u, init) => (init.headers.Authorization === 'Bearer good' ? res(200, { id: 'u1' }) : res(401, {}))];

  // Barcode: not cached -> Open Food Facts -> saved with the service key
  let saved;
  let f = fakeFetch([
    authOk,
    [/\/rest\/v1\/foods\?barcode=eq\./, () => res(200, [])],
    [/openfoodfacts\.org\/api\/v3\/product\/9300633123456/, (_u, init) => {
      assert.match(init.headers['User-Agent'], /RewiredCoaching/);
      return res(200, { status: 'success', product: { product_name: 'Wholemeal wraps', brands: 'Mission', countries_tags: ['en:australia'], nutriments: { 'energy-kcal_100g': 292, proteins_100g: 9.2, carbohydrates_100g: 45, fat_100g: 6.1 } } });
    }],
    [/\/rest\/v1\/foods\?on_conflict/, (_u, init) => {
      assert.equal(init.headers.Authorization, 'Bearer service', 'cache write uses the server key');
      saved = JSON.parse(init.body);
      return res(201, [{ ...saved, id: 'f1' }]);
    }],
  ]);
  let out = await barcode._handler({ httpMethod: 'GET', headers: { authorization: 'Bearer good' }, queryStringParameters: { code: '9300633123456' } }, {}, f);
  assert.equal(out.statusCode, 200);
  assert.equal(JSON.parse(out.body).food.name, 'Wholemeal wraps');
  assert.equal(saved.source, 'off');
  assert.equal(saved.quality, 'label');
  assert.equal(saved.barcode, '9300633123456');
  // Cached: Open Food Facts is not asked again
  calls.length = 0;
  f = fakeFetch([authOk, [/\/rest\/v1\/foods\?barcode=eq\./, () => res(200, [{ id: 'f1', name: 'Wholemeal wraps' }])]]);
  out = await barcode._handler({ httpMethod: 'GET', headers: { authorization: 'Bearer good' }, queryStringParameters: { code: '9300633123456' } }, {}, f);
  assert.equal(JSON.parse(out.body).cached, true);
  assert.equal(calls.some((c) => /openfoodfacts/.test(c.url)), false);
  out = await barcode._handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { code: '9300633123456' } }, {}, f);
  assert.equal(out.statusCode, 401, 'signed-out callers refused');
  out = await barcode._handler({ httpMethod: 'GET', headers: { authorization: 'Bearer good' }, queryStringParameters: { code: '12ab' } }, {}, f);
  assert.equal(out.statusCode, 400);
  f = fakeFetch([authOk, [/\/rest\/v1\/foods\?barcode/, () => res(200, [])], [/openfoodfacts/, () => res(404, {})]]);
  out = await barcode._handler({ httpMethod: 'GET', headers: { authorization: 'Bearer good' }, queryStringParameters: { code: '00000000' } }, {}, f);
  assert.equal(out.statusCode, 404);

  // Recipe import: parses lines, searches as the user (not the service key)
  f = fakeFetch([
    authOk,
    [/\/rest\/v1\/rpc\/food_search$/, (_u, init) => {
      assert.equal(init.headers.Authorization, 'Bearer good', 'search runs as the signed-in user');
      const q = JSON.parse(init.body).q;
      if (/chicken/.test(q)) return res(200, [{ id: 'c', name: 'Chicken, thigh, fillets, lean, raw', basis: 'g', kcal: 120 }]);
      if (/rice/.test(q)) return res(200, [{ id: 'r', name: 'Rice, white, basmati, uncooked', basis: 'g', kcal: 350 }]);
      return res(200, [{ id: 'o', name: 'Oil, olive', basis: 'g', kcal: 884 }]);
    }],
  ]);
  out = await recipeImport._handler({ httpMethod: 'POST', headers: { authorization: 'Bearer good' }, body: JSON.stringify({ url: 'https://www.example.com/chicken-rice', country: 'AU' }) }, {}, {
    fetch: f,
    safeFetch: async (url) => ({ url, body: html }),
  });
  assert.equal(out.statusCode, 200, out.body);
  const body = JSON.parse(out.body);
  assert.equal(body.recipe.source_url, 'https://www.example.com/chicken-rice');
  assert.equal(body.recipe.source_author, 'Sam Cook');
  const [chicken, rice, oil, salt] = body.ingredients;
  assert.equal(chicken.grams, 500);
  assert.equal(chicken.prep, 'diced');
  assert.equal(chicken.match, 'confirmed', 'clear weight and every word matched');
  assert.equal(rice.match, 'confirmed');
  assert.equal(oil.match, 'uncertain', 'tablespoons need the user to confirm grams');
  assert.equal(salt.candidates.length, 0);
  assert.equal(salt.match, 'uncertain');
  out = await recipeImport._handler({ httpMethod: 'POST', headers: { authorization: 'Bearer good' }, body: JSON.stringify({ url: 'https://x.com/a' }) }, {}, { fetch: f, safeFetch: async (url) => ({ url, body: '<p>none</p>' }) });
  assert.equal(out.statusCode, 422);
  out = await recipeImport._handler({ httpMethod: 'POST', headers: { authorization: 'Bearer good' }, body: JSON.stringify({ url: 'http://10.0.0.1/' }) }, {}, { fetch: f });
  assert.equal(out.statusCode, 400, 'private address refused through the real guard');
  assert.equal(recipeImport.matchConfidence('green chillies', 'Chilli, green, raw'), 1);

  // Add client: coach only, creates the login with the service key, fills name and phone
  const addClient = require('../functions/add-client');
  const coachRole = (role) => [/\/rest\/v1\/profiles\?id=eq\.u1&select=role/, () => res(200, [{ role }])];
  let made;
  let patched;
  f = fakeFetch([
    authOk, coachRole('coach'),
    [/\/auth\/v1\/admin\/users$/, (_u, init) => {
      assert.equal(init.headers.apikey, 'service', 'login made with the server key');
      made = JSON.parse(init.body);
      return made.email === 'taken@example.com' ? res(422, { msg: 'A user with this email address has already been registered' }) : res(200, { id: 'c9' });
    }],
    [/\/rest\/v1\/profiles\?id=eq\.c9$/, (_u, init) => { patched = JSON.parse(init.body); return res(204); }],
  ]);
  const add = (who, body) => addClient._handler({ httpMethod: 'POST', headers: { authorization: `Bearer ${who}` }, body: JSON.stringify(body) }, {}, f);
  out = await add('good', { first_name: ' Dean ', last_name: 'Subotic', email: 'Dean@Example.com', phone: '+61 400 000 000' });
  assert.equal(out.statusCode, 200, out.body);
  assert.equal(made.email, 'dean@example.com');
  assert.equal(made.email_confirm, true);
  assert.deepEqual(patched, { full_name: 'Dean Subotic', phone: '+61 400 000 000' });
  out = await add('good', { first_name: 'Dean', email: 'taken@example.com' });
  assert.equal(out.statusCode, 409, 'an email that already has a login is explained');
  out = await add('good', { first_name: '', email: 'x@example.com' });
  assert.equal(out.statusCode, 400);
  out = await add('good', { first_name: 'X', email: 'not-an-email' });
  assert.equal(out.statusCode, 400);
  out = await add('bad', { first_name: 'X', email: 'x@example.com' });
  assert.equal(out.statusCode, 401, 'signed-out callers are refused');
  f = fakeFetch([authOk, coachRole('client')]);
  out = await addClient._handler({ httpMethod: 'POST', headers: { authorization: 'Bearer good' }, body: JSON.stringify({ first_name: 'X', email: 'x@example.com' }) }, {}, f);
  assert.equal(out.statusCode, 403, 'a client cannot add clients');

  console.log('function tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
