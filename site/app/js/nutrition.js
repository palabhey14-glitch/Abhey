// Nutrition maths shared by the coach and client screens: metric units,
// per-100 scaling, plan versions, planned vs actual, and adherence.
// Pure functions, no network or DOM: `node site/app/js/nutrition.test.js`.
//
// Rules: energy is Calories (kcal); amounts are g or mL (kg and L accepted
// on entry); a nutrient that is unknown stays null and is reported as
// unknown, never counted as zero.
(function (root) {
  'use strict';

  const NUTRIENTS = ['kcal', 'p', 'c', 'f', 'fibre'];
  const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const WEEKDAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday', all: 'Every day' };

  // How sure we are of a food's numbers, in plain words.
  const QUALITY = {
    reference: { label: 'Lab data', hint: 'Analysed values from a national food composition table' },
    label: { label: 'Label', hint: 'From the product label' },
    calculated: { label: 'Calculated', hint: 'Worked out from the ingredients' },
    estimate: { label: 'Estimate', hint: 'Your coach’s estimate' },
    self_reported: { label: 'Self-reported', hint: 'Typed in by hand' },
  };
  const SOURCES = { afcd: 'AFCD', usda: 'USDA', cofid: 'CoFID', off: 'Open Food Facts', recipe: 'Recipe', coach: 'Coach', client: 'Own entry' };

  const STATUS = {
    as_planned: 'Ate as planned',
    adjusted: 'Different amount',
    replaced: 'Ate something different',
    skipped: 'Skipped',
  };

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ------------------------------------------------------------------ units

  // Units a person may type. Ounces, pounds and cups are deliberately absent.
  const ENTRY_UNITS = { g: { base: 'g', factor: 1 }, kg: { base: 'g', factor: 1000 }, mL: { base: 'mL', factor: 1 }, L: { base: 'mL', factor: 1000 } };

  // Turns "1.2", "kg" into 1200 g. The unit must match the food's basis
  // (a food measured per 100 g is entered in g or kg).
  function toBase(value, unit, basis) {
    const v = num(value);
    const u = ENTRY_UNITS[unit];
    if (v === null || v <= 0) return { error: 'Enter an amount above zero.' };
    if (!u) return { error: 'Use g, kg, mL or L.' };
    if (basis && u.base !== basis) return { error: basis === 'g' ? 'This food is measured by weight: use g or kg.' : 'This food is measured by volume: use mL or L.' };
    const amount = Math.round(v * u.factor * 10) / 10;
    if (amount > 5000) return { error: `That is more than 5 ${u.base === 'g' ? 'kg' : 'L'}. Check the amount.` };
    return { amount, unit: u.base };
  }

  function entryUnitsFor(basis) {
    return basis === 'mL' ? ['mL', 'L'] : ['g', 'kg'];
  }

  function fmtNumber(v, dp) {
    return Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: dp === undefined ? 0 : dp });
  }

  // 250 -> "250 g", 1250 -> "1.25 kg", 330 mL -> "330 mL", 1500 mL -> "1.5 L".
  function formatAmount(amount, unit) {
    const a = num(amount);
    if (a === null) return '–';
    const u = unit === 'mL' ? 'mL' : 'g';
    if (a >= 1000) return `${fmtNumber(a / 1000, 2)} ${u === 'g' ? 'kg' : 'L'}`;
    return `${fmtNumber(a, a < 10 ? 1 : 0)} ${u}`;
  }

  function formatKcal(v) {
    const n = num(v);
    return n === null ? '– kcal' : `${fmtNumber(Math.round(n))} kcal`;
  }

  function formatGrams(v) {
    const n = num(v);
    return n === null ? '–' : `${fmtNumber(n, n < 10 ? 1 : 0)} g`;
  }

  // ------------------------------------------------------------ nutrition

  function per100Of(food) {
    if (!food) return { kcal: null, p: null, c: null, f: null, fibre: null };
    if (food.per100) return food.per100;
    return { kcal: num(food.kcal), p: num(food.protein_g), c: num(food.carbs_g), f: num(food.fat_g), fibre: num(food.fibre_g) };
  }

  // Nutrition for an amount of a food given per 100 g / 100 mL.
  function forAmount(per100, amount) {
    const a = num(amount) || 0;
    const out = {};
    for (const k of NUTRIENTS) {
      const v = num(per100 && per100[k]);
      out[k] = v === null ? null : Math.round(v * a) / 100;
    }
    return out;
  }

  function emptyTotal() {
    return { kcal: 0, p: 0, c: 0, f: 0, fibre: 0, unknown: { kcal: 0, p: 0, c: 0, f: 0, fibre: 0 }, items: 0, incomplete: 0 };
  }

  // Adds known values and counts unknown ones per nutrient.
  function sum(list) {
    const t = emptyTotal();
    for (const n of list) {
      t.items += 1;
      let missing = false;
      for (const k of NUTRIENTS) {
        const v = num(n[k]);
        if (v === null) {
          t.unknown[k] += 1;
          if (k !== 'fibre') missing = true;
        } else t[k] += v;
      }
      if (missing) t.incomplete += 1;
    }
    for (const k of NUTRIENTS) t[k] = Math.round(t[k] * 10) / 10;
    return t;
  }

  // A food_log_entries row already holds its per-portion values.
  function entryNutrition(e) {
    return { kcal: num(e.kcal), p: num(e.protein_g), c: num(e.carbs_g), f: num(e.fat_g), fibre: num(e.fibre_g) };
  }

  function itemNutrition(item) {
    return forAmount(item.per100, item.amount);
  }

  function mealPlanned(meal) {
    return sum(((meal && meal.items) || []).map(itemNutrition));
  }

  // ----------------------------------------------------------- plan versions

  function weekdayKey(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return WEEKDAYS[(new Date(y, m - 1, d).getDay() + 6) % 7];
  }

  // The assignment version in force on a day: the newest version whose
  // dates cover it.
  function assignmentFor(assignments, day) {
    let best = null;
    for (const a of assignments || []) {
      const ends = a.ends_on;
      if (a.starts_on <= day && (!ends || ends >= day) && (!ends || ends >= a.starts_on) && (!best || a.version > best.version)) best = a;
    }
    return best;
  }

  // The meals planned for a date ([] on a weekly plan's day off).
  function planDay(plan, day) {
    if (!plan || !plan.days) return null;
    const key = plan.schedule === 'weekly' ? weekdayKey(day) : 'all';
    return plan.days.find((d) => d.day === key) || null;
  }

  function planMeals(plan, day) {
    const d = planDay(plan, day);
    return d ? d.meals || [] : [];
  }

  // Daily targets: the coach's numbers if set, otherwise the plan's total.
  function targetsFor(assignment, day) {
    if (!assignment) return null;
    if (assignment.protein_g !== null && assignment.protein_g !== undefined) {
      return {
        calories: num(assignment.calories), protein_g: num(assignment.protein_g), carbs_g: num(assignment.carbs_g),
        fats_g: num(assignment.fats_g), fibre_g: num(assignment.fibre_g), from: 'targets',
      };
    }
    if (assignment.kind !== 'meal_plan') return null;
    const t = sum(planMeals(assignment.plan, day).map(mealPlanned));
    return { calories: Math.round(t.kcal), protein_g: Math.round(t.p), carbs_g: Math.round(t.c), fats_g: Math.round(t.f), fibre_g: Math.round(t.fibre), from: 'plan' };
  }

  // -------------------------------------------------------- planned vs actual

  // Everything about one client-day: each planned meal with its record,
  // extras, totals and adherence. The plan shown is the version in force
  // that day; meal records keep their own copy of what was planned.
  function dayReport({ assignments, day, mealLogs, entries }) {
    const assignment = assignmentFor(assignments, day);
    const isPlan = assignment && assignment.kind === 'meal_plan';
    const logsToday = (mealLogs || []).filter((l) => l.day === day);
    const entriesToday = (entries || []).filter((e) => e.day === day);
    const byLog = new Map();
    for (const e of entriesToday) {
      if (!e.meal_log_id) continue;
      if (!byLog.has(e.meal_log_id)) byLog.set(e.meal_log_id, []);
      byLog.get(e.meal_log_id).push(e);
    }

    const meals = (isPlan ? planMeals(assignment.plan, day) : []).map((meal) => {
      const log = logsToday.find((l) => l.assignment_id === assignment.id && l.meal_id === meal.id) || null;
      const eaten = log ? byLog.get(log.id) || [] : [];
      const planned = mealPlanned(meal);
      const actual = log ? sum(eaten.map(entryNutrition)) : null;
      return { meal, log, entries: eaten, planned, actual, status: log ? log.status : 'open' };
    });

    // Records made against an older version of today's plan still count.
    const shownLogs = new Set(meals.filter((m) => m.log).map((m) => m.log.id));
    const earlier = logsToday
      .filter((l) => !shownLogs.has(l.id))
      .map((log) => {
        const eaten = byLog.get(log.id) || [];
        return { meal: log.planned, log, entries: eaten, planned: mealPlanned(log.planned), actual: sum(eaten.map(entryNutrition)), status: log.status, earlier: true };
      });

    const extras = entriesToday.filter((e) => !e.meal_log_id);
    const actualTotal = sum(entriesToday.map(entryNutrition));
    const plannedTotal = sum(meals.map((m) => m.planned).map((t) => ({ kcal: t.kcal, p: t.p, c: t.c, f: t.f, fibre: t.fibre })));
    const target = targetsFor(assignment, day);
    return {
      day, assignment, isPlan, meals, earlier, extras, actualTotal, plannedTotal, target,
      adherence: adherence(meals, actualTotal, target),
      selfReported: entriesToday.filter((e) => e.quality === 'self_reported').length,
      needsReview: entriesToday.filter((e) => e.needs_review).length,
    };
  }

  // Adherence is about what was logged:
  //   meals: share of planned meals eaten as planned, or at a different
  //          amount within 10% of the planned Calories.
  //   kcal / protein: logged total as a share of the day's target.
  function adherence(meals, actualTotal, target) {
    const counts = { as_planned: 0, adjusted: 0, replaced: 0, skipped: 0, open: 0 };
    let onPlan = 0;
    for (const m of meals) {
      counts[m.status] += 1;
      if (m.status === 'as_planned') onPlan += 1;
      else if (m.status === 'adjusted' && m.planned.kcal > 0 && m.actual && Math.abs(m.actual.kcal - m.planned.kcal) / m.planned.kcal <= 0.1) onPlan += 1;
    }
    const logged = meals.length - counts.open;
    return {
      counts,
      planned: meals.length,
      logged,
      onPlan,
      mealScore: meals.length ? onPlan / meals.length : null,
      kcalRatio: target && target.calories ? actualTotal.kcal / target.calories : null,
      proteinRatio: target && target.protein_g ? actualTotal.p / target.protein_g : null,
      unknownItems: actualTotal.incomplete,
    };
  }

  // ---------------------------------------------------------------- recipes

  // Mirrors the database: a nutrient is known for the recipe only when it is
  // known for every ingredient. Per 100 g uses the cooked weight if weighed.
  function recipeNutrition(items, servings, cookedWeight) {
    const rows = (items || []).map((it) => forAmount(it.per100, it.amount));
    const ingredientWeight = (items || []).reduce((a, it) => a + (num(it.amount) || 0), 0);
    const total = {};
    for (const k of NUTRIENTS) total[k] = rows.length && rows.every((r) => r[k] !== null) ? rows.reduce((a, r) => a + r[k], 0) : null;
    const weight = num(cookedWeight) || ingredientWeight;
    const scale = (x) => (x === null || !weight ? null : Math.round((x / weight) * 100 * 100) / 100);
    const per100 = {};
    for (const k of NUTRIENTS) per100[k] = scale(total[k]);
    const sv = num(servings) || 1;
    const perServing = {};
    for (const k of NUTRIENTS) perServing[k] = total[k] === null ? null : Math.round((total[k] / sv) * 10) / 10;
    return { total, per100, perServing, weight, servingWeight: weight ? Math.round((weight / sv) * 10) / 10 : null, ingredientWeight };
  }

  // ------------------------------------------------------------- plan editing

  let idCounter = 0;
  function newId(prefix) {
    idCounter += 1;
    return `${prefix || 'x'}${Date.now().toString(36)}${idCounter.toString(36)}`;
  }

  function emptyPlan(schedule) {
    const meals = () => [
      { id: newId('m'), name: 'Breakfast', time: '07:30', items: [] },
      { id: newId('m'), name: 'Lunch', time: '12:30', items: [] },
      { id: newId('m'), name: 'Snack', time: '16:00', items: [] },
      { id: newId('m'), name: 'Dinner', time: '19:00', items: [] },
    ];
    return schedule === 'weekly'
      ? { schedule: 'weekly', days: WEEKDAYS.map((day) => ({ day, meals: meals() })) }
      : { schedule: 'daily', days: [{ day: 'all', meals: meals() }] };
  }

  // The part of a plan the database needs; it fills in the nutrition itself.
  function planForSave(plan) {
    return {
      schedule: plan.schedule,
      days: plan.days.map((d) => ({
        day: d.day,
        meals: d.meals.map((m) => ({
          id: m.id, name: m.name, time: m.time || null, note: m.note || null,
          items: m.items.map((it) => ({ id: it.id, food_id: it.food_id, amount: it.amount, portion: it.portion || null })),
        })),
      })),
    };
  }

  // Calories from macros (Australian label factors: fibre counts 2 kcal/g
  // because carbs here exclude fibre).
  function macroKcal(m) {
    return Math.round(((Number(m.p) || 0) * 4 + (Number(m.c) || 0) * 4 + (Number(m.f) || 0) * 9 + (Number(m.fibre) || 0) * 2) * 10) / 10;
  }

  // A "macros only" meal is stored as a food plus an amount whose product is
  // the totals typed in. The amount grows past 100 g only when a total would
  // break the per-100 g limits foods are held to.
  const PER100_LIMITS = { kcal: 1000, p: 100, c: 130, f: 100, fibre: 100 };
  function macroOnlyFood(m) {
    const totals = { kcal: macroKcal(m), p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0, fibre: Number(m.fibre) || 0 };
    const need = Math.max(...Object.keys(PER100_LIMITS).map((k) => totals[k] / PER100_LIMITS[k]));
    const amount = Math.max(100, Math.ceil(need * 100));
    const per100 = {};
    for (const k of Object.keys(totals)) per100[k] = Math.round((totals[k] * 10000) / amount) / 100;
    return { amount, per100, totals };
  }

  const api = {
    macroKcal, macroOnlyFood,
    NUTRIENTS, WEEKDAYS, WEEKDAY_NAMES, QUALITY, SOURCES, STATUS, ENTRY_UNITS,
    toBase, entryUnitsFor, formatAmount, formatKcal, formatGrams,
    per100Of, forAmount, sum, entryNutrition, itemNutrition, mealPlanned,
    weekdayKey, assignmentFor, planDay, planMeals, targetsFor, dayReport, adherence,
    recipeNutrition, newId, emptyPlan, planForSave,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredNutrition = api;
})(typeof window !== 'undefined' ? window : globalThis);
