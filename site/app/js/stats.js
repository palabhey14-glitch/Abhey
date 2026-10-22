// Calculations that the client workbook did with formulas: week numbers,
// weekly averages, adherence and progress to goal. Pure functions, no
// network or DOM, so they can be tested with `node site/app/js/stats.test.js`.
(function (root) {
  'use strict';

  const WEEKS = 12;
  const DAY_MS = 86400000;

  // Dates are handled as 'YYYY-MM-DD' strings in local time, so a log made at
  // 11pm in Sydney never slips into the next or previous day.
  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function today() {
    return toISO(new Date());
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function addDays(iso, n) {
    const t = new Date(parseISO(iso) + n * DAY_MS);
    return t.toISOString().slice(0, 10);
  }

  function daysBetween(fromISO, toISO_) {
    return Math.round((parseISO(toISO_) - parseISO(fromISO)) / DAY_MS);
  }

  // Week 1 is the 7 days from the start date. Returns null outside the program.
  function weekOf(startDate, day) {
    if (!startDate || !day) return null;
    const diff = daysBetween(startDate, day);
    if (diff < 0) return null;
    const week = Math.floor(diff / 7) + 1;
    return week <= WEEKS ? week : null;
  }

  // The program week for "now", clamped to 1..12 (0 before the start).
  function currentWeek(startDate, now) {
    if (!startDate) return 0;
    const diff = daysBetween(startDate, now || today());
    if (diff < 0) return 0;
    return Math.min(WEEKS, Math.floor(diff / 7) + 1);
  }

  function weekDates(startDate, week) {
    const first = addDays(startDate, (week - 1) * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
  }

  function num(v) {
    return v === null || v === undefined || v === '' ? null : Number(v);
  }

  // Same as the workbook's AVERAGEIF(range, ">0").
  function avgPositive(values) {
    const xs = values.map(num).filter((v) => v !== null && v > 0);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }

  // Coach sets Monday's macros; later weeks follow until changed.
  function macrosForWeek(macroRows, week) {
    let best = null;
    for (const row of macroRows || []) {
      if (row.week_number <= week && (!best || row.week_number > best.week_number)) best = row;
    }
    return best;
  }

  const MEAL_PLAN_SCORE = { Yes: 1, Partly: 0.5, No: 0 };

  function weekStats(ctx, week) {
    const { profile, targets, macros } = ctx;
    const dates = new Set(weekDates(profile.start_date, week));
    const logs = (ctx.logs || []).filter((l) => dates.has(l.day));
    const macro = macrosForWeek(macros, week);

    const avgWeight = avgPositive(logs.map((l) => l.weight_kg));
    const avgSteps = avgPositive(logs.map((l) => l.steps));
    const avgCardio = avgPositive(logs.map((l) => l.cardio_min));
    const avgCalories = avgPositive(logs.map((l) => l.calories));
    const avgProtein = avgPositive(logs.map((l) => l.protein_g));
    const avgCarbs = avgPositive(logs.map((l) => l.carbs_g));
    const avgFats = avgPositive(logs.map((l) => l.fats_g));
    const avgFibre = avgPositive(logs.map((l) => l.fibre_g));
    const sessions = logs.filter((l) => l.trained === 'Yes').length;
    const foodDays = logs.filter((l) => num(l.calories) !== null).length;
    const mealPlanDays = logs.filter((l) => l.meal_plan in MEAL_PLAN_SCORE);
    const mealPlanScore = mealPlanDays.length
      ? mealPlanDays.reduce((a, l) => a + MEAL_PLAN_SCORE[l.meal_plan], 0) / mealPlanDays.length
      : null;

    // Workbook Check-In "ADHERENCE (AUTO)": the average of food, training
    // and steps, each capped at 100%.
    let adherence = null;
    if (foodDays > 0 || sessions > 0 || avgSteps) {
      const food = profile.nutrition_tracking === 'Assigned meal plan' ? mealPlanScore || 0 : foodDays / 7;
      const plannedSessions = num(profile.training_days_per_week);
      const training = plannedSessions ? Math.min(1, sessions / plannedSessions) : sessions > 0 ? 1 : 0;
      const stepsTarget = num(targets && targets.steps_target);
      const steps = !avgSteps ? 0 : stepsTarget ? Math.min(1, avgSteps / stepsTarget) : 1;
      adherence = (food + training + steps) / 3;
    }

    return {
      week,
      logsCount: logs.length,
      avgWeight,
      avgSteps,
      avgCardio,
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFats,
      avgFibre,
      sessions,
      foodDays,
      mealPlanScore,
      adherence,
      macro,
    };
  }

  function firstWeight(logs) {
    const sorted = (logs || []).filter((l) => num(l.weight_kg) > 0).sort((a, b) => (a.day < b.day ? -1 : 1));
    return sorted.length ? num(sorted[0].weight_kg) : null;
  }

  // Everything the Dashboard tab showed, for one client.
  function dashboard(ctx, now) {
    const { profile, targets } = ctx;
    if (!profile.start_date) return null;
    const thisWeek = currentWeek(profile.start_date, now);
    const weeks = [];
    for (let w = 1; w <= WEEKS; w++) weeks.push(weekStats(ctx, w));

    const startWeight = firstWeight(ctx.logs);
    const withWeight = weeks.filter((w) => w.avgWeight !== null);
    const latest = withWeight.length ? withWeight[withWeight.length - 1] : null;
    const adherences = weeks.filter((w) => w.adherence !== null).map((w) => w.adherence);

    // "Latest week" is the most recent week that has any logs (falls back to this week).
    const logged = weeks.filter((w) => w.logsCount > 0 && w.week <= Math.max(thisWeek, 1));
    const latestWeek = logged.length ? logged[logged.length - 1] : weeks[Math.max(thisWeek, 1) - 1];

    const goalWeight = num(targets && targets.goal_weight_kg);
    let goalWeightProgress = null;
    if (startWeight !== null && latest && goalWeight !== null && startWeight !== goalWeight) {
      goalWeightProgress = (startWeight - latest.avgWeight) / (startWeight - goalWeight);
    }

    const measurements = (ctx.measurements || []).slice().sort((a, b) => a.week_number - b.week_number);
    const waistRows = measurements.filter((m) => num(m.waist) !== null);
    const startWaist = waistRows.length && waistRows[0].week_number === 0 ? num(waistRows[0].waist) : null;
    const latestWaist = waistRows.length ? num(waistRows[waistRows.length - 1].waist) : null;
    const goalWaist = num(targets && targets.goal_waist_cm);
    let goalWaistProgress = null;
    if (startWaist !== null && latestWaist !== null && goalWaist !== null && startWaist !== goalWaist) {
      goalWaistProgress = (startWaist - latestWaist) / (startWaist - goalWaist);
    }

    return {
      thisWeek,
      weeks,
      startWeight,
      latestAvgWeight: latest ? latest.avgWeight : null,
      totalChange: latest && startWeight !== null ? latest.avgWeight - startWeight : null,
      weeksLogged: withWeight.length,
      latestAvgSteps: latestWeek ? latestWeek.avgSteps : null,
      avgAdherence: adherences.length ? adherences.reduce((a, b) => a + b, 0) / adherences.length : null,
      latestWeek,
      goalWeightProgress,
      goalWaistProgress,
      latestWaist,
      expectedProgress: withWeight.length / WEEKS,
    };
  }

  // Status words used in the workbook's "Latest week vs target" table.
  function status(kind, ratio, expected) {
    if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '';
    if (kind === 'calories') return Math.abs(ratio - 1) <= 0.05 ? 'On track' : ratio > 1 ? 'Over' : 'Under';
    if (kind === 'protein') return ratio >= 0.9 ? 'On track' : 'Under';
    if (kind === 'goal') return ratio >= 1 ? 'Goal reached' : ratio >= (expected || 0) ? 'On track' : 'Behind';
    return ratio >= 1 ? 'On track' : 'Under';
  }

  const api = {
    WEEKS,
    toISO,
    today,
    addDays,
    daysBetween,
    weekOf,
    currentWeek,
    weekDates,
    avgPositive,
    macrosForWeek,
    weekStats,
    firstWeight,
    dashboard,
    status,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredStats = api;
})(typeof window !== 'undefined' ? window : globalThis);
