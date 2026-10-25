// Run with: node site/app/js/stats.test.js
const assert = require('node:assert/strict');
const S = require('./stats.js');

const start = '2026-11-02'; // a Monday

assert.equal(S.weekOf(start, '2026-11-02'), 1);
assert.equal(S.weekOf(start, '2026-11-08'), 1);
assert.equal(S.weekOf(start, '2026-11-09'), 2);
assert.equal(S.weekOf(start, '2026-11-01'), null);
assert.equal(S.weekOf(start, S.addDays(start, 84)), null); // day after week 12
assert.equal(S.currentWeek(start, '2026-10-30'), 0);
assert.equal(S.currentWeek(start, '2027-06-01'), 12);
assert.deepEqual(S.weekDates(start, 2).slice(0, 2), ['2026-11-09', '2026-11-10']);
assert.equal(S.addDays('2026-12-31', 1), '2027-01-01');

assert.equal(S.avgPositive([80, '', null, 0, 82]), 81);
assert.equal(S.macrosForWeek([{ week_number: 1, calories: 2200 }, { week_number: 3, calories: 2000 }], 2).calories, 2200);
assert.equal(S.macrosForWeek([{ week_number: 3 }], 2), null);

const profile = { start_date: start, training_days_per_week: 4, nutrition_tracking: 'Macro-based / Flexible' };
const targets = { steps_target: 10000, goal_weight_kg: 76, goal_waist_cm: 86 };
const logs = [];
// Week 1: 7 days logged, 4 sessions, 8000 steps, weight 82 -> 81.4
for (let i = 0; i < 7; i++) {
  logs.push({ day: S.addDays(start, i), weight_kg: 82 - i * 0.1, steps: 8000, trained: i < 4 ? 'Yes' : 'Rest day', calories: 2100, protein_g: 170 });
}
// Week 2: 3 days logged, 2 sessions, 12000 steps, no food
for (let i = 7; i < 10; i++) {
  logs.push({ day: S.addDays(start, i), weight_kg: 81, steps: 12000, trained: i < 9 ? 'Yes' : 'Missed' });
}
const ctx = { profile, targets, macros: [{ week_number: 1, calories: 2200, protein_g: 180 }], logs, measurements: [
  { week_number: 0, waist: 96 }, { week_number: 2, waist: 94 },
] };

const w1 = S.weekStats(ctx, 1);
assert.equal(w1.sessions, 4);
assert.equal(w1.foodDays, 7);
assert.ok(Math.abs(w1.avgWeight - 81.7) < 1e-9);
// food 7/7 = 1, training 4/4 = 1, steps 0.8 -> 0.9333
assert.ok(Math.abs(w1.adherence - (1 + 1 + 0.8) / 3) < 1e-9);

const w2 = S.weekStats(ctx, 2);
// food 0, training 2/4, steps capped at 1 -> 0.5
assert.ok(Math.abs(w2.adherence - (0 + 0.5 + 1) / 3) < 1e-9);
assert.equal(w2.macro.calories, 2200); // week 1 macros carry forward

const meal = S.weekStats({ ...ctx, profile: { ...profile, nutrition_tracking: 'Assigned meal plan' }, logs: [
  { day: start, meal_plan: 'Yes' }, { day: S.addDays(start, 1), meal_plan: 'Partly' },
] }, 1);
assert.equal(meal.mealPlanScore, 0.75);

const d = S.dashboard(ctx, '2026-11-11');
assert.equal(d.thisWeek, 2);
assert.equal(d.startWeight, 82);
assert.equal(d.weeksLogged, 2);
assert.equal(d.latestAvgWeight, 81);
assert.equal(d.totalChange, -1);
assert.equal(d.latestWeek.week, 2);
assert.ok(Math.abs(d.goalWeightProgress - 1 / 6) < 1e-9);
assert.ok(Math.abs(d.goalWaistProgress - 0.2) < 1e-9);

assert.equal(S.status('calories', 1.03), 'On track');
assert.equal(S.status('calories', 1.2), 'Over');
assert.equal(S.status('protein', 0.85), 'Under');
assert.equal(S.status('goal', 0.3, 2 / 12), 'On track');
assert.equal(S.status('goal', 0.1, 2 / 12), 'Behind');
assert.equal(S.status('steps', null), '');

// Habit tracker colours: met = green, within 25% = orange, beyond = red.
assert.equal(S.habitStatus('steps', 10000, 10000).level, 'good');
assert.equal(S.habitStatus('steps', 12000, 10000).level, 'good');
assert.deepEqual(S.habitStatus('steps', 9200, 10000), { level: 'warn', label: 'Close' });
assert.deepEqual(S.habitStatus('steps', 8000, 10000), { level: 'warn', label: 'Behind' });
assert.equal(S.habitStatus('steps', 7400, 10000).level, 'bad');
assert.equal(S.habitStatus('steps', null, 10000).level, '');
assert.equal(S.habitStatus('steps', 5000, null).level, '');
assert.equal(S.habitStatus('calories', 2240, 2200).level, 'good');
assert.deepEqual(S.habitStatus('calories', 2400, 2200), { level: 'warn', label: 'Slightly over' });
assert.equal(S.habitStatus('calories', 2900, 2200).level, 'bad');
assert.equal(S.habitStatus('calories', 1500, 2200).level, 'bad');
assert.equal(S.parseLitres('3-4 L'), 3);
assert.equal(S.parseLitres('2.5L'), 2.5);
assert.equal(S.parseLitres('lots'), null);

console.log('stats.js: all checks passed');
