// Additive coach Training pages. Uses the existing shell, palette and exercise DB.
(function (root) {
  'use strict';
  let h, T;
  const views = new Map(), drafts = new Map();
  const e = (v) => h.esc(v);
  const n = (v, dp = 0) => v == null ? '–' : Number(v).toLocaleString('en-AU', { maximumFractionDigits: dp });
  const date = (d) => d ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`)) : '–';
  const signed = (v) => v == null ? '–' : `${v > 0 ? '+' : ''}${n(v, 1)}%`;
  const ci = (name, badge = false) => h.CI.icon(name, badge);
  const status = (s) => `<span class="tr-status tr-${e(s.toLowerCase().split(' ')[0])}">${e(s)}</span>`;
  function init(helpers) { h = helpers; T = helpers.T; }
  function modal(title, body, wide) {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog'); dialog.className = `tr-modal${wide ? ' tr-wide' : ''}`;
    dialog.innerHTML = `<header><h2>${e(title)}</h2><button type="button" data-close aria-label="Close">×</button></header>${body}`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (event) => { if (event.target.closest('[data-close]')) dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); if (previous?.isConnected) previous.focus(); });
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const elements = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href]')].filter((x) => !x.hidden);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    dialog.showModal(); dialog.querySelector('input,button')?.focus();
    return dialog;
  }
  const button = (label, attr, primary = false) => `<button type="button" class="btn ${primary ? '' : 'btn-ghost'} btn-small" ${attr}>${label}</button>`;
  const empty = (text) => `<p class="tr-empty">${e(text)}</p>`;
  function line(points, label, unit = '', small = false) {
    const valid = points.filter((p) => p.value != null);
    if (!valid.length) return empty('Insufficient data available for this period');
    const width = 560, height = small ? 90 : 200, pad = 22;
    const low = Math.min(...valid.map((p) => p.value)), high = Math.max(...valid.map((p) => p.value));
    const spread = high - low || Math.max(1, Math.abs(high) * .1);
    const xy = (p, i) => [pad + i * (width - pad * 2) / Math.max(1, points.length - 1), height - pad - (p.value - low) / spread * (height - pad * 2)];
    let path = '', on = false;
    points.forEach((p, i) => { if (p.value == null) { on = false; return; } const [x, y] = xy(p, i); path += `${on ? 'L' : 'M'}${x},${y} `; on = true; });
    return `<svg class="tr-line${small ? ' tr-spark' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${e(label)}"><title>${e(label)}</title><path d="M${pad} ${height-pad}H${width-pad}" class="tr-axis"/><path d="${path}" class="tr-stroke"/>${points.map((p, i) => p.value == null ? '' : `<circle cx="${xy(p,i)[0]}" cy="${xy(p,i)[1]}" r="3" class="tr-dot"><title>${e(date(p.day))}: ${n(p.value, 1)}${e(unit)}</title></circle>`).join('')}${small ? '' : `<text x="${pad}" y="${height-4}">${e(date(points[0].day))}</text><text x="${width-pad}" y="${height-4}" text-anchor="end">${e(date(points.at(-1).day))}</text><text x="${pad}" y="13">${n(low, 1)}–${n(high, 1)}${e(unit)}</text>`}</svg>`;
  }
  function stacked(report, mode) {
    const colours = ['var(--brand-blue)', 'var(--navy)', 'var(--sand)', 'color-mix(in srgb, var(--brand-blue) 65%, white)', 'color-mix(in srgb, var(--navy) 65%, white)', 'color-mix(in srgb, var(--brand-blue) 35%, white)', 'color-mix(in srgb, var(--navy) 35%, white)'];
    const used = Object.keys(T.PARTS).filter((p) => report.weeks.some((w) => w[mode][p]));
    const max = Math.max(1, ...report.weeks.map((w) => Object.values(w[mode]).reduce((a,b) => a+b, 0)));
    if (!used.length) return empty('No logged working sets for this period');
    const w = 720, height = 260, base = 220, usable = 180, bar = Math.min(38, 620 / report.weeks.length * .65);
    const svg = report.weeks.map((week, i) => {
      let y = base;
      const x = 65 + i * 620 / report.weeks.length;
      return used.map((p, j) => { const value = week[mode][p] || 0, bh = value / max * usable; y -= bh; return `<rect x="${x}" y="${y}" width="${bar}" height="${bh}" fill="${colours[j % colours.length]}" opacity="${j < 7 ? 1 : .65}"><title>${e(date(week.day))} · ${e(T.PARTS[p])}: ${n(value, 1)} ${mode === 'sets' ? 'sets' : 'kg'}</title></rect>`; }).join('') + (report.weeks.length <= 13 || i % 3 === 0 ? `<text x="${x}" y="242" font-size="10">${e(date(week.day).replace(/ \d{4}$/, ''))}</text>` : '');
    }).join('');
    return `<svg class="tr-volume" viewBox="0 0 ${w} ${height}" role="img" aria-label="Weekly training ${mode} by body part"><title>Weekly training ${e(mode)} by body part</title>${[0,.5,1].map((f) => `<path class="tr-axis" d="M50 ${base-f*usable}H710"/><text x="42" y="${base-f*usable+4}" text-anchor="end">${n(max*f)}</text>`).join('')}${svg}</svg><div class="tr-legend">${used.map((p, i) => `<span><i style="background:${colours[i%colours.length]}"></i>${e(T.PARTS[p])}</span>`).join('')}</div>`;
  }
  async function render(ctx, title, sub, tab = 'workouts') {
    const renderId = h.state.renderId;
    const lib = await h.loadExerciseLibrary();
    // Full recorded history is necessary for 26-week/custom ranges and bests.
    let logs = [], error;
    for (let from = 0; ; from += 500) {
      const result = await h.sb.from('workout_logs').select('*').eq('user_id', ctx.profile.id).order('day').range(from, from+499);
      if (result.error) { error = result.error; break; }
      logs.push(...result.data); if (result.data.length < 500) break;
    }
    if (h.state.renderId !== renderId) return;
    const id = ctx.profile.id;
    const view = views.get(id) || { weeks: 8, from: T.add(h.S.today(), -55), to: h.S.today(), mode: 'sets', part: '', page: 0 };
    views.set(id, view);
    const starts = [...new Set(ctx.training.map((r) => r.program_start_date))].sort().reverse();
    const activeStart = starts.find((s) => s <= h.S.today());
    const current = ctx.training.filter((r) => r.program_start_date === (activeStart || starts[0])).sort((a,b) => a.cycle_day-b.cycle_day);
    const openSetup = tab === 'new';
    if (openSetup) tab = 'program';
    const pending = h.state.pendingExercise;
    if (pending?.clientId === id) {
      let draft = drafts.get(id);
      if (!draft) draft = pending.newPlan ? T.newProgram('New training program', nextDate(), [1,2,3,5,6]) : T.program(current, h.S.today());
      const day = draft.days.find((d) => d.cycle_day === pending.day);
      if (day) { day.is_rest_day = false; day.exercises.push(T.exercise(pending.exercise)); }
      drafts.set(id, draft); h.state.pendingExercise = null; tab = 'designer';
    }
    const url = (p) => `#client/${id}/training/${p}`;
    const saveKey = `rewired-program-draft:${h.state.me.id}:${id}`;
    function nextDate() { return starts[0] && starts[0] >= h.S.today() ? T.add(starts[0],1) : h.S.today(); }
    function go(p) { location.hash = url(p); }
    function frame(content) {
      h.shell(title, sub, `<div class="tr-page"><div class="tr-heading"><p>Workouts, progress and your client's training program</p>${button('+ Add Program', 'data-tr-new', true)}</div><nav class="tr-tabs" aria-label="Training pages">${['workouts','progress','program'].map((p) => `<a href="${url(p)}" ${tab === p || tab === 'designer' && p === 'program' ? 'aria-current="page"' : ''}>${p[0].toUpperCase()+p.slice(1)}</a>`).join('')}</nav>${error ? '<div class="card tr-alert">Training history could not be loaded. Please retry; reports are unavailable.</div>' : ''}${content}</div>`);
      h.root.querySelector('[data-tr-new]').addEventListener('click', setup);
    }
    const report = T.analyse(error ? [] : logs, ctx.training, lib.list, view.from, view.to);
    if (tab === 'designer') { if (!drafts.has(id)) { tab = 'program'; } else { designer(); return; } }
    if (tab === 'progress') progress();
    else if (tab === 'program') programs();
    else workouts();
    if (openSetup && !pending) setup();

    function setup() {
      const dialog = modal('Add training program', `<form class="tr-setup"><label>Program name<input name="program_name" required maxlength="160" placeholder="e.g. Strength · Phase 2"></label><label>Start date<input name="start" type="date" value="${nextDate()}" required></label><fieldset><legend>Start from</legend><label class="tr-option"><input type="radio" name="source" value="blank" checked> Blank program <small>Design your own workout days</small></label><label class="tr-option"><input type="radio" name="source" value="current" ${current.length ? '' : 'disabled'}> Copy current program <small>Keep its workouts and prescriptions</small></label></fieldset><fieldset data-days><legend>Workout days · repeating seven-day cycle</legend><div class="tr-checks">${Array.from({length:7},(_,i) => `<label><input type="checkbox" name="day" value="${i+1}" ${[0,1,3,4].includes(i)?'checked':''}>Day ${i+1}</label>`).join('')}</div><p class="hint">Other days are rest days. You can adjust these in the designer.</p></fieldset><p class="tr-error" role="alert"></p><footer>${button('Cancel','data-close')}<button class="btn" type="submit">Design workout →</button></footer></form>`);
      const form = dialog.querySelector('form');
      form.addEventListener('change', () => { const copy = form.querySelector('[name=source]:checked').value === 'current'; form.querySelector('[data-days]').hidden = copy; });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = form.querySelector('[name=program_name]').value.trim(), start = form.querySelector('[name=start]').value;
        const days = [...form.querySelectorAll('[name=day]:checked')].map((x) => Number(x.value));
        const copy = form.querySelector('[name=source]:checked').value === 'current';
        if (!name || !start || starts.includes(start) || !copy && !days.length) { form.querySelector('.tr-error').textContent = starts.includes(start) ? 'A program already starts on that date. Choose another date or edit that version.' : 'Add a name, start date and at least one workout day.'; return; }
        if (drafts.has(id) && !confirm('Replace your unsaved in-memory program draft?')) return;
        drafts.set(id, T.newProgram(name,start,days,copy?current:null)); dialog.close(); go('designer');
      });
    }
    function workouts() {
      const last7 = T.analyse(error ? [] : logs, ctx.training, lib.list, T.add(h.S.today(),-6),h.S.today());
      const prev7 = T.analyse(error ? [] : logs, ctx.training, lib.list, T.add(h.S.today(),-13),T.add(h.S.today(),-7));
      const summary = T.analyse(error ? [] : logs, ctx.training, lib.list, T.add(h.S.today(),-55),h.S.today());
      const sets = last7.sessions.reduce((a,w) => a+w.count,0), before = prev7.sessions.reduce((a,w) => a+w.count,0);
      const best = last7.exercises.filter((x) => x.newBest);
      const top = summary.exercises.filter((x) => x.change != null).sort((a,b) => Math.abs(b.change)-Math.abs(a.change)).slice(0,2);
      const kpi = (label,value,detail) => `<article class="card tr-kpi"><small>${label}</small><strong>${value}</strong><span>${e(detail)}</span></article>`;
      frame(`<div class="tr-three"><article class="card tr-card"><h2 class="tr-summary-title">${ci('training',true)}<span>Overall progress</span><small>8 weeks</small></h2><dl><div><dt>${ci('trend')}<span>Strength trend</span></dt><dd>${signed(summary.change)}</dd></div><div><dt>${ci('training')}<span>Exercises tracked</span></dt><dd>${n(summary.exercises.length)}</dd></div><div><dt>${ci('star')}<span>Biggest improvement</span></dt><dd>${e(summary.exercises.filter((x)=>x.change>0).sort((a,b)=>b.change-a.change)[0]?.name || 'Insufficient data')}</dd></div></dl></article><article class="card tr-card"><h2 class="tr-summary-title">${ci('calendar',true)}<span>Week summary</span><small>Last 7 days</small></h2><dl><div><dt>${ci('clock')}<span>Sessions</span></dt><dd>${n(last7.sessions.length)}</dd></div><div><dt>${ci('training')}<span>Working sets</span></dt><dd>${n(sets)}</dd></div><div><dt>${ci('trend')}<span>Set change vs previous 7 days</span></dt><dd>${prev7.sessions.length ? `${sets-before>0?'+':''}${n(sets-before)}` : 'No comparison yet'}</dd></div><div><dt>${ci('star')}<span>Exercises with a new best</span></dt><dd>${n(best.length)}</dd></div></dl></article><article class="card tr-card"><h2 class="tr-summary-title">${ci('chart',true)}<span>Analysis</span><small>Top 2 trends</small></h2>${top.length ? top.map((x)=>`<p><b>${e(x.name)}</b><br>${signed(x.change)} estimated strength ${status(x.status)}</p>`).join('') : empty('More comparable sessions are needed to identify trends.')}</article></div><div class="tr-four">${kpi('Sessions · 7 days', error?'–':n(last7.sessions.length),'Completed workout logs')}${kpi('Working sets · 7 days',error?'–':n(sets),'Warmups excluded when labelled')}${kpi('Average performance · 7 days','–','Session ratings are not recorded')}${kpi('Time trained · 7 days','–','Workout duration is not recorded')}</div><article class="card tr-card"><h2 class="tr-summary-title">${ci('physique',true)}<span>Sets by body part</span><small>Last 7 days</small></h2><p class="hint">Select a body part to see its exercises. Shared primary muscles split each set equally.</p><div class="tr-part-grid">${last7.parts.map((p)=>`<button data-tr-part="${p.id}" aria-pressed="false"><span>${e(p.name)}</span><b>${n(p.total,1)}</b></button>`).join('')}</div><div data-part-detail></div></article><article class="card tr-card"><h2 class="tr-summary-title">${ci('calendar',true)}<span>Workout history</span></h2><div class="tr-scroll"><table><thead><tr><th>Date</th><th>Workout</th><th>Type</th><th>Duration</th><th>Working sets</th><th>Performance</th></tr></thead><tbody>${summary.sessions.slice().reverse().map((w)=>`<tr><td>${date(w.day)}</td><td><button class="tr-link" data-workout="${e(w.day)}">${e(w.session_name||'Workout')}</button></td><td>Training</td><td>–</td><td>${n(w.count)}</td><td>–</td></tr>`).join('') || '<tr><td colspan="6">No workouts logged in the last 8 weeks</td></tr>'}</tbody></table></div></article>`);
      h.root.querySelectorAll('[data-tr-part]').forEach((b)=>b.addEventListener('click',()=>{
        h.root.querySelectorAll('[data-tr-part]').forEach((x)=>x.setAttribute('aria-pressed',String(x===b)));
        const list = last7.exercises.filter((x)=>x.parts.includes(b.dataset.trPart));
        h.root.querySelector('[data-part-detail]').innerHTML = list.length ? `<ul>${list.map((x)=>`<li>${e(x.name)} · ${n(x.sets)} sets</li>`).join('')}</ul>` : empty('No working sets for this body part in the last 7 days');
      }));
      h.root.querySelectorAll('[data-workout]').forEach((b)=>b.addEventListener('click',()=>{
        const log = logs.find((x)=>x.day===b.dataset.workout);
        modal(log.session_name||'Workout',`<div class="tr-card"><p>${date(log.day)}</p>${(log.exercises||[]).map((x)=>`<h3>${e(x.name)}</h3><p>${(x.sets||[]).map((s)=>`${s.kg==null?'Bodyweight':`${n(s.kg,1)} kg`} × ${n(s.reps)}${s.set_type?` · ${e(s.set_type)}`:''}`).join('<br>')}</p>`).join('')}${log.note?`<p>${e(log.note)}</p>`:''}</div>`);
      }));
    }
    function progress() {
      const windowDays = T.days(view.from,view.to)+1;
      const preceding = T.analyse(error?[]:logs,ctx.training,lib.list,T.add(view.from,-windowDays),T.add(view.from,-1));
      const weekly = (r) => r.weeks.reduce((sum,w)=>sum+Object.values(w[view.mode]).reduce((a,b)=>a+b,0),0)/r.weeks.length;
      const comparison = preceding.sessions.length ? `${weekly(report)-weekly(preceding)>0?'+':''}${n(weekly(report)-weekly(preceding),1)} against the previous equal window` : 'No previous window available';
      frame(`<div class="tr-range"><div role="group" aria-label="Progress range">${[8,12,26].map((w)=>button(`${w} wk`,`data-weeks="${w}" aria-pressed="${view.weeks===w}"`)).join('')}${button('Custom',`data-weeks="custom" aria-pressed="${view.weeks==='custom'}"`)}</div><label>From<input data-from type="date" value="${view.from}" max="${view.to}"></label><label>To<input data-to type="date" value="${view.to}" max="${h.S.today()}"></label><span>${date(view.from)} – ${date(view.to)}</span></div><div class="tr-progress-top"><div><article class="card tr-card"><h2 class="tr-summary-title">${ci('trend',true)}<span>Strength trend</span></h2><strong class="tr-big">${signed(report.change)}</strong><p class="hint">Set-weighted change in estimated strength</p>${line(report.strength,'Estimated strength change','%')}<p class="hint">${report.change == null ? 'Two weighted sessions at least a week apart are needed.' : `${signed(report.change / Math.max(1,(T.days(view.from,view.to)+1)/7))} per week across the selected window`}</p></article><article class="card tr-card"><h2 class="tr-summary-title">${ci('chart',true)}<span>Status spread</span></h2><div class="tr-spread">${Object.entries(report.spread).map(([s,count])=>`<span class="tr-${e(s.toLowerCase().split(' ')[0])}" style="flex:${count}" title="${e(s)}: ${count}"></span>`).join('')}</div>${Object.entries(report.spread).map(([s,count])=>`<button class="tr-spread-row" data-status="${e(s)}">${status(s)}<b>${count} ›</b></button>`).join('')}</article></div><article class="card tr-card"><h2>Training volume <span>${button('Sets',`data-mode="sets" aria-pressed="${view.mode==='sets'}"`)}${button('Volume',`data-mode="volume" aria-pressed="${view.mode==='volume'}"`)}</span></h2><p class="hint">Weekly ${view.mode==='sets'?'working sets':'external load × reps (kg)'} by primary body part</p>${stacked(report,view.mode)}<p class="hint">Average ${n(report.weeks.reduce((sum,w)=>sum+Object.values(w[view.mode]).reduce((a,b)=>a+b,0),0)/report.weeks.length,1)} ${view.mode==='sets'?'sets':'kg'} per week · ${comparison}. Warmups excluded when labelled.</p></article></div><article class="card tr-card"><h2 class="tr-summary-title">${ci('physique',true)}<span>Body part progress</span></h2><div class="tr-part-grid tr-progress-parts">${report.parts.map((p)=>`<button data-progress-part="${p.id}"><span>${e(p.name)}</span>${status(p.status)}<strong>${n(p.total/report.weeks.length,1)}<small> / wk</small></strong><small>${n(p.total,1)} sets in this window</small>${line(p.values.map((value,i)=>({day:report.weeks[i].day,value})),`${p.name} weekly sets`,'',true)}<small>${p.last?`Last trained ${date(p.last)}`:'Not trained in this window'}</small><small>${p.lastBest?`Last best ${date(p.lastBest)}`:'No recorded best in this window'}</small></button>`).join('')}</div></article><article class="card tr-card"><h2>Exercises <small>${report.exercises.length} with working sets</small></h2><p class="hint" data-ex-filter>Estimated 1RM uses Epley for weighted sets of 1–30 reps. Status compares first and last estimates: ±2%; plateau under 0.5% over at least 4 weeks.</p><div data-ex-table></div></article><details class="card tr-card"><summary>How these reports are calculated</summary><p>Warmup sets are excluded when their log has that label. Older logs without set types count as working sets. Each set is split equally between its primary body parts; unknown muscles appear as Other. Volume uses external weight × reps, so unweighted sets contribute sets but no external volume. Strength is an estimate, not a tested max. Each exercise's first and last comparable estimates are weighted by its logged sets. No missing duration, rating or weight is invented.</p><p>Best history covers all recorded workout logs, including those before this date range.</p></details>`);
      const showExercises = (filter) => {
        const list = report.exercises.filter(filter||(()=>true));
        const pages = Math.max(1,Math.ceil(list.length/10)); view.page = Math.min(view.page,pages-1);
        h.root.querySelector('[data-ex-table]').innerHTML = `<div class="tr-scroll"><table><thead><tr><th>Exercise</th><th>Sessions</th><th>Sets</th><th>Est. 1RM</th><th>Last done</th><th>Status</th></tr></thead><tbody>${list.slice(view.page*10,view.page*10+10).map((x)=>`<tr><td><button class="tr-link" data-ex="${e(x.id)}">${e(x.name)}</button>${x.newBest?'<span class="tr-status">New best · 7d</span>':''}</td><td>${x.sessions}</td><td>${x.sets}</td><td>${n(x.latest?.estimated,1)}${x.latest?.estimated!=null?' kg':''}</td><td>${date(x.latest?.day)}</td><td>${status(x.status)}</td></tr>`).join('')||'<tr><td colspan="6">No matching exercises with logged working sets</td></tr>'}</tbody></table></div><footer class="tr-pager">${button('‹',`data-page="-1" aria-label="Previous exercise page" ${view.page===0?'disabled':''}`)}<span>Page ${view.page+1} of ${pages} · ${list.length} exercises</span>${button('›',`data-page="1" aria-label="Next exercise page" ${view.page===pages-1?'disabled':''}`)}${button('Show all','data-show-all')}</footer>`;
        h.root.querySelectorAll('[data-ex]').forEach((b)=>b.addEventListener('click',()=>detail(report.exercises.find((x)=>x.id===b.dataset.ex))));
        h.root.querySelectorAll('[data-page]').forEach((b)=>b.addEventListener('click',()=>{view.page+=Number(b.dataset.page);showExercises(filter);}));
        h.root.querySelector('[data-show-all]').addEventListener('click',()=>{view.page=0;showExercises();});
      };
      showExercises();
      h.root.querySelectorAll('[data-weeks]').forEach((b)=>b.addEventListener('click',()=>{view.weeks=b.dataset.weeks==='custom'?'custom':Number(b.dataset.weeks);if(view.weeks!=='custom')view.from=T.add(view.to,1-view.weeks*7);refreshReport();}));
      for(const field of ['from','to'])h.root.querySelector(`[data-${field}]`).addEventListener('change',(event)=>{
        const from=field==='from'?event.target.value:view.from,to=field==='to'?event.target.value:view.to;
        if(!from||!to||from>to||to>h.S.today()||T.days(from,to)>1095){h.toast('Choose a valid date range of up to three years, ending today or earlier.',true);progress();return;}
        Object.assign(view,{from,to,weeks:'custom',page:0}); refreshReport();
      });
      h.root.querySelectorAll('[data-mode]').forEach((b)=>b.addEventListener('click',()=>{view.mode=b.dataset.mode;progress();}));
      h.root.querySelectorAll('[data-status]').forEach((b)=>b.addEventListener('click',()=>{view.page=0;showExercises((x)=>x.status===b.dataset.status);}));
      h.root.querySelectorAll('[data-progress-part]').forEach((b)=>b.addEventListener('click',()=>{view.page=0;showExercises((x)=>x.parts.includes(b.dataset.progressPart));h.root.querySelector('[data-ex-table]').scrollIntoView({block:'nearest',behavior:'smooth'});}));
    }
    function refreshReport() { Object.assign(report,T.analyse(error?[]:logs,ctx.training,lib.list,view.from,view.to));progress(); }
    function detail(ex) {
      const dialog=modal(ex.name,`<div class="tr-card"><p>${status(ex.status)} · ${ex.sessions} sessions in window</p><div class="tr-checks">${[['estimated','Est. 1RM'],['topWeight','Top weight'],['topReps','Top reps'],['bestSetScore','Best set'],['volume','Volume']].map(([key,label])=>button(label,`data-metric="${key}" aria-pressed="${key==='estimated'}"`)).join('')}</div><div data-chart></div><div class="tr-four">${[['Latest estimate',ex.latest?.estimated],['Change (%)',ex.change],['Best in window',Math.max(...ex.history.map((p)=>p.estimated||0))||null],['Recorded best',Math.max(...ex.allHistory.map((p)=>p.estimated||0))||null]].map(([label,value])=>`<div class="tr-kpi"><small>${label}</small><strong>${n(value,1)}${label.includes('(%)')?'%':value!=null?' kg':''}</strong></div>`).join('')}</div><h3>Sessions</h3><div class="tr-scroll"><table><thead><tr><th>Date</th><th>Workout</th><th>Best weighted set</th><th>Sets</th><th>Volume</th><th>Est. 1RM</th></tr></thead><tbody>${ex.history.slice().reverse().map((p)=>`<tr><td>${date(p.day)}</td><td>${e(p.session)}</td><td>${e(p.bestSet)}</td><td>${p.sets}</td><td>${n(p.volume)} kg</td><td>${n(p.estimated,1)}${p.estimated?' kg':''}</td></tr>`).join('')}</tbody></table></div><h3>Best history · all recorded sessions</h3><div class="tr-scroll"><table><thead><tr><th>Date</th><th>Best set</th><th>Est. 1RM</th><th>Improvement</th></tr></thead><tbody>${ex.bests.map((p,i)=>`<tr><td>${date(p.day)}</td><td>${e(p.bestSet)}</td><td>${n(p.estimated,1)} kg</td><td>${i?`+${n(p.estimated-ex.bests[i-1].estimated,1)} kg`:'First recorded'}</td></tr>`).reverse().join('')||'<tr><td colspan="4">No comparable weighted sets recorded</td></tr>'}</tbody></table></div></div>`,true);
      const draw=(metric)=>{dialog.querySelector('[data-chart]').innerHTML=line(ex.history.map((p)=>({day:p.day,value:p[metric]})),`${ex.name} ${metric}`,metric==='topReps'?' reps':' kg');dialog.querySelectorAll('[data-metric]').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.metric===metric)));};
      draw('estimated');dialog.querySelectorAll('[data-metric]').forEach((b)=>b.addEventListener('click',()=>draw(b.dataset.metric)));
    }
    function programs() {
      let saved=false;try{saved=!!sessionStorage.getItem(saveKey);}catch(_){}
      frame(`<article class="card tr-card"><h2>Program</h2><p class="hint">Saved versions keep their original start dates. A future version starts on its scheduled date.</p>${drafts.has(id)?button('Continue unsaved draft','data-resume',true):''}${saved?button('Restore saved draft','data-restore'):''}${starts.map((start)=>{
        const rows=ctx.training.filter((r)=>r.program_start_date===start).sort((a,b)=>a.cycle_day-b.cycle_day);
        return `<section class="tr-program"><div><h3>${e(rows[0].program_name)}</h3><p>${date(start)} · ${rows.length}-day cycle · ${rows.filter((r)=>!r.is_rest_day).length} workouts <span class="tr-status">${start===activeStart?'Active':start>h.S.today()?'Scheduled':'Previous'}</span></p><div class="tr-checks">${rows.map((r)=>`<button type="button" class="tr-day-chip" data-view-day="${e(start)}:${r.cycle_day}">Day ${r.cycle_day} · ${e(r.session_name)}</button>`).join('')}</div></div>${button('Edit program',`data-edit="${e(start)}"`)}</section>`;
      }).join('')||empty('No training program assigned yet. Add a program to start designing.')}</article>`);
      h.root.querySelectorAll('[data-view-day]').forEach((b)=>b.addEventListener('click',()=>{
        const [start,cycleDay]=b.dataset.viewDay.split(':');
        const day=ctx.training.find((r)=>r.program_start_date===start&&r.cycle_day===Number(cycleDay));
        modal(`Day ${cycleDay} · ${day.session_name}`,`<div class="tr-card"><p>${e(day.program_name)} · ${date(start)}</p>${day.is_rest_day?empty('Rest and recover.'):(day.exercises||[]).map((ex)=>`<h3>${e(ex.name)}</h3><div class="tr-scroll"><table><thead><tr><th>Set</th><th>Weight</th><th>Reps</th><th>Tempo</th><th>RIR</th><th>Type / group</th><th>Rest</th></tr></thead><tbody>${T.prescriptions(ex).map((s,i)=>`<tr><td>${i+1}</td><td>${s.weight_kg==null||s.weight_kg===''?'–':`${n(s.weight_kg,1)} kg`}</td><td>${n(s.reps_min)}–${n(s.reps_max)}</td><td>${e(s.tempo||'–')}</td><td>${s.rir==null||s.rir===''?'–':n(s.rir)}</td><td>${e(s.set_type)} ${e(s.group||'')}</td><td>${n(s.rest_seconds)} sec</td></tr>`).join('')}</tbody></table></div>${ex.note?`<p>${e(ex.note)}</p>`:''}`).join('')}${day.session_note?`<p>${e(day.session_note)}</p>`:''}</div>`,true);
      }));
      h.root.querySelectorAll('[data-edit]').forEach((b)=>b.addEventListener('click',()=>{if(drafts.has(id)&&!confirm('Replace your unsaved draft with this saved version?'))return;drafts.set(id,T.program(ctx.training.filter((r)=>r.program_start_date===b.dataset.edit).sort((a,b)=>a.cycle_day-b.cycle_day),h.S.today()));go('designer');}));
      h.root.querySelector('[data-resume]')?.addEventListener('click',()=>go('designer'));
      h.root.querySelector('[data-restore]')?.addEventListener('click',()=>{try{const draft=JSON.parse(sessionStorage.getItem(saveKey));if(!draft?.days?.length)throw Error('Draft unavailable');drafts.set(id,draft);go('designer');}catch(_){h.toast('This saved draft could not be restored.',true);}});
    }
    function designer() {
      const draft=drafts.get(id);let selected=draft.days.find((d)=>!d.is_rest_day)?.cycle_day||1;
      let reordering=false;
      const persist=()=>{try{sessionStorage.setItem(saveKey,JSON.stringify(draft));h.toast('Draft saved in this browser session. The client program has not changed.');}catch(_){h.toast('Browser storage is unavailable. Keep this page open to retain your draft.',true);}};
      function draw() {
        const day=draft.days.find((d)=>d.cycle_day===selected);
        frame(`<div class="tr-designer-head">${button('← Program','data-back')}<div><h2>${e(draft.name||'Untitled program')}</h2><small>Starts ${date(draft.start)} · ${draft.editing?'Editing saved version':'New program draft'}</small></div><div>${button('Program settings','data-settings')}${button('Save Draft','data-draft')}${button('Save program','data-save',true)}</div></div><div class="tr-designer"><aside class="card tr-card"><h2>Workouts ${button('+ Add workout','data-workout-add')}</h2><div class="tr-workout-list">${draft.days.map((d)=>`<button type="button" data-day="${d.cycle_day}" aria-pressed="${d.cycle_day===selected}"><small>Day ${d.cycle_day}</small><strong>${d.is_rest_day?'Rest day':e(d.session_name||'Untitled workout')}</strong><small>${d.is_rest_day?'Recovery':`${d.exercises.length} exercises`}</small></button>`).join('')}</div></aside><section class="tr-workout"><div class="tr-workout-head"><label>Workout name<input data-day-name maxlength="120" value="${e(day.session_name)}" ${day.is_rest_day?'disabled':''}></label><div>${button('Volume breakdown','data-volume')}${button(reordering?'Done reordering':'Reorder','data-reorder')}${button('+ Add Exercise','data-add-ex',true)}</div></div><label class="tr-rest"><input type="checkbox" data-rest ${day.is_rest_day?'checked':''}>Rest day</label>${day.is_rest_day?empty('Rest and recover. Untick Rest day to design a workout here.'):day.exercises.length?day.exercises.map((ex,i)=>exerciseCard(ex,i,reordering)).join(''):`<div class="card tr-card">${empty('You have not added any exercises yet.')}${button('+ Add Saved Workout','data-import')}</div>`}${!day.is_rest_day&&day.exercises.length?button('+ Add Saved Workout','data-import'):''}<label class="tr-session-note">Workout note<textarea data-day-note maxlength="2000" placeholder="Warm-up, coaching notes or workout instructions">${e(day.session_note||'')}</textarea></label><p class="hint">Save Draft keeps this in your current browser session. Save program updates the client's assigned plan.</p></section></div>`);
        h.root.querySelector('[data-back]').addEventListener('click',()=>go('program'));
        h.root.querySelector('[data-settings]').addEventListener('click',settings);
        h.root.querySelector('[data-draft]').addEventListener('click',persist);
        h.root.querySelector('[data-save]').addEventListener('click',(event)=>h.withBusy(event.currentTarget,async()=>{
          if(!draft.editing&&starts.includes(draft.start))throw Error('A program already starts on that date. Choose a different start date.');
          const rows=T.payload(draft,id);
          const saved=h.must(await h.sb.from('training_plan').upsert(rows,{onConflict:'client_id,program_start_date,cycle_day'}).select('cycle_day'));
          if(saved.length!==rows.length)throw Error('The complete program could not be saved. Please retry.');
          drafts.delete(id);try{sessionStorage.removeItem(saveKey);}catch(_){}h.invalidate(id);h.toast('Training program saved for this client.');go('program');
        }));
        h.root.querySelectorAll('[data-day]').forEach((b)=>b.addEventListener('click',()=>{selected=Number(b.dataset.day);draw();}));
        h.root.querySelector('[data-day-name]').addEventListener('input',(event)=>{day.session_name=event.target.value;const label=h.root.querySelector(`[data-day="${selected}"] strong`);if(label)label.textContent=day.session_name||'Untitled workout';});
        h.root.querySelector('[data-day-note]').addEventListener('input',(event)=>{day.session_note=event.target.value;});
        h.root.querySelector('[data-rest]').addEventListener('change',(event)=>{day.is_rest_day=event.target.checked;draw();});
        h.root.querySelector('[data-add-ex]').disabled=day.is_rest_day||!lib.ready;
        h.root.querySelector('[data-add-ex]').addEventListener('click',()=>picker(day,draw));
        h.root.querySelector('[data-reorder]').addEventListener('click',()=>{reordering=!reordering;draw();});
        h.root.querySelector('[data-volume]').addEventListener('click',()=>{
          const totals={};day.exercises.forEach((ex)=>{const parts=[...new Set((ex.primary||[]).map((p)=>h.X.MUSCLES[p]||p))];const count=ex.prescriptions.filter((s)=>s.set_type!=='Warmup').length;for(const p of parts.length?parts:['Other'])totals[p]=(totals[p]||0)+count/(parts.length||1);});
          modal('Workout volume breakdown',`<div class="tr-card"><p>Working sets, split between primary muscles. Warmups excluded.</p>${Object.entries(totals).map(([p,count])=>`<p><b>${e(p)}</b> · ${n(count,1)} sets</p>`).join('')||empty('Add exercises to see the volume breakdown.')}</div>`);
        });
        h.root.querySelector('[data-workout-add]').addEventListener('click',()=>{
          const options=draft.days.filter((d)=>d.is_rest_day);
          if(!options.length){h.toast('All days already have workouts. Select a day to edit it.');return;}
          const dialog=modal('Add workout',`<form class="tr-setup"><label>Day<select name="day">${options.map((d)=>`<option value="${d.cycle_day}">Day ${d.cycle_day}</option>`).join('')}</select></label><label>Workout name<input name="workout_name" required maxlength="120" placeholder="e.g. Upper body"></label><footer><button class="btn" type="submit">Add workout</button></footer></form>`);
          dialog.querySelector('form').addEventListener('submit',(event)=>{event.preventDefault();const d=draft.days.find((x)=>x.cycle_day===Number(dialog.querySelector('select').value));d.session_name=dialog.querySelector('input').value.trim();if(!d.session_name)return;d.is_rest_day=false;selected=d.cycle_day;dialog.close();draw();});
        });
        h.root.querySelector('[data-import]')?.addEventListener('click',()=>{
          const options=ctx.training.filter((d)=>!d.is_rest_day&&d.exercises?.length);
          const dialog=modal('Add saved workout',`<div class="tr-card"><p>Copy exercises from an existing saved client workout. Its original version stays intact.</p>${options.map((d,i)=>button(`${e(d.session_name)} · ${date(d.program_start_date)}`,`data-copy="${i}"`)).join('')||empty('No saved workouts are available for this client.')}</div>`);
          dialog.querySelectorAll('[data-copy]').forEach((b)=>b.addEventListener('click',()=>{day.exercises.push(...options[Number(b.dataset.copy)].exercises.map(T.exercise));dialog.close();draw();}));
        });
        h.root.querySelectorAll('[data-ex-card]').forEach((card)=>{
          const i=Number(card.dataset.exCard),ex=day.exercises[i];
          card.querySelector('[data-remove-ex]').addEventListener('click',()=>{day.exercises.splice(i,1);draw();});
          card.querySelector('[data-add-set]').addEventListener('click',()=>{if(ex.prescriptions.length>=20){h.toast('Use up to 20 sets per exercise.',true);return;}ex.prescriptions.push({...ex.prescriptions.at(-1)});draw();});
          card.querySelector('[data-cue]').addEventListener('input',(event)=>{ex.note=event.target.value;});
          card.querySelectorAll('[data-move]').forEach((b)=>b.addEventListener('click',()=>{const j=i+Number(b.dataset.move);if(j>=0&&j<day.exercises.length){[day.exercises[i],day.exercises[j]]=[day.exercises[j],day.exercises[i]];draw();}}));
          card.querySelectorAll('[data-set-row]').forEach((row)=>{
            const index=Number(row.dataset.setRow),s=ex.prescriptions[index];
            row.querySelectorAll('[data-field]').forEach((input)=>input.addEventListener('input',()=>{s[input.dataset.field]=input.value;}));
            row.querySelector('[data-remove-set]').disabled=ex.prescriptions.length===1;
            row.querySelector('[data-remove-set]').addEventListener('click',()=>{ex.prescriptions.splice(index,1);draw();});
          });
        });
      }
      function settings() {
        const dialog=modal('Program settings',`<form class="tr-setup"><label>Program name<input name="program_name" required maxlength="160" value="${e(draft.name)}"></label><label>Start date<input name="start" required type="date" value="${e(draft.start)}" ${draft.editing?'readonly':''}></label><p class="hint">${draft.editing?'The saved start date is locked. Add a new program to schedule a new phase.':`The ${draft.days.length}-day cycle repeats from this date.`}</p><footer><button class="btn" type="submit">Done</button></footer></form>`);
        dialog.querySelector('form').addEventListener('submit',(event)=>{event.preventDefault();draft.name=dialog.querySelector('[name=program_name]').value.trim();draft.start=dialog.querySelector('[name=start]').value;dialog.close();draw();});
      }
      draw();
    }
    function exerciseCard(ex,index,reordering) {
      const field=(key,value,attrs='')=>`<input data-field="${key}" value="${e(value??'')}" ${attrs}>`;
      return `<article class="card tr-exercise" data-ex-card="${index}"><header><span class="tr-ex-num">${index+1}</span><div><h3>${e(ex.name)}</h3><small>${e((ex.primary||[]).map((p)=>h.X.MUSCLES[p]||p).join(', '))} · ${ex.prescriptions.length} sets</small></div><div>${reordering?button('↑','data-move="-1" aria-label="Move exercise up"')+button('↓','data-move="1" aria-label="Move exercise down"'):''}${button('+ Add Set','data-add-set')}${button('Remove','data-remove-ex')}</div></header><div class="tr-scroll"><table class="tr-prescription"><thead><tr><th>Set</th><th>Weight (kg)</th><th>Rep range</th><th>Tempo</th><th>RIR</th><th>Set Type</th><th>Group</th><th>Rest (sec)</th><th></th></tr></thead><tbody>${ex.prescriptions.map((s,i)=>`<tr data-set-row="${i}"><td>${i+1}</td><td>${field('weight_kg',s.weight_kg,'type="number" min="0" max="500" step="0.5" placeholder="Optional" aria-label="Weight kg"')}</td><td><div class="tr-reps">${field('reps_min',s.reps_min,'type="number" min="1" max="100" aria-label="Minimum reps"')}<span>–</span>${field('reps_max',s.reps_max,'type="number" min="1" max="100" aria-label="Maximum reps"')}</div></td><td>${field('tempo',s.tempo,'maxlength="7" placeholder="3-1-X-0" aria-label="Tempo"')}</td><td>${field('rir',s.rir,'type="number" min="0" max="10" placeholder="–" aria-label="Reps in reserve"')}</td><td><select data-field="set_type" aria-label="Set type">${T.SET_TYPES.map((type)=>`<option ${s.set_type===type?'selected':''}>${e(type)}</option>`).join('')}</select></td><td>${field('group',s.group,'maxlength="20" placeholder="e.g. A1" aria-label="Superset or giant set group"')}</td><td>${field('rest_seconds',s.rest_seconds,'type="number" min="0" max="1200" step="1" aria-label="Rest seconds"')}</td><td>${button('×','data-remove-set aria-label="Remove set"')}</td></tr>`).join('')}</tbody></table></div><label class="tr-cue">Coach cue<input data-cue maxlength="500" value="${e(ex.note||'')}" placeholder="Optional technique instructions"></label><p class="hint">Tempo: lowering – pause – lifting – pause; X = explosive. Use the same group letter for paired superset / giant set exercises.</p></article>`;
    }
    function picker(day,done) {
      const selected=new Set();let page=0,q='',focus='',source='',equipment='',type='';
      const dialog=modal('Add Exercises',`<div class="tr-card"><div class="tr-picker-filters"><input type="search" data-search placeholder="Search your exercise library" aria-label="Search exercises"><select data-filter="type" aria-label="Exercise type"><option value="">All types</option><option>Resistance</option><option>Cardio</option></select><select data-filter="focus" aria-label="Primary focus"><option value="">Primary focus</option>${Object.entries(h.X.MUSCLES).map(([k,v])=>`<option value="${k}">${e(v)}</option>`).join('')}</select><select data-filter="equipment" aria-label="Equipment"><option value="">Equipment</option>${[...new Set(lib.list.map((x)=>x.equipment).filter(Boolean))].sort().map((v)=>`<option>${e(v)}</option>`).join('')}</select><select data-filter="source" aria-label="Library"><option value="">All libraries</option><option value="default">Default</option><option value="custom">Custom</option></select>${button('Reset filters','data-reset')}</div><div class="tr-selected" aria-live="polite" data-selected>0 exercises selected</div><div data-picker-table></div><p class="hint">Only exercises already in your database are listed. Selections are kept while you search or change pages.</p></div><footer>${button('Cancel','data-close')}<button class="btn" type="button" data-add-selected disabled>Add selected exercises</button></footer>`,true);
      function draw() {
        const rows=lib.list.filter((x)=>(!q||T.key(`${x.name} ${x.equipment}`).includes(T.key(q)))&&(!focus||(x.primary||[]).includes(focus))&&(!equipment||x.equipment===equipment)&&(!source||(x.custom?'custom':'default')===source)&&(!type||h.EUI.typeOf(x)===type));
        const pages=Math.max(1,Math.ceil(rows.length/10));page=Math.max(0,Math.min(page,pages-1));const slice=rows.slice(page*10,page*10+10);
        dialog.querySelector('[data-selected]').textContent=`${selected.size} exercise${selected.size===1?'':'s'} selected`;
        dialog.querySelector('[data-add-selected]').disabled=!selected.size;
        dialog.querySelector('[data-picker-table]').innerHTML=`<div class="tr-scroll"><table><thead><tr><th><input type="checkbox" data-all aria-label="Select all exercises on this page" ${slice.length&&slice.every((x)=>selected.has(x.id))?'checked':''}></th><th>Name</th><th>Type</th><th>Primary focus</th><th>Category</th><th>Library</th><th></th></tr></thead><tbody>${slice.map((x)=>`<tr><td><input type="checkbox" data-check="${e(x.id)}" aria-label="Select ${e(x.name)}" ${selected.has(x.id)?'checked':''}></td><td>${e(x.name)}</td><td>${e(h.EUI.typeOf(x))}</td><td>${e((x.primary||[]).map((p)=>h.X.MUSCLES[p]||p).join(', '))}</td><td>${e(x.equipment||'Other')}</td><td>${x.custom?'Custom':'Default'}</td><td>${button('View',`data-view="${e(x.id)}"`)}</td></tr>`).join('')||'<tr><td colspan="7">No matching exercises in your database</td></tr>'}</tbody></table></div><div class="tr-pager">${button('‹',`data-picker-page="-1" ${page===0?'disabled':''}`)}<span>${rows.length?`${page*10+1}–${Math.min(rows.length,page*10+10)}`:'0'} of ${rows.length} · Page ${page+1} of ${pages}</span>${button('›',`data-picker-page="1" ${page===pages-1?'disabled':''}`)}</div>`;
        dialog.querySelectorAll('[data-check]').forEach((input)=>input.addEventListener('change',()=>{input.checked?selected.add(input.dataset.check):selected.delete(input.dataset.check);draw();}));
        dialog.querySelector('[data-all]').addEventListener('change',(event)=>{for(const x of slice)event.target.checked?selected.add(x.id):selected.delete(x.id);draw();});
        dialog.querySelectorAll('[data-picker-page]').forEach((b)=>b.addEventListener('click',()=>{page+=Number(b.dataset.pickerPage);draw();}));
        dialog.querySelectorAll('[data-view]').forEach((b)=>b.addEventListener('click',()=>{const x=lib.list.find((ex)=>ex.id===b.dataset.view);modal(x.name,`<div class="tr-card">${h.X.bodyDiagram(x.primary,x.secondary)}<p>${e(x.equipment||'Equipment not specified')}</p><p>Primary: ${e((x.primary||[]).map((p)=>h.X.MUSCLES[p]||p).join(', ')||'Not specified')}</p></div>`);}));
      }
      dialog.querySelector('[data-search]').addEventListener('input',(event)=>{q=event.target.value;page=0;draw();});
      dialog.querySelectorAll('[data-filter]').forEach((input)=>input.addEventListener('change',()=>{focus=dialog.querySelector('[data-filter=focus]').value;source=dialog.querySelector('[data-filter=source]').value;equipment=dialog.querySelector('[data-filter=equipment]').value;type=dialog.querySelector('[data-filter=type]').value;page=0;draw();}));
      dialog.querySelector('[data-reset]').addEventListener('click',()=>{q=focus=source=equipment=type='';page=0;dialog.querySelector('[data-search]').value='';dialog.querySelectorAll('[data-filter]').forEach((x)=>x.value='');draw();});
      dialog.querySelector('[data-add-selected]').addEventListener('click',()=>{day.exercises.push(...[...selected].map((id)=>lib.list.find((x)=>x.id===id)).filter(Boolean).map((x)=>T.exercise({exercise_id:x.id,name:x.name,primary:x.primary,secondary:x.secondary,equipment:x.equipment})));dialog.close();done();});
      draw();
    }
  }
  root.RewiredTrainingUI={init,render};
})(window);
