// Client-specific coach calendar. Existing plans and logs are read directly;
// coach-created schedule items live in client_calendar_events.
(function (root) {
  'use strict';
  let h;
  const CATEGORIES = [
    ['events', 'Events'], ['workouts', 'Workouts'], ['nutrition', 'Nutrition'],
    ['steps', 'Steps'], ['cardio', 'Cardio'], ['weight', 'Weight'],
  ];
  const hidden = new Set();
  const isoDate = (value) => new Date(`${value}T12:00:00Z`);
  const format = (value, options) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', ...options }).format(isoDate(value));
  const weekStart = (value) => h.S.addDays(value, -((isoDate(value).getUTCDay() + 6) % 7));
  const monthStart = (value) => `${value.slice(0, 7)}-01`;
  const monthEnd = (value) => h.S.addDays(`${value.slice(0, 7)}-01`, new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)).getUTCDate() - 1);
  const shiftMonth = (value, n) => new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 10);
  const labelOf = (category) => CATEGORIES.find(([key]) => key === category)?.[1] || category;
  function init(helpers) { h = helpers; }

  function trainingFor(ctx, day) {
    const starts = [...new Set((ctx.training || []).map((row) => row.program_start_date))].filter((date) => date <= day).sort().reverse();
    const start = starts[0];
    if (!start) return null;
    const sessions = ctx.training.filter((row) => row.program_start_date === start);
    const length = sessions.length ? Math.max(...sessions.map((row) => row.cycle_day)) : 0;
    if (!length) return null;
    const cycle = (h.S.daysBetween(start, day) % length) + 1;
    return sessions.find((row) => row.cycle_day === cycle) || null;
  }

  function entriesFor(ctx, day, events, clientView = false) {
    const out = [];
    const push = (category, title, note, href, event) => out.push({ category, title, note, href, event });
    const destination = (coachSection, clientSection) => clientView ? clientSection : `#client/${ctx.profile.id}/${coachSection}`;
    const targetDay = Number(ctx.targets?.checkin_day);
    if (ctx.profile.start_date && Number.isInteger(targetDay) && targetDay >= 0 && targetDay <= 6
      && h.S.weekOf(ctx.profile.start_date, day) && isoDate(day).getUTCDay() === targetDay) {
      push('events', 'Weekly check-in', `Week ${h.S.weekOf(ctx.profile.start_date, day)}`, destination('checkins', `#checkin/${h.S.weekOf(ctx.profile.start_date, day)}`));
    }
    const session = trainingFor(ctx, day);
    if (session && !session.is_rest_day) push('workouts', session.session_name || 'Training', `${(session.exercises || []).length} exercises`, destination('training', '#training'));
    const week = h.S.weekOf(ctx.profile.start_date, day);
    const macros = week ? h.S.macrosForWeek(ctx.macros, week) : null;
    const assignment = (ctx.assignments || []).filter((row) => row.starts_on <= day && (!row.ends_on || row.ends_on >= day)).at(-1);
    if (assignment) push('nutrition', assignment.name || 'Meal plan', '', destination('nutrition', '#meals'));
    else if (macros) push('nutrition', `${h.fmt(macros.calories)} kcal target`, '', destination('nutrition', '#meals'));
    const log = (ctx.logs || []).find((row) => row.day === day);
    if (ctx.targets?.steps_target || log?.steps != null) {
      const target = ctx.targets?.steps_target ? `${h.fmt(ctx.targets.steps_target)} target` : '';
      const actual = log?.steps != null ? `${h.fmt(log.steps)} logged` : '';
      push('steps', [actual, target].filter(Boolean).join(' · '), '', destination('activity', '#training'));
    }
    if (log?.cardio_min != null) push('cardio', `${h.fmt(log.cardio_min)} min logged`, '', destination('activity', '#training'));
    if (log?.weight_kg != null) push('weight', `${h.fmt(log.weight_kg, 1)} kg logged`, '', destination('physique', '#progress'));
    for (const event of events.filter((row) => row.day === day)) push(event.category, event.title, event.notes || '', '', event);
    return out;
  }

  function eventHTML(entry, clientView = false) {
    const content = `<span class="cal-chip-dot"></span><span><b>${h.esc(entry.title)}</b>${entry.note ? `<small>${h.esc(entry.note)}</small>` : ''}</span>`;
    if (entry.event) return `<button type="button" class="cal-chip ${entry.category}" data-cal-event="${h.esc(entry.event.id)}">${content}</button>`;
    return `<a class="cal-chip ${entry.category}" href="${entry.href}">${content}</a>`;
  }

  function modal(title, body) {
    const el = document.createElement('div');
    el.className = 'cal-overlay';
    el.innerHTML = `<section class="cal-modal" role="dialog" aria-modal="true" aria-label="${h.esc(title)}"><header><h2>${h.esc(title)}</h2><button type="button" data-cal-close aria-label="Close">×</button></header>${body}</section>`;
    document.body.appendChild(el);
    const keydown = (event) => { if (event.key === 'Escape') close(); };
    const close = () => { el.remove(); document.removeEventListener('keydown', keydown); };
    document.addEventListener('keydown', keydown);
    el.addEventListener('click', (event) => { if (event.target === el || event.target.closest('[data-cal-close], [data-cal-cancel]')) close(); });
    el.querySelector('form input, form select, [data-cal-close]')?.focus();
    return { el, close };
  }

  async function calendar(ctx, title, sub, requestedView, requestedDate) {
    const clientView = h.state.me?.role === 'client';
    const mode = requestedView === 'month' ? 'month' : 'week';
    const today = h.S.today();
    const selected = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') ? requestedDate : today;
    const first = mode === 'week' ? weekStart(selected) : weekStart(monthStart(selected));
    const last = mode === 'week' ? h.S.addDays(first, 6) : h.S.addDays(weekStart(monthEnd(selected)), 6);
    const days = [];
    for (let day = first; day <= last; day = h.S.addDays(day, 1)) days.push(day);
    const response = await h.sb.from('client_calendar_events').select('id,client_id,day,category,title,notes').eq('client_id', ctx.profile.id).gte('day', first).lte('day', last).order('day');
    const eventsReady = !response.error;
    let events = eventsReady ? response.data : [];
    const path = (nextMode, date) => clientView ? `#calendar/${nextMode}/${date}` : `#client/${ctx.profile.id}/calendar/${nextMode}/${date}`;
    const go = (nextMode, date) => { location.hash = path(nextMode, date); };
    const label = mode === 'week'
      ? `${format(first, { day: 'numeric', month: 'short' })} – ${format(last, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : format(selected, { month: 'long', year: 'numeric' });
    const prev = mode === 'week' ? h.S.addDays(first, -7) : shiftMonth(selected, -1);
    const next = mode === 'week' ? h.S.addDays(first, 7) : shiftMonth(selected, 1);

    const mobileWeekHTML = () => `<div class="cal-mobile-days">${days.map((day) => `<section class="cal-mobile-day"><h2>${format(day, { weekday: 'long', day: 'numeric', month: 'short' })}${day === today ? '<span>Today</span>' : ''}</h2>${CATEGORIES.filter(([key]) => !hidden.has(key)).map(([key, name]) => { const shown = entriesFor(ctx, day, events, true).filter((item) => item.category === key); return `<div class="cal-mobile-row"><span class="cal-row-name ${key}"><i></i>${name}</span><div>${shown.length ? shown.map(eventHTML).join('') : '<small>—</small>'}</div></div>`; }).join('')}</section>`).join('')}</div>`;
    const weekHTML = () => `<div class="cal-scroll cal-week-scroll"><table class="cal-week"><thead><tr><th scope="col" class="cal-corner"></th>${days.map((day) => `<th scope="col" class="${day === today ? 'today' : ''}">${format(day, { weekday: 'short' })} <b>${format(day, { day: 'numeric' })}</b></th>`).join('')}</tr></thead><tbody>
      ${CATEGORIES.filter(([key]) => !hidden.has(key)).map(([key, name]) => `<tr><th scope="row"><span class="cal-row-name ${key}"><i></i>${name}</span>${key === 'weight' && ctx.targets?.goal_weight_kg ? `<small>Goal ${h.fmt(ctx.targets.goal_weight_kg, 1)} kg</small>` : ''}</th>
        ${days.map((day) => `<td><div class="cal-cell-items">${entriesFor(ctx, day, events, clientView).filter((item) => item.category === key).map(eventHTML).join('')}</div>${clientView ? '' : `<button type="button" class="cal-plus" data-cal-add="${day}" data-cal-category="${key}" aria-label="Add ${name.toLowerCase()} on ${format(day, { day: 'numeric', month: 'long' })}"${eventsReady ? '' : ' disabled'}>＋</button>`}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>${clientView ? mobileWeekHTML() : ''}`;
    const monthHTML = () => `<div class="cal-scroll"><div class="cal-month"><div class="cal-month-head">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => `<span>${name}</span>`).join('')}</div>
      <div class="cal-month-grid">${days.map((day) => {
        const visible = entriesFor(ctx, day, events, clientView).filter((item) => !hidden.has(item.category));
        return `<section class="cal-month-day${day.slice(0, 7) === selected.slice(0, 7) ? '' : ' outside'}${day === today ? ' today' : ''}"><header><b>${format(day, { day: 'numeric' })}</b>${clientView ? '' : `<button type="button" data-cal-add="${day}" data-cal-category="events" aria-label="Add event on ${format(day, { day: 'numeric', month: 'long' })}"${eventsReady ? '' : ' disabled'}>＋</button>`}</header>${visible.slice(0, 3).map(eventHTML).join('')}${visible.length > 3 ? `<small>+${visible.length - 3} more</small>` : ''}</section>`;
      }).join('')}</div></div></div>`;

    h.shell(title, sub, `<div class="cal-page${clientView ? ' cal-client' : ''}">
      <div class="cal-intro"><p>${clientView ? 'Your training, nutrition, activity, check-ins and progress in one place.' : `Plan and review ${h.esc(ctx.profile.full_name || 'this client')}’s upcoming activity. The weight row shows logged weigh-ins.`}</p><div>${clientView ? '<span class="cal-read-only">Your schedule</span>' : `<button type="button" class="cal-help" data-cal-help>How the calendar works</button><a class="cal-plain" href="#client/${ctx.profile.id}/training">Training plan</a><button type="button" class="cal-dark" data-cal-add="${selected}" data-cal-category="events"${eventsReady ? '' : ' disabled'}>＋ Add event</button>`}</div></div>
      <div class="cal-toolbar"><button type="button" data-cal-go="${prev}" aria-label="Previous ${mode}">‹</button><button type="button" data-cal-today>Today</button><button type="button" data-cal-go="${next}" aria-label="Next ${mode}">›</button><strong>${h.esc(label)}</strong><div class="cal-toolbar-end"><details class="cal-filter"><summary aria-label="Show or hide categories">☷</summary><div>${CATEGORIES.map(([key, name]) => `<label><input type="checkbox" data-cal-filter="${key}"${hidden.has(key) ? '' : ' checked'}> <i class="${key}"></i>${name}</label>`).join('')}</div></details><div class="cal-mode"><button type="button" data-cal-mode="week" aria-pressed="${mode === 'week'}">Week</button><button type="button" data-cal-mode="month" aria-pressed="${mode === 'month'}">Month</button></div></div></div>
      ${eventsReady ? '' : `<p class="cal-notice">Scheduled events are unavailable until the calendar database update is applied. Existing training, nutrition, activity and weight records still appear.</p>`}
      <div data-cal-grid>${mode === 'week' ? weekHTML() : monthHTML()}</div>
    </div>`, clientView ? 'home' : undefined);
    const page = h.root.querySelector('.cal-page');
    const redraw = () => { page.querySelector('[data-cal-grid]').innerHTML = mode === 'week' ? weekHTML() : monthHTML(); };
    page.addEventListener('change', (event) => {
      const key = event.target.dataset.calFilter;
      if (key) { if (event.target.checked) hidden.delete(key); else hidden.add(key); redraw(); }
    });
    page.addEventListener('click', (event) => {
      const date = event.target.closest('[data-cal-go]')?.dataset.calGo;
      if (date) return go(mode, date);
      if (event.target.closest('[data-cal-today]')) return go(mode, today);
      const nextMode = event.target.closest('[data-cal-mode]')?.dataset.calMode;
      if (nextMode) return go(nextMode, selected);
      if (event.target.closest('[data-cal-help]')) return modal('How the calendar works', `<div class="cal-help-body"><p>Workouts come from this client’s current Training Plan. Nutrition, steps, cardio and weight use their existing targets and daily logs. Weekly check-ins appear on the client’s chosen check-in day.</p><p>Use the plus buttons to schedule a custom item in any category. Only coach-created items can be edited or deleted here. The Weight row is at the bottom of the weekly calendar and shows logged weigh-ins and the client’s goal weight.</p></div><footer><button type="button" data-cal-cancel>Done</button></footer>`);
      const add = event.target.closest('[data-cal-add]');
      if (add && !clientView) return editEvent(null, add.dataset.calAdd, add.dataset.calCategory);
      const edit = event.target.closest('[data-cal-event]');
      if (edit) { const item = events.find((row) => row.id === edit.dataset.calEvent); if (item) clientView ? modal(item.title, `<div class="cal-help-body"><p>${format(item.day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${h.esc(labelOf(item.category))}</p><p>${h.esc(item.notes || 'No additional details.')}</p></div><footer><button type="button" data-cal-cancel>Done</button></footer>`) : editEvent(item); }
    });

    function editEvent(item, day, category) {
      if (clientView || !eventsReady) return;
      const creating = !item;
      const { el, close } = modal(creating ? 'Add calendar event' : 'Edit calendar event', `<form class="cal-form"><label>Title<input name="title" maxlength="120" value="${h.esc(item?.title || '')}" placeholder="e.g. Progress check-in" required></label>
        <div class="cal-form-two"><label>Date<input type="date" name="day" value="${h.esc(item?.day || day || today)}" required></label><label>Category<select name="category">${CATEGORIES.map(([key, name]) => `<option value="${key}"${(item?.category || category) === key ? ' selected' : ''}>${name}</option>`).join('')}</select></label></div>
        <label>Notes <small>Optional</small><textarea name="notes" maxlength="1000" rows="3" placeholder="Details for this scheduled item">${h.esc(item?.notes || '')}</textarea></label>
        <footer>${creating ? '' : '<button type="button" class="cal-danger" data-cal-delete>Delete</button>'}<button type="button" data-cal-cancel>Cancel</button><button type="submit" class="cal-dark">${creating ? 'Add event' : 'Save changes'}</button></footer></form>`);
      const form = el.querySelector('form');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        h.withBusy(form.querySelector('[type="submit"]'), async () => {
          const eventTitle = form.elements.title.value.trim();
          const day = form.elements.day.value;
          const category = form.elements.category.value;
          if (!eventTitle || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !CATEGORIES.some(([key]) => key === category)) throw new Error('Add a title, date and category.');
          const payload = { title: eventTitle, day, category, notes: form.elements.notes.value.trim() || null };
          const result = creating
            ? await h.sb.from('client_calendar_events').insert({ ...payload, client_id: ctx.profile.id }).select('id,client_id,day,category,title,notes').single()
            : await h.sb.from('client_calendar_events').update(payload).eq('id', item.id).eq('client_id', ctx.profile.id).select('id,client_id,day,category,title,notes').single();
          h.must(result);
          close(); h.toast(creating ? 'Event added to calendar.' : 'Event updated.');
          if (day < first || day > last) go(mode, day);
          else calendar(ctx, title, sub, mode, selected);
        });
      });
      el.querySelector('[data-cal-delete]')?.addEventListener('click', async () => {
        if (!confirm(`Delete “${item.title}” from this client's calendar?`)) return;
        const result = await h.sb.from('client_calendar_events').delete().eq('id', item.id).eq('client_id', ctx.profile.id).select('id');
        try { const deleted = h.must(result); if (!deleted.length) throw new Error('Event was not deleted.'); close(); h.toast('Event deleted.'); calendar(ctx, title, sub, mode, selected); }
        catch (error) { h.toast(h.friendlyError(error), true); }
      });
    }
  }

  const api = { init, calendar, weekStart, trainingFor, entriesFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredCalendarUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
