// McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID),
// UK, 2021 edition (Open Government Licence v3.0; see the user guide for
// values supplied by third parties).
//
//   --file "McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021.xlsx"
//
// Reads the "Proximates" sheet (and sodium from "Inorganics"). Values are per
// 100 g. In CoFID "Tr" means a trace (stored as 0 and noted) and "N" means
// present but not measured (stored as unknown). Carbohydrate is available
// carbohydrate; fibre is AOAC fibre, or NSP when AOAC is missing (noted).
'use strict';
const { openWorkbook } = require('../lib/xlsx');
const { food, num } = require('../lib/food');

const SOURCE_VERSION = 'cofid:2021';
const PAGE = 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid';

const HEADERS = {
  code: /^food code$/i,
  name: /^food name$/i,
  group: /^group$/i,
  kcal: /^energy \(kcal\)/i,
  kj: /^energy \(kj\)/i,
  protein_g: /^protein/i,
  fat_g: /^fat\b/i,
  carbs_g: /^carbohydrate/i,
  aoac: /^aoac fibre/i,
  nsp: /^nsp\b/i,
  sugars_g: /^total sugars/i,
};

function mapHeader(header, headers) {
  const idx = {};
  header.forEach((h, i) => {
    const t = String(h || '').replace(/\s+/g, ' ').trim();
    for (const [k, re] of Object.entries(headers)) if (idx[k] === undefined && re.test(t)) idx[k] = i;
  });
  return idx;
}

// "Tr" -> 0 (trace), "N" / "" -> null (not measured).
function value(v, field, traces) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (/^tr$/i.test(s)) {
    traces.push(field);
    return 0;
  }
  if (/^n$/i.test(s) || s === '') return null;
  return num(s.replace(/[()]/g, ''));
}

function findHeader(rows) {
  return rows.findIndex((r) => r.some((c) => /^food code$/i.test(String(c || '').trim())));
}

function* fromXlsx(file, cursor) {
  const wb = openWorkbook(file);
  const names = wb.sheetNames();
  const prox = names.find((n) => /proximates/i.test(n));
  if (!prox) throw new Error(`No Proximates sheet. Sheets: ${names.join(', ')}`);
  const rows = wb.rows(prox);
  const h = findHeader(rows);
  if (h < 0) throw new Error('No "Food Code" header in the Proximates sheet');
  const idx = mapHeader(rows[h], HEADERS);
  for (const k of ['code', 'name', 'protein_g', 'fat_g', 'carbs_g']) if (idx[k] === undefined) throw new Error(`CoFID column for ${k} not found`);

  const sodium = new Map();
  const inorg = names.find((n) => /inorganics/i.test(n));
  if (inorg) {
    const ir = wb.rows(inorg);
    const ih = findHeader(ir);
    if (ih >= 0) {
      const ii = mapHeader(ir[ih], { code: /^food code$/i, na: /^sodium/i });
      if (ii.na !== undefined) for (const r of ir.slice(ih + 1)) sodium.set(String(r[ii.code] || '').trim(), r[ii.na]);
    }
  }

  for (let i = cursor ? cursor.row + 1 : h + 1; i < rows.length; i++) {
    const r = rows[i];
    const code = String(r[idx.code] || '').trim();
    if (!/^\d{2}-\d{3}/.test(code)) continue;
    const traces = [];
    const get = (k) => (idx[k] === undefined ? null : value(r[idx[k]], k, traces));
    let kcal = get('kcal');
    const notes = { carbs: 'available carbohydrate (monosaccharide equivalent)' };
    if (kcal === null && get('kj') !== null) {
      kcal = get('kj') / 4.184;
      notes.energy = 'kJ / 4.184';
    }
    let fibre = get('aoac');
    if (fibre === null && get('nsp') !== null) {
      fibre = get('nsp');
      notes.fibre = 'NSP (Englyst); AOAC not reported';
    }
    const na = sodium.has(code) ? value(sodium.get(code), 'sodium_mg', traces) : null;
    const protein = get('protein_g');
    const carbs = get('carbs_g');
    const fat = get('fat_g');
    const sugars = get('sugars_g');
    if (traces.length) notes.trace = [...new Set(traces)].filter((t) => t !== 'kj' && t !== 'aoac' && t !== 'nsp');
    const row = food({
      source: 'cofid',
      source_id: code,
      source_version: SOURCE_VERSION,
      source_url: PAGE,
      name: r[idx.name],
      category: idx.group !== undefined ? r[idx.group] : null,
      countries: ['GB'],
      basis: 'g',
      quality: 'reference',
      kcal,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fibre_g: fibre,
      sugars_g: sugars,
      sodium_mg: na,
      notes,
    });
    if (row) yield { row, cursor: { row: i } };
  }
}

module.exports = { fromXlsx, value, SOURCE_VERSION };
