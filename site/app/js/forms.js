// Forms: the model shared by the coach's builder, the live preview and the
// client's form. Plain data in, plain data out, so it also runs under Node
// for the tests (node site/app/js/forms.test.js).
//
// A form's content is one JSON document:
//   { welcome: { enabled, title, text, button },
//     sections: [{ id, title, description, questions: [{ id, type, label, help,
//       required, placeholder, maxLength, min, max, minPicks, maxPicks,
//       lowLabel, highLabel, allowOther, options: [{ id, label }] }] }],
//     thanks: { title, text } }
// Answers are keyed by question id ("<id>.other" holds an Other text box),
// never by position, so reordering or editing never mixes answers up.
// The database runs the same publish and submit checks (2026-10-29-forms.sql).
(function (root) {
  'use strict';

  const CATEGORIES = ['Onboarding', 'Health screen', 'Contract', 'Feedback', 'Other'];

  const TYPES = {
    short: { label: 'Short answer', group: 'Basics' },
    long: { label: 'Long answer', group: 'Basics' },
    single: { label: 'Single choice', group: 'Basics' },
    multi: { label: 'Multiple choice', group: 'Basics' },
    yesno: { label: 'Yes / No', group: 'Basics' },
    scale: { label: 'Scale', group: 'Numbers and dates' },
    number: { label: 'Number', group: 'Numbers and dates' },
    date: { label: 'Date', group: 'Numbers and dates' },
    ack: { label: 'Acknowledgement', group: 'Agreement' },
  };
  const TYPE_IDS = Object.keys(TYPES);
  const LENGTHS = { short: [100, 250], long: [250, 500, 1000, 2000] };
  const OTHER = 'other';

  function uid(prefix) {
    const c = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    const bytes = new Uint8Array(8);
    c.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)}`;
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const blank = (s) => !String(s === null || s === undefined ? '' : s).trim();

  function newQuestion(type) {
    const q = { id: uid('q'), type, label: '', help: '', required: false };
    if (type === 'single' || type === 'multi') q.options = [{ id: uid('o'), label: 'Option 1' }, { id: uid('o'), label: 'Option 2' }];
    if (type === 'short') q.maxLength = 250;
    if (type === 'long') q.maxLength = 1000;
    if (type === 'scale') Object.assign(q, { min: 1, max: 5, lowLabel: '', highLabel: '', required: true });
    if (type === 'ack') q.required = true;
    return q;
  }

  function newSection(title) {
    return { id: uid('s'), title: title || 'New section', description: '', questions: [] };
  }

  function blankContent() {
    return {
      welcome: { enabled: true, title: '', text: '', button: 'Start' },
      sections: [newSection('Section 1')],
      thanks: { title: 'Thank you', text: "Your answers are in. I'll go through them before we next speak." },
    };
  }

  // Template copy. The first two questions follow Abhey's reference; the rest
  // are proposed starter questions he can edit. Measurements are optional.
  const opt = (label) => ({ label });
  const TEMPLATES = [
    {
      id: 'onboarding',
      category: 'Onboarding',
      name: 'Rewired onboarding template',
      content: {
        welcome: {
          enabled: true,
          title: 'Welcome to Rewired',
          text: 'This takes about five minutes. Your answers shape your plan around your goals, your week and the food you love.',
          button: 'Start',
        },
        sections: [
          {
            title: 'Your goals',
            questions: [
              { type: 'multi', label: 'What are your main goals?', required: true, allowOther: true,
                options: ['Lose body fat', 'Build muscle', 'Get stronger', 'Improve fitness', 'Feel healthier'].map(opt) },
              { type: 'long', label: 'What would success look like for you in 12 weeks?', required: true, maxLength: 1000 },
            ],
          },
          {
            title: 'Training history',
            questions: [
              { type: 'single', label: 'How long have you been training?', required: true,
                options: ['Not yet', 'Less than 6 months', '6 to 12 months', '1 to 3 years', 'More than 3 years'].map(opt) },
              { type: 'scale', label: 'How confident do you feel in the gym?', required: true, min: 1, max: 5, lowLabel: 'Not at all', highLabel: 'Very' },
              { type: 'long', label: 'What training or sport do you enjoy most?', required: false, maxLength: 1000 },
            ],
          },
          {
            title: 'Availability',
            questions: [
              { type: 'single', label: 'How many days a week can you train?', required: true, options: ['2', '3', '4', '5', '6'].map(opt) },
              { type: 'multi', label: 'Where will you train?', required: true, allowOther: true, options: ['Gym', 'Home', 'Hotel gym'].map(opt) },
            ],
          },
          {
            title: 'Measurements',
            description: 'Optional. Skip anything you would rather share later.',
            questions: [
              { type: 'number', label: 'Current bodyweight (kg)', required: false, min: 30, max: 300, placeholder: 'e.g. 82.5' },
              { type: 'number', label: 'Height (cm)', required: false, min: 120, max: 230, placeholder: 'e.g. 178' },
            ],
          },
        ],
        thanks: { title: 'Thank you', text: "Your answers are in. I'll go through them before our first check-in." },
      },
    },
  ];

  // Fills in ids and defaults. Used for templates and for anything loaded from
  // the database, so the rest of the code can rely on the shape.
  function normalise(content) {
    const c = content && typeof content === 'object' ? clone(content) : {};
    const base = blankContent();
    c.welcome = { ...base.welcome, ...(c.welcome || {}) };
    c.thanks = { ...base.thanks, ...(c.thanks || {}) };
    c.sections = Array.isArray(c.sections) ? c.sections : base.sections;
    for (const s of c.sections) {
      s.id = s.id || uid('s');
      s.title = s.title === undefined ? '' : s.title;
      s.description = s.description || '';
      s.questions = Array.isArray(s.questions) ? s.questions : [];
      for (const q of s.questions) {
        q.id = q.id || uid('q');
        q.help = q.help || '';
        q.required = Boolean(q.required);
        if (q.type === 'single' || q.type === 'multi') {
          q.options = (q.options || []).map((o) => ({ id: o.id || uid('o'), label: o.label || '' }));
          q.allowOther = Boolean(q.allowOther);
        }
      }
    }
    return c;
  }

  // A template becomes the coach's own copy with fresh ids, so editing it
  // never touches the template or anyone else's form.
  function fromTemplate(id) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return null;
    const c = clone(t.content);
    for (const s of c.sections) {
      delete s.id;
      for (const q of s.questions) {
        delete q.id;
        for (const o of q.options || []) delete o.id;
      }
    }
    return normalise(c);
  }

  function templatesFor(category) {
    return TEMPLATES.filter((t) => t.category === category);
  }

  function counts(content) {
    const sections = (content && content.sections) || [];
    return { sections: sections.length, questions: sections.reduce((n, s) => n + (s.questions || []).length, 0) };
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function findQuestion(content, qid) {
    for (let si = 0; si < content.sections.length; si += 1) {
      const qi = content.sections[si].questions.findIndex((q) => q.id === qid);
      if (qi >= 0) return { section: content.sections[si], si, qi, question: content.sections[si].questions[qi] };
    }
    return null;
  }

  // One line under each question in the builder: type and its settings.
  function summary(q) {
    const t = (TYPES[q.type] || { label: q.type }).label;
    if (q.type === 'single' || q.type === 'multi') {
      const labels = (q.options || []).map((o) => o.label).filter(Boolean);
      if (q.allowOther) labels.push('Other');
      return `${t} · ${labels.join(', ') || 'no options yet'}`;
    }
    if (q.type === 'short' || q.type === 'long') return `${t} · Up to ${q.maxLength || 1000} characters`;
    if (q.type === 'scale') return `${t} · ${q.min} to ${q.max}`;
    if (q.type === 'number') {
      if (q.min !== undefined && q.min !== null && q.max !== undefined && q.max !== null) return `${t} · ${q.min} to ${q.max}`;
      return t;
    }
    return t;
  }

  const num = (v) => v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v));

  // Everything stopping a publish, each pointing at what needs fixing.
  // [{ where: 'welcome'|'thanks'|sectionId, questionId?, message }]
  function problems(content) {
    const out = [];
    const c = content || {};
    if (c.welcome && c.welcome.enabled && blank(c.welcome.button)) {
      out.push({ where: 'welcome', message: 'Welcome screen needs a start button label' });
    }
    if (c.thanks && blank(c.thanks.title)) out.push({ where: 'thanks', message: 'Thank-you screen needs a title' });
    const sections = c.sections || [];
    if (!sections.length) out.push({ where: 'form', message: 'Add a section' });
    let n = 0;
    sections.forEach((s, si) => {
      const name = blank(s.title) ? `Section ${si + 1}` : s.title;
      if (blank(s.title)) out.push({ where: s.id, message: `Section ${si + 1} needs a title` });
      if (!s.questions.length) out.push({ where: s.id, message: `${name} has no questions` });
      s.questions.forEach((q) => {
        n += 1;
        const at = (message) => out.push({ where: s.id, questionId: q.id, message: `Question ${n}: ${message}` });
        if (!TYPES[q.type]) at('unknown answer type');
        if (blank(q.label)) at('add the question');
        if (q.type === 'single' || q.type === 'multi') {
          const labels = q.options.map((o) => o.label.trim()).filter(Boolean);
          if (labels.length + (q.allowOther ? 1 : 0) < 2) at('needs at least two options');
          if (q.options.some((o) => blank(o.label))) at('has an empty option');
          const lower = labels.map((l) => l.toLowerCase());
          if (new Set(lower).size !== lower.length) at('has the same option twice');
          if (q.type === 'multi') {
            const max = labels.length + (q.allowOther ? 1 : 0);
            if (num(q.minPicks) && num(q.maxPicks) && Number(q.minPicks) > Number(q.maxPicks)) at('minimum picks is more than maximum');
            if (num(q.minPicks) && Number(q.minPicks) > max) at('asks for more picks than there are options');
            if ((num(q.minPicks) && Number(q.minPicks) < 0) || (num(q.maxPicks) && Number(q.maxPicks) < 1)) at('picks must be positive');
          }
        }
        if ((q.type === 'number' || q.type === 'scale') && num(q.min) && num(q.max) && Number(q.min) >= Number(q.max)) {
          at('lowest value must be below the highest');
        }
        if (q.type === 'scale' && (!num(q.min) || !num(q.max) || Number(q.max) - Number(q.min) > 10)) at('scale needs a range of up to 10 steps');
        if ((q.type === 'short' || q.type === 'long') && num(q.maxLength) && Number(q.maxLength) < 1) at('length must be at least 1');
      });
    });
    if (sections.length && !n) out.push({ where: 'form', message: 'Add at least one question' });
    return out;
  }

  function isEmpty(v) {
    return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
  }

  // The client-facing check for one answer. Returns a message or ''.
  function answerError(q, answers) {
    const v = answers[q.id];
    if (isEmpty(v)) return q.required ? (q.type === 'ack' ? 'Tick the box to continue.' : 'This one is required.') : '';
    switch (q.type) {
      case 'ack':
        return v === true || !q.required ? '' : 'Tick the box to continue.';
      case 'yesno':
        return typeof v === 'boolean' ? '' : 'Choose Yes or No.';
      case 'number':
      case 'scale':
        if (typeof v !== 'number' || Number.isNaN(v)) return 'Enter a number.';
        if (num(q.min) && v < Number(q.min)) return `Enter ${q.min} or more.`;
        if (num(q.max) && v > Number(q.max)) return `Enter ${q.max} or less.`;
        return '';
      case 'short':
      case 'long':
        return num(q.maxLength) && String(v).length > Number(q.maxLength) ? `Keep it to ${q.maxLength} characters.` : '';
      case 'date':
        return /^\d{4}-\d{2}-\d{2}$/.test(v) ? '' : 'Enter a date.';
      case 'single':
        if (v === OTHER && q.allowOther && isEmpty(answers[`${q.id}.other`])) return 'Tell me a bit more in the Other box.';
        return '';
      case 'multi': {
        const picks = Array.isArray(v) ? v : [];
        if (num(q.minPicks) && picks.length < Number(q.minPicks)) return `Pick at least ${q.minPicks}.`;
        if (num(q.maxPicks) && picks.length > Number(q.maxPicks)) return `Pick up to ${q.maxPicks}.`;
        if (picks.includes(OTHER) && q.allowOther && isEmpty(answers[`${q.id}.other`])) return 'Tell me a bit more in the Other box.';
        return '';
      }
      default:
        return '';
    }
  }

  // Keeps answers that still fit the content: drops deleted questions and
  // options, and answers whose type no longer matches. Used when a preview's
  // draft changes under it.
  function reconcile(content, answers) {
    const out = {};
    for (const s of content.sections) {
      for (const q of s.questions) {
        const v = answers[q.id];
        if (v === undefined) continue;
        const ids = new Set((q.options || []).map((o) => o.id).concat(q.allowOther ? [OTHER] : []));
        let keep;
        switch (q.type) {
          case 'single': keep = typeof v === 'string' && ids.has(v) ? v : undefined; break;
          case 'multi': keep = Array.isArray(v) ? v.filter((x) => ids.has(x)) : undefined; break;
          case 'number': case 'scale': keep = typeof v === 'number' ? v : undefined; break;
          case 'yesno': keep = typeof v === 'boolean' ? v : undefined; break;
          case 'ack': keep = v === true ? true : undefined; break;
          case 'date': keep = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined; break;
          default: keep = typeof v === 'string' ? v : undefined;
        }
        if (keep !== undefined) out[q.id] = keep;
        if (q.allowOther && typeof answers[`${q.id}.other`] === 'string') out[`${q.id}.other`] = answers[`${q.id}.other`];
      }
    }
    return out;
  }

  // The screens a client steps through, in order.
  function steps(content) {
    const out = [];
    if (content.welcome && content.welcome.enabled) out.push({ kind: 'welcome' });
    content.sections.forEach((s, si) =>
      s.questions.forEach((q, qi) => out.push({ kind: 'question', si, qi, sectionId: s.id, questionId: q.id })),
    );
    out.push({ kind: 'thanks' });
    return out;
  }

  // Readable answer for the coach's review. Unanswered is said plainly, so
  // it never looks like a No.
  function answerText(q, answers) {
    const v = answers[q.id];
    if (isEmpty(v)) return { text: 'Not answered', empty: true };
    const label = (id) => (id === OTHER ? `Other: ${answers[`${q.id}.other`] || ''}` : ((q.options || []).find((o) => o.id === id) || { label: '(removed option)' }).label);
    switch (q.type) {
      case 'yesno': return { text: v ? 'Yes' : 'No' };
      case 'ack': return { text: v === true ? 'Ticked' : 'Not ticked' };
      case 'single': return { text: label(v) };
      case 'multi': return { text: v.map(label).join(', ') };
      case 'scale': return { text: `${v} of ${q.max}` };
      default: return { text: String(v) };
    }
  }

  // Draft vs published, for the library and the builder toolbar.
  function status(form) {
    if (form.archived_at) return { key: 'archived', label: 'Archived' };
    if (!form.published_version_id) return { key: 'draft', label: 'In draft' };
    if (form.published_rev !== form.draft_rev) return { key: 'changed', label: 'Unpublished changes' };
    return { key: 'published', label: 'Ready' };
  }

  // Tags: trimmed, at most 40 characters, no repeats ignoring case.
  function addTag(tags, tag) {
    const t = String(tag || '').trim().slice(0, 40);
    if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) return tags;
    return tags.concat(t);
  }

  const api = {
    CATEGORIES, TYPES, TYPE_IDS, LENGTHS, OTHER, TEMPLATES,
    uid, clone, newQuestion, newSection, blankContent, normalise, fromTemplate, templatesFor, counts, plural,
    findQuestion, summary, problems, answerError, isEmpty, reconcile, steps, answerText, status, addTag,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RewiredForms = api;
})(typeof window !== 'undefined' ? window : globalThis);
