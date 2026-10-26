// Run with: node site/app/js/nutrition.test.js
const assert = require('node:assert/strict');
const N = require('./nutrition.js');

// Units: metric only, matched to the food's basis
assert.deepEqual(N.toBase('1.2', 'kg', 'g'), { amount: 1200, unit: 'g' });
assert.deepEqual(N.toBase(330, 'mL', 'mL'), { amount: 330, unit: 'mL' });
assert.deepEqual(N.toBase(1.5, 'L', 'mL'), { amount: 1500, unit: 'mL' });
assert.ok(N.toBase(8, 'oz', 'g').error, 'ounces are not accepted');
assert.ok(N.toBase(1, 'lb', 'g').error, 'pounds are not accepted');
assert.ok(N.toBase(200, 'mL', 'g').error, 'volume for a weight-based food is refused');
assert.ok(N.toBase(0, 'g', 'g').error);
assert.ok(N.toBase(6, 'kg', 'g').error, 'more than 5 kg is refused');
assert.equal(N.formatAmount(250, 'g'), '250 g');
assert.equal(N.formatAmount(1250, 'g'), '1.25 kg');
assert.equal(N.formatAmount(1500, 'mL'), '1.5 L');
assert.equal(N.formatKcal(1234.4), '1,234 kcal');
assert.equal(N.formatKcal(null), '– kcal');

// Per-100 scaling and unknown values
const oats = { kcal: 380, p: 13, c: 60, f: 7, fibre: 10 };
assert.deepEqual(N.forAmount(oats, 80), { kcal: 304, p: 10.4, c: 48, f: 5.6, fibre: 8 });
const bar = { kcal: 400, p: null, c: null, f: 15, fibre: null };
const t = N.sum([N.forAmount(oats, 80), N.forAmount(bar, 50)]);
assert.equal(t.kcal, 504);
assert.equal(t.p, 10.4, 'unknown protein is not added as zero');
assert.equal(t.unknown.p, 1);
assert.equal(t.incomplete, 1);

// Plan versions and days
const plan = {
  schedule: 'weekly',
  days: [
    { day: 'mon', meals: [{ id: 'b', name: 'Breakfast', items: [{ id: 'b1', amount: 80, per100: oats }] }] },
    { day: 'tue', meals: [] },
  ],
};
assert.equal(N.weekdayKey('2026-10-26'), 'mon');
assert.equal(N.planMeals(plan, '2026-10-26').length, 1);
assert.equal(N.planMeals(plan, '2026-10-27').length, 0);
assert.equal(N.planMeals(plan, '2026-10-28').length, 0, 'no plan on a day the weekly plan leaves out');
const v1 = { id: 'v1', version: 1, kind: 'meal_plan', plan, starts_on: '2026-10-01', ends_on: '2026-10-26', protein_g: null };
const v2 = { id: 'v2', version: 2, kind: 'macros', plan: null, starts_on: '2026-10-27', ends_on: null, protein_g: 170, carbs_g: 260, fats_g: 75, fibre_g: null, calories: 2395 };
const replacedBeforeStart = { id: 'v0', version: 3, kind: 'macros', starts_on: '2026-11-10', ends_on: '2026-11-09', protein_g: 1 };
assert.equal(N.assignmentFor([v1, v2], '2026-10-26').id, 'v1');
assert.equal(N.assignmentFor([v1, v2], '2026-10-27').id, 'v2');
assert.equal(N.assignmentFor([v1, v2], '2026-09-30'), null);
assert.equal(N.assignmentFor([v1, v2, replacedBeforeStart], '2026-11-10').id, 'v2', 'a version replaced before it began never applies');
assert.equal(N.targetsFor(v2, '2026-10-27').calories, 2395);
assert.equal(N.targetsFor(v1, '2026-10-26').calories, 304, 'no targets: the plan total is the target');
assert.equal(N.targetsFor(v1, '2026-10-26').from, 'plan');

