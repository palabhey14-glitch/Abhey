// node site/app/js/exercises.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const X = require('./exercises.js');

test('every exercise has a unique name and known muscles', () => {
  const names = new Set();
  for (const ex of X.LIBRARY) {
    assert.ok(!names.has(ex.name.toLowerCase()), `duplicate ${ex.name}`);
    names.add(ex.name.toLowerCase());
    assert.ok(ex.primary.length > 0, `${ex.name} has no primary muscle`);
    for (const m of [...ex.primary, ...ex.secondary]) assert.ok(X.MUSCLES[m], `${ex.name}: unknown muscle ${m}`);
    assert.ok(X.EQUIPMENT.includes(ex.equipment), `${ex.name}: unknown equipment ${ex.equipment}`);
  }
});

test('search understands gym shorthand and muscle filters', () => {
  assert.strictEqual(X.search(X.LIBRARY, 'incline db press')[0].name, 'Incline dumbbell press');
  assert.strictEqual(X.search(X.LIBRARY, 'rdl')[0].name, 'Romanian deadlift');
  const triceps = X.search(X.LIBRARY, '', 'triceps');
  assert.ok(triceps.length > 5);
  assert.ok(triceps.every((ex) => ex.primary.includes('triceps') || ex.secondary.includes('triceps')));
  assert.deepStrictEqual(X.search(X.LIBRARY, 'zzzz'), []);
});

test('musclesOf lets a primary muscle win over a secondary one', () => {
  const m = X.musclesOf([{ primary: ['chest'], secondary: ['triceps'] }, { primary: ['triceps'], secondary: ['chest', 'front_delts'] }]);
  assert.deepStrictEqual(m, { primary: ['chest', 'triceps'], secondary: ['front_delts'] });
});

test('bodyDiagram marks primary and secondary muscles and escapes its label', () => {
  const svg = X.bodyDiagram(['chest'], ['triceps'], { label: 'a "b"' });
  assert.match(svg, /^<svg class="mx"/);
  assert.match(svg, /aria-label="a &quot;b&quot;"/);
  assert.ok((svg.match(/class="mx-p"/g) || []).length >= 2);
  assert.ok((svg.match(/class="mx-s"/g) || []).length >= 2);
  assert.doesNotMatch(X.bodyDiagram([], []), /mx-p|mx-s/);
});
