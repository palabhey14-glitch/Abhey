// Run with: node site/app/js/ingredients.test.js
const assert = require('node:assert/strict');
const { parseLine, parseNumber } = require('./ingredients.js');

assert.equal(parseNumber('1 ½'), 1.5);
assert.equal(parseNumber('1½'), 1.5);
assert.equal(parseNumber('1 1/2'), 1.5);
assert.equal(parseNumber('3/4'), 0.75);
assert.equal(parseNumber('2,5'), 2.5);

let r = parseLine('200g chicken breast, diced');
assert.equal(r.grams, 200);
assert.equal(r.name, 'chicken breast');
assert.equal(r.prep, 'diced');
assert.equal(r.uncertain, false);

r = parseLine('2 cups (250 g) plain flour, sifted');
assert.equal(r.grams, 250, 'bracketed metric weight wins');
assert.equal(r.name, 'plain flour');
assert.equal(r.uncertain, false);

r = parseLine('1 ½ cups milk');
assert.equal(r.mL, 375);
assert.equal(r.grams, null, 'volume is not turned into grams silently');
assert.equal(r.uncertain, true);

r = parseLine('1 tbsp olive oil');
assert.equal(r.mL, 15);
assert.match(r.reason, /Australian 20 mL/);

r = parseLine('1 x 400 g can chickpeas, drained and rinsed');
assert.equal(r.grams, 400);
assert.equal(r.name, 'chickpeas');
assert.equal(r.prep, 'drained and rinsed');

r = parseLine('2 x 400g tins chopped tomatoes');
assert.equal(r.grams, 800);
assert.equal(r.name, 'tomatoes');
assert.equal(r.prep, 'chopped');

r = parseLine('1 kg lamb shoulder');
assert.equal(r.grams, 1000);

r = parseLine('8 oz cheddar, grated');
assert.equal(r.grams, 226.8, 'overseas ounces convert to grams');
assert.equal(r.name, 'cheddar');

r = parseLine('1-2 green chillies, finely chopped');
assert.equal(r.quantity, 1);
assert.equal(r.quantityMax, 2);
assert.equal(r.grams, null);
assert.equal(r.name, 'green chillies');
assert.equal(r.prep, 'finely chopped');
assert.match(r.reason, /Counted/);

r = parseLine('3 cloves garlic, crushed');
assert.equal(r.unit, 'clove');
assert.equal(r.name, 'garlic');

r = parseLine('Salt to taste');
assert.equal(r.quantity, null);
assert.equal(r.name, 'Salt');
assert.equal(r.prep, 'to taste');
assert.match(r.reason, /to taste/);

r = parseLine('500 ml water');
assert.equal(r.mL, 500);
r = parseLine('250-300 g basmati rice');
assert.equal(r.grams, 275);
assert.equal(r.uncertain, true);

console.log('ingredients tests passed');
