// Open Food Facts: packaged foods and barcodes worldwide (ODbL 1.0).
//
// Use the bulk exports for anything beyond single lookups (the public API
// allows 15 product reads and 10 searches a minute per IP):
//   --file en.openfoodfacts.org.products.csv.gz   tab-separated full export
//   --file openfoodfacts-products.jsonl.gz        JSONL full export, or a
//                                                 daily delta file for refreshes
//   --countries AU,NZ,GB                          keep products sold there
// Products without energy are skipped. Values are per 100 g, or per 100 mL for
// drinks sold by volume. All of it is crowd-sourced label data.
'use strict';
const { lines, splitCsv } = require('../lib/lines');
const { food, num } = require('../lib/food');

const COUNTRY = {
  australia: 'AU', 'new-zealand': 'NZ', 'united-kingdom': 'GB', ireland: 'IE', 'united-states': 'US', canada: 'CA',
  india: 'IN', pakistan: 'PK', 'sri-lanka': 'LK', bangladesh: 'BD', nepal: 'NP', singapore: 'SG', malaysia: 'MY',
  'united-arab-emirates': 'AE', 'saudi-arabia': 'SA', qatar: 'QA', 'south-africa': 'ZA', france: 'FR', germany: 'DE',
  spain: 'ES', italy: 'IT', netherlands: 'NL', belgium: 'BE', switzerland: 'CH', sweden: 'SE', norway: 'NO',
  denmark: 'DK', poland: 'PL', portugal: 'PT', austria: 'AT', japan: 'JP', 'hong-kong': 'HK', mexico: 'MX', brazil: 'BR',
};

function countriesOf(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(',');
  return [...new Set(list.map((t) => COUNTRY[String(t).trim().replace(/^en:/, '')]).filter(Boolean))];
}

function isVolume(p) {
  const unit = String(p.product_quantity_unit || '').toLowerCase();
  if (unit) return unit === 'ml' || unit === 'l' || unit === 'cl';
  return /\b\d+(?:[.,]\d+)?\s*(ml|cl|l)\b/i.test(String(p.quantity || ''));
}

// Works for API products ({nutriments: {...}}) and flat CSV rows.
function mapProduct(p, exportVersion) {
  const n = p.nutriments || p;
  const g = (k) => num(n[k]);
  let kcal = g('energy-kcal_100g');
  const notes = {};
  if (kcal === null && g('energy_100g') !== null) {
    kcal = g('energy_100g') / 4.184; // energy_100g is in kJ
    notes.energy = 'kJ / 4.184';
  }
  const name = p.product_name || p.product_name_en || p.generic_name || '';
  const code = String(p.code || p._id || '').trim();
  if (!code || !name.trim() || kcal === null) return null;
  const protein = g('proteins_100g');
  const carbs = g('carbohydrates_100g');
  const fat = g('fat_100g');
  // Label numbers that do not add up are flagged rather than trusted.
  let review = false;
  if (protein !== null && carbs !== null && fat !== null) {
    const est = protein * 4 + carbs * 4 + fat * 9;
    if (Math.abs(est - kcal) > Math.max(60, kcal * 0.35)) {
      review = true;
      notes.check = 'Calories do not match the macros on the label';
    }
  }
  const basis = isVolume(p) ? 'mL' : 'g';
  const portions = [];
  const sq = num(p.serving_quantity);
  if (sq && sq > 0) portions.push({ label: p.serving_size ? `1 serving (${p.serving_size})` : '1 serving', amount: sq });
  const sodium = g('sodium_100g');
  return food({
    source: 'off',
    source_id: code,
    source_version: `off:${exportVersion || 'api'}`,
    source_url: `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`,
    name,
    brand: String(p.brands || '').split(',')[0] || null,
    barcode: code,
    countries: countriesOf(p.countries_tags),
    category: String(p.categories_tags || '').split(',').pop().replace(/^en:/, '') || null,
    basis,
    quality: 'label',
    kcal,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fibre_g: g('fiber_100g'),
    sugars_g: g('sugars_100g'),
    sodium_mg: sodium === null ? null : sodium * 1000,
    portions,
    needs_review: review,
    notes,
  });
}

function wanted(row, countries) {
  return !countries || countries.length === 0 || row.countries.some((c) => countries.includes(c));
}

async function* fromCsv(file, { countries, version, cursor }) {
  let header = null;
  let lineNo = 0;
  const skipTo = cursor ? cursor.line : 0;
  for await (const line of lines(file)) {
    lineNo++;
    if (!header) {
      header = line.split('\t');
      continue;
    }
    if (lineNo <= skipTo) continue;
    const cells = line.includes('"') && !line.includes('\t') ? splitCsv(line) : line.split('\t');
    const obj = {};
    header.forEach((h, i) => (obj[h] = cells[i]));
    obj.countries_tags = obj.countries_tags || obj.countries_en || '';
    const row = mapProduct(obj, version);
    if (row && wanted(row, countries)) yield { row, cursor: { line: lineNo } };
    else if (lineNo % 5000 === 0) yield { row: null, cursor: { line: lineNo } };
  }
}

async function* fromJsonl(file, { countries, version, cursor }) {
  let lineNo = 0;
  const skipTo = cursor ? cursor.line : 0;
  for await (const line of lines(file)) {
    lineNo++;
    if (lineNo <= skipTo || !line.trim()) continue;
    let p;
    try {
      p = JSON.parse(line);
    } catch (_) {
      continue;
    }
    const row = mapProduct(p, version);
    if (row && wanted(row, countries)) yield { row, cursor: { line: lineNo } };
    else if (lineNo % 5000 === 0) yield { row: null, cursor: { line: lineNo } };
  }
}

module.exports = { mapProduct, countriesOf, fromCsv, fromJsonl, COUNTRY };
