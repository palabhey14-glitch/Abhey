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
  assert.deepEqual(W.validateReading(base, base.day), { ...base, notes: null, reading_unit: null, result_qualifier: '=', reference_range: null, lab_name: null });
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
test('blood-test panels include the requested hormones, thyroid and cholesterol markers', () => {
  assert.equal(W.BLOOD_MARKERS.length, 11);
  assert.deepEqual(W.BLOOD_MARKERS.map((m) => m.key), ['free_testosterone','total_testosterone','shbg','estradiol','tsh','free_t4','free_t3','total_cholesterol','ldl_cholesterol','hdl_cholesterol','triglycerides']);
  for (const m of W.BLOOD_MARKERS) {
    const result = W.validateReading({ marker: m.key, day: '2026-10-29', value: 1.2345, reading_unit: m.unit }, '2026-10-29');
    assert.equal(result.value, 1.2345); assert.equal(result.taken_at, null); assert.equal(result.reading_unit, m.unit);
  }
  assert.throws(() => W.validateReading({marker:'total_testosterone',day:'2026-10-29',value:18,reading_unit:'mmol/L'},'2026-10-29'));
  assert.throws(() => W.validateReading({marker:'heart_rate',day:'2026-10-29',value:72},'2026-10-29'));
});
test('blood summaries never combine measurements recorded in different units', () => {
  const rows = [{ marker:'total_testosterone',day:'2026-10-25',value:18,reading_unit:'nmol/L' },{ marker:'total_testosterone',day:'2026-10-29',value:520,reading_unit:'ng/dL' }];
  const latestUnit = W.markerSummary(rows,'total_testosterone','2026-10-01','2026-10-29');
  assert.equal(latestUnit.average,520); assert.equal(latestUnit.unit,'ng/dL'); assert.equal(latestUnit.allReadings.length,2);
  const selected = W.markerSummary(rows,'total_testosterone','2026-10-01','2026-10-29','nmol/L');
  assert.equal(selected.average,18); assert.equal(selected.daily.length,1);
});
test('reported detection limits retain precision but do not become exact graph points or averages', () => {
  const result = W.validateReading({marker:'tsh',day:'2026-10-29',value:0.005,reading_unit:'mIU/L',result_qualifier:'<',reference_range:'Copied from report',lab_name:'Sample lab'},'2026-10-29');
  assert.equal(result.value,0.005); assert.equal(result.result_qualifier,'<');
  const summary = W.markerSummary([result],'tsh','2026-10-01','2026-10-29');
  assert.equal(summary.latest.value,0.005); assert.equal(summary.average,null); assert.equal(summary.daily.length,0); assert.equal(summary.excluded,1);
});
