// Shared validation for coach prospects and public enquiry forms.
(function (root) {
  'use strict';
  const STAGES = { new: 'New lead', call_not_scheduled: 'Call not scheduled', call_scheduled: 'Call scheduled', call_completed: 'Call completed', follow_up: 'Following up', converted: 'Converted to client', lost: 'Not proceeding' };
  const TYPES = { text: 'Short answer', textarea: 'Long answer', select: 'Single choice', multiselect: 'Multiple choice', number: 'Number' };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
  const clean = (value) => String(value ?? '').trim();
  function tags(values) { return [...new Map((values || []).map(clean).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()]; }
  function validateProspect(values) {
    const p = { first_name: clean(values.first_name), last_name: clean(values.last_name), email: clean(values.email).toLowerCase() || null, phone: clean(values.phone) || null, deal_value: values.deal_value === '' || values.deal_value == null ? null : Number(values.deal_value), stage: values.stage || 'call_not_scheduled', close_percentage: values.close_percentage === '' || values.close_percentage == null ? null : Number(values.close_percentage), tags: tags(values.tags), notes: clean(values.notes) || null };
    if (!p.first_name || p.first_name.length > 40 || p.last_name.length > 40) throw Error('Add a first name and keep each name under 40 characters.');
    if (p.email && (!EMAIL.test(p.email) || p.email.length > 254)) throw Error('Enter a valid email address.');
    if (p.phone && !/^\+?[0-9 ()-]{6,25}$/.test(p.phone)) throw Error('Check the phone number, including its country code.');
    if (!Object.hasOwn(STAGES,p.stage)) throw Error('Choose a deal stage.');
    if (p.deal_value !== null && (!Number.isFinite(p.deal_value) || p.deal_value < 0 || p.deal_value > 1000000 || Math.abs(p.deal_value * 100 - Math.round(p.deal_value * 100)) > 0.00001)) throw Error('Enter a deal value from 0 to 1,000,000 with at most two decimal places.');
    if (p.close_percentage !== null && (!Number.isInteger(p.close_percentage) || p.close_percentage < 0 || p.close_percentage > 100)) throw Error('Choose a close percentage from 0 to 100.');
    if (p.tags.length > 20 || p.tags.some((t) => t.length > 40)) throw Error('Use up to 20 tags, each under 40 characters.');
    if ((p.notes || '').length > 2000) throw Error('Keep notes under 2,000 characters.');
    return p;
  }
  function schema(values) {
    const title = clean(values.title), description = clean(values.description);
    if (!title || title.length > 120 || description.length > 500) throw Error('Add a form title (up to 120 characters) and keep its introduction under 500 characters.');
    const ids = new Set();
    if (!Array.isArray(values.questions) || values.questions.length > 20) throw Error('A lead form can have up to 20 questions.');
    const questions = values.questions.map((q) => {
      const id = clean(q.id), type = q.type, label = clean(q.label), required = !!q.required;
      if (!UUID.test(id) || ids.has(id) || !Object.hasOwn(TYPES,type) || !label || label.length > 160) throw Error('Give each question a label (up to 160 characters) and choose its answer type.');
      ids.add(id);
      const options = ['select', 'multiselect'].includes(type) ? tags(q.options) : [];
      if (['select', 'multiselect'].includes(type) && (options.length < 2 || options.length > 20 || options.some((o) => o.length > 80))) throw Error('Choice questions need 2–20 unique options, each under 80 characters.');
      return { id, type, label, required, options };
    });
    return { title, description, questions };
  }
  function submission(values, formSchema) {
    const p = validateProspect({ ...values, stage: 'new', tags: [], notes: '' });
    if (!p.email) throw Error('Add your email address so we can respond to your enquiry.');
    const form = schema(formSchema), answers = {};
    for (const q of form.questions) {
      const raw = values.answers?.[q.id];
      const value = q.type === 'multiselect' ? tags(Array.isArray(raw) ? raw : []) : clean(raw);
      const missing = Array.isArray(value) ? !value.length : value === '';
      if (q.required && missing) throw Error(`Please answer: ${q.label}`);
      if (!missing) {
        if (['select', 'multiselect'].includes(q.type) && (Array.isArray(value) ? value : [value]).some((v) => !q.options.includes(v))) throw Error(`Choose a listed answer for: ${q.label}`);
        if (q.type === 'number' && (!Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1000000)) throw Error(`Enter a valid number for: ${q.label}`);
        if (typeof value === 'string' && value.length > 2000) throw Error(`Keep the answer to “${q.label}” under 2,000 characters.`);
      }
      answers[q.id] = value;
    }
    return { first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone, answers };
  }
  const name = (p) => `${p.first_name} ${p.last_name || ''}`.trim();
  const daysInStage = (p, today) => Math.max(0, Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${String(p.stage_changed_at || p.created_at).slice(0,10)}T12:00:00Z`)) / 86400000));
  function filtered(rows, view) { const q = clean(view.q).toLowerCase();return rows.filter((p) => !!p.archived_at === !!view.archived && (!view.stage || p.stage === view.stage) && (!view.tag || (p.tags || []).includes(view.tag)) && (!q || [name(p), p.email, p.phone, ...(p.tags || [])].join(' ').toLowerCase().includes(q))); }
  const api = { STAGES, TYPES, UUID, EMAIL, tags, validateProspect, schema, submission, name, daysInStage, filtered };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RewiredProspects = api;
})(typeof window !== 'undefined' ? window : globalThis);
