const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('./wellness.js');
const S = { ...require('./stats.js'), today: () => '2026-10-29' };
const UI = require('./wellness-ui.js');
const state = { coachView: { section: 'health-markers' } };
UI.init({ W, S, state, esc: String, fmt: (n) => String(n) });
const ctx = { profile: { id: 'range-test', start_date: '2026-09-21' } };
test('report dates show seven real dates and the client programme week', () => {
  const r = UI.rangeFor(ctx);
  assert.equal(r.first, '2026-10-23'); assert.equal(r.last, '2026-10-29'); assert.equal(r.days.length, 7);
  assert.equal(UI.programWeek(ctx), 6); assert.match(UI.headerHTML(ctx), /Week 6 of 12/);
});
test('existing programme pages keep their seven-day reporting structure', () => {
  state.coachView.section = 'physique';
  UI.useProgramWeek(ctx, 2);
  const r = UI.rangeFor(ctx);
  assert.equal(r.first, '2026-09-28'); assert.equal(r.last, '2026-10-04'); assert.equal(r.days.length, 7);
  assert.equal(r.mode, 'program'); assert.match(UI.headerHTML(ctx), /Program week/);
  state.coachView.section = 'health-markers';
  assert.equal(UI.rangeFor(ctx).last, '2026-10-29');
});
