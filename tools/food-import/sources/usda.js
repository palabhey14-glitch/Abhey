// USDA FoodData Central: Foundation Foods and SR Legacy (CC0).
//
//   --api --dataset foundation|sr_legacy   pages through /v1/foods/list with
//       FDC_API_KEY (free key: https://fdc.nal.usda.gov/api-key-signup).
//       Resumes from the last saved page.
//   --file <FoodData_Central_*_json_*.zip | .json>   the bulk JSON download.
// Values are per 100 g. Energy: kcal (208), else Atwater specific (958) or
// general (957), else kJ (268) / 4.184. Carbohydrate is stored as available
// carbohydrate (by difference minus total dietary fibre) when fibre is known.
'use strict';
const fs = require('node:fs');
const { openZip } = require('../lib/zip');
const { food, num } = require('../lib/food');

const DATASETS = { foundation: 'Foundation', sr_legacy: 'SR Legacy' };
// Old NDB nutrient numbers (list endpoint) and new ids (full JSON), by field.
const CODES = {
  kcal: ['208', '1008'],
  atwater_specific: ['958', '2048'],
  atwater_general: ['957', '2047'],
  kj: ['268', '1062'],
  protein_g: ['203', '1003'],
  fat_g: ['204', '1004'],
  carbs_total: ['205', '1005'],
  fibre_g: ['291', '1079'],
  sugars_g: ['269', '2000'],
  sodium_mg: ['307', '1093'],
};

function nutrientMap(list) {
  const out = {};
  for (const n of list || []) {
    const number = String(n.number || (n.nutrient && n.nutrient.number) || '');
    const amount = num(n.amount);
    if (amount === null) continue;
    for (const [field, codes] of Object.entries(CODES)) if (codes.includes(number) && out[field] === undefined) out[field] = amount;
  }
  return out;
}

function mapFood(item, dataset) {
  const n = nutrientMap(item.foodNutrients);
  const notes = {};
  let kcal = n.kcal;
  if (kcal === undefined) {
    if (n.atwater_specific !== undefined) {
      kcal = n.atwater_specific;
      notes.energy = 'Atwater specific factors';
    } else if (n.atwater_general !== undefined) {
      kcal = n.atwater_general;
      notes.energy = 'Atwater general factors';
    } else if (n.kj !== undefined) {
      kcal = n.kj / 4.184;
      notes.energy = 'kJ / 4.184';
    }
  }
  let carbs = n.carbs_total === undefined ? null : n.carbs_total;
  if (carbs !== null && carbs < 0 && carbs > -2) {
    // "By difference" dips just below zero for some meats and fish.
    carbs = 0;
    notes.carbs_negative = n.carbs_total;
  }
  if (carbs !== null && n.fibre_g !== undefined) {
    carbs = Math.max(0, carbs - n.fibre_g);
    notes.carbs = 'available (by difference minus fibre)';
  } else if (carbs !== null) notes.carbs = 'total by difference (fibre not reported)';
  const portions = (item.foodPortions || [])
    .filter((p) => num(p.gramWeight) > 0)
    .map((p) => {
      const unit = (p.measureUnit && p.measureUnit.name !== 'undetermined' && p.measureUnit.name) || '';
      const label = [num(p.amount) || 1, unit, p.modifier || p.portionDescription || ''].join(' ').replace(/\s+/g, ' ').trim();
      return { label, amount: num(p.gramWeight) };
    });
  return food({
    source: 'usda',
    source_id: item.fdcId,
    source_version: `${dataset}:${item.publicationDate || ''}`,
    source_url: `https://fdc.nal.usda.gov/food-details/${item.fdcId}/nutrients`,
    name: item.description,
    category: (item.foodCategory && item.foodCategory.description) || null,
    countries: ['US'],
    basis: 'g',
    quality: 'reference',
    kcal,
    protein_g: n.protein_g,
    carbs_g: carbs,
    fat_g: n.fat_g,
    fibre_g: n.fibre_g,
    sugars_g: n.sugars_g,
    sodium_mg: n.sodium_mg,
    portions,
    notes,
  });
}

// Bulk JSON: a zip (or .json) holding {"FoundationFoods": [...]} or
// {"SRLegacyFoods": [...]}; saved list pages ({data: [...]}) also work.
function* fromFile(file, dataset, cursor) {
  let text;
  if (/\.zip$/i.test(file)) {
    const zip = openZip(file);
    const name = zip.names().find((n) => /\.json$/i.test(n));
    text = zip.read(name).toString('utf8');
  } else text = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(text);
  const list = Array.isArray(json) ? json : json.FoundationFoods || json.SRLegacyFoods || json.SurveyFoods || json.data || [];
  for (let i = cursor ? cursor.index + 1 : 0; i < list.length; i++) {
    const row = mapFood(list[i], dataset);
    if (row) yield { row, cursor: { index: i } };
  }
}

async function* fromApi(fetchJson, { apiKey, dataset, cursor, pageSize = 200 }) {
  if (!apiKey) throw new Error('Set FDC_API_KEY (free key at https://fdc.nal.usda.gov/api-key-signup).');
  const type = DATASETS[dataset];
  if (!type) throw new Error('Use --dataset foundation or --dataset sr_legacy');
  for (let page = cursor ? cursor.page + 1 : 1; ; page++) {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/list?dataType=${encodeURIComponent(type)}&pageSize=${pageSize}&pageNumber=${page}&api_key=${encodeURIComponent(apiKey)}`;
    const list = await fetchJson(url);
    if (!Array.isArray(list) || !list.length) return;
    for (let i = 0; i < list.length; i++) {
      const row = mapFood(list[i], dataset);
      // The cursor only moves on at the end of a page, so a resume re-reads
      // at most one page (upserts make that harmless).
      if (row) yield { row, cursor: i === list.length - 1 ? { page } : { page: page - 1 } };
    }
    if (list.length < pageSize) return;
  }
}

module.exports = { mapFood, nutrientMap, fromFile, fromApi, DATASETS };
