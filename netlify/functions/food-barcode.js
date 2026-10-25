// GET /.netlify/functions/food-barcode?code=9300633123456
// Signed-in users only. Looks the barcode up in our foods table first; if it
// is not there, asks Open Food Facts once and saves the product (with its
// source and licence) so later lookups never leave our database.
'use strict';
const { json, requireUser, rest } = require('../lib/supabase');
const { mapProduct } = require('../../tools/food-import/sources/off');

const OFF_FIELDS = 'code,product_name,product_name_en,generic_name,brands,countries_tags,quantity,product_quantity_unit,serving_size,serving_quantity,nutriments,categories_tags';
const USER_AGENT = 'RewiredCoaching/1.0 (coaching@abheyrewired.com)';

async function lookupOff(code, fetchImpl) {
  const res = await fetchImpl(`https://world.openfoodfacts.org/api/v3/product/${code}.json?fields=${OFF_FIELDS}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (res.status === 429) throw Object.assign(new Error('The barcode service is busy. Try again in a minute, or search by name.'), { status: 503 });
  if (!res.ok) throw Object.assign(new Error('The barcode service is not answering. Search by name instead.'), { status: 502 });
  const data = await res.json();
  return data && data.product ? data.product : null;
}

async function handler(event, _context, fetchImpl = fetch) {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Use GET' });
    await requireUser(event, fetchImpl);
    const code = String((event.queryStringParameters || {}).code || '').replace(/\D/g, '');
    if (!/^[0-9]{8,14}$/.test(code)) return json(400, { error: 'A barcode has 8 to 14 digits.' });

    const found = await rest(`/foods?barcode=eq.${code}&retired_at=is.null&select=*&limit=1`, { service: true }, fetchImpl);
    if (found && found.length) return json(200, { food: found[0], cached: true });

    const product = await lookupOff(code, fetchImpl);
    const row = product ? mapProduct({ ...product, code }, `api-${new Date().toISOString().slice(0, 10)}`) : null;
    if (!row) return json(404, { error: 'No nutrition found for that barcode. Search by name or type the label in.', found: false });
    row.last_seen_at = new Date().toISOString();
    const saved = await rest('/foods?on_conflict=source,source_id', { method: 'POST', body: row, service: true, prefer: 'resolution=merge-duplicates,return=representation' }, fetchImpl);
    return json(200, { food: saved[0], cached: false });
  } catch (err) {
    return json(err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
  }
}

exports.handler = (event, context) => handler(event, context);
exports._handler = handler;
