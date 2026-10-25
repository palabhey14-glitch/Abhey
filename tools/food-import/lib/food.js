// Turns a source record into a row for public.foods, with the same limits
// the database enforces. Values that are missing or implausible become null
// (unknown) and the row is flagged; nothing is set to zero to fill a gap.
'use strict';

const LIMITS = { kcal: 1000, protein_g: 100, carbs_g: 130, fat_g: 100, fibre_g: 100, sugars_g: 100, sodium_mg: 100000 };
const NUTRIENT_KEYS = Object.keys(LIMITS);

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round(v, dp) {
  if (v === null) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

const BAD_PORTION = /\b(oz|ounces?|lbs?|pounds?)\b/i;

function food(input) {
  const notes = { ...(input.notes || {}) };
  const row = {
    source: input.source,
    source_id: String(input.source_id),
    source_version: input.source_version || null,
    source_url: input.source_url || null,
    name: String(input.name || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    brand: input.brand ? String(input.brand).replace(/\s+/g, ' ').trim().slice(0, 120) || null : null,
    barcode: input.barcode && /^[0-9]{6,14}$/.test(String(input.barcode)) ? String(input.barcode) : null,
    countries: [...new Set((input.countries || []).filter((c) => /^[A-Z]{2}$/.test(c)))],
    category: input.category ? String(input.category).slice(0, 120) : null,
    basis: input.basis === 'mL' ? 'mL' : 'g',
    quality: input.quality,
    portions: (input.portions || [])
      .filter((p) => p && p.label && num(p.amount) > 0 && num(p.amount) <= 5000 && !BAD_PORTION.test(p.label))
      .slice(0, 30)
      .map((p) => ({ label: String(p.label).slice(0, 60), amount: round(num(p.amount), 1) })),
    needs_review: Boolean(input.needs_review),
    retired_at: null,
  };
  const dropped = [];
  for (const k of NUTRIENT_KEYS) {
    let v = num(input[k]);
    if (v !== null && (v < 0 || v > LIMITS[k])) {
      dropped.push(k);
      v = null;
    }
    row[k] = round(v, 2);
  }
  if (dropped.length) {
    notes.out_of_range = dropped;
    row.needs_review = true;
  }
  row.notes = Object.keys(notes).length ? notes : null;
  if (!row.name) return null;
  return row;
}

function isComplete(row) {
  return row.kcal !== null && row.protein_g !== null && row.carbs_g !== null && row.fat_g !== null;
}

module.exports = { food, num, round, isComplete, NUTRIENT_KEYS };
