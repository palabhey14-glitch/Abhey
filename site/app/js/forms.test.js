// Run with: node site/app/js/forms.test.js
const assert = require('node:assert/strict');
const F = require('./forms.js');

// Exactly the five categories, in order.
assert.deepEqual(F.CATEGORIES, ['Onboarding', 'Health screen', 'Contract', 'Feedback', 'Other']);

// Templates: only Onboarding has one; 4 sections, 9 questions.
assert.equal(F.templatesFor('Onboarding').length, 1);
assert.equal(F.templatesFor('Contract').length, 1);
assert.equal(F.templatesFor('Health screen').length, 1);
assert.equal(F.templatesFor('Feedback').length, 0);
const t = F.fromTemplate('onboarding');
assert.deepEqual(F.counts(t), { sections: 4, questions: 9 });
assert.deepEqual(t.sections.map((s) => s.title), ['Your goals', 'Training history', 'Availability', 'Measurements']);
assert.equal(t.sections[0].questions.length, 2);
const q1 = t.sections[0].questions[0];
assert.equal(q1.label, 'What are your main goals?');
assert.equal(q1.type, 'multi');
assert.equal(q1.required, true);
assert.deepEqual(q1.options.map((o) => o.label).concat(q1.allowOther ? ['Other'] : []),
  ['Lose body fat', 'Build muscle', 'Get stronger', 'Improve fitness', 'Feel healthier', 'Other']);
assert.ok(t.sections[3].questions.every((q) => !q.required), 'measurements are optional');
assert.deepEqual(F.problems(t), [], 'template is ready to publish');

// Each copy is independent: fresh ids, and editing it leaves the template alone.
const t2 = F.fromTemplate('onboarding');
assert.notEqual(t.sections[0].id, t2.sections[0].id);
assert.notEqual(q1.options[0].id, t2.sections[0].questions[0].options[0].id);
t.sections[0].questions[0].label = 'Changed';
assert.equal(F.fromTemplate('onboarding').sections[0].questions[0].label, 'What are your main goals?');

// Blank: welcome, one empty section, thank-you. Not publishable yet.
const b = F.blankContent();
assert.equal(b.welcome.enabled, true);
assert.equal(b.sections.length, 1);
assert.equal(b.sections[0].questions.length, 0);
assert.ok(b.thanks.title);
assert.ok(F.problems(b).some((p) => /no questions/.test(p.message)));

// Publishing checks point at what to fix.
const bad = F.normalise({ sections: [{ title: 'S', questions: [
  { id: 'qa', type: 'single', label: '', options: [{ id: 'o1', label: 'Only' }] },
  { id: 'qb', type: 'number', label: 'N', min: 10, max: 5 },
  { id: 'qc', type: 'multi', label: 'M', options: [{ label: 'a' }, { label: 'A' }], minPicks: 3, maxPicks: 1 },
] }, { title: '', questions: [] }] });
const msgs = F.problems(bad).map((p) => p.message).join(' | ');
assert.match(msgs, /Question 1: add the question/);
assert.match(msgs, /Question 1: needs at least two options/);
assert.match(msgs, /Question 2: lowest value must be below the highest/);
assert.match(msgs, /Question 3: has the same option twice/);
assert.match(msgs, /Question 3: minimum picks is more than maximum/);
assert.match(msgs, /Section 2 needs a title/);
assert.equal(F.problems(bad).find((p) => /Question 1/.test(p.message)).questionId, 'qa');

// Answers: required, explicit No, ranges, Other text.
const yn = { id: 'y', type: 'yesno', required: true };
assert.equal(F.answerError(yn, {}), 'This one is required.');
assert.equal(F.answerError(yn, { y: false }), '', 'No is an answer');
const n = { id: 'n', type: 'number', required: false, min: 30, max: 300 };
assert.equal(F.answerError(n, {}), '', 'optional can be skipped');
assert.equal(F.answerError(n, { n: 20 }), 'Enter 30 or more.');
const m = { ...q1 };
assert.equal(F.answerError(m, { [m.id]: [] }), 'This one is required.');
assert.match(F.answerError(m, { [m.id]: [F.OTHER] }), /Other box/);
assert.equal(F.answerError(m, { [m.id]: [F.OTHER], [`${m.id}.other`]: 'Sleep better' }), '');
const ack = { id: 'k', type: 'ack', required: true };
assert.equal(F.answerError(ack, { k: false }), 'Tick the box to continue.');

// Review text: unanswered is never shown as No.
assert.deepEqual(F.answerText(yn, {}), { text: 'Not answered', empty: true });
assert.deepEqual(F.answerText(yn, { y: false }), { text: 'No' });
assert.equal(F.answerText(m, { [m.id]: [m.options[1].id, F.OTHER], [`${m.id}.other`]: 'Sleep' }).text, 'Build muscle, Other: Sleep');

