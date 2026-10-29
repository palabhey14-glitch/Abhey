// Small, decorative coach dashboard icons. Uses the current Rewired palette.
(function (root) {
  'use strict';
  const PATHS = {
    prospects: '<circle cx="9" cy="7" r="4"/><path d="M2 21c0-5 3-7 7-7s7 2 7 7M19 7v6m-3-3h6"/>',
    forms: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    overview: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 15l3-3 3 2 4-5M7 18h10"/>',
    phases: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="19" r="2"/><path d="M8 5h6a4 4 0 0 1 4 4v1M16 12h-6a4 4 0 0 0-4 4v1"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2m4 0h2m-8 3h2"/>',
    physique: '<circle cx="12" cy="5" r="2"/><path d="M8 10l-3 5m11-5 3 5M8 10l4-2 4 2m-8 0 1 5-2 6m9-11-1 5 2 6m-8-6h6"/>',
    nutrition: '<path d="M4 12c0 5 3 8 8 8s8-3 8-8H4ZM6 8h12M12 8V3m0 0 3 2"/>',
    goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    foodlog: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v4H9zM8 11h8m-8 4h8m-8 4h5"/>',
    activity: '<circle cx="14" cy="4" r="2"/><path d="m7 21 3-6-1-6m-5 5 5-5 4 3 4 1m-7 2 5 6m-2-9 1-5"/>',
    sleep: '<path d="M20.7 13A9 9 0 0 1 11 3.3 9 9 0 1 0 20.7 13Z"/>',
    recovery: '<path d="M12 3v4m0 10v4M3 12h4m10 0h4m-15-6 3 3m6 6 3 3m0-12-3 3m-6 6-3 3"/><circle cx="12" cy="12" r="3"/>',
    habits: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
    'health-markers': '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M5 12h4l2-3 2 6 2-3h4"/>',
    training: '<path d="M2 9v6m3-9v12m3-14v16m8-16v16m3-14v12m3-9v6M8 12h8"/>',
    supps: '<path d="M5 19a5 5 0 0 1 0-7l7-7a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7 0ZM9 8l7 7"/>',
    checkins: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v4H9zM8 11l2 2 4-4M8 18h8"/>',
    trend: '<path d="M3 19V5m0 14h18M6 15l4-5 4 3 6-7"/>',
    chart: '<path d="M3 20V4M3 20h18M7 16v-4m5 4V8m5 8V5"/>',
    star: '<path d="m12 2 3 6.2 6.8 1-4.9 4.8 1.2 6.8L12 17.6l-6.1 3.2 1.2-6.8-4.9-4.8 6.8-1L12 2Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    flag: '<path d="M5 21V3m0 1h13l-3 5 3 5H5"/>',
    steps: '<path d="M7 20c2-1 3-2 3-4s-1-3-3-3-4 2-4 4 1 3 4 3Zm10-9c2-1 3-2 3-4s-1-3-3-3-4 2-4 4 1 3 4 3ZM7 8V5m3 5V7m7 11v-3m3 5v-3"/>',
    scale: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 10a4 4 0 0 1 8 0m-4 0 2-2"/>',
    water: '<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/>',
    food: '<path d="M5 2v8m3-8v8m3-8v8M5 10h6m-3 0v12M17 2c-3 3-3 9 0 11h2V2h-2Zm2 11v9"/>',
    flame: '<path d="M12 22c5 0 8-4 8-9 0-3-2-5-4-7 0 3-1 4-3 5 0-4-2-7-5-9 0 4-1 6-3 9-3 5 0 11 7 11Z"/>',
  };
  const SECTIONS = ['overview', 'phases', 'calendar', 'physique', 'nutrition', 'goals', 'foodlog', 'activity', 'sleep', 'recovery', 'habits', 'health-markers', 'training', 'supps', 'checkins'];
  function icon(key, badge = false) {
    return `<span class="ci-icon${badge ? ' ci-badge' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[key] || PATHS.overview}</svg></span>`;
  }
  function forText(value) {
    const text = String(value || '').trim().toLowerCase();
    if (/weekly trend|strength trend|change vs|trend|progress/.test(text)) return 'trend';
    if (/improvement|best|win/.test(text)) return 'star';
    if (/training|workout|session|set|exercise/.test(text)) return 'training';
    if (/weight|waist|measurement|body/.test(text)) return 'scale';
    if (/sleep|bedtime/.test(text)) return 'sleep';
    if (/calor/.test(text)) return 'flame';
    if (/protein|fibre|carb|fat|meal|nutrition|food/.test(text)) return 'food';
    if (/water|hydration/.test(text)) return 'water';
    if (/step|activity/.test(text)) return 'steps';
    if (/cardio|heart|health/.test(text)) return 'health-markers';
    if (/check-in|feedback/.test(text)) return 'checkins';
    if (/habit|target|goal/.test(text)) return 'goals';
    if (/supplement|supps/.test(text)) return 'supps';
    if (/calendar|week|day|date|schedule|log/.test(text)) return 'calendar';
    if (/analysis|status|tracking|review/.test(text)) return 'chart';
    return null;
  }
  function decorate(container) {
    const selector = '.crm-main .crm-sub, .crm-main .coach-editor-intro h2, .crm-main .daily-col .kicker, .crm-main .checkin-day-card .kicker, .crm-main #plan-form > .kicker, .crm-main #targets-form > .kicker, .crm-main #note-form > .kicker, .crm-main .card > .kicker';
    container.querySelectorAll(selector).forEach((heading) => {
      if (heading.closest('.coach-preview, .tr-page, .w-page, .cal-page') || heading.querySelector('.ci-icon, .w-marker-icon, svg')) return;
      const kind = forText(heading.textContent);
      if (kind) heading.insertAdjacentHTML('afterbegin', icon(kind));
    });
  }
  const api = { icon, forText, decorate, SECTIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredCoachIcons = api;
})(typeof window !== 'undefined' ? window : globalThis);
