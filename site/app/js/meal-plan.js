// Coach-assigned meal plans. Nutrition is calculated from verified per-100g
// food records and recipe ingredient weights. Assigned plans are kept separate
// from client-reported intake in daily_logs.
(function () {
  'use strict';

  const TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const FIELDS = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
  const empty = () => ({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const round = (value, digits = 1) => Number(value || 0).toLocaleString('en-AU', { maximumFractionDigits: digits });
  const plus = (a, b) => { const out = empty(); for (const key of FIELDS) out[key] = a[key] + b[key]; return out; };

  function amountFor(item, library) {
    if (item.food_id) {
      const food = library.foods.find(row => row.id === item.food_id);
      if (!food) return { name: 'Food unavailable', unit: 'g', missing: true, ...empty() };
      const amount = Number(item.amount) / 100;
      return {
        name: food.name + (food.food_state === 'raw' || food.food_state === 'dry' ? ` · ${food.food_state}` : ''),
        unit: 'g',
        calories: Number(food.calories_per_100g) * amount,
        protein_g: Number(food.protein_per_100g) * amount,
        carbs_g: Number(food.carbs_per_100g) * amount,
        fat_g: Number(food.fat_per_100g) * amount,
      };
    }
    const recipe = library.recipes.find(row => row.id === item.recipe_id);
    if (!recipe) return { name: 'Recipe unavailable', unit: 'servings', missing: true, ...empty() };
    const ingredients = library.ingredients.filter(row => row.recipe_id === recipe.id);
    const out = { name: recipe.name, unit: 'servings', ...empty() };
    if (!ingredients.length) return { ...out, missing: true };
    for (const ingredient of ingredients) {
      const food = library.foods.find(row => row.id === ingredient.food_id);
      if (!food) return { ...out, missing: true };
      const scale = Number(ingredient.grams) / 100 * Number(item.amount) / Number(recipe.servings);
      out.calories += Number(food.calories_per_100g) * scale;
      out.protein_g += Number(food.protein_per_100g) * scale;
      out.carbs_g += Number(food.carbs_per_100g) * scale;
      out.fat_g += Number(food.fat_per_100g) * scale;
    }
    return out;
  }

  function totals(items, library) {
    return items.reduce((acc, item) => plus(acc, amountFor(item, library)), empty());
  }

  async function load(sb, clientId) {
    const results = await Promise.all([
      sb.from('food_items').select('*').eq('approved', true).order('name'),
      sb.from('recipes').select('*').eq('approved', true).order('name'),
      sb.from('recipe_ingredients').select('*').order('sort_order'),
      sb.from('meal_plan_items').select('*').eq('client_id', clientId).order('sort_order').order('created_at'),
    ]);
    const error = results.find(row => row.error);
    if (error) throw error.error;
    return { foods: results[0].data, recipes: results[1].data, ingredients: results[2].data, items: results[3].data };
  }

  const macroLine = values => `<span>${round(values.calories, 0)} kcal</span><span>P ${round(values.protein_g)}g</span><span>C ${round(values.carbs_g)}g</span><span>F ${round(values.fat_g)}g</span>`;

  function html(library, coach) {
    const total = totals(library.items, library);
    const byType = TYPES.map(type => {
      const items = library.items.filter(item => item.meal_type === type);
      const subtotal = totals(items, library);
      return `<section class="meal-group card"><div class="meal-group-head"><h2>${type}</h2><div class="meal-macros">${macroLine(subtotal)}</div></div>
        ${items.length ? items.map(item => {
          const values = amountFor(item, library);
          return `<div class="assigned-meal" data-item="${esc(item.id)}"><div><strong>${esc(values.name)}</strong><span class="meal-amount">${round(item.amount, 2)} ${values.unit}</span>
            <div class="meal-macros">${values.missing ? '<span>Nutrition needs review</span>' : macroLine(values)}</div>${item.coach_note ? `<p class="hint">${esc(item.coach_note)}</p>` : ''}</div>
            ${coach ? `<div class="meal-actions"><label>Portion <input type="number" data-portion="${esc(item.id)}" value="${esc(item.amount)}" min="0.01" max="${item.recipe_id ? 20 : 5000}" step="${item.recipe_id ? '0.25' : '1'}" aria-label="Portion for ${esc(values.name)}"></label><button class="btn btn-ghost btn-small" type="button" data-remove-meal="${esc(item.id)}">Remove</button></div>` : ''}
          </div>`;
        }).join('') : '<p class="meal-empty">No meals assigned here yet.</p>'}</section>`;
    }).join('');
    const options = `<optgroup label="Recipes · servings">${library.recipes.map(r => `<option value="recipe:${esc(r.id)}">${esc(r.name)}</option>`).join('')}</optgroup><optgroup label="Foods · grams">${library.foods.map(f => `<option value="food:${esc(f.id)}">${esc(f.name)} · ${esc(f.food_state.replaceAll('_', ' '))}</option>`).join('')}</optgroup>`;
    const form = coach ? (library.recipes.length || library.foods.length ? `<section class="card meal-builder"><p class="kicker">Build this client's plan</p><h2>Add a meal</h2><form id="meal-plan-form"><div class="grid-2"><div class="field"><label for="meal-type">Meal type</label><select id="meal-type" name="meal_type">${TYPES.map(t => `<option>${t}</option>`).join('')}</select></div><div class="field"><label for="meal-source">Recipe or food</label><select id="meal-source" name="source">${options}</select></div></div><div class="grid-2"><div class="field"><label for="meal-amount">Portion <span id="meal-unit">(servings)</span></label><input id="meal-amount" name="amount" type="number" min="0.25" max="20" step="0.25" value="1" required></div><div class="meal-preview"><span>For this portion</span><strong id="meal-preview-total">Choose an item</strong></div></div><div class="field"><label for="meal-note">Coach note (optional)</label><input id="meal-note" name="coach_note" maxlength="500" placeholder="A swap, prep tip or portion cue"></div><button class="btn" type="submit">Add to plan</button></form></section>` : `<section class="card meal-builder"><p class="kicker">Food library</p><h2>Ready for your reviewed meals.</h2><p>No foods or recipes have been approved for client plans yet. Review the starter library’s portions and nutrition values before assigning meals.</p></section>`) : '';
    return `<div class="meal-page"><div class="meal-intro"><p class="kicker">Assigned nutrition plan</p><h1>Food that fits the day.</h1><p>Recipes by serving and foods by weight. The coach's assigned plan is separate from what the client logs as eaten.</p></div>
      <section class="meal-summary card"><div><span class="kicker">Assigned daily total</span><strong>${round(total.calories, 0)} <small>kcal</small></strong></div><div class="meal-macros">${macroLine(total)}</div></section>
      ${form}${byType}<p class="hint">Foods use cooked or ready-to-eat weight unless labelled raw or dry. Nutrition values come from the coach-reviewed library.</p></div>`;
  }

  function bind(root, library, sb, clientId, coach, refresh, onError) {
    if (!coach) return;
    const form = root.querySelector('#meal-plan-form');
    if (!form) return;
    const source = form.querySelector('#meal-source');
    const amount = form.querySelector('#meal-amount');
    const preview = () => {
      const [kind, id] = source.value.split(':');
      const isFood = kind === 'food';
      amount.min = isFood ? '1' : '0.25'; amount.max = isFood ? '5000' : '20'; amount.step = isFood ? '1' : '0.25';
      root.querySelector('#meal-unit').textContent = isFood ? '(grams)' : '(servings)';
      const qty = Number(amount.value);
      if (!(qty > 0)) return;
      const values = amountFor({ food_id: isFood ? id : null, recipe_id: isFood ? null : id, amount: qty }, library);
      root.querySelector('#meal-preview-total').textContent = values.missing ? 'Nutrition needs review' : `${round(values.calories, 0)} kcal · P ${round(values.protein_g)}g · C ${round(values.carbs_g)}g · F ${round(values.fat_g)}g`;
    };
    source.addEventListener('change', () => { amount.value = source.value.startsWith('food:') ? '100' : '1'; preview(); });
    amount.addEventListener('input', preview);
    preview();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const [kind, id] = source.value.split(':');
      if (!id) return;
      const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
      try {
        const row = { client_id: clientId, meal_type: form.meal_type.value, amount: Number(amount.value), coach_note: form.coach_note.value.trim() || null, food_id: kind === 'food' ? id : null, recipe_id: kind === 'recipe' ? id : null };
        const result = await sb.from('meal_plan_items').insert(row);
        if (result.error) throw result.error;
        await refresh();
      } catch (error) { onError(error); submit.disabled = false; }
    });
    root.querySelectorAll('[data-portion]').forEach(input => input.addEventListener('change', async () => {
      if (!input.reportValidity()) return;
      input.disabled = true;
      try { const result = await sb.from('meal_plan_items').update({ amount: Number(input.value) }).eq('id', input.dataset.portion); if (result.error) throw result.error; await refresh(); }
      catch (error) { onError(error); input.disabled = false; }
    }));
    root.querySelectorAll('[data-remove-meal]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { const result = await sb.from('meal_plan_items').delete().eq('id', button.dataset.removeMeal); if (result.error) throw result.error; await refresh(); }
      catch (error) { onError(error); button.disabled = false; }
    }));
  }

  window.RewiredMeals = { TYPES, amountFor, totals, load, html, bind };
})();
