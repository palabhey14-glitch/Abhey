// Shared health and sleep calculations. Missing readings remain missing.
(function (root) {
  'use strict';
  const MARKERS = [
    { key: 'heart_rate', name: 'Heart Rate', short: 'HR', unit: 'bpm', icon: 'heart', min: 1, max: 350, dp: 0 },
    { key: 'resting_heart_rate', name: 'Resting Heart Rate', short: 'RHR', unit: 'bpm', icon: 'pulse', min: 1, max: 300, dp: 0 },
    { key: 'hrv', name: 'Heart Rate Variability', short: 'HRV', unit: 'ms', icon: 'hrv', min: 0, max: 1000, dp: 1 },
    { key: 'blood_glucose', name: 'Blood Glucose', short: 'BG', unit: 'mmol/L', icon: 'drop', min: 0.1, max: 100, dp: 1 },
    { key: 'blood_pressure', name: 'Blood Pressure', short: 'BP', unit: 'mmHg', icon: 'pressure', min: 1, max: 400, dp: 0, paired: true },
    { key: 'body_temperature', name: 'Body Temperature', short: 'Temp', unit: '°C', icon: 'temperature', min: 20, max: 50, dp: 1 },
    { key: 'respiratory_rate', name: 'Respiratory Rate', short: 'RR', unit: 'breaths/min', icon: 'breath', min: 1, max: 150, dp: 0 },
  ];
  const SLEEP_FIELDS = {
    sleep_h: ['Total sleep (hours)', 0, 16, 0.1],
    sleep_core_min: ['Core sleep (minutes)', 0, 960, 1],
    sleep_rem_min: ['REM sleep (minutes)', 0, 960, 1],
    sleep_deep_min: ['Deep sleep (minutes)', 0, 960, 1],
    sleep_awake_min: ['Awake (minutes)', 0, 960, 1],
    sleep_latency_min: ['Time to fall asleep (minutes)', 0, 960, 1],
    sleep_efficiency_pct: ['Sleep efficiency (%)', 0, 100, 0.1],
    sleep_restfulness_pct: ['Restfulness (%)', 0, 100, 0.1],
    sleep_score: ['Sleep score from your device (0–100)', 0, 100, 1],
    sleep_interruptions: ['Interruptions', 0, 200, 1],
    sleep_rhr_bpm: ['Sleeping resting heart rate (bpm)', 1, 300, 1],
    sleep_hrv_ms: ['Sleeping heart rate variability (ms)', 0, 1000, 0.1],
  };
  const num = (v) => v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
  const mean = (values) => { const n = values.map(num).filter((v) => v != null); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; };
  const sum = (values) => { const n = values.map(num).filter((v) => v != null); return n.length ? n.reduce((a, b) => a + b, 0) : null; };
  function validDay(day) {
    return /^\d{4}-\d{2}-\d{2}$/.test(day || '') && !Number.isNaN(Date.parse(day)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
  }
  function markerSummary(rows, marker, first, last) {
    const readings = rows.filter((r) => r.marker === marker && r.day >= first && r.day <= last && num(r.value) != null)
      .sort((a, b) => `${a.day} ${a.taken_at || ''} ${a.created_at || ''}`.localeCompare(`${b.day} ${b.taken_at || ''} ${b.created_at || ''}`));
    const days = [...new Set(readings.map((r) => r.day))];
    const daily = days.map((day) => {
      const rs = readings.filter((r) => r.day === day);
      return { day, value: mean(rs.map((r) => r.value)), secondary: mean(rs.map((r) => r.secondary_value)) };
    });
    const values = readings.map((r) => Number(r.value));
    const secondary = readings.map((r) => num(r.secondary_value)).filter((v) => v != null);
    return { readings, daily, latest: readings.at(-1) || null, average: mean(daily.map((r) => r.value)),
      averageSecondary: mean(daily.map((r) => r.secondary)), min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null, minSecondary: secondary.length ? Math.min(...secondary) : null,
      maxSecondary: secondary.length ? Math.max(...secondary) : null };
  }
  function validateReading(data, today) {
    const marker = MARKERS.find((m) => m.key === data.marker);
    if (!marker) throw new Error('Choose a health marker.');
    if (!validDay(data.day) || data.day > today) throw new Error('Choose a valid reading date up to today.');
    if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(data.taken_at || '')) throw new Error('Enter a valid reading time.');
    const value = num(data.value);
    if (value == null || value < marker.min || value > marker.max) throw new Error(`Enter ${marker.name.toLowerCase()} between ${marker.min} and ${marker.max} ${marker.unit}.`);
    const secondary = marker.paired ? num(data.secondary_value) : null;
    if (marker.paired && (secondary == null || secondary < 1 || secondary > 300 || secondary >= value)) throw new Error('Enter both blood pressure numbers. Systolic must be higher than diastolic.');
    if (String(data.notes || '').length > 500) throw new Error('Keep notes to 500 characters.');
    return { marker: marker.key, day: data.day, taken_at: data.taken_at, value, secondary_value: secondary, notes: String(data.notes || '').trim() || null };
  }
  function validateSleep(data, today) {
    if (!validDay(data.day) || data.day > today) throw new Error('Choose a valid wake-up date up to today.');
    const out = { day: data.day };
    for (const [key, [label, min, max, step]] of Object.entries(SLEEP_FIELDS)) {
      const v = num(data[key]);
      if (data[key] != null && data[key] !== '' && (v == null || v < min || v > max || (step === 1 && !Number.isInteger(v)))) throw new Error(`${label}: enter ${step === 1 ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
      out[key] = v;
    }
    out.sleep_bedtime = data.sleep_bedtime || null;
    if (out.sleep_bedtime && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(out.sleep_bedtime)) throw new Error('Enter a valid bedtime.');
    const stages = ['sleep_core_min', 'sleep_rem_min', 'sleep_deep_min'].map((key) => out[key]);
    if (stages.some((v) => v != null) && out.sleep_h == null) throw new Error('Enter total sleep before adding sleep stages.');
    if (out.sleep_h != null && (sum(stages) || 0) > out.sleep_h * 60 + 3) throw new Error('Core, REM and deep sleep cannot add up to more than total sleep.');
    if (out.sleep_h == null && !Object.entries(out).some(([key, v]) => key !== 'day' && v != null)) throw new Error('Enter at least one sleep value.');
    return out;
  }
  function sleepSummary(logs, first, last, target) {
    const nights = logs.filter((r) => r.day >= first && r.day <= last && (num(r.sleep_h) != null || Object.keys(SLEEP_FIELDS).some((k) => num(r[k]) != null) || r.sleep_bedtime)).sort((a, b) => a.day.localeCompare(b.day));
    const durations = nights.map((r) => num(r.sleep_h)).filter((v) => v != null);
    return { nights, latest: nights.at(-1) || null, average: mean(durations), min: durations.length ? Math.min(...durations) : null,
      max: durations.length ? Math.max(...durations) : null, debt: num(target) > 0 && durations.length ? durations.reduce((total, n) => total + Math.max(0, Number(target) - n), 0) : null,
      rhr: mean(nights.map((r) => r.sleep_rhr_bpm)), hrv: mean(nights.map((r) => r.sleep_hrv_ms)),
      averageField: (key) => mean(nights.map((r) => r[key])) };
  }
  function activitySummary(logs, field, first, last) {
    const rows = logs.filter((r) => r.day >= first && r.day <= last && num(r[field]) != null).sort((a, b) => a.day.localeCompare(b.day));
    const values = rows.map((r) => Number(r[field]));
    return { rows, latest: rows.at(-1) || null, average: mean(values), total: sum(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
  }
  const api = { MARKERS, SLEEP_FIELDS, num, mean, sum, validDay, markerSummary, validateReading, validateSleep, sleepSummary, activitySummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredWellness = api;
})(typeof window !== 'undefined' ? window : globalThis);
