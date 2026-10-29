const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('./wellness.js');

test('health summaries average days equally and preserve missing readings', () => {
  const rows = [
    { marker: 'heart_rate', day: '2026-10-25', taken_at: '08:00', value: 60 },
    { marker: 'heart_rate', day: '2026-10-25', taken_at: '09:00', value: 80 },
    { marker: 'heart_rate', day: '2026-10-26', taken_at: '08:00', value: 90 },
    { marker: 'heart_rate', day: '2026-09-01', value: 200 },
  ];
  const s = W.markerSummary(rows, 'heart_rate', '2026-10-23', '2026-10-29');
  assert.equal(s.average, 80); assert.equal(s.latest.value, 90);
  assert.equal(s.daily.length, 2); assert.equal(s.min, 60); assert.equal(s.max, 90);
  assert.equal(W.markerSummary([], 'heart_rate', '2026-10-23', '2026-10-29').average, null);
});
test('blood pressure remains a pair and validation rejects wrong units or incomplete readings', () => {
  const base = { marker: 'blood_pressure', day: '2026-10-29', taken_at: '08:00', value: 120, secondary_value: 80 };
  assert.deepEqual(W.validateReading(base, base.day), { ...base, notes: null });
  assert.throws(() => W.validateReading({ ...base, secondary_value: null }, base.day));
  assert.throws(() => W.validateReading({ ...base, secondary_value: 130 }, base.day));
  assert.throws(() => W.validateReading({ ...base, day: '2026-02-30' }, base.day));
  assert.throws(() => W.validateReading({ ...base, day: '2026-10-30' }, base.day));
  assert.throws(() => W.validateReading({ ...base, marker: 'body_temperature', value: 98.6 }, base.day));
  const s = W.markerSummary([base], 'blood_pressure', base.day, base.day);
  assert.equal(s.averageSecondary, 80);
});
test('sleep debt excludes unlogged nights and device scores are never fabricated', () => {
  const s = W.sleepSummary([{ day: '2026-10-23', sleep_h: 6 }, { day: '2026-10-24', sleep_h: null }, { day: '2026-10-29', sleep_h: 8 }], '2026-10-23', '2026-10-29', 7.5);
  assert.equal(s.average, 7); assert.equal(s.debt, 1.5); assert.equal(s.nights.length, 2);
  assert.equal(s.averageField('sleep_score'), null); assert.equal(s.hrv, null);
  assert.equal(W.sleepSummary([], '2026-10-23', '2026-10-29', 7.5).debt, null);
});
test('sleep detail validation checks stages without requiring optional device fields', () => {
  const base = { day: '2026-10-29', sleep_h: '7.5' };
  const data = W.validateSleep(base, base.day);
  assert.equal(data.sleep_h, 7.5); assert.equal(data.sleep_score, null);
  assert.throws(() => W.validateSleep({ ...base, sleep_core_min: 400, sleep_rem_min: 90 }, base.day));
  assert.throws(() => W.validateSleep({ ...base, sleep_score: 101 }, base.day));
  assert.throws(() => W.validateSleep({ ...base, sleep_bedtime: '25:00' }, base.day));
  assert.throws(() => W.validateSleep({ day: base.day }, base.day));
});
test('activity trends count actual zero readings and exclude missing days from averages', () => {
  const s = W.activitySummary([{ day: '2026-10-23', cardio_min: 0 }, { day: '2026-10-24', cardio_min: 30 }, { day: '2026-10-25' }], 'cardio_min', '2026-10-23', '2026-10-29');
  assert.equal(s.average, 15); assert.equal(s.total, 30); assert.equal(s.rows.length, 2);
  assert.equal(W.activitySummary([], 'steps', '2026-10-23', '2026-10-29').total, null);
});