// Preview keeps answers that still fit after edits.
const c = F.normalise({ sections: [{ title: 'S', questions: [
  { id: 'a', type: 'single', label: 'A', options: [{ id: 'x', label: 'X' }, { id: 'z', label: 'Z' }] },
  { id: 'b', type: 'short', label: 'B' },
] }] });
const kept = F.reconcile(c, { a: 'gone', b: 'hello', deleted: 'x' });
assert.deepEqual(kept, { b: 'hello' }, 'removed option and removed question dropped');
c.sections[0].questions[1].type = 'number';
assert.deepEqual(F.reconcile(c, { a: 'x', b: 'hello' }), { a: 'x' }, 'type change drops the old answer');

// Steps: welcome (when on), questions, thank-you.
assert.deepEqual(F.steps(t).map((s) => s.kind).filter((k, i, a) => a.indexOf(k) === i), ['welcome', 'question', 'thanks']);
assert.equal(F.steps(t).length, 11);
t.welcome.enabled = false;
assert.equal(F.steps(t)[0].kind, 'question');

// Status and tags.
assert.equal(F.status({ published_version_id: null }).label, 'In draft');
assert.equal(F.status({ published_version_id: 'v', published_rev: 3, draft_rev: 3 }).key, 'published');
assert.equal(F.status({ published_version_id: 'v', published_rev: 3, draft_rev: 4 }).key, 'changed');
assert.equal(F.status({ archived_at: 'x' }).key, 'archived');
assert.deepEqual(F.addTag(['New'], ' new '), ['New']);
assert.deepEqual(F.addTag(['New'], 'VIP'), ['New', 'VIP']);

// Contract template: terms document then a signature, ready to publish.
const ct = F.fromTemplate('contract');
assert.deepEqual(ct.sections[0].questions.map((q) => q.type), ['terms', 'signature']);
assert.deepEqual(F.problems(ct), []);
const [terms, sig] = ct.sections[0].questions;
assert.equal(terms.required, true, 'terms are always required');
assert.equal(F.answerError(terms, {}), 'Tick the box to continue.');
assert.equal(F.answerError(terms, { [terms.id]: { agreed: true } }), '');
assert.equal(F.answerText(terms, { [terms.id]: { agreed: true } }).text, 'Agreed · Version 1');
assert.equal(F.answerError(sig, { [sig.id]: { name: 'Dean Subotic' } }), 'Tick the box to agree.');
assert.match(F.answerError(sig, { [sig.id]: { agreed: true } }), /signature|name/);
assert.equal(F.answerError(sig, { [sig.id]: { agreed: true, name: 'Dean Subotic' } }), '');
assert.equal(F.answerError(sig, { [sig.id]: { agreed: true, image: 'data:image/png;base64,AAAA' } }), '');
assert.match(F.answerError({ ...sig, mode: 'draw' }, { [sig.id]: { agreed: true, name: 'Dean' } }), /Draw/);
assert.match(F.answerError(sig, { [sig.id]: { agreed: true, image: `data:image/png;base64,${'A'.repeat(F.SIGN_MAX)}` } }), /too detailed/);
assert.equal(F.answerText(sig, { [sig.id]: { agreed: true, name: 'Dean Subotic' } }).typed, 'Dean Subotic');
const noTerms = F.normalise({ sections: [{ title: 'S', questions: [{ id: 't', type: 'terms', label: 'T', terms: '' }, { id: 'g', type: 'signature', label: 'G', statement: ' ' }] }] });
assert.match(F.problems(noTerms).map((p) => p.message).join(' | '), /add the terms text.*add the consent statement/);

// Health screen: rules, follow-ups and flags.
const hs = F.fromTemplate('health');
assert.deepEqual(F.problems(hs), []);
assert.equal(hs.sections.length, 6);
const hist = hs.sections[1].questions;
const heart = hist[0];
const heartMore = hist[1];
assert.equal(heartMore.showIf.q, heart.id);
const supervised = hist.filter((q) => q.type === 'yesno')[6];
assert.equal(hs.sections[2].showIf.q, supervised.id);
const ans = { [heart.id]: false, [heartMore.id]: 'old note', [supervised.id]: false };
assert.equal(F.shown(hs, 1, 1, ans), false);
assert.equal(F.shown(hs, 2, 0, ans), false);
assert.equal(F.visibleAnswers(hs, ans)[heartMore.id], undefined);
ans[heart.id] = true;
ans[supervised.id] = true;
assert.equal(F.shown(hs, 1, 1, ans), true);
assert.equal(F.shown(hs, 2, 0, ans), true);
assert.equal(F.isFlagged(heart, ans), true);
assert.equal(F.isFlagged(heart, { [heart.id]: false }), false);
assert.equal(F.isFlagged(hs.sections[4].questions[0], { [hs.sections[4].questions[0].id]: ['knee-l'] }), true);
// A rule pointing at a deleted question stops a publish.
const broken = F.clone(hs);
broken.sections[1].questions.splice(0, 1);
assert.match(F.problems(broken).map((p) => p.message).join(' | '), /follows up an answer that is missing/);
const dob = hs.sections[0].questions[1];
assert.equal(F.answerError(dob, { [dob.id]: '2999-01-01' }), 'Pick a date in the past.');
assert.equal(F.answerError(dob, { [dob.id]: '1990-05-01' }), '');

console.log('forms tests passed');
