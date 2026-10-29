const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./stats.js');
const C = require('./calendar-ui.js');

C.init({ S, fmt: (value, decimals = 0) => Number(value).toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) });

test('calendar weeks start on Monday across a month boundary', () => {
  assert.equal(C.weekStart('2026-10-29'), '2026-10-26');
  assert.equal(C.weekStart('2026-11-01'), '2026-10-26');
  assert.equal(C.weekStart('2026-11-02'), '2026-11-02');
});

test('the calendar selects the applicable training version and repeats its sessions', () => {
  const ctx = { training: [
    { program_start_date: '2026-10-01', cycle_day: 1, session_name: 'Old push' },
    { program_start_date: '2026-10-01', cycle_day: 2, session_name: 'Old pull' },
    { program_start_date: '2026-10-29', cycle_day: 1, session_name: 'New push' },
    { program_start_date: '2026-10-29', cycle_day: 2, session_name: 'New pull' },
  ] };
  assert.equal(C.trainingFor(ctx, '2026-10-28').session_name, 'Old pull');
  assert.equal(C.trainingFor(ctx, '2026-10-29').session_name, 'New push');
  assert.equal(C.trainingFor(ctx, '2026-10-30').session_name, 'New pull');
  assert.equal(C.trainingFor(ctx, '2026-10-31').session_name, 'New push');
});

test('calendar entries include logged weight and coach-scheduled items without altering plan data', () => {
  const ctx = {
    profile: { id: 'client-1', start_date: '2026-10-01' },
    targets: { checkin_day: 4, steps_target: 10000 },
    training: [], macros: [], assignments: [],
    logs: [{ day: '2026-10-29', weight_kg: 81.4, steps: 9500, cardio_min: 20 }],
  };
  const entries = C.entriesFor(ctx, '2026-10-29', [{ day: '2026-10-29', category: 'events', title: 'Progress call' }]);
  assert.ok(entries.some((row) => row.category === 'weight' && row.title === '81.4 kg logged'));
  assert.ok(entries.some((row) => row.category === 'steps' && row.title.includes('9,500')));
  assert.ok(entries.some((row) => row.category === 'cardio' && row.title === '20 min logged'));
  assert.ok(entries.some((row) => row.title === 'Weekly check-in'));
  assert.ok(entries.some((row) => row.title === 'Progress call'));
});
