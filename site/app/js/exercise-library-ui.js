// Coach exercise library. The rows come only from the existing exercises table.
(function (root) {
  'use strict';

  let h;
  const view = { q: '', type: '', focus: '', category: '', source: '', page: 0, per: 10,
    columns: { type: true, focus: true, category: true, source: true } };

  function init(helpers) { h = helpers; }

  function typeOf(ex) {
    return /\b(bike|treadmill|elliptical|rower|rowing|run|sprint|skipping|jump rope|stair climber)\b/i.test(ex.name || '') ? 'Cardio' : 'Resistance';
  }

  function categoryOf(ex) {
    const eq = String(ex.equipment || '').toLowerCase();
    if (eq.includes('dumbbell')) return 'Dumbbells';
    if (eq.includes('barbell') || eq.includes('ez bar') || eq.includes('trap bar')) return 'Free weights';
    if (eq.includes('machine') || eq.includes('cable')) return 'Machine';
    if (eq.includes('bodyweight')) return 'Bodyweight';
    return ex.equipment || 'Other';
  }

  function filtered(list, filters) {
    const q = h.X.normalise(filters.q);
    return list.filter((ex) => {
      if (q && !h.X.normalise([ex.name, ex.equipment, ...(ex.primary || []).map((m) => h.X.MUSCLES[m])].join(' ')).includes(q)) return false;
      if (filters.type && typeOf(ex) !== filters.type) return false;
      if (filters.focus && !(ex.primary || []).includes(filters.focus)) return false;
      if (filters.category && categoryOf(ex) !== filters.category) return false;
      if (filters.source && (ex.custom ? 'Custom' : 'Default') !== filters.source) return false;
      return true;
    });
  }

  function modal(label, body) {
    const el = document.createElement('div');
    el.className = 'el-overlay';
    el.innerHTML = `<section class="el-modal" role="dialog" aria-modal="true" aria-label="${h.esc(label)}">
      <header><h2>${h.esc(label)}</h2><button type="button" class="el-close" aria-label="Close">×</button></header>${body}</section>`;
    document.body.appendChild(el);
    const close = () => { el.remove(); document.removeEventListener('keydown', keydown); };
    const keydown = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', keydown);
    el.addEventListener('click', (event) => {
      if (event.target === el || event.target.closest('.el-close, [data-el-cancel]')) close();
    });
    el.querySelector('form input, form select, .el-close')?.focus();
    return { el, close };
  }

  async function library() {
    h.state.coachView = { section: 'exercise-library' };
    let lib = await h.loadExerciseLibrary(true);
    h.shell('Exercise Library', 'Every movement your programmes are built from', `
      <div class="el-page">
        <div class="el-top"><p>Find exercises from your database, add your own movements, and use them in client training plans.</p>
          <div class="el-top-actions"><button type="button" class="el-help" data-el-help>How Exercise Library works</button>
          <button type="button" class="el-primary" data-el-add${lib.ready ? '' : ' disabled'}>＋ Add Exercise</button></div></div>
        ${lib.ready ? `<div class="el-toolbar">
          <label class="el-search"><span class="sr-only">Search exercises</span><span aria-hidden="true">⌕</span><input type="search" placeholder="Search exercises" data-el-q value="${h.esc(view.q)}"></label>
          <label><span class="sr-only">Type</span><select data-el-filter="type"><option value="">Type</option></select></label>
          <label><span class="sr-only">Primary focus</span><select data-el-filter="focus"><option value="">Primary Focus</option></select></label>
          <label><span class="sr-only">Category</span><select data-el-filter="category"><option value="">Category</option></select></label>
          <label><span class="sr-only">Library</span><select data-el-filter="source"><option value="">Library</option></select></label>
          <button type="button" class="el-reset" data-el-reset>Reset filters</button>
          <details class="el-columns"><summary>Columns</summary><div>${[['type', 'Type'], ['focus', 'Primary focus'], ['category', 'Category'], ['source', 'Library']].map(([key, label]) => `<label><input type="checkbox" data-el-column="${key}"${view.columns[key] ? ' checked' : ''}> ${label}</label>`).join('')}</div></details>
        </div><div class="el-table-wrap" data-el-results></div>`
          : `<section class="el-unavailable" role="alert"><h2>Exercise library unavailable</h2><p>${h.esc(h.friendlyError(lib.error || new Error('The exercises table could not be loaded.')))}</p><button type="button" class="el-primary" data-el-retry>Try again</button></section>`}
      </div>`);

    const page = h.root.querySelector('.el-page');
    if (!lib.ready) {
      page.querySelector('[data-el-retry]').addEventListener('click', () => library());
      return;
    }

    const makeOptions = (key, options) => {
      const field = page.querySelector(`[data-el-filter="${key}"]`);
      field.innerHTML = `<option value="">${field.options[0].textContent}</option>` + options.map(([value, label]) => `<option value="${h.esc(value)}"${view[key] === value ? ' selected' : ''}>${h.esc(label)}</option>`).join('');
    };
    const draw = () => {
      const all = lib.list;
      makeOptions('type', [...new Set(all.map(typeOf))].sort().map((x) => [x, x]));
      makeOptions('focus', [...new Set(all.flatMap((ex) => ex.primary || []))].filter((k) => h.X.MUSCLES[k]).sort((a, b) => h.X.MUSCLES[a].localeCompare(h.X.MUSCLES[b])).map((k) => [k, h.X.MUSCLES[k]]));
      makeOptions('category', [...new Set(all.map(categoryOf))].sort().map((x) => [x, x]));
      makeOptions('source', [...new Set(all.map((ex) => ex.custom ? 'Custom' : 'Default'))].sort().map((x) => [x, x]));
      const found = filtered(all, view);
      const pages = Math.max(1, Math.ceil(found.length / view.per));
      view.page = Math.min(view.page, pages - 1);
      const rows = found.slice(view.page * view.per, (view.page + 1) * view.per);
      const th = (key, label) => view.columns[key] ? `<th scope="col">${label}</th>` : '';
      const cell = (key, value) => view.columns[key] ? `<td data-label="${key === 'source' ? 'Library' : key === 'focus' ? 'Primary focus' : key}">${value}</td>` : '';
      page.querySelector('[data-el-results]').innerHTML = `<table class="el-table"><thead><tr><th scope="col">Name</th>${th('type', 'Type')}${th('focus', 'Primary focus')}${th('category', 'Category')}${th('source', 'Library')}<th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map((ex) => `<tr data-el-id="${h.esc(ex.id)}"><td data-label="Name"><span class="el-name"><span class="el-thumb" aria-hidden="true">${h.X.bodyDiagram(ex.primary, ex.secondary, { small: true })}</span><span>${h.esc(ex.name)}</span></span></td>
          ${cell('type', `<span class="el-pill ${typeOf(ex) === 'Cardio' ? 'cardio' : ''}">${typeOf(ex)}</span>`)}
          ${cell('focus', h.esc((ex.primary || []).map((m) => h.X.MUSCLES[m] || m).join(', ') || '—'))}
          ${cell('category', h.esc(categoryOf(ex)))}
          ${cell('source', `<span class="el-pill">● ${ex.custom ? 'Custom' : 'Default'}</span>`)}
          <td data-label="Actions"><div class="el-row-actions"><button type="button" data-el-use="${h.esc(ex.id)}">Use in plan</button>${ex.custom ? `<button type="button" class="el-delete" data-el-delete="${h.esc(ex.id)}" aria-label="Delete ${h.esc(ex.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg></button>` : ''}</div></td></tr>`).join('') || `<tr><td colspan="6" class="el-empty">${all.length ? 'No exercises match these filters.' : 'No exercises are in your database yet. Add your first exercise above.'}</td></tr>`}</tbody></table>
        <footer class="el-footer"><span>Showing ${found.length ? view.page * view.per + 1 : 0}–${Math.min(found.length, (view.page + 1) * view.per)} of ${found.length}</span>
        <label><span class="sr-only">Rows per page</span><select data-el-per>${[10, 25, 50].map((n) => `<option value="${n}"${view.per === n ? ' selected' : ''}>${n} per page</option>`).join('')}</select></label>
        <nav aria-label="Exercise pages"><button type="button" data-el-page="prev"${view.page === 0 ? ' disabled' : ''}>‹</button><span>Page ${view.page + 1} of ${pages}</span><button type="button" data-el-page="next"${view.page >= pages - 1 ? ' disabled' : ''}>›</button></nav></footer>`;
    };
    draw();

    page.addEventListener('input', (event) => {
      if (event.target.matches('[data-el-q]')) { view.q = event.target.value; view.page = 0; draw(); }
    });
    page.addEventListener('change', (event) => {
      const field = event.target.dataset.elFilter;
      if (field) { view[field] = event.target.value; view.page = 0; draw(); }
      if (event.target.matches('[data-el-per]')) { view.per = Number(event.target.value); view.page = 0; draw(); }
      const column = event.target.dataset.elColumn;
      if (column) { view.columns[column] = event.target.checked; draw(); }
    });
    page.addEventListener('click', async (event) => {
      if (event.target.closest('[data-el-add]')) return addModal();
      if (event.target.closest('[data-el-help]')) return modal('How Exercise Library works', `<div class="el-modal-body"><p>This page lists exercises already saved in your database. Search or filter them, add custom movements, then choose <b>Use in plan</b> to open a client's training plan with the exercise added as a draft.</p><p>The client sees the change only after you save their plan. Existing saved plans keep their own exercise details.</p><p>Machine brand filters are not shown because the current exercise records do not store brands.</p></div><footer><button type="button" data-el-cancel>Done</button></footer>`);
      if (event.target.closest('[data-el-reset]')) { Object.assign(view, { q: '', type: '', focus: '', category: '', source: '', page: 0 }); page.querySelector('[data-el-q]').value = ''; draw(); return; }
      const step = event.target.closest('[data-el-page]')?.dataset.elPage;
      if (step) { view.page += step === 'next' ? 1 : -1; draw(); return; }
      const use = event.target.closest('[data-el-use]');
      if (use) { const ex = lib.list.find((row) => row.id === use.dataset.elUse); if (ex) await assignModal(ex); return; }
      const del = event.target.closest('[data-el-delete]');
      if (del) {
        const ex = lib.list.find((row) => row.id === del.dataset.elDelete && row.custom);
        if (!ex || !confirm(`Delete “${ex.name}” from your exercise library? Saved client plans will keep their existing exercise details.`)) return;
        const result = await h.sb.from('exercises').delete().eq('id', ex.id).eq('is_custom', true).select('id');
        try { const removed = h.must(result); if (!removed.length) throw new Error('Exercise was not deleted.'); lib = await h.loadExerciseLibrary(true); draw(); h.toast(`${ex.name} deleted from your library.`); }
        catch (error) { h.toast(h.friendlyError(error), true); }
      }
    });

    function addModal() {
      const { el, close } = modal('Add Exercise', `<form class="el-form" data-el-form><label>Exercise name<input name="name" maxlength="120" required placeholder="e.g. Seated cable row"></label>
        <label>Primary focus<select name="primary" required><option value="">Choose a muscle</option>${Object.entries(h.X.MUSCLES).map(([key, value]) => `<option value="${key}">${h.esc(value)}</option>`).join('')}</select></label>
        <label>Also works <small>Optional</small><select name="secondary"><option value="">None</option>${Object.entries(h.X.MUSCLES).map(([key, value]) => `<option value="${key}">${h.esc(value)}</option>`).join('')}</select></label>
        <label>Equipment <small>Optional</small><select name="equipment"><option value="">Choose equipment</option>${h.X.EQUIPMENT.map((value) => `<option>${h.esc(value)}</option>`).join('')}</select></label>
        <p class="el-form-note">This exercise will be saved to your database and available in Training Plans.</p><footer><button type="button" data-el-cancel>Cancel</button><button type="submit" class="el-primary">Add Exercise</button></footer></form>`);
      el.querySelector('form').addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        h.withBusy(form.querySelector('[type="submit"]'), async () => {
          const name = form.elements.name.value.trim().replace(/\s+/g, ' ');
          const primary = form.elements.primary.value;
          const secondary = form.elements.secondary.value;
          if (!name || !primary) throw new Error('Add a name and primary focus.');
          if (lib.list.some((row) => h.X.normalise(row.name) === h.X.normalise(name))) throw new Error('An exercise with that name is already in your library.');
          const result = await h.sb.from('exercises').insert({ name, primary_muscles: [primary], secondary_muscles: secondary && secondary !== primary ? [secondary] : [], equipment: form.elements.equipment.value || null, is_custom: true }).select('id').single();
          h.must(result);
          lib = await h.loadExerciseLibrary(true);
          close(); draw(); h.toast(`${name} added to your exercise library.`);
        });
      });
    }

    async function assignModal(ex) {
      const clients = h.must(await h.sb.from('profiles').select('id,full_name,email').eq('role', 'client').order('full_name'));
      const { el, close } = modal('Use exercise in a training plan', `<form class="el-form" data-el-assign><p class="el-form-note"><b>${h.esc(ex.name)}</b> will be added to a plan draft. Review and save that plan before the client sees it.</p>
        <label>Client<select name="client" required><option value="">Choose a client</option>${clients.map((c) => `<option value="${h.esc(c.id)}">${h.esc(c.full_name || c.email || 'Client')}</option>`).join('')}</select></label>
        <label>Training plan<select name="mode"><option value="existing">Current plan</option><option value="new">New plan</option></select></label>
        <label>Training day<select name="day" required></select></label>
        <p class="el-form-note" data-el-assign-status></p><footer><button type="button" data-el-cancel>Cancel</button><button type="submit" class="el-primary">Open plan editor</button></footer></form>`);
      const form = el.querySelector('form');
      const mode = form.elements.mode;
      const day = form.elements.day;
      let latest = [];
      const defaultDays = [[1, 'Push'], [2, 'Pull'], [3, 'Legs'], [5, 'Upper'], [6, 'Lower']];
      const updateDays = () => {
        const current = mode.value === 'existing';
        const choices = current ? latest.filter((row) => !row.is_rest_day && row.cycle_day <= 7).map((row) => [row.cycle_day, row.session_name]) : defaultDays;
        day.innerHTML = choices.length ? choices.map(([n, label]) => `<option value="${n}">Day ${n} · ${h.esc(label)}</option>`).join('') : '<option value="">No training days available</option>';
        form.querySelector('[data-el-assign-status]').textContent = current && !latest.length ? 'This client has no current plan. Choose New plan.' : 'Nothing changes for the client until you save the plan.';
        form.querySelector('[type="submit"]').disabled = !form.elements.client.value || !choices.length;
      };
      form.elements.client.addEventListener('change', async () => {
        latest = [];
        if (form.elements.client.value) {
          const rows = h.must(await h.sb.from('training_plan').select('program_start_date,cycle_day,session_name,is_rest_day').eq('client_id', form.elements.client.value).order('program_start_date', { ascending: false }).order('cycle_day'));
          const start = rows[0]?.program_start_date;
          latest = rows.filter((row) => row.program_start_date === start);
          mode.value = latest.length ? 'existing' : 'new';
        }
        updateDays();
      });
      mode.addEventListener('change', updateDays);
      updateDays();
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!form.elements.client.value || !day.value) return;
        h.state.pendingExercise = { clientId: form.elements.client.value, day: Number(day.value), newPlan: mode.value === 'new',
          exercise: { exercise_id: ex.id, name: ex.name, primary: ex.primary, secondary: ex.secondary, equipment: ex.equipment } };
        const id = form.elements.client.value;
        const route = mode.value === 'new' ? `#client/${id}/training/new` : `#client/${id}/training`;
        close();
        if (location.hash === route) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else location.hash = route;
      });
    }
  }

  const api = { init, library, typeOf, categoryOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredExerciseLibraryUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