// Planned vs actual for one day
const day = '2026-10-26';
const lunchPlan = { id: 'l', name: 'Lunch', items: [{ id: 'l1', amount: 200, per100: { kcal: 130, p: 2.7, c: 28, f: 0.3, fibre: 0.4 } }] };
const p2 = { schedule: 'daily', days: [{ day: 'all', meals: [plan.days[0].meals[0], lunchPlan, { id: 'd', name: 'Dinner', items: [] }] }] };
const a = { id: 'a', version: 1, kind: 'meal_plan', plan: p2, starts_on: '2026-10-01', ends_on: null, protein_g: 180, carbs_g: 220, fats_g: 70, fibre_g: 30, calories: 2290 };
const mealLogs = [
  { id: 'ml1', day, assignment_id: 'a', meal_id: 'b', status: 'adjusted', planned: plan.days[0].meals[0] },
  { id: 'ml2', day, assignment_id: 'a', meal_id: 'l', status: 'skipped', planned: lunchPlan },
  { id: 'ml9', day, assignment_id: 'old', meal_id: 'x', status: 'as_planned', planned: { id: 'x', name: 'Old snack', items: [] } },
];
const entries = [
  { id: 'e1', day, meal_log_id: 'ml1', kcal: 323, protein_g: 11.1, carbs_g: 51, fat_g: 6, fibre_g: 8.5, quality: 'reference' },
  { id: 'e2', day, meal_log_id: null, kcal: 114, protein_g: 1.4, carbs_g: 24, fat_g: 0.4, fibre_g: 3.1, quality: 'reference' },
  { id: 'e3', day, meal_log_id: null, kcal: 90, protein_g: null, carbs_g: null, fat_g: null, fibre_g: null, quality: 'self_reported', needs_review: true },
  { id: 'e4', day: '2026-10-25', meal_log_id: null, kcal: 999 },
];
const r = N.dayReport({ assignments: [a], day, mealLogs, entries });
assert.equal(r.meals.length, 3);
assert.equal(r.meals[0].status, 'adjusted');
assert.equal(r.meals[0].planned.kcal, 304);
assert.equal(r.meals[0].actual.kcal, 323);
assert.equal(r.meals[1].status, 'skipped');
assert.equal(r.meals[1].actual.kcal, 0, 'a skipped meal adds nothing');
assert.equal(r.meals[2].status, 'open');
assert.equal(r.earlier.length, 1, 'a record against an older version is still shown');
assert.equal(r.extras.length, 2);
assert.equal(r.actualTotal.kcal, 323 + 114 + 90, 'other days are not counted');
assert.equal(r.actualTotal.incomplete, 1);
assert.equal(r.plannedTotal.kcal, 304 + 260);
assert.equal(r.target.calories, 2290);
assert.equal(r.selfReported, 1);
assert.equal(r.needsReview, 1);
// 323 vs 304 planned is within 10%, so breakfast counts as on plan; lunch skipped, dinner open
assert.equal(r.adherence.onPlan, 1);
assert.equal(r.adherence.logged, 2);
assert.equal(r.adherence.mealScore, 1 / 3);
assert.equal(Math.round(r.adherence.kcalRatio * 1000) / 1000, Math.round((527 / 2290) * 1000) / 1000);

// Macro-only client: no meals, a normal food log
const m = N.dayReport({ assignments: [v2], day: '2026-10-28', mealLogs: [], entries: [{ day: '2026-10-28', kcal: 500, protein_g: 40, carbs_g: 50, fat_g: 10, fibre_g: 5 }] });
assert.equal(m.isPlan, false);
assert.equal(m.meals.length, 0);
assert.equal(m.actualTotal.kcal, 500);
assert.equal(m.adherence.mealScore, null);
assert.equal(m.target.protein_g, 170);

// Recipes: whole, per serving, per 100 g of the finished dish
const rec = N.recipeNutrition(
  [
    { amount: 300, per100: { kcal: 130, p: 2.7, c: 28, f: 0.3, fibre: 0.4 } },
    { amount: 250, per100: { kcal: 165, p: 31, c: 0, f: 3.6, fibre: 0 } },
  ],
  2,
  500,
);
assert.equal(rec.total.kcal, 802.5);
assert.equal(rec.per100.kcal, 160.5);
assert.equal(rec.perServing.kcal, 401.3);
assert.equal(rec.servingWeight, 250);
const rec2 = N.recipeNutrition([{ amount: 100, per100: oats }, { amount: 40, per100: bar }], 1);
assert.equal(rec2.total.p, null, 'an unknown ingredient value makes the recipe value unknown');
assert.equal(rec2.total.kcal, 540);
assert.equal(rec2.weight, 140, 'without a cooked weight, the ingredient weight is used');

// Plans sent to the database carry ids and amounts only
const ep = N.emptyPlan('weekly');
assert.equal(ep.days.length, 7);
ep.days[0].meals[0].items.push({ id: 'i1', food_id: 'f', amount: 50, name: 'x', per100: oats });
const saved = N.planForSave(ep);
assert.deepEqual(Object.keys(saved.days[0].meals[0].items[0]).sort(), ['amount', 'food_id', 'id', 'portion']);

console.log('nutrition tests passed');

// Macros only: Calories from macros, stored as a food plus an amount
assert.equal(N.macroKcal({ p: 40, c: 60, f: 20, fibre: 10 }), 40 * 4 + 60 * 4 + 20 * 9 + 10 * 2);
assert.equal(N.macroKcal({ p: 30 }), 120);
{
  const small = N.macroOnlyFood({ p: 40, c: 60, f: 20, fibre: 10 });
  assert.equal(small.amount, 100, 'an ordinary meal is stored as 100 g');
  assert.equal(small.per100.kcal, 600);
  const big = N.macroOnlyFood({ p: 90, c: 250, f: 80, fibre: 20 });
  assert.ok(big.amount > 100, 'a big meal grows the amount to stay within per-100 g limits');
  for (const [k, lim] of Object.entries({ kcal: 1000, p: 100, c: 130, f: 100, fibre: 100 })) assert.ok(big.per100[k] <= lim, k);
  assert.ok(Math.abs((big.per100.c * big.amount) / 100 - 250) < 0.5, 'totals survive the round trip');
  assert.ok(Math.abs((big.per100.kcal * big.amount) / 100 - N.macroKcal({ p: 90, c: 250, f: 80, fibre: 20 })) < 1);
}
