const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const context = {window: {}};
vm.runInNewContext(fs.readFileSync(__dirname + '/meal-plan.js', 'utf8'), context);
const {amountFor, totals} = context.window.RewiredMeals;
const library = {
  foods: [
    {id: 'rice', name: 'Rice', food_state: 'cooked', calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: .3},
    {id: 'chicken', name: 'Chicken', food_state: 'cooked', calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6},
  ],
  recipes: [{id: 'bowl', name: 'Rice and chicken', servings: 2}],
  ingredients: [{recipe_id: 'bowl', food_id: 'rice', grams: 300}, {recipe_id: 'bowl', food_id: 'chicken', grams: 200}],
};

test('food macros scale from per-100g cooked weight', () => {
  const result = amountFor({food_id: 'rice', amount: 250}, library);
  assert.equal(result.calories, 325);
  assert.equal(result.carbs_g, 70);
});

test('recipe macros scale by ingredients, servings, and assigned portion', () => {
  const result = amountFor({recipe_id: 'bowl', amount: 1.5}, library);
  assert.equal(result.calories, 540);
  assert.equal(result.protein_g, 52.575);
  assert.equal(result.carbs_g, 63);
});

test('daily totals keep individual food and recipe quantities distinct', () => {
  const result = totals([{food_id: 'rice', amount: 250}, {recipe_id: 'bowl', amount: 1.5}], library);
  assert.equal(result.calories, 865);
  assert.equal(result.carbs_g, 133);
});
