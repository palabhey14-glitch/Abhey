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

  // In the order the Add tab shows them. Hidden types still work in forms
  // made before they were folded into another type.
  const TYPES = {
    short: { label: 'Short answer', group: 'Basics' },
    long: { label: 'Long answer', group: 'Basics' },
    single: { label: 'Single choice', group: 'Basics' },
    multi: { label: 'Multiple choice', group: 'Basics' },
    yesno: { label: 'Yes / No', group: 'Basics' },
    dropdown: { label: 'Dropdown', group: 'Basics' },
    scale: { label: 'Scale', group: 'Numbers and dates' },
    grid: { label: 'Grid', group: 'Numbers and dates' },
    measurement: { label: 'Measurement', group: 'Numbers and dates' },
    date: { label: 'Date', group: 'Numbers and dates' },
    time: { label: 'Time', group: 'Numbers and dates' },
    ranking: { label: 'Ranking', group: 'Numbers and dates' },
    contact: { label: 'Contact details', group: 'Client details' },
    availability: { label: 'Availability', group: 'Client details' },
    bodymap: { label: 'Body map', group: 'Client details' },
    file: { label: 'File upload', group: 'Client details' },
    info: { label: 'Info text', group: 'Content' },
    media: { label: 'Image or video', group: 'Content' },
    signature: { label: 'Signature', group: 'Content' },
    terms: { label: 'Terms document', group: 'Content' },
    pagebreak: { label: 'Page break', group: 'Content' },
    number: { label: 'Number', group: 'Numbers and dates', hidden: true },
    ack: { label: 'Acknowledgement', group: 'Content', hidden: true },
  };
  const MENU_IDS = Object.keys(TYPES).filter((t) => !TYPES[t].hidden);
  // Blocks clients read rather than answer.
  const CONTENT_TYPES = ['info', 'media', 'pagebreak'];
  const isContent = (q) => CONTENT_TYPES.includes(q.type);
  const CHOICE_TYPES = ['single', 'multi', 'dropdown', 'ranking'];
  const UNITS = ['kg', 'lb', 'cm', 'in', '%', 'bpm', 'mmHg', 'hours', 'litres', 'steps'];
  const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
  const SLOTS = [['early', 'Early morning'], ['morning', 'Morning'], ['midday', 'Midday'], ['afternoon', 'Afternoon'], ['evening', 'Evening']];
  // Body map regions: [id, label, side, x, y] on a 100 x 220 figure.
  const REGIONS = [
    ['head', 'Head', 'front', 50, 14], ['neck', 'Neck', 'front', 50, 32], ['shoulder_l', 'Left shoulder', 'front', 72, 44], ['shoulder_r', 'Right shoulder', 'front', 28, 44],
    ['chest', 'Chest', 'front', 50, 54], ['elbow_l', 'Left elbow', 'front', 80, 80], ['elbow_r', 'Right elbow', 'front', 20, 80], ['abdomen', 'Abdomen', 'front', 50, 82],
    ['wrist_l', 'Left wrist or hand', 'front', 86, 110], ['wrist_r', 'Right wrist or hand', 'front', 14, 110], ['hip_l', 'Left hip', 'front', 62, 104], ['hip_r', 'Right hip', 'front', 38, 104],
    ['thigh_l', 'Left thigh', 'front', 60, 132], ['thigh_r', 'Right thigh', 'front', 40, 132], ['knee_l', 'Left knee', 'front', 60, 158], ['knee_r', 'Right knee', 'front', 40, 158],
    ['shin_l', 'Left shin or calf', 'front', 60, 182], ['shin_r', 'Right shin or calf', 'front', 40, 182], ['ankle_l', 'Left ankle or foot', 'front', 60, 208], ['ankle_r', 'Right ankle or foot', 'front', 40, 208],
    ['upper_back', 'Upper back', 'back', 50, 52], ['mid_back', 'Mid back', 'back', 50, 74], ['lower_back', 'Lower back', 'back', 50, 94], ['glutes', 'Glutes', 'back', 50, 112],
    ['hamstring_l', 'Left hamstring', 'back', 40, 134], ['hamstring_r', 'Right hamstring', 'back', 60, 134],
  ];
  const FILE_KINDS = { images: 'Images', pdf: 'PDF', both: 'Images or PDF' };
  const FILE_MAX = 10 * 1024 * 1024;
  const SIGN_MODES = { both: 'Draw or type', draw: 'Draw only', type: 'Type only' };
  const SIGN_MAX = 150000; // characters of the drawn signature image
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
  const num = (v) => v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v));

  // What a media link shows: a YouTube or Vimeo player, a picture or a video.
  function mediaKind(url) {
    const u = String(url || '').trim();
    if (!/^https:\/\/[^\s]+$/i.test(u)) return '';
    if (/^https:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{6,}/i.test(u)) return 'YouTube';
    if (/^https:\/\/(www\.|player\.)?vimeo\.com\/(video\/)?\d+/i.test(u)) return 'Vimeo';
    if (/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(u)) return 'Image';
    if (/\.(mp4|webm|mov)(\?.*)?$/i.test(u)) return 'Video';
    return '';
  }

  // The address the client's browser plays, or '' when it can't be shown.
  function mediaEmbed(url) {
    const u = String(url || '').trim();
    const kind = mediaKind(u);
    if (kind === 'YouTube') {
      const id = (u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{6,})/) || [])[1];
      return id ? { kind, src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (kind === 'Vimeo') {
      const id = (u.match(/vimeo\.com\/(?:video\/)?(\d+)/) || [])[1];
      return id ? { kind, src: `https://player.vimeo.com/video/${id}` } : null;
    }
    return kind ? { kind, src: u } : null;
  }
  const blank = (s) => !String(s === null || s === undefined ? '' : s).trim();

  function newQuestion(type) {
    const q = { id: uid('q'), type, label: '', help: '', required: false };
    if (CHOICE_TYPES.includes(type)) q.options = [{ id: uid('o'), label: 'Option 1' }, { id: uid('o'), label: 'Option 2' }];
    if (type === 'grid') Object.assign(q, { rows: [{ id: uid('r'), label: 'Row 1' }], columns: [{ id: uid('c'), label: 'Column 1' }, { id: uid('c'), label: 'Column 2' }] });
    if (type === 'measurement') Object.assign(q, { unit: 'kg', min: null, max: null });
    if (type === 'contact') Object.assign(q, { label: 'Your contact details', fields: { name: true, email: true, phone: true } });
    if (type === 'availability') Object.assign(q, { days: DAYS.map((d) => d[0]), slots: ['morning', 'afternoon', 'evening'] });
    if (type === 'bodymap') q.label = 'Where do you feel pain or discomfort?';
    if (type === 'file') Object.assign(q, { maxFiles: 1, accept: 'both' });
    if (type === 'info') Object.assign(q, { label: 'Before you start', text: '' });
    if (type === 'media') Object.assign(q, { label: '', url: '', caption: '' });
    if (type === 'pagebreak') Object.assign(q, { label: 'Next part', text: '' });
    if (type === 'short') q.maxLength = 250;
    if (type === 'long') q.maxLength = 1000;
    if (type === 'scale') Object.assign(q, { min: 1, max: 5, lowLabel: '', highLabel: '', required: true });
    if (type === 'ack') q.required = true;
    if (type === 'terms') Object.assign(q, { required: true, terms: '', versionName: 'Version 1', mustRead: true, agreeLabel: 'I have read and agree to these terms' });
    if (type === 'signature') Object.assign(q, { required: true, statement: 'I agree to the agreement above.', tickLabel: 'I agree', mode: 'both' });
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
              { type: 'measurement', label: 'Current bodyweight', unit: 'kg', required: false, min: 30, max: 300, placeholder: 'e.g. 82.5' },
              { type: 'measurement', label: 'Height', unit: 'cm', required: false, min: 120, max: 230, placeholder: 'e.g. 178' },
            ],
          },
        ],
        thanks: { title: 'Thank you', text: "Your answers are in. I'll go through them before our first check-in." },
      },
    },
    {
      id: 'contract',
      category: 'Contract',
      name: 'Rewired coaching agreement',
      answerLimit: 'once',
      content: {
        welcome: {
          enabled: true,
          title: 'Your coaching agreement',
          text: 'Read the agreement, then sign at the end. It takes about two minutes.',
          button: 'Start',
        },
        sections: [
          {
            title: 'Coaching agreement',
            description: '',
            questions: [
              {
                type: 'terms',
                label: 'Coaching agreement',
                required: true,
                versionName: 'Version 2',
                mustRead: true,
                agreeLabel: 'I have read the coaching agreement',
                terms: [
                  'Your coach will set your training and nutrition plans and review your weekly check-ins.',
                  'You agree to follow the plans as best you can and to tell your coach about any injury, illness or change in your health.',
                  'Coaching is general fitness and nutrition guidance, not medical advice. Check with your doctor before starting if you have a medical condition.',
                  'Premium Coaching support is my personal WhatsApp, 7 days a week, with replies within 12 hours. On the weekly Rewired Coaching subscription, coaching communication is by email, with replies within 2 days.',
                  'Your photos and data are seen only by you and your coach. Using your photos or results publicly is a separate, optional choice.',
                  'Premium Coaching is paid in 3 payments and does not renew. There are no change-of-mind refunds. Every client stays for at least the first four weeks, which are not refundable. If you have to stop after that because of injury or illness, with a doctor\'s certificate, the unused part is refunded pro rata within 14 days. The Week 8 Progress Promise is a guarantee of extra coaching, not a refund.',
                  'The weekly Rewired Coaching subscription renews every week. Your first four weeks are committed, and after your fourth weekly payment you can cancel any time by email. The eight-week satisfaction policy applies to it if you have followed your program at least 80% of the time.',
                  'The full Terms & Conditions at rewiredbyabhey.com/terms.html apply. Your rights under the Australian Consumer Law always apply.',
                ].join('\n\n'),
              },
              {
                type: 'signature',
                label: 'Sign the agreement',
                required: true,
                statement: 'I agree to the coaching agreement above.',
                tickLabel: 'I agree',
                mode: 'both',
              },
            ],
          },
        ],
        thanks: { title: 'Signed, thank you', text: "Your agreement is signed. I'll be in touch about your first week." },
      },
    },
    {
      id: 'health',
      category: 'Health screen',
      name: 'Rewired health screen',
      // Questions with a key can be pointed at by a rule ({ q: key }).
      content: {
        welcome: {
          enabled: true,
          title: 'Your health screen',
          text: 'This takes about five minutes and helps keep your training safe. Answer honestly. A Yes does not rule you out.',
          button: 'Start',
        },
        sections: [
          {
            title: 'About you',
            questions: [
              { type: 'contact', label: 'Your contact details', required: true, fields: { name: true, email: true, phone: true } },
              { type: 'date', label: 'What is your date of birth?', required: true, allowed: 'past' },
            ],
          },
          {
            title: 'Health history',
            description: 'Answer yes to anything that applies to you, even if it is under control.',
            questions: [
              ['heart', 'Has a doctor ever told you that you have a heart condition or high blood pressure?'],
              ['chest', 'Do you get chest pain at rest, during daily activities or when you exercise?'],
              ['dizzy', 'In the last 12 months, have you lost your balance through dizziness or lost consciousness?'],
              ['condition', 'Have you been diagnosed with any other long term medical condition?'],
              ['meds', 'Do you take prescribed medication for a long term medical condition?'],
              ['joint', 'Do you have a bone, joint or muscle problem that more activity could make worse?'],
              ['supervised', 'Has a doctor ever said you should only exercise under medical supervision?'],
            ].flatMap(([key, label]) => [
              { key, type: 'yesno', label, required: true, flag: 'yes' },
              { type: 'long', label: 'Tell us a little more', required: false, maxLength: 1000, showIf: { q: key, is: 'yes' } },
            ]),
          },
          {
            title: "Doctor's clearance",
            description: 'Because a doctor has said you should exercise under supervision.',
            showIf: { q: 'supervised', is: 'yes' },
            questions: [
              { type: 'yesno', label: 'Has your doctor cleared you to start this program?', required: true, flag: 'no' },
              { type: 'file', label: "Upload your doctor's clearance letter, if you have one", required: false, maxFiles: 2, accept: 'both' },
            ],
          },
          {
            title: 'Lifestyle',
            questions: [
              { type: 'single', label: 'How active are you day to day?', required: true, options: ['Mostly sitting', 'Lightly active', 'Active', 'Very active'].map(opt) },
              { type: 'scale', label: 'How well do you sleep?', required: true, min: 1, max: 5, lowLabel: 'Poorly', highLabel: 'Very well' },
              { type: 'single', label: 'Do you smoke?', required: true, options: ['No', 'Occasionally', 'Daily'].map(opt) },
              { type: 'single', label: 'How many days a week do you drink alcohol?', required: true, options: ['None', 'One or two', 'Three or four', 'Five or more'].map(opt) },
            ],
          },
          {
            title: 'Pain and injury',
            questions: [
              { type: 'bodymap', label: 'Mark anywhere you have pain or an injury', required: false, flag: true },
              { type: 'long', label: 'Tell us about any past injuries or operations', required: false, maxLength: 1000 },
            ],
          },
          {
            title: 'Consent',
            questions: [
              {
                type: 'signature',
                label: 'Confirm your answers',
                required: true,
                statement: 'I confirm that my answers are true and complete to the best of my knowledge, and I will tell my coach if my health changes.',
                tickLabel: 'I confirm my answers are accurate',
                mode: 'both',
              },
            ],
          },
        ],
        thanks: { title: "Thanks, that's everything", text: "I'll go through your answers before we start. If anything needs a doctor's sign-off, I'll let you know." },
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
        q.required = q.type === 'terms' ? true : Boolean(q.required);
        if (q.type === 'terms') {
          q.terms = q.terms || '';
          q.versionName = q.versionName === undefined ? 'Version 1' : q.versionName;
          q.mustRead = q.mustRead !== false;
          q.agreeLabel = q.agreeLabel || 'I have read and agree to these terms';
        }
        if (q.type === 'signature') {
          q.statement = q.statement === undefined ? '' : q.statement;
          q.tickLabel = q.tickLabel || 'I agree';
          q.mode = SIGN_MODES[q.mode] ? q.mode : 'both';
        }
        if (CHOICE_TYPES.includes(q.type)) {
          q.options = (q.options || []).map((o) => (o.flag && q.type !== 'ranking' ? { id: o.id || uid('o'), label: o.label || '', flag: true } : { id: o.id || uid('o'), label: o.label || '' }));
          q.allowOther = (q.type === 'single' || q.type === 'multi') && Boolean(q.allowOther);
        }
        if (q.type === 'grid') {
          q.rows = (q.rows || []).map((r) => ({ id: r.id || uid('r'), label: r.label || '' }));
          q.columns = (q.columns || []).map((c) => ({ id: c.id || uid('c'), label: c.label || '' }));
        }
        if (q.type === 'contact') q.fields = { name: true, email: true, phone: true, ...(q.fields || {}) };
        if (q.type === 'availability') {
          q.days = Array.isArray(q.days) && q.days.length ? q.days : DAYS.map((d) => d[0]);
          q.slots = Array.isArray(q.slots) && q.slots.length ? q.slots : ['morning', 'afternoon', 'evening'];
        }
        if (q.type === 'file') {
          q.maxFiles = Math.min(5, Math.max(1, Number(q.maxFiles) || 1));
          q.accept = FILE_KINDS[q.accept] ? q.accept : 'both';
        }
        if (CONTENT_TYPES.includes(q.type)) q.required = false;
        if (q.type === 'yesno') q.flag = q.flag === 'yes' || q.flag === 'no' ? q.flag : '';
        if (q.type === 'bodymap') q.flag = Boolean(q.flag);
        if (q.type === 'date') q.allowed = q.allowed === 'past' || q.allowed === 'future' ? q.allowed : 'any';
        q.showIf = cleanRule(q.showIf);
        if (!q.showIf) delete q.showIf;
      }
      s.showIf = cleanRule(s.showIf);
      if (!s.showIf) delete s.showIf;
    }
    return c;
  }

  function cleanRule(r) {
    return r && typeof r === 'object' && typeof r.q === 'string' && typeof r.is === 'string' && r.q && r.is ? { q: r.q, is: r.is } : null;
  }

  // Rules: a follow-up question, or a whole section, shows only when an
  // earlier answer matches. { q: questionId, is: 'yes' | 'no' | optionId }
  function ruleMet(rule, answers) {
    if (!rule) return true;
    const v = answers[rule.q];
    if (rule.is === 'yes' || rule.is === 'no') return v === (rule.is === 'yes');
    return v === rule.is || (Array.isArray(v) && v.includes(rule.is));
  }

  function shown(content, si, qi, answers) {
    const s = content.sections[si];
    return ruleMet(s.showIf, answers) && ruleMet(s.questions[qi].showIf, answers);
  }

  // Questions a rule can point at: Yes/No and choice questions that always
  // show, so rules never chain. Pass a question id to get only those before it.
  function ruleTargets(content, beforeId) {
    const out = [];
    for (const s of content.sections) {
      for (const q of s.questions) {
        if (q.id === beforeId) return out;
        if (!s.showIf && !q.showIf && ['yesno', 'single', 'dropdown', 'multi'].includes(q.type)) out.push(q);
      }
    }
    return out;
  }

  function ruleText(content, rule) {
    if (!rule) return '';
    const f = findQuestion(content, rule.q);
    if (!f) return 'a question that was deleted';
    const q = f.question;
    const is = rule.is === 'yes' ? 'Yes' : rule.is === 'no' ? 'No' : ((q.options || []).find((o) => o.id === rule.is) || { label: 'a removed option' }).label;
    return `“${q.label || 'Untitled question'}” is ${is}`;
  }

  // Drops answers to questions a rule hides, as the database does on submit.
  function visibleAnswers(content, answers) {
    const out = {};
    content.sections.forEach((s, si) => s.questions.forEach((q, qi) => {
      if (!shown(content, si, qi, answers)) return;
      if (answers[q.id] !== undefined) out[q.id] = answers[q.id];
      if (answers[`${q.id}.other`] !== undefined) out[`${q.id}.other`] = answers[`${q.id}.other`];
    }));
    return out;
  }

  // An answer the coach marked to look at.
  function isFlagged(q, answers) {
    const v = answers[q.id];
    if (isEmpty(v)) return false;
    if (q.type === 'yesno') return (q.flag === 'yes' && v === true) || (q.flag === 'no' && v === false);
    if (q.type === 'bodymap') return Boolean(q.flag) && Array.isArray(v) && v.length > 0;
    if (['single', 'multi', 'dropdown'].includes(q.type)) return (q.options || []).some((o) => o.flag && (v === o.id || (Array.isArray(v) && v.includes(o.id))));
    return false;
  }

  // A template becomes the coach's own copy with fresh ids, so editing it
  // never touches the template or anyone else's form.
  function fromTemplate(id) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return null;
    const c = clone(t.content);
    const ids = {};
    for (const s of c.sections) {
      delete s.id;
      for (const q of s.questions) {
        q.id = uid('q');
        if (q.key) ids[q.key] = q.id;
        delete q.key;
        for (const o of q.options || []) delete o.id;
      }
    }
    // Rules name a template key; point them at the new question ids.
    for (const s of c.sections) {
      if (s.showIf) s.showIf = { ...s.showIf, q: ids[s.showIf.q] };
      for (const q of s.questions) if (q.showIf) q.showIf = { ...q.showIf, q: ids[q.showIf.q] };
    }
    return normalise(c);
  }

  function templatesFor(category) {
    return TEMPLATES.filter((t) => t.category === category);
  }

  function counts(content) {
    const sections = (content && content.sections) || [];
    return { sections: sections.length, questions: sections.reduce((n, s) => n + (s.questions || []).filter((q) => !isContent(q)).length, 0) };
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
    if (q.type === 'grid') return `${t} · ${plural((q.rows || []).length, 'row')} × ${plural((q.columns || []).length, 'column')}`;
    if (q.type === 'measurement') return `${t} · ${q.unit || 'no unit'}${num(q.min) && num(q.max) ? ` · ${q.min} to ${q.max}` : ''}`;
    if (q.type === 'contact') return `${t} · ${['name', 'email', 'phone'].filter((k) => q.fields && q.fields[k]).join(', ')}`;
    if (q.type === 'availability') return `${t} · ${(q.days || []).length} days, ${(q.slots || []).length} times`;
    if (q.type === 'file') return `${t} · ${FILE_KINDS[q.accept] || 'Files'}, up to ${q.maxFiles || 1}`;
    if (q.type === 'media') return `${t}${q.url ? ` · ${mediaKind(q.url) || 'link'}` : ' · no link yet'}`;
    if (q.type === 'info' || q.type === 'pagebreak') return t;
    if (CHOICE_TYPES.includes(q.type)) {
      const labels = (q.options || []).map((o) => o.label).filter(Boolean);
      if (q.allowOther) labels.push('Other');
      return `${t} · ${labels.join(', ') || 'no options yet'}`;
    }
    if (q.type === 'short' || q.type === 'long') return `${t} · Up to ${q.maxLength || 1000} characters`;
    if (q.type === 'scale') return `${t} · ${q.min} to ${q.max}`;
    if (q.type === 'terms') return `${t}${q.versionName ? ` · ${q.versionName}` : ''}`;
    if (q.type === 'signature') return `${t} · ${SIGN_MODES[q.mode] || SIGN_MODES.both}`;
    if (q.type === 'number') {
      if (q.min !== undefined && q.min !== null && q.max !== undefined && q.max !== null) return `${t} · ${q.min} to ${q.max}`;
      return t;
    }
    return t;
  }

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
      const badRule = (rule, beforeId) => {
        const t = ruleTargets(c, beforeId).find((x) => x.id === rule.q);
        return !t || !(t.type === 'yesno' ? rule.is === 'yes' || rule.is === 'no' : (t.options || []).some((o) => o.id === rule.is));
      };
      if (s.showIf && badRule(s.showIf, s.questions[0] && s.questions[0].id)) out.push({ where: s.id, message: `${name}: its rule points at an answer that is missing` });
      s.questions.forEach((q) => {
        n += 1;
        const at = (message) => out.push({ where: s.id, questionId: q.id, message: `Question ${n}: ${message}` });
        if (q.showIf && badRule(q.showIf, q.id)) at('it follows up an answer that is missing');
        if (!TYPES[q.type]) at('unknown answer type');
        if (q.type === 'info') {
          if (blank(q.label) && blank(q.text)) at('add a heading or some text');
          return;
        }
        if (q.type === 'pagebreak') return;
        if (q.type === 'media') {
          if (!mediaKind(q.url)) at('add an https link to an image, a video file, or a YouTube or Vimeo video');
          return;
        }
        if (blank(q.label)) at('add the question');
        if (q.type === 'dropdown' || q.type === 'ranking') {
          const labels = q.options.map((o) => o.label.trim()).filter(Boolean);
          if (labels.length < 2) at('needs at least two options');
          if (q.options.some((o) => blank(o.label))) at('has an empty option');
          if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) at('has the same option twice');
        }
        if (q.type === 'grid') {
          if (!q.rows.length || q.rows.some((r) => blank(r.label))) at('every row needs a label');
          if (q.columns.length < 2 || q.columns.some((c) => blank(c.label))) at('needs at least two labelled columns');
        }
        if (q.type === 'measurement' && num(q.min) && num(q.max) && Number(q.min) >= Number(q.max)) at('lowest value must be below the highest');
        if (q.type === 'contact' && !['name', 'email', 'phone'].some((k) => q.fields[k])) at('ask for at least one detail');
        if (q.type === 'availability' && (!q.days.length || !q.slots.length)) at('needs at least one day and one time');
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
        if (q.type === 'terms' && blank(q.terms)) at('add the terms text');
        if (q.type === 'terms' && String(q.terms || '').length > 20000) at('terms are longer than 20,000 characters');
        if (q.type === 'signature' && blank(q.statement)) at('add the consent statement');
        if (q.type === 'signature' && String(q.statement || '').length > 1000) at('consent statement is longer than 1,000 characters');
      });
    });
    if (sections.length && !n) out.push({ where: 'form', message: 'Add at least one question' });
    return out;
  }

  function isEmpty(v) {
    return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)
      || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).some((k) => !isEmpty(v[k])));
  }

  // The client-facing check for one answer. Returns a message or ''.
  function answerError(q, answers) {
    if (isContent(q)) return '';
    const v = answers[q.id];
    if (isEmpty(v)) {
      if (!q.required) return '';
      if (q.type === 'ack' || q.type === 'terms') return 'Tick the box to continue.';
      if (q.type === 'signature') return 'Tick the box and sign to continue.';
      if (q.type === 'file') return 'Upload a file to continue.';
      if (q.type === 'grid') return 'Answer every row.';
      return 'This one is required.';
    }
    switch (q.type) {
      case 'terms':
        return v && v.agreed === true ? '' : 'Tick the box to continue.';
      case 'signature': {
        if (!v || typeof v !== 'object') return 'Tick the box and sign to continue.';
        if (q.required && v.agreed !== true) return 'Tick the box to agree.';
        const mode = SIGN_MODES[q.mode] ? q.mode : 'both';
        const typed = mode !== 'draw' && typeof v.name === 'string' && v.name.trim().length >= 2;
        const drawn = mode !== 'type' && typeof v.image === 'string' && v.image.startsWith('data:image/png;base64,');
        if (typeof v.image === 'string' && v.image.length > SIGN_MAX) return 'That signature is too detailed. Clear it and sign again.';
        if (typeof v.name === 'string' && v.name.length > 120) return 'Keep your name to 120 characters.';
        return typed || drawn ? '' : mode === 'draw' ? 'Draw your signature.' : mode === 'type' ? 'Type your full name to sign.' : 'Draw your signature or type your full name.';
      }
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
      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Enter a date.';
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (q.allowed === 'past' && v > today) return 'Pick a date in the past.';
        if (q.allowed === 'future' && v < today) return 'Pick today or a later date.';
        return '';
      }
      case 'measurement':
        if (typeof v !== 'number' || Number.isNaN(v)) return 'Enter a number.';
        if (num(q.min) && v < Number(q.min)) return `Enter ${q.min} or more.`;
        if (num(q.max) && v > Number(q.max)) return `Enter ${q.max} or less.`;
        return '';
      case 'time':
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? '' : 'Enter a time.';
      case 'dropdown':
        return (q.options || []).some((o) => o.id === v) ? '' : 'Choose an option.';
      case 'ranking': {
        const ids = (q.options || []).map((o) => o.id);
        return Array.isArray(v) && v.length === ids.length && ids.every((id) => v.includes(id)) ? '' : 'Put every option in order.';
      }
      case 'grid': {
        const rows = q.rows || [];
        const cols = new Set((q.columns || []).map((c) => c.id));
        const picked = rows.filter((r) => cols.has(v && v[r.id]));
        if (q.required && picked.length < rows.length) return `Answer every row (${picked.length} of ${rows.length} done).`;
        return '';
      }
      case 'contact': {
        const val = v && typeof v === 'object' ? v : {};
        const want = ['name', 'email', 'phone'].filter((k) => q.fields && q.fields[k]);
        if (q.required) {
          const missing = want.find((k) => blank(val[k]));
          if (missing) return `Add your ${missing === 'name' ? 'full name' : missing === 'email' ? 'email' : 'phone number'}.`;
        }
        if (!blank(val.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.email.trim())) return 'Check your email address.';
        if (!blank(val.phone) && !/^[+()\d\s-]{6,20}$/.test(val.phone.trim())) return 'Check your phone number.';
        if (want.some((k) => String(val[k] || '').length > 120)) return 'Keep each detail to 120 characters.';
        return '';
      }
      case 'availability':
      case 'bodymap':
        return Array.isArray(v) ? '' : 'Pick at least one.';
      case 'file': {
        const files = Array.isArray(v) ? v : [];
        if (files.length > (q.maxFiles || 1)) return `Upload up to ${q.maxFiles || 1}.`;
        return files.every((f) => f && typeof f.path === 'string') ? '' : 'Upload your file again.';
      }
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
          case 'terms': case 'signature': case 'contact': keep = v && typeof v === 'object' && !Array.isArray(v) ? v : undefined; break;
          case 'measurement': keep = typeof v === 'number' ? v : undefined; break;
          case 'time': keep = typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : undefined; break;
          case 'dropdown': keep = typeof v === 'string' && ids.has(v) ? v : undefined; break;
          case 'ranking': keep = Array.isArray(v) && v.length === ids.size && v.every((x) => ids.has(x)) ? v : undefined; break;
          case 'grid': {
            const rows = new Set((q.rows || []).map((r) => r.id));
            const cols = new Set((q.columns || []).map((c) => c.id));
            const g = {};
            if (v && typeof v === 'object') Object.keys(v).forEach((r) => { if (rows.has(r) && cols.has(v[r])) g[r] = v[r]; });
            keep = Object.keys(g).length ? g : undefined;
            break;
          }
          case 'availability': {
            const ok = new Set((q.days || []).flatMap((d) => (q.slots || []).map((t) => `${d}:${t}`)));
            keep = Array.isArray(v) ? v.filter((x) => ok.has(x)) : undefined;
            break;
          }
          case 'bodymap': keep = Array.isArray(v) ? v.filter((x) => REGIONS.some((r) => r[0] === x)) : undefined; break;
          case 'file': keep = Array.isArray(v) ? v.filter((f) => f && typeof f.path === 'string') : undefined; break;
          case 'info': case 'media': case 'pagebreak': keep = undefined; break;
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
      case 'dropdown': return { text: label(v) };
      case 'ranking': return { text: v.map((id, i) => `${i + 1}. ${label(id)}`).join('  ') };
      case 'measurement': return { text: `${v}${q.unit ? ` ${q.unit}` : ''}` };
      case 'grid': return { text: (q.rows || []).map((r) => `${r.label}: ${((q.columns || []).find((c) => c.id === v[r.id]) || { label: 'not answered' }).label}`).join(' · ') };
      case 'contact': return { text: ['name', 'email', 'phone'].filter((k) => !isEmpty(v[k])).map((k) => v[k]).join(' · ') };
      case 'availability': {
        const byDay = DAYS.map(([d, dl]) => [dl, SLOTS.filter(([t]) => v.includes(`${d}:${t}`)).map(([, tl]) => tl)]).filter(([, ts]) => ts.length);
        return { text: byDay.map(([d, ts]) => `${d}: ${ts.join(', ')}`).join(' · ') };
      }
      case 'bodymap': return { text: v.map((id) => (REGIONS.find((r) => r[0] === id) || [id, id])[1]).join(', ') };
      case 'file': return { text: v.map((f) => f.name || 'file').join(', '), files: v };
      case 'terms': return { text: v.agreed === true ? `Agreed${q.versionName ? ` · ${q.versionName}` : ''}` : 'Not agreed' };
      case 'signature': {
        const agreed = v.agreed === true ? `${q.tickLabel || 'Agreed'}` : 'Did not tick';
        if (typeof v.image === 'string' && v.image.startsWith('data:image/png;base64,')) return { text: `${agreed} · signed by drawing`, image: v.image };
        if (typeof v.name === 'string' && v.name.trim()) return { text: `${agreed} · signed as “${v.name.trim()}”`, typed: v.name.trim() };
        return { text: `${agreed} · no signature` };
      }
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
    CATEGORIES, TYPES, TYPE_IDS, MENU_IDS, CONTENT_TYPES, CHOICE_TYPES, isContent, UNITS, DAYS, SLOTS, REGIONS, FILE_KINDS, FILE_MAX, mediaKind, mediaEmbed, LENGTHS, OTHER, TEMPLATES, SIGN_MODES, SIGN_MAX,
    ruleMet, shown, ruleTargets, ruleText, visibleAnswers, isFlagged,
    uid, clone, newQuestion, newSection, blankContent, normalise, fromTemplate, templatesFor, counts, plural,
    findQuestion, summary, problems, answerError, isEmpty, reconcile, steps, answerText, status, addTag,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RewiredForms = api;
})(typeof window !== 'undefined' ? window : globalThis);
