// Additive reporting pages and client Habits summaries, using existing app tokens.
(function (root) {
  'use strict';
  let h, W;
  const periods = new Map();
  const PATHS = {
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    hrv: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 0v5m9 10-4-2M3 17l4-2M6 12h3l2-4 3 8 2-4h2"/>',
    drop: '<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M12 10c-2 3-3 4-3 6a3 3 0 0 0 3 3"/>',
    pressure: '<circle cx="12" cy="12" r="9"/><path d="m12 12 5-5M7 7l1 1m-3 4h2m5-7v2m5 5h2M8 17h8"/>',
    temperature: '<path d="M10 14.5V5a3 3 0 0 0-6 0v9.5a5 5 0 1 0 6 0Z"/><path d="M7 9v10m8-14h5m-5 5h3m-3 5h5"/>',
    breath: '<path d="M3 8h13a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/>',
    moon: '<path d="M20.7 13A9 9 0 0 1 11 3.3 9 9 0 1 0 20.7 13Z"/><path d="m17 3 .5 1.5L19 5l-1.5.5L17 7l-.5-1.5L15 5l1.5-.5L17 3Z"/>',
    steps: '<circle cx="14" cy="4" r="2"/><path d="m7 21 3-6-1-6m-5 5 5-5 4 3 4 1m-7 2 5 6m-2-9 1-5"/>',
    cardio: '<circle cx="16" cy="4" r="2"/><path d="m4 14 5-4 4 2 4-4m-8 2 2-4 3 1m-1 5-3 5-6 3m6-3 6 3 3-2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    chart: '<path d="M3 3v18h18M6 15l4-5 4 3 6-8"/>',
    range: '<path d="M12 3v18m-4-14 4-4 4 4M8 17l4 4 4-4"/>',
    history: '<path d="M3 3v6h6M3.6 9A9 9 0 1 1 3 14m9-8v6l4 2"/>',
  };
  function icon(key) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[key] || PATHS.heart}</svg>`; }
  function init(helpers) { h = helpers; W = helpers.W; }
  const val = (value, dp = 0) => W.num(value) == null ? '–' : h.fmt(value, dp);
  const date = (day, opts) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', ...opts }).format(new Date(`${day}T12:00:00Z`));
  const dayLabel = (day) => date(day, { day: 'numeric', month: 'short' });
  const timeLabel = (time) => time ? time.slice(0, 5) : '–';
  const hours = (n) => { if (W.num(n) == null) return '–'; const m = Math.round(Number(n) * 60); return `${Math.floor(m / 60)}h ${m % 60}m`; };
  const mins = (n) => W.num(n) == null ? '–' : hours(Number(n) / 60);
  const bounds = (a, b, dp) => W.num(a) == null || W.num(b) == null ? '–' : `${val(a, dp)}–${val(b, dp)}`;
  const pair = (a, b, dp) => `${val(a, dp)}${W.num(b) == null ? '' : ` / ${val(b, dp)}`}`;
  const reportSection = () => ['health-markers', 'sleep', 'activity'].includes(h.state.coachView?.section);
  const periodKey = (ctx) => `${ctx.profile.id}:${reportSection() ? 'reports' : 'program'}`;
  function useProgramWeek(ctx, week) {
    if (Number.isInteger(week) && week >= 1 && week <= 12 && ctx.profile.start_date) periods.set(`${ctx.profile.id}:program`, { mode: 'program', last: h.S.weekDates(ctx.profile.start_date, week)[6] });
  }
  function rangeFor(ctx) {
    const key = periodKey(ctx);
    if (!periods.has(key)) {
      const week = h.S.currentWeek(ctx.profile.start_date);
      const last = !reportSection() && week ? h.S.weekDates(ctx.profile.start_date, week)[6] : h.S.today();
      periods.set(key, { mode: reportSection() ? 'week' : 'program', last });
    }
    const p = periods.get(key);
    const first = p.mode === 'custom' ? p.first : h.S.addDays(p.last, p.mode === 'month' ? -29 : -6);
    return { ...p, first, days: Array.from({ length: h.S.daysBetween(first, p.last) + 1 }, (_, i) => h.S.addDays(first, i)) };
  }
  function programWeek(ctx) { return h.S.currentWeek(ctx.profile.start_date, rangeFor(ctx).last); }
  function headerHTML(ctx) {
    if (!ctx) return '';
    const r = rangeFor(ctx);
    const week = programWeek(ctx);
    const rangeLabel = `${date(r.first, r.first.slice(0, 7) === r.last.slice(0, 7) ? { day: 'numeric' } : { day: 'numeric', month: 'short', ...(r.first.slice(0, 4) === r.last.slice(0, 4) ? {} : { year: 'numeric' }) })} – ${date(r.last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const status = !ctx.profile.start_date ? 'Start date not set' : r.last < ctx.profile.start_date ? `Starts ${dayLabel(ctx.profile.start_date)}`
      : `Week ${week} of 12${h.S.daysBetween(ctx.profile.start_date, r.last) >= 84 ? ' · Complete' : ''}`;
    return `<div class="w-date-controls" data-w-dates><button type="button" data-w-shift="-1" aria-label="Previous date range">‹</button>
      <details class="w-date-picker"><summary>${rangeLabel}</summary><form data-w-custom>${r.mode === 'program' ? `<input type="hidden" name="first" value="${r.first}">` : `<label>From<input type="date" name="first" value="${r.first}" max="${h.S.today()}" required></label>`}<label>${r.mode === 'program' ? 'Show week containing' : 'To'}<input type="date" name="last" value="${r.last > h.S.today() ? h.S.today() : r.last}" max="${h.S.today()}" required></label><button type="submit" class="btn btn-small">Apply dates</button></form></details>
      <button type="button" data-w-shift="1" aria-label="Next date range"${r.last >= h.S.today() ? ' disabled' : ''}>›</button>
      <label class="w-period"><span class="sr-only">Reporting period</span><select data-w-period>${r.mode === 'program' ? '<option value="program">Program week</option>' : `<option value="week"${r.mode === 'week' ? ' selected' : ''}>Rolling week</option><option value="month"${r.mode === 'month' ? ' selected' : ''}>Rolling 30 days</option><option value="custom"${r.mode === 'custom' ? ' selected' : ''}>Custom range</option>`}</select></label><span class="w-program-week">${h.esc(status)}</span></div>`;
  }
  function bindHeader(ctx, scope = h.root) {
    const box = scope.querySelector('[data-w-dates]');
    if (!box) return;
    box.addEventListener('click', (event) => {
      const shift = Number(event.target.closest('[data-w-shift]')?.dataset.wShift);
      if (!shift) return;
      const r = rangeFor(ctx), n = r.days.length * shift;
      const last = r.mode !== 'program' && h.S.addDays(r.last, n) > h.S.today() ? h.S.today() : h.S.addDays(r.last, n);
      const actual = h.S.daysBetween(r.last, last);
      periods.set(periodKey(ctx), { mode: r.mode, first: h.S.addDays(r.first, actual), last });
      rerender();
    });
    box.querySelector('[data-w-period]').addEventListener('change', (event) => {
      if (event.target.value === 'custom') { box.querySelector('details').open = true; return; }
      periods.set(periodKey(ctx), { mode: event.target.value, last: rangeFor(ctx).last }); rerender();
    });
    box.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const first = event.target.elements.first.value, last = event.target.elements.last.value;
      if (!reportSection()) {
        if (!W.validDay(last) || last > h.S.today()) return h.toast('Choose a valid date up to today.', true);
        const week = h.S.currentWeek(ctx.profile.start_date, last);
        periods.set(periodKey(ctx), { mode: 'program', last: week ? h.S.weekDates(ctx.profile.start_date, week)[6] : last });
      } else {
        if (!W.validDay(first) || !W.validDay(last) || first > last || last > h.S.today() || h.S.daysBetween(first, last) > 365) return h.toast('Choose a date range of up to 366 days, ending no later than today.', true);
        periods.set(periodKey(ctx), { mode: 'custom', first, last });
      }
      rerender();
    });
    function rerender() {
      const base = `#client/${ctx.profile.id}/overview`;
      if (h.state.coachView?.section === 'overview' && location.hash !== base) location.hash = base;
      else h.rerender();
    }
  }
  function summaryRow(label, value, glyph) { return `<div class="w-summary-row"><span>${icon(glyph)}${label}</span><b>${value}</b></div>`; }
  function chart(title, days, series, unit, target) {
    const values = series.flatMap((s) => s.values).map(W.num).filter((v) => v != null);
    const all = [...values, ...(W.num(target) != null ? [Number(target)] : [])];
    let min = all.length ? Math.max(0, Math.floor(Math.min(...all) * 0.8)) : 0;
    let max = all.length ? Math.ceil(Math.max(...all) * 1.15) : 20;
    if (max <= min) max = min + 1;
    const x = (i) => 44 + (days.length === 1 ? 226 : i * 452 / (days.length - 1));
    const y = (n) => 205 - (n - min) * 170 / (max - min);
    const ticks = Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4);
    let drawing = ticks.map((n) => `<g><line x1="44" x2="496" y1="${y(n)}" y2="${y(n)}" class="w-grid-line"/><text x="35" y="${y(n) + 4}" text-anchor="end">${h.esc(n >= 1000 ? `${val(n / 1000, 1)}k` : val(n, Number.isInteger(n) ? 0 : max < 100 ? 1 : 0))}</text></g>`).join('');
    if (W.num(target) != null) drawing += `<line x1="44" x2="496" y1="${y(target)}" y2="${y(target)}" class="w-target-line"/><text x="492" y="${y(target) - 5}" text-anchor="end">Target ${val(target, Number.isInteger(Number(target)) ? 0 : 1)}</text>`;
    series.forEach((s, si) => {
      let path = '', previous = false;
      s.values.forEach((v, i) => { const n = W.num(v); if (n == null) { previous = false; return; } path += `${previous ? 'L' : 'M'}${x(i)},${y(n)} `; previous = true; });
      drawing += `<path d="${path}" fill="none" class="w-chart-line w-series-${si}"/>`;
      drawing += s.values.map((v, i) => W.num(v) == null ? '' : `<circle tabindex="0" cx="${x(i)}" cy="${y(Number(v))}" r="3.5" class="w-chart-dot w-series-${si}"><title>${h.esc(`${dayLabel(days[i])} · ${s.name}: ${val(v, 1)} ${unit}`)}</title></circle>`).join('');
    });
    drawing += days.map((day, i) => i % Math.max(1, Math.ceil(days.length / 7)) && i !== days.length - 1 ? '' : `<text x="${x(i)}" y="226" text-anchor="middle">${h.esc(days.length <= 7 ? date(day, { weekday: 'short' }) : dayLabel(day))}</text>`).join('');
    if (!values.length) drawing += '<text x="270" y="120" text-anchor="middle">No readings in this date range</text>';
    return `<section class="card w-chart"><div class="w-chart-title"><b>${h.esc(title)}</b><span>${series.map((s, i) => `<i class="w-key w-series-${i}"></i>${h.esc(s.name)}`).join(' · ')} (${h.esc(unit)})</span></div><svg role="img" aria-label="${h.esc(title)} trend. ${values.length ? 'Daily values are plotted; gaps mean no reading.' : 'No readings in this date range.'}" viewBox="0 0 520 245">${drawing}</svg><p class="w-chart-note">${values.length ? 'Daily averages · point details available on hover or focus' : 'Your client’s logged readings will appear here.'}</p></section>`;
  }
  function table(title, headers, rows, per = 7) {
    return `<section class="card w-history" data-w-history="${per}"><div class="w-history-title">${h.esc(title)}</div><div class="table-wrap"><table class="crm-table"><thead><tr>${headers.map((label) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}" class="w-empty">No logs found for this date range.</td></tr>`}</tbody></table></div>${rows.length ? '<footer><span data-w-table-count></span><button type="button" data-w-prev aria-label="Previous page">‹</button><span data-w-table-page></span><button type="button" data-w-next aria-label="Next page">›</button></footer>' : ''}</section>`;
  }
  function bindTables(scope) {
    scope.querySelectorAll('[data-w-history]').forEach((box) => {
      const footer = box.querySelector('footer'); if (!footer) return;
      const rows = [...box.querySelectorAll('tbody tr')], per = Number(box.dataset.wHistory), pages = Math.ceil(rows.length / per); let page = 0;
      const draw = () => { rows.forEach((row, i) => { row.hidden = Math.floor(i / per) !== page; }); box.querySelector('[data-w-table-count]').textContent = `${page * per + 1}–${Math.min(rows.length, (page + 1) * per)} of ${rows.length} items`; box.querySelector('[data-w-table-page]').textContent = `${page + 1} of ${pages}`; box.querySelector('[data-w-prev]').disabled = !page; box.querySelector('[data-w-next]').disabled = page === pages - 1; };
      box.querySelector('[data-w-prev]').onclick = () => { page--; draw(); }; box.querySelector('[data-w-next]').onclick = () => { page++; draw(); }; draw();
    });
  }
  function modal(title, body) {
    const before = document.activeElement;
    const el = document.createElement('div'); el.className = 'w-overlay';
    el.innerHTML = `<section class="w-modal card" role="dialog" aria-modal="true" aria-label="${h.esc(title)}"><header><h2>${h.esc(title)}</h2><button type="button" data-w-close aria-label="Close">×</button></header>${body}</section>`;
    document.body.appendChild(el);
    const close = () => { document.removeEventListener('keydown', keys); el.remove(); before?.isConnected && before.focus(); };
    const keys = (event) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') { const nodes = [...el.querySelectorAll('button:not(:disabled), input:not(:disabled), select, textarea, a[href]')].filter((n) => n.getClientRects().length); const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); } else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); } }
    };
    document.addEventListener('keydown', keys); el.addEventListener('click', (event) => { if (event.target === el || event.target.closest('[data-w-close]')) close(); });
    (el.querySelector('form input:not([type=hidden]), form select') || el.querySelector('[data-w-close]'))?.focus(); return { el, close };
  }
  async function loadReadings(uid, first, last) {
    const rows = [];
    for (let from = 0; ; from += 500) {
      const r = await h.sb.from('health_marker_readings').select('*').eq('user_id', uid).gte('day', first).lte('day', last).order('day').order('taken_at').order('id').range(from, from + 499);
      if (r.error) return { ready: false, rows: [], error: r.error };
      rows.push(...r.data); if (r.data.length < 500) return { ready: true, rows };
    }
  }
  function unavailable(result) {
    const missing = /42P01|PGRST20[45]/.test(result.error?.code || '');
    return `<p class="w-notice" role="status">${missing ? 'Health logging will be available after the health markers update is enabled.' : `Health readings could not be loaded. ${h.esc(h.friendlyError(result.error))}`}</p>`;
  }
  function healthCard(m, stats) {
    return `<section class="card w-summary"><header><span class="w-marker-icon">${icon(m.icon)}</span><h2>${m.name}</h2><button type="button" class="w-icon-button" data-w-history-marker="${m.key}" aria-label="View ${m.name} readings">${icon('history')}</button></header>
      ${summaryRow(`Latest reading${stats.latest ? ` · ${dayLabel(stats.latest.day)}` : ''}`, `${pair(stats.latest?.value, stats.latest?.secondary_value, m.dp)} <small>${m.unit}</small>`, 'clock')}
      ${summaryRow('Daily average', `${pair(stats.average, stats.averageSecondary, m.dp)} <small>${m.unit}</small>`, 'chart')}
      ${summaryRow('Range', `${bounds(stats.min, stats.max, m.dp)}${m.paired && stats.minSecondary != null ? ` / ${bounds(stats.minSecondary, stats.maxSecondary)}` : ''} <small>${m.unit}</small>`, 'range')}
      <p class="w-card-foot">${stats.readings.length} readings · ${stats.daily.length} days logged</p></section>`;
  }
  async function health(ctx, title, sub) {
    const range = rangeFor(ctx), result = await loadReadings(ctx.profile.id, range.first, range.last);
    h.shell(title, sub, `<div class="w-page">${result.ready ? '' : unavailable(result)}<div class="w-two">${W.MARKERS.map((m) => {
      const s = W.markerSummary(result.rows, m.key, range.first, range.last);
      const byDay = new Map(s.daily.map((r) => [r.day, r]));
      const series = [{ name: m.paired ? 'Systolic' : m.short, values: range.days.map((day) => byDay.get(day)?.value) }];
      if (m.paired) series.push({ name: 'Diastolic', values: range.days.map((day) => byDay.get(day)?.secondary) });
      return `<article class="w-metric">${healthCard(m, s)}${chart(m.name, range.days, series, m.unit)}</article>`;
    }).join('')}</div></div>`);
    h.root.querySelectorAll('[data-w-history-marker]').forEach((button) => button.onclick = () => historyModal(W.MARKERS.find((m) => m.key === button.dataset.wHistoryMarker), result.rows, range, false, ctx));
  }
  function historyModal(m, rows, range, editable, ctx, refresh) {
    const s = W.markerSummary(rows, m.key, range.first, range.last);
    const { el, close } = modal(`${m.name} readings`, `<p class="w-muted">${dayLabel(range.first)} – ${dayLabel(range.last)} · ${m.unit}</p>${table('Recorded readings', ['Date', 'Time', 'Reading', 'Notes'].concat(editable ? [''] : []), s.readings.slice().reverse().map((r) => `<tr><td>${dayLabel(r.day)}</td><td>${timeLabel(r.taken_at)}</td><td>${pair(r.value, r.secondary_value, m.dp)} ${m.unit}</td><td>${h.esc(r.notes || '–')}</td>${editable ? `<td><button type="button" class="btn btn-ghost btn-small" data-w-edit-reading="${h.esc(r.id)}">Edit</button></td>` : ''}</tr>`))}`);
    bindTables(el);
    el.querySelectorAll('[data-w-edit-reading]').forEach((button) => button.onclick = () => { const r = rows.find((row) => row.id === button.dataset.wEditReading); close(); readingModal(ctx, r.day, r, refresh); });
  }
  function readingModal(ctx, day, existing, refresh) {
    if (h.state.preview) return h.toast('Client view is a preview. Nothing is saved.');
    const now = new Date();
    const { el, close } = modal(existing?.id ? 'Edit health reading' : 'Log health reading', `<form class="w-form"><label>Health marker<select name="marker">${W.MARKERS.map((m) => `<option value="${m.key}"${existing?.marker === m.key ? ' selected' : ''}>${m.name}</option>`).join('')}</select></label><div class="w-form-two"><label>Date<input type="date" name="day" max="${h.S.today()}" value="${day}" required></label><label>Time (local)<input type="time" name="taken_at" value="${existing?.taken_at?.slice(0, 5) || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}" required></label></div><div class="w-form-two"><label><span data-w-value-label></span><input type="number" name="value" inputmode="decimal" value="${existing?.value ?? ''}" required></label><label data-w-second><span>Diastolic (mmHg)</span><input type="number" name="secondary_value" inputmode="numeric" min="1" max="300" step="1" value="${existing?.secondary_value ?? ''}"></label></div><label>Notes <small>Optional</small><textarea name="notes" rows="2" maxlength="500">${h.esc(existing?.notes || '')}</textarea></label><p class="hint">Enter a reading from your device. Keep the units shown above.</p><p class="w-form-error" role="alert" data-w-error></p><footer><button type="button" class="btn btn-ghost btn-small" data-w-close>Cancel</button><button type="submit" class="btn btn-small">Save reading</button></footer></form>`);
    const form = el.querySelector('form');
    const update = () => { const m = W.MARKERS.find((m) => m.key === form.elements.marker.value); form.querySelector('[data-w-value-label]').textContent = `${m.paired ? 'Systolic' : m.name} (${m.unit})`; Object.assign(form.elements.value, { min: m.min, max: m.max, step: m.dp ? '0.1' : '1' }); form.querySelector('[data-w-second]').hidden = !m.paired; form.elements.secondary_value.required = !!m.paired; };
    form.elements.marker.onchange = update; update();
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      h.withBusy(form.querySelector('[type=submit]'), async () => {
        try {
          const payload = W.validateReading(Object.fromEntries(new FormData(form)), h.S.today());
          const q = existing?.id ? h.sb.from('health_marker_readings').update(payload).eq('id', existing.id).eq('user_id', ctx.profile.id) : h.sb.from('health_marker_readings').insert({ ...payload, user_id: ctx.profile.id });
          h.must(await q.select('id').single()); close(); h.toast('Health reading saved.'); if (refresh) await refresh();
        } catch (err) { form.querySelector('[data-w-error]').textContent = h.friendlyError(err); }
      });
    });
  }
  function sleepModal(ctx, day, refresh, detailedReady) {
    if (h.state.preview) return h.toast('Client view is a preview. Nothing is saved.');
    const log = ctx.logs.find((r) => r.day === day) || {};
    const { el, close } = modal('Log sleep details', `<form class="w-form"><p class="hint">For the night ending on ${dayLabel(day)}. Your total sleep is the same value used in your Sleep habit.</p><input type="hidden" name="day" value="${day}"><div class="w-form-two">${Object.entries(W.SLEEP_FIELDS).map(([key, [label, min, max, step]]) => `<label>${h.esc(label)}<input type="number" name="${key}" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${log[key] ?? ''}"${!detailedReady && key !== 'sleep_h' ? ' disabled' : ''}></label>`).join('')}<label>Bedtime<input type="time" name="sleep_bedtime" value="${log.sleep_bedtime?.slice(0, 5) || ''}"${detailedReady ? '' : ' disabled'}></label></div><p class="hint">Extra fields are optional. Only enter stages and scores when your device records them.</p>${detailedReady ? '' : '<p class="hint">Detailed sleep logging will be available after the health markers update is enabled. You can still save total sleep.</p>'}<p class="w-form-error" role="alert" data-w-error></p><footer><button type="button" class="btn btn-ghost btn-small" data-w-close>Cancel</button><button type="submit" class="btn btn-small">Save sleep</button></footer></form>`);
    const form = el.querySelector('form');
    form.addEventListener('submit', (event) => {
      event.preventDefault(); h.withBusy(form.querySelector('[type=submit]'), async () => {
        try {
          const values = W.validateSleep(Object.fromEntries(new FormData(form)), h.S.today());
          const payload = detailedReady ? values : { day, sleep_h: values.sleep_h };
          const saved = h.must(await h.sb.from('daily_logs').upsert({ ...payload, user_id: ctx.profile.id }, { onConflict: 'user_id,day' }).select('*').single());
          ctx.logs = [...ctx.logs.filter((r) => r.day !== day), saved]; h.invalidate(ctx.profile.id); close(); h.toast('Sleep saved.'); await refresh();
        } catch (err) { form.querySelector('[data-w-error]').textContent = h.friendlyError(err); }
      });
    });
  }
  async function mountHabits(ctx, day) {
    const slot = h.root.querySelector('[data-client-health]'); if (!slot) return;
    const result = await loadReadings(ctx.profile.id, day, day); if (!slot.isConnected) return;
    const refresh = () => mountHabits(ctx, day);
    const log = ctx.logs.find((r) => r.day === day) || {};
    slot.innerHTML = `<section class="card w-client-health"><header><div><p class="kicker">Health markers</p><p class="hint">Your readings for ${dayLabel(day)}</p></div><button type="button" class="btn btn-ghost btn-small" data-w-log-health${result.ready && !h.state.preview ? '' : ' disabled'}>Log reading</button></header>${result.ready ? '' : unavailable(result)}<div class="w-client-markers">${W.MARKERS.map((m) => { const s = W.markerSummary(result.rows, m.key, day, day); return `<button type="button" data-w-client-marker="${m.key}" aria-label="${m.name}: ${s.latest ? `${pair(s.latest.value, s.latest.secondary_value, m.dp)} ${m.unit}` : 'Not logged'}"><span class="w-marker-icon">${icon(m.icon)}</span><span><b>${m.name}</b><small>${s.latest ? `${pair(s.latest.value, s.latest.secondary_value, m.dp)} ${m.unit}` : 'Not logged'}</small></span></button>`; }).join('')}</div></section>
      <section class="card w-client-sleep"><header><span class="w-marker-icon">${icon('moon')}</span><div><p class="kicker">Sleep details</p><p class="hint">Night ending ${dayLabel(day)}</p></div><button type="button" class="btn btn-ghost btn-small" data-w-log-sleep${h.state.preview ? ' disabled' : ''}>Log details</button></header><div class="w-client-sleep-values"><span>Total sleep<b>${hours(log.sleep_h)}</b></span><span>Sleep score<b>${val(log.sleep_score)}${W.num(log.sleep_score) == null ? '' : ' / 100'}</b></span><span>Bedtime<b>${timeLabel(log.sleep_bedtime)}</b></span></div></section>`;
    slot.querySelector('[data-w-log-health]').onclick = () => readingModal(ctx, day, null, refresh);
    slot.querySelectorAll('[data-w-client-marker]').forEach((button) => button.onclick = () => { const m = W.MARKERS.find((m) => m.key === button.dataset.wClientMarker); const found = result.rows.filter((r) => r.marker === m.key); if (found.length) historyModal(m, found, { first: day, last: day }, !h.state.preview, ctx, refresh); else if (result.ready && !h.state.preview) readingModal(ctx, day, { marker: m.key }, refresh); });
    slot.querySelector('[data-w-log-sleep]').onclick = () => sleepModal(ctx, day, async () => { await refresh(); if (h.refreshHabits) h.refreshHabits(day); }, result.ready);
  }
  function progress(label, value, text, max = 100) { return `<div class="w-progress-row"><div><span>${label}</span><b>${text}</b></div><div class="w-progress"><span style="width:${W.num(value) == null ? 0 : Math.min(100, Math.max(0, Number(value) / max * 100))}%"></span></div></div>`; }
  function sleep(ctx, title, sub) {
    const r = rangeFor(ctx), s = W.sleepSummary(ctx.logs, r.first, r.last, ctx.targets.sleep_target_h), latest = s.latest;
    const byDay = new Map(s.nights.map((row) => [row.day, row]));
    const stages = [['Awake', 'sleep_awake_min'], ['Core', 'sleep_core_min'], ['REM', 'sleep_rem_min'], ['Deep', 'sleep_deep_min']];
    const stageTotal = W.sum(stages.map(([, key]) => s.averageField(key)));
    h.shell(title, sub, `<div class="w-page"><div class="w-page-actions"><button type="button" class="btn btn-ghost btn-small" data-w-sleep-info>Sleep Info ${icon('moon')}</button></div><section class="card w-summary"><header><span class="w-marker-icon">${icon('moon')}</span><h2>Sleep</h2><label class="w-sleep-select"><span class="sr-only">Sleep chart metric</span><select data-w-sleep-metric><option value="sleep_h">Duration</option><option value="sleep_score">Sleep score</option><option value="sleep_efficiency_pct">Efficiency</option></select></label></header>${summaryRow(`Latest sleep${latest ? ` · ${dayLabel(latest.day)}` : ''}`, hours(latest?.sleep_h), 'clock')}${summaryRow('Average Sleep', hours(s.average), 'chart')}${summaryRow('Range', s.min == null ? '–' : `${hours(s.min)} – ${hours(s.max)}`, 'range')}</section><div data-w-sleep-chart>${chart('Sleep', r.days, [{ name: 'Duration', values: r.days.map((day) => byDay.get(day)?.sleep_h) }], 'hours', ctx.targets.sleep_target_h)}</div>
      <div class="w-three"><section class="card w-sleep-card"><h2>Sleep Score <small>Latest logged night</small></h2><div class="w-score"><span class="w-score-ring" style="--w-percent:${W.num(latest?.sleep_score) ?? 0}%"><b>${val(latest?.sleep_score)}</b></span><span>/ 100<small>${latest?.sleep_score != null ? 'Recorded device score' : 'No device score logged'}</small></span></div>${summaryRow('Duration', hours(latest?.sleep_h), 'moon')}${summaryRow('Bedtime', timeLabel(latest?.sleep_bedtime), 'clock')}${summaryRow('Interruptions', val(latest?.sleep_interruptions), 'history')}</section>
      <section class="card w-sleep-card"><h2>Sleep Breakdown <small>Selected-period averages</small></h2>${progress('Total sleep', s.average, hours(s.average), W.num(ctx.targets.sleep_target_h) || 8)}${progress('Sleep efficiency', s.averageField('sleep_efficiency_pct'), `${val(s.averageField('sleep_efficiency_pct'), 1)}%`)}${progress('Restfulness', s.averageField('sleep_restfulness_pct'), `${val(s.averageField('sleep_restfulness_pct'), 1)}%`)}${progress('REM sleep', s.averageField('sleep_rem_min'), mins(s.averageField('sleep_rem_min')), s.average * 60 || 480)}${progress('Deep sleep', s.averageField('sleep_deep_min'), mins(s.averageField('sleep_deep_min')), s.average * 60 || 480)}${progress('Latency', s.averageField('sleep_latency_min'), mins(s.averageField('sleep_latency_min')), 60)}</section>
      <section class="card w-sleep-card"><h2>Sleep Stages <small>Selected-period averages</small></h2><div class="w-stage-bar">${stages.map(([, key], i) => `<span class="w-stage-${i}" style="width:${stageTotal && s.averageField(key) != null ? s.averageField(key) / stageTotal * 100 : 0}%"></span>`).join('')}</div>${stages.map(([label, key], i) => `<div class="w-stage-row"><span><i class="w-stage-${i}"></i>${label}</span><b>${mins(s.averageField(key))}</b></div>`).join('')}<p class="w-muted">Stages appear only when recorded.</p></section></div>
      <div class="w-three w-sleep-mini"><section class="card"><h2>Sleep Debt</h2><p>${icon('history')}<b>${hours(s.debt)}</b></p><small>Shortfall vs ${hours(ctx.targets.sleep_target_h)} target, across ${s.nights.filter((n) => W.num(n.sleep_h) != null).length} logged nights</small></section><section class="card"><h2>Sleeping RHR</h2><p>${icon('pulse')}<b>${val(s.rhr)} <small>bpm</small></b></p><small>Average of recorded readings</small></section><section class="card"><h2>Sleeping HRV</h2><p>${icon('hrv')}<b>${val(s.hrv, 1)} <small>ms</small></b></p><small>Average of recorded readings</small></section></div>
      ${table('Sleep history', ['Date', 'Total sleep', 'Bedtime', 'Core sleep', 'REM sleep', 'Deep sleep'], s.nights.slice().reverse().map((n) => `<tr><td>${dayLabel(n.day)}</td><td>${hours(n.sleep_h)}</td><td>${timeLabel(n.sleep_bedtime)}</td><td>${mins(n.sleep_core_min)}</td><td>${mins(n.sleep_rem_min)}</td><td>${mins(n.sleep_deep_min)}</td></tr>`))}</div>`);
    const box = h.root.querySelector('.w-page'); bindTables(box);
    box.querySelector('[data-w-sleep-metric]').onchange = (event) => { const key = event.target.value; const label = { sleep_h: ['Duration', 'hours', ctx.targets.sleep_target_h], sleep_score: ['Sleep score', '/100', null], sleep_efficiency_pct: ['Efficiency', '%', null] }[key]; box.querySelector('[data-w-sleep-chart]').innerHTML = chart('Sleep', r.days, [{ name: label[0], values: r.days.map((day) => byDay.get(day)?.[key]) }], label[1], label[2]); };
    box.querySelector('[data-w-sleep-info]').onclick = () => modal('Sleep Info', '<p>Duration comes from the client’s existing Sleep habit. Bedtime, stages, efficiency, restfulness, heart readings and device scores are optional details logged in Habits.</p><p>Sleep debt adds only the shortfall below the coach’s sleep target on nights that have a duration recorded. Unlogged nights do not count as zero sleep.</p><p>Scores are recorded device values. No score or sleep stage is estimated from duration alone.</p>');
  }
  function activity(ctx, title, sub) {
    const r = rangeFor(ctx), previousFirst = h.S.addDays(r.first, -r.days.length), previousLast = h.S.addDays(r.first, -1);
    const metrics = [{ key: 'steps', name: 'Steps', unit: 'steps', icon: 'steps', target: ctx.targets.steps_target }, { key: 'cardio_min', name: 'Cardio', unit: 'mins', icon: 'cardio', target: null }];
    const cards = metrics.map((m) => {
      const s = W.activitySummary(ctx.logs, m.key, r.first, r.last), before = W.activitySummary(ctx.logs, m.key, previousFirst, previousLast), byDay = new Map(s.rows.map((row) => [row.day, row]));
      const delta = s.average != null && before.average != null ? s.average - before.average : null;
      return `<article class="w-metric"><section class="card w-summary"><header><span class="w-marker-icon">${icon(m.icon)}</span><h2>${m.name}</h2><span class="w-muted">${m.key === 'cardio_min' ? 'Duration' : 'Daily total'}</span></header>${summaryRow(`Latest reading${s.latest ? ` · ${dayLabel(s.latest.day)}` : ''}`, `${val(s.latest?.[m.key])} <small>${m.unit}</small>`, 'clock')}${summaryRow('Daily average', `${val(s.average)} <small>${m.unit}</small>`, 'chart')}${summaryRow('Range', `${bounds(s.min, s.max)} <small>${m.unit}</small>`, 'range')}${summaryRow('Total', `${val(s.total)} <small>${m.unit}</small>`, 'history')}<p class="w-card-foot">${s.rows.length}/${r.days.length} days logged${delta == null ? '' : ` · ${delta >= 0 ? '+' : ''}${val(delta)} ${m.unit}/day vs previous period`}</p></section>${chart(m.name, r.days, [{ name: m.key === 'cardio_min' ? 'Duration' : 'Steps', values: r.days.map((day) => byDay.get(day)?.[m.key]) }], m.unit, m.target)}${table(`${m.name} history`, ['Date', 'Actual', 'Target', 'Compliance'], s.rows.slice().reverse().map((row) => `<tr><td>${dayLabel(row.day)}</td><td>${val(row[m.key])} ${m.unit}</td><td>${m.target ? `${val(m.target)} ${m.unit}` : '–'}</td><td>${m.target ? `${val(Number(row[m.key]) / Number(m.target) * 100)}%` : '–'}</td></tr>`))}</article>`;
    });
    const trained = ctx.logs.filter((row) => row.day >= r.first && row.day <= r.last && row.trained === 'Yes').length;
    h.shell(title, sub, `<div class="w-page"><p class="w-muted">The steps and cardio this client has logged · ${trained} training sessions in this period</p><div class="w-two">${cards.join('')}</div></div>`); bindTables(h.root);
  }
  const api = { init, icon, rangeFor, programWeek, useProgramWeek, headerHTML, bindHeader, health, sleep, activity, mountHabits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredWellnessUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
