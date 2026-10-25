// Australian Food Composition Database (FSANZ), Release 3.
//
// Two ways in:
//   --file "AFCD Release 3 - Nutrient profiles.xlsx"   the official download
//   --api                                              the per-nutrient JSON the
//       AFCD search pages use. It is not a documented API, so prefer the file.
// Both give values per 100 g. Energy is "with dietary fibre" in kJ, turned
// into kcal (kJ / 4.184). Carbohydrate is available carbohydrate.
'use strict';
const { openWorkbook } = require('../lib/xlsx');
const { food, num } = require('../lib/food');

const SOURCE_VERSION = 'afcd:release3';
const API = 'https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/search/api/nutrients/';
const API_NUTRIENTS = { kj: 'ENERGY - AHS', protein_g: 'PROT', fat_g: 'FAT', carbs_g: 'AVAILCHO', fibre_g: 'AOACDFTOTW' };
const PAGE = 'https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd';

function toRow(key, v) {
  const kj = num(v.kj);
  return food({
    source: 'afcd',
    source_id: key,
    source_version: SOURCE_VERSION,
    source_url: PAGE,
    name: v.name,
    category: v.category || null,
    countries: ['AU'],
    basis: 'g',
    quality: 'reference',
    kcal: kj === null ? null : kj / 4.184,
    protein_g: v.protein_g,
    carbs_g: v.carbs_g,
    fat_g: v.fat_g,
    fibre_g: v.fibre_g,
    sugars_g: v.sugars_g,
    sodium_mg: v.sodium_mg,
    notes: { energy: 'kJ with dietary fibre / 4.184', carbs: 'available carbohydrate', ...(v.inclusions ? { also_known_as: v.inclusions } : {}) },
  });
}

const HEADERS = {
  key: /^public food key/i,
  name: /^food name/i,
  category: /^classification name/i,
  kj: /^energy,? with dietary fibre/i,
  protein_g: /^protein/i,
  fat_g: /^fat,? total/i,
  carbs_g: /^available carbohydrate,? with sugar alcohols|^available carbohydrate/i,
  fibre_g: /^total dietary fibre/i,
  sugars_g: /^total sugars/i,
  sodium_mg: /^sodium/i,
};

function mapHeader(header) {
  const idx = {};
  header.forEach((h, i) => {
    const t = String(h || '').replace(/\s+/g, ' ').trim();
    for (const [k, re] of Object.entries(HEADERS)) if (idx[k] === undefined && re.test(t)) idx[k] = i;
  });
  return idx;
}

function* fromXlsx(file, cursor) {
  const wb = openWorkbook(file);
  const sheet = wb.sheetNames().find((n) => /per 100 ?g/i.test(n)) || wb.sheetNames()[0];
  const rows = wb.rows(sheet);
  const h = rows.findIndex((r) => r.some((c) => /^public food key$/i.test(String(c || '').trim())));
  if (h < 0) throw new Error(`No "Public Food Key" header in sheet "${sheet}"`);
  const idx = mapHeader(rows[h]);
  for (const k of ['key', 'name', 'kj', 'protein_g', 'fat_g', 'carbs_g']) if (idx[k] === undefined) throw new Error(`AFCD column for ${k} not found`);
  const start = cursor ? cursor.row + 1 : h + 1;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const key = String(r[idx.key] || '').trim();
    if (!/^F\d{6}$/.test(key)) continue;
    const v = {};
    for (const k of Object.keys(HEADERS)) if (idx[k] !== undefined) v[k] = r[idx[k]];
    yield { row: toRow(key, v), cursor: { row: i } };
  }
}

async function* fromApi(fetchJson, cursor) {
  const merged = new Map();
  for (const [field, id] of Object.entries(API_NUTRIENTS)) {
    const data = await fetchJson(API + encodeURIComponent(id));
    for (const f of data.foods || []) {
      if (!merged.has(f.pfk)) merged.set(f.pfk, { name: f.name, inclusions: f.inclusions });
      merged.get(f.pfk)[field] = f.value_per_100;
    }
  }
  const all = [...merged.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (let i = cursor ? cursor.row + 1 : 0; i < all.length; i++) yield { row: toRow(all[i][0], all[i][1]), cursor: { row: i } };
}

module.exports = { fromXlsx, fromApi, toRow, mapHeader, SOURCE_VERSION };
