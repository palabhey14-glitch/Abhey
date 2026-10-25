// POST /.netlify/functions/recipe-import  {"url": "...", "country": "AU"}
// Signed-in users only. Fetches one page the user supplied (never crawls),
// reads its Schema.org Recipe data, parses each ingredient line and suggests
// matching foods for the user to confirm. Nothing is saved here; the app
// saves the recipe after the user has checked it.
'use strict';
const { json, requireUser, rest } = require('../lib/supabase');
const { safeFetch } = require('../lib/safe-fetch');
const { extractRecipe } = require('../lib/recipe-jsonld');
const { parseLine } = require('../../site/app/js/ingredients');

const words = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);

// Confident only when every word of the ingredient appears in the food name.
function matchConfidence(ingredientName, foodName) {
  const a = words(ingredientName);
  const b = words(foodName);
  if (!a.length) return 0;
  // "chillies" matches "chilli", "tomatoes" matches "tomato".
  const same = (x, y) => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
  const hit = a.filter((w) => b.some((v) => same(w, v))).length;
  return hit / a.length;
}

async function handler(event, _context, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST' });
    const { token } = await requireUser(event, fetchImpl);
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (_) {
      return json(400, { error: 'Send JSON' });
    }
    const country = /^[A-Z]{2}$/.test(body.country || '') ? body.country : 'AU';
    const page = await (deps.safeFetch || safeFetch)(body.url);
    const recipe = extractRecipe(page.body, page.url);
    if (!recipe) return json(422, { error: 'This page has no recipe data we can read. Add the ingredients by hand instead.' });
    if (!recipe.ingredients.length) return json(422, { error: 'This recipe lists no ingredients we can read.' });

    const ingredients = [];
    for (const line of recipe.ingredients) {
      const parsed = parseLine(line);
      let candidates = [];
      if (parsed.name && !/^(salt|pepper|water|ice)\b/i.test(parsed.name)) {
        candidates = await rest('/rpc/food_search', { method: 'POST', body: { q: parsed.name, country, lim: 4 }, token }, fetchImpl);
      }
      const best = candidates[0];
      const confidence = best ? matchConfidence(parsed.name, best.name) : 0;
      ingredients.push({
        ...parsed,
        candidates: candidates.map((f) => ({
          id: f.id, name: f.name, brand: f.brand, source: f.source, quality: f.quality, basis: f.basis, complete: f.complete,
          kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fibre_g: f.fibre_g, portions: f.portions,
        })),
        match: best && confidence === 1 && !parsed.uncertain ? 'confirmed' : 'uncertain',
      });
    }
    return json(200, { recipe: { name: recipe.name, servings: recipe.servings, source_url: recipe.source_url, source_name: recipe.publisher, source_author: recipe.author }, ingredients });
  } catch (err) {
    return json(err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
  }
}

exports.handler = (event, context) => handler(event, context);
exports._handler = handler;
exports.matchConfidence = matchConfidence;
