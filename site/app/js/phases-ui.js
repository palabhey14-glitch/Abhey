// Coach phases and year roadmap. All phase writes target the selected client.
(function (root) {
  'use strict';
  let h;
  const e = (value) => h.esc(value);
  const iso = (date) => date.toISOString().slice(0, 10);
  const shift = (day, amount) => iso(new Date(Date.parse(`${day}T12:00:00Z`) + amount * 86400000));
  const days = (from, to) => Math.max(0, Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1);
  const nice = (day) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  const weeks = (phase) => Math.ceil(days(phase.start_date, phase.end_date) / 7);
  const status = (phase) => phase.status === 'active' ? 'Active phase' : phase.status === 'completed' ? 'Completed' : 'Not started';
  const color = (phase) => phase.status === 'active' ? 'active' : phase.status === 'completed' ? 'completed' : 'planned';
  const active = (phases) => phases.find((phase) => phase.status === 'active');
  const inRange = (day, phase) => day >= phase.start_date && day <= phase.end_date;
  function init(helpers) { h = helpers; }
  function month(year, index, phases) {
    const first = new Date(Date.UTC(year, index, 1));
    const start = new Date(first); start.setUTCDate(1 - first.getUTCDay());
    const cells = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start); date.setUTCDate(start.getUTCDate() + i);
      const day = iso(date), matches = phases.filter((phase) => inRange(day, phase));
      const selected = matches.find((phase) => phase.status === 'active') || matches[0];
      const outside = date.getUTCMonth() !== index;
      return `<span class="ph-day${outside ? ' outside' : ''}${selected ? ` ${color(selected)}` : ''}${day === h.S.today() ? ' today' : ''}" title="${selected ? e(`${selected.name} · ${status(selected)}`) : e(nice(day))}">${date.getUTCDate()}</span>`;
    });
    return `<section class="ph-month" aria-label="${e(new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(first))}"><h3>${e(new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: 'UTC' }).format(first))}</h3><div class="ph-month-grid ph-weekdays">${['S','M','T','W','T','F','S'].map((d) => `<span>${d}</span>`).join('')}</div><div class="ph-month-grid">${cells.join('')}</div></section>`;
  }
  function card(phase, compact = false) {
    const elapsed = phase.status === 'active' ? Math.min(weeks(phase), Math.floor(days(phase.start_date, h.S.today()) / 7)) : phase.status === 'completed' ? weeks(phase) : 0;
    return `<article class="card ph-card ${color(phase)}"><div class="ph-symbol">${h.CI.icon(phase.status === 'active' ? 'star' : phase.status === 'completed' ? 'checkins' : 'flag')}</div><div class="ph-card-body"><div class="ph-card-head"><strong>${e(phase.name)}</strong><span class="ph-status ${color(phase)}">${status(phase)}</span></div><small>${e(nice(phase.start_date))} → ${e(nice(phase.end_date))} <span>(Projected)</span></small><small>${elapsed} weeks / ${weeks(phase)} weeks</small>${compact ? '' : phase.description ? `<p>${e(phase.description)}</p>` : ''}</div>${compact && phase.status === 'not_started' ? `<button class="ph-activate" type="button" data-ph-active="${e(phase.id)}">Set as active</button>` : ''}<details class="ph-menu"><summary aria-label="Phase actions for ${e(phase.name)}">⋯</summary><div><button type="button" data-ph-edit="${e(phase.id)}">Edit phase</button>${!compact && phase.status !== 'active' ? `<button type="button" data-ph-active="${e(phase.id)}">Set as active</button>` : ''}${phase.status !== 'completed' ? `<button type="button" data-ph-complete="${e(phase.id)}">Mark completed</button>` : ''}<button type="button" data-ph-delete="${e(phase.id)}">Delete phase</button></div></details></article>`;
  }
  async function render(ctx, title, sub, page = 'list', yearArg) {
    const renderId = h.state?.renderId;
    const clientId = ctx.profile.id;
    const year = Math.max(2000, Math.min(2100, Number(yearArg) || Number(h.S.today().slice(0, 4))));
    const result = await h.sb.from('client_phases').select('*').eq('client_id', clientId).order('start_date');
    if (h.state?.renderId !== renderId) return;
    const ready = !result.error;
    const phases = ready ? result.data || [] : [];
    const roster = phases.map((phase) => card(phase, page === 'roadmap')).join('') || `<div class="card ph-empty">${h.CI.icon('flag',true)}<p>No phases created yet.</p></div>`;
    const url = `#client/${clientId}/phases`;
    const newButton = `<button class="btn btn-small" type="button" data-ph-new${ready ? '' : ' disabled'}>＋ New phase</button>`;
    const notice = ready ? '' : `<div class="card ph-notice" role="alert">Phases are unavailable until the new database update is applied. Other client pages are unaffected.</div>`;
    const intro = page === 'roadmap'
      ? `<div class="ph-toolbar"><a href="${url}" class="ph-back">← Phases</a><div class="ph-year"><a href="${url}/roadmap/${year-1}" aria-label="Previous year">‹</a><strong>${year}</strong><a href="${url}/roadmap/${year+1}" aria-label="Next year">›</a>${newButton}</div></div>`
      : `<div class="ph-toolbar"><p>Plan a client's goals around events and periods. Projected end dates will not close a phase automatically.</p><div><a class="btn btn-ghost btn-small" href="${url}/roadmap/${year}">${h.CI.icon('goals')} Phases roadmap</a>${newButton}</div></div>`;
    const content = page === 'roadmap'
      ? `<div class="ph-roadmap"><div class="ph-roster">${roster}</div><div class="card ph-calendar"><div class="ph-calendar-head"><strong>${year}</strong><span class="ph-legend">${phases.filter((p) => p.start_date <= `${year}-12-31` && p.end_date >= `${year}-01-01`).map((p) => `<i class="${color(p)}">${e(p.name)}</i>`).join('')}</span></div><div class="ph-months">${Array.from({length:12},(_,i) => month(year,i,phases)).join('')}</div></div></div>`
      : `<div class="ph-counts"><span>Not started (${phases.filter((p) => p.status === 'not_started').length})</span><span>Completed (${phases.filter((p) => p.status === 'completed').length})</span><small>${phases.length} phase${phases.length === 1 ? '' : 's'}</small></div><div class="ph-list">${roster}</div>`;
    h.shell(page === 'roadmap' ? 'Phases roadmap' : title, sub, `<div class="ph-page">${intro}${notice}${content}</div>`);
    h.root.querySelector('[data-ph-new]')?.addEventListener('click', () => edit());
    h.root.querySelectorAll('[data-ph-edit]').forEach((btn) => btn.addEventListener('click', () => edit(phases.find((p) => p.id === btn.dataset.phEdit))));
    h.root.querySelectorAll('[data-ph-active]').forEach((btn) => btn.addEventListener('click', () => change(btn, async () => h.sb.rpc('activate_client_phase', { p_phase_id: btn.dataset.phActive }), 'Phase set as active.')));
    h.root.querySelectorAll('[data-ph-complete]').forEach((btn) => btn.addEventListener('click', () => change(btn, async () => h.sb.from('client_phases').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', btn.dataset.phComplete).eq('client_id', clientId).select('id'), 'Phase completed.')));
    h.root.querySelectorAll('[data-ph-delete]').forEach((btn) => btn.addEventListener('click', () => {
      if (confirm('Delete this phase? This cannot be undone.')) change(btn, async () => h.sb.from('client_phases').delete().eq('id', btn.dataset.phDelete).eq('client_id', clientId).select('id'), 'Phase deleted.');
    }));
    async function change(button, call, message) {
      try { button.disabled = true; const result = await call(); h.must(result); h.invalidate(clientId); h.toast(message); await render(ctx,title,sub,page,year); }
      catch (error) { button.disabled = false; h.toast(h.friendlyError(error), true); }
    }
    function edit(phase) {
      const previous = document.activeElement;
      const dialog = document.createElement('dialog'); dialog.className = 'ph-dialog';
      dialog.innerHTML = `<form><header><div><h2>${phase ? 'Edit phase' : 'Add phase'}</h2><small>${e(ctx.profile.full_name || ctx.profile.email || 'Client')}</small></div><button type="button" data-ph-close aria-label="Close">×</button></header><label>Phase name <span data-ph-count>${phase?.name?.length || 0}/40</span><input name="name" maxlength="40" required value="${e(phase?.name || '')}" autofocus></label><div class="ph-dates"><label>Start date <small>(Projected)</small><input name="start_date" type="date" required value="${e(phase?.start_date || h.S.today())}"></label><label>End date <small>(Projected)</small><input name="end_date" type="date" required value="${e(phase?.end_date || shift(h.S.today(), 1))}"></label></div><p class="ph-hint">End date is indicative; an active phase stays active if it passes its end date.</p><label>Description<textarea name="description" rows="6" maxlength="2000">${e(phase?.description || '')}</textarea><small>This description is visible to the client.</small></label><p class="ph-error" role="alert"></p><footer><button type="button" class="btn btn-ghost btn-small" data-ph-close>Cancel</button><button type="submit" class="btn btn-small">Save</button></footer></form>`;
      document.body.appendChild(dialog); dialog.showModal(); dialog.querySelector('[name=name]').focus();
      dialog.querySelectorAll('[data-ph-close]').forEach((btn) => btn.addEventListener('click', () => dialog.close()));
      dialog.addEventListener('close', () => { dialog.remove(); previous?.focus?.(); });
      const form = dialog.querySelector('form');
      const field = (name) => form.querySelector(`[name="${name}"]`);
      field('name').addEventListener('input', () => { dialog.querySelector('[data-ph-count]').textContent = `${field('name').value.length}/40`; });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = field('name').value.trim(), start = field('start_date').value, end = field('end_date').value;
        if (!name || !start || !end || end < start) { dialog.querySelector('.ph-error').textContent = 'Enter a name and an end date on or after the start date.'; return; }
        const values = { name, start_date: start, end_date: end, description: field('description').value.trim() || null };
        const save = form.querySelector('[type=submit]'); save.disabled = true;
        try {
          const query = phase ? h.sb.from('client_phases').update(values).eq('id', phase.id).eq('client_id', clientId) : h.sb.from('client_phases').insert({ ...values, client_id: clientId, status: 'not_started' });
          const rows = h.must(await query.select('id'));
          if (!rows.length) throw new Error('Phase was not saved. Please retry.');
          dialog.close(); h.invalidate(clientId); h.toast('Phase saved.'); await render(ctx,title,sub,page,year);
        } catch (error) { save.disabled = false; dialog.querySelector('.ph-error').textContent = h.friendlyError(error); }
      });
    }
  }
  const api = { init, render, month, days, weeks, inRange, active };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredPhasesUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
