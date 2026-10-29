// Training reporting and compatible program payloads. No network or UI.
(function (root) {
  'use strict';
  const SET_TYPES = ['Working set', 'Warmup', 'Drop set', 'Superset', 'Giant set', 'Rest pause', 'Failure', 'Widowmaker', 'AMRAP', 'Top set', 'Back off set'];
  const PARTS = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', adductors: 'Adductors', core: 'Core', legs: 'Legs', full_body: 'Full body', other: 'Other' };
  const key = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const num = (v) => v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
  const add = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  function part(m) {
    if (['front_delts', 'side_delts', 'rear_delts'].includes(m)) return 'shoulders';
    if (['lats', 'traps', 'upper_back', 'lower_back'].includes(m)) return 'back';
    if (['abs', 'obliques'].includes(m)) return 'core';
    return PARTS[m] ? m : 'other';
  }
  function prescriptions(ex) {
    if (Array.isArray(ex.prescriptions) && ex.prescriptions.length) return clone(ex.prescriptions);
    return Array.from({ length: Math.max(1, Math.min(20, Number(ex.sets) || 3)) }, () => ({ weight_kg: ex.weight_kg ?? '', reps_min: ex.reps_min ?? 8, reps_max: ex.reps_max ?? 12, tempo: ex.tempo || '', rir: ex.rir === false ? '' : ex.rir_target ?? 2, set_type: 'Working set', rest_seconds: ex.rest_seconds_min ?? ex.rest_seconds_max ?? 90, group: '' }));
  }
  function exercise(ex) { return { ...clone(ex), prescriptions: prescriptions(ex) }; }
  function program(rows, fallbackDate) {
    return { name: rows[0]?.program_name || '', start: rows[0]?.program_start_date || fallbackDate, editing: !!rows.length, days: rows.map((r) => ({ ...clone(r), exercises: (r.exercises || []).map(exercise) })) };
  }
  function newProgram(name, start, selected, copyRows) {
    const draft = program(copyRows || [], start);
    draft.name = name; draft.start = start; draft.editing = false;
    if (!draft.days.length) draft.days = Array.from({ length: 7 }, (_, i) => ({ cycle_day: i + 1, session_name: `Workout ${i + 1}`, session_note: '', is_rest_day: !selected.includes(i + 1), exercises: [] }));
    return draft;
  }
  function payload(draft, clientId) {
    if (!draft.name.trim() || draft.name.length > 160 || !/^\d{4}-\d{2}-\d{2}$/.test(draft.start) || Number.isNaN(Date.parse(draft.start)) || new Date(`${draft.start}T12:00:00Z`).toISOString().slice(0,10) !== draft.start) throw new Error('Add a program name and a valid start date.');
    if (draft.days.length < 7 || draft.days.length > 8 || new Set(draft.days.map((d) => d.cycle_day)).size !== draft.days.length || draft.days.some((d) => d.cycle_day < 1 || d.cycle_day > draft.days.length)) throw new Error('The repeating cycle must contain seven days, or the existing eight days.');
    if (draft.days.every((d) => d.is_rest_day)) throw new Error('Choose at least one workout day.');
    return draft.days.map((d) => {
      const fail = (message) => { throw new Error(`Day ${d.cycle_day}: ${message}`); };
      if (!d.is_rest_day && (!d.session_name.trim() || d.session_name.length > 120)) fail('add a workout name (up to 120 characters).');
      if ((d.session_note || '').length > 2000) fail('keep the workout note under 2,000 characters.');
      const exercises = d.is_rest_day ? [] : d.exercises.map((ex) => {
        if (!ex.name || ex.name.length > 120) fail('choose an exercise from your library.');
        const sets = prescriptions(ex);
        if (sets.length > 20) fail(`${ex.name} has more than 20 sets.`);
        const checked = sets.map((s, index) => {
          const numeric = (field, min, max, optional, integer) => {
            const n = num(s[field]);
            if (n === null && optional && (s[field] === '' || s[field] == null)) return null;
            if (n === null || n < min || n > max || (integer && !Number.isInteger(n))) fail(`${ex.name}, set ${index + 1}: check ${field.replace(/_/g, ' ')}.`);
            return n;
          };
          const result = { weight_kg: numeric('weight_kg', 0, 500, true), reps_min: numeric('reps_min', 1, 100, false, true), reps_max: numeric('reps_max', 1, 100, false, true), rir: numeric('rir', 0, 10, true, true), rest_seconds: numeric('rest_seconds', 0, 1200, false, true), tempo: String(s.tempo || '').trim(), set_type: s.set_type || 'Working set', group: String(s.group || '').trim() };
          if (result.reps_min > result.reps_max) fail(`${ex.name}, set ${index + 1}: the rep range is reversed.`);
          if (result.tempo && !/^([0-9Xx]-){3}[0-9Xx]$/.test(result.tempo)) fail(`${ex.name}: enter tempo as four parts, e.g. 3-1-X-0.`);
          if (!SET_TYPES.includes(result.set_type)) fail(`${ex.name}: choose a valid set type.`);
          if (result.group.length > 20) fail('keep the superset / giant set group under 20 characters.');
          return result;
        });
        if ((ex.note || '').length > 500) fail(`${ex.name}: keep the cue under 500 characters.`);
        const first = checked[0];
        return { ...ex, prescriptions: checked, sets: checked.length, reps_min: first.reps_min, reps_max: first.reps_max, rir: first.rir !== null, rir_target: first.rir, rest_seconds_min: first.rest_seconds, rest_seconds_max: first.rest_seconds };
      });
      if (!d.is_rest_day && !exercises.length) fail('add an exercise or mark this as a rest day.');
      return { client_id: clientId, program_start_date: draft.start, program_name: draft.name.trim(), cycle_day: d.cycle_day, session_name: d.is_rest_day ? 'Rest day' : d.session_name.trim(), is_rest_day: !!d.is_rest_day, session_note: d.session_note || null, exercises };
    });
  }
  function analyse(logs, plans, library, from, to) {
    const entries = new Map();
    const all = [...logs].sort((a, b) => a.day.localeCompare(b.day));
    const nWeeks = Math.max(1, Math.ceil((days(from, to) + 1) / 7));
    const weeks = Array.from({ length: nWeeks }, (_, i) => ({ day: add(from, i * 7), sets: {}, volume: {} }));
    const sessions = [];
    for (const w of all) {
      let sessionSets = 0, sessionVolume = 0;
      for (const ex of w.exercises || []) {
        const plan = (plans || []).find((p) => p.program_start_date === w.program_start_date && p.cycle_day === w.cycle_day);
        const meta = (plan?.exercises || []).find((x) => x.exercise_id && x.exercise_id === ex.exercise_id || key(x.name) === key(ex.name)) || (library || []).find((x) => x.id && x.id === ex.exercise_id || key(x.name) === key(ex.name)) || {};
        const catalog = (library || []).find((x) => x.id && x.id === ex.exercise_id || key(x.name) === key(ex.name));
        const identity = catalog?.id || ex.exercise_id || meta.exercise_id || key(ex.name);
        const primary = [...new Set((ex.primary?.length ? ex.primary : meta.primary || []).map(part))];
        if (!entries.has(identity)) entries.set(identity, { id: identity, name: ex.name, parts: primary.length ? primary : ['other'], history: [] });
        const entry = entries.get(identity);
        const sets = (ex.sets || []).filter((s) => num(s.reps) > 0 && key(s.set_type) !== 'warmup');
        if (!sets.length) continue;
        const weighted = sets.filter((s) => num(s.kg) > 0);
        const estimates = weighted.filter((s) => Number(s.reps) <= 30).map((s) => Number(s.reps) === 1 ? Number(s.kg) : Number(s.kg) * (1 + Number(s.reps) / 30));
        const volume = weighted.reduce((n, s) => n + Number(s.kg) * Number(s.reps), 0);
        const top = weighted.slice().sort((a, b) => b.kg - a.kg || b.reps - a.reps)[0];
        entry.history.push({ day: w.day, session: w.session_name || 'Workout', sets: sets.length, volume, estimated: estimates.length ? Math.max(...estimates) : null, topWeight: top ? Number(top.kg) : null, topReps: Math.max(...sets.map((s) => Number(s.reps))), bestSetScore: top ? (Number(top.reps) === 1 ? Number(top.kg) : Number(top.kg) * (1 + Number(top.reps) / 30)) : null, bestSet: top ? `${top.kg} kg × ${top.reps}` : 'Bodyweight / unweighted' });
        if (w.day < from || w.day > to) continue;
        sessionSets += sets.length; sessionVolume += volume;
        const bucket = weeks[Math.min(nWeeks - 1, Math.floor(days(from, w.day) / 7))];
        for (const p of entry.parts) { bucket.sets[p] = (bucket.sets[p] || 0) + sets.length / entry.parts.length; bucket.volume[p] = (bucket.volume[p] || 0) + volume / entry.parts.length; }
      }
      if (w.day >= from && w.day <= to && sessionSets) sessions.push({ ...w, count: sessionSets, volume: sessionVolume });
    }
    const exercises = [...entries.values()].map((e) => {
      const history = e.history.filter((p) => p.day >= from && p.day <= to);
      const usable = history.filter((p) => p.estimated !== null);
      const first = usable[0]?.estimated, last = usable.at(-1)?.estimated;
      const change = usable.length >= 2 ? (last / first - 1) * 100 : null;
      const span = usable.length >= 2 ? days(usable[0].day, usable.at(-1).day) / 7 : 0;
      const status = change === null || span < 1 ? 'Insufficient data' : change > 2 ? 'Progressing' : change < -2 ? 'Regressing' : span >= 4 && Math.abs(change) < .5 ? 'Plateaued' : 'Maintaining';
      let best = null;
      const bests = e.history.filter((p) => { if (p.estimated === null || best !== null && p.estimated <= best) return false; best = p.estimated; return true; });
      return { ...e, history, allHistory: e.history, bests, change, status, sessions: history.length, sets: history.reduce((s, p) => s + p.sets, 0), latest: history.at(-1), newBest: bests.some((b) => b.day >= add(to, -6) && b.day <= to), weeks: span };
    }).filter((e) => e.history.length);
    const parts = Object.entries(PARTS).map(([id, name]) => {
      const values = weeks.map((w) => w.sets[id] || 0), relevant = exercises.filter((e) => e.parts.includes(id));
      const last = relevant.flatMap((e) => e.history).sort((a, b) => b.day.localeCompare(a.day))[0]?.day;
      const lastBest = relevant.flatMap((e) => e.bests).filter((p) => p.day >= from && p.day <= to).sort((a, b) => b.day.localeCompare(a.day))[0]?.day;
      const comparable = relevant.filter((e) => e.change !== null && e.weeks >= 1);
      const change = comparable.length ? comparable.reduce((s,e) => s + e.change * e.sets,0) / comparable.reduce((s,e) => s + e.sets,0) : null;
      const status = change == null ? 'Insufficient data' : change > 2 ? 'Progressing' : change < -2 ? 'Regressing' : 'Maintaining';
      return { id, name, values, status, total: values.reduce((a, b) => a + b, 0), last, lastBest };
    });
    const comparable = exercises.filter((e) => e.change !== null && e.weeks >= 1);
    const totalWeight = comparable.reduce((n, e) => n + e.sets, 0);
    const strength = weeks.map((w, i) => {
      const cutoff = i === nWeeks - 1 ? to : add(w.day, 6);
      const values = comparable.map((e) => { const first = e.history.find((p) => p.estimated !== null); const latest = e.history.filter((p) => p.estimated !== null && p.day <= cutoff).at(-1); return latest && first && days(first.day, latest.day) >= 7 ? { v: (latest.estimated / first.estimated - 1) * 100, weight: e.sets } : null; }).filter(Boolean);
      return { day: w.day, value: values.length ? values.reduce((s, p) => s + p.v * p.weight, 0) / values.reduce((s, p) => s + p.weight, 0) : null };
    });
    return { from, to, weeks, sessions, exercises, parts, strength, change: totalWeight ? comparable.reduce((n, e) => n + e.change * e.sets, 0) / totalWeight : null, spread: Object.fromEntries(['Progressing', 'Maintaining', 'Plateaued', 'Regressing', 'Insufficient data'].map((s) => [s, exercises.filter((e) => e.status === s).length])) };
  }
  const api = { SET_TYPES, PARTS, key, num, add, days, prescriptions, exercise, program, newProgram, payload, analyse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredTraining = api;
})(typeof window !== 'undefined' ? window : globalThis);
