// Forms screens: the coach's Forms library, New Form, the builder with its
// live preview, sending to clients and reading responses; and the client's
// forms on Home and the form itself. Loaded after forms.js and before app.js,
// which hands over its shared helpers with RewiredFormsUI.init().
//
// The database decides who may see and change what (2026-10-29-forms.sql).
// The preview and the client's form are the same renderer (runner below);
// only the client's one is wired to save.
(function () {
  'use strict';

  const F = window.RewiredForms;
  let h = null;
  let sb = null;
  let esc = null;

  function init(helpers) {
    h = helpers;
    ({ sb, esc } = helpers);
  }

  const missingTable = (e) => e && /42P01|42883|PGRST20[0-9]|does not exist|schema cache/i.test(`${e.code} ${e.message}`);
  const SETUP_MSG = 'Forms need a one-off database update. Run supabase/migrations/2026-10-29-forms.sql in the Supabase SQL Editor.';
  function explain(err) {
    if (missingTable(err)) return SETUP_MSG;
    const msg = (err && err.message) || String(err);
    if (/stale_draft/.test(msg)) return 'This form was changed in another tab. Reload to get the latest version.';
    if (/already_submitted/.test(msg)) return 'This form has already been sent.';
    return h.friendlyError(err);
  }
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
  const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '–');

  const svg = (d, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra || ''}>${d}</svg>`;
  const IC = {
    forms: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    back: svg('<path d="m15 6-6 6 6 6"/>'),
    chev: svg('<path d="m6 9 6 6 6-6"/>'),
    up: svg('<path d="m6 15 6-6 6 6"/>'),
    down: svg('<path d="m6 9 6 6 6-6"/>'),
    dots: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
    grip: svg('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    star: svg('<path d="M12 4v16M5 8l14 8M19 8 5 16"/>'),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
    pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    send: svg('<path d="m4 12 16-8-6 16-3-6z"/>'),
    check: svg('<path d="m5 12 4.5 4.5L19 7"/>'),
    search: svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>'),
    wave: svg('<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.5-2.7L3 14.5a1.6 1.6 0 0 1 2.4-2L7 14"/>'),
    flag: svg('<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'),
    enter: svg('<path d="M19 6v6H6M10 8l-4 4 4 4"/>'),
    t: {
      short: svg('<path d="M5 6h14M12 6v13"/>'),
      long: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>'),
      single: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'),
      multi: svg('<path d="m3 12 3 3 5-6M13 12l3 3 5-6"/>'),
      yesno: svg('<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="8" cy="12" r="2.5"/>'),
      scale: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
      number: svg('<path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16"/>'),
      date: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'),
      ack: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>'),
    },
  };

  // Small toast with an optional action (Undo, Retry).
  function notify(message, opts) {
    const o = opts || {};
    document.querySelectorAll('.f-toast').forEach((el) => el.remove());
    const el = document.createElement('div');
    el.className = `f-toast${o.error ? ' error' : ''}`;
    el.setAttribute('role', o.error ? 'alert' : 'status');
    el.innerHTML = `<span>${esc(message)}</span>${o.action ? `<button type="button">${esc(o.action)}</button>` : ''}<button type="button" class="f-toast-x" aria-label="Dismiss">${IC.x}</button>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    if (o.action) el.querySelector('button').addEventListener('click', () => { close(); o.onAction(); });
    el.querySelector('.f-toast-x').addEventListener('click', close);
    setTimeout(close, o.ms || (o.action ? 8000 : 3500));
  }

  // Dialog with a dimmed backdrop: focus moves in, Tab stays inside, Escape
  // or the backdrop closes it (unless canClose says no), focus goes back.
  function dialog(html, opts) {
    const o = opts || {};
    const before = document.activeElement;
    const back = document.createElement('div');
    back.className = 'f-back';
    back.innerHTML = html;
    document.body.appendChild(back);
    const box = back.firstElementChild;
    const focusables = () => [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
    const close = () => {
      if (o.canClose && !o.canClose()) return;
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      if (o.onClose) o.onClose();
      if (before && before.focus) before.focus();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (box.querySelector('[aria-expanded="true"]')) return;
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    const first = box.querySelector('[autofocus]') || focusables()[0];
    if (first) first.focus();
    return { box, close, remove: () => { o.canClose = null; close(); } };
  }

  // ------------------------------------------------------------- tag picker

  // Searchable tag field: pick existing tags or create new ones, no repeats.
  function tagPicker(host, opts) {
    let tags = opts.tags.slice();
    let active = 0;
    let open = false;
    const id = `tp-${F.uid('x')}`;
    function options(q) {
      const lower = tags.map((t) => t.toLowerCase());
      const list = opts.all.filter((t) => !lower.includes(t.toLowerCase()) && t.toLowerCase().includes(q.toLowerCase()));
      const exact = opts.all.concat(tags).some((t) => t.toLowerCase() === q.trim().toLowerCase());
      if (q.trim() && !exact) list.push({ create: q.trim().slice(0, 40) });
      return list.slice(0, 8);
    }
    function draw(focus) {
      const q = host.querySelector('input') ? host.querySelector('input').value : '';
      const list = options(q);
      if (active >= list.length) active = Math.max(0, list.length - 1);
      host.innerHTML = `<div class="ftp${open ? ' open' : ''}">
        ${tags.map((t, i) => `<span class="ftp-chip">${esc(t)}<button type="button" data-rm="${i}" aria-label="Remove tag ${esc(t)}">${IC.x}</button></span>`).join('')}
        <input type="text" role="combobox" aria-autocomplete="list" aria-expanded="${open && list.length ? 'true' : 'false'}" aria-controls="${id}"
          ${opts.labelledby ? `aria-labelledby="${opts.labelledby}"` : ''} placeholder="${tags.length ? 'Add another tag' : 'Search or create a tag'}" value="${esc(q)}" maxlength="40"
          ${open && list.length ? `aria-activedescendant="${id}-${active}"` : ''}>
        <span class="ftp-chev" aria-hidden="true">${IC.chev}</span>
        ${open && list.length ? `<ul class="ftp-list" role="listbox" id="${id}">${list.map((t, i) => `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${i === active}">${t.create ? `Create “${esc(t.create)}”` : esc(t)}</li>`).join('')}</ul>` : ''}
      </div>`;
      const input = host.querySelector('input');
      if (focus) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      input.addEventListener('input', () => { open = true; active = 0; draw(true); });
      input.addEventListener('focus', () => { if (!open) { open = true; draw(true); } });
      input.addEventListener('blur', () => setTimeout(() => { if (!host.contains(document.activeElement) && open) { open = false; draw(false); } }, 120));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          open = true;
          active = Math.max(0, Math.min(list.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
          draw(true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (list[active]) pick(list[active]);
          else if (input.value.trim()) pick({ create: input.value.trim() });
        } else if (e.key === 'Escape' && open) {
          e.stopPropagation();
          open = false;
          draw(true);
        } else if (e.key === 'Backspace' && !input.value && tags.length) {
          tags = tags.slice(0, -1);
          opts.onChange(tags);
          draw(true);
        }
      });
      host.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
        tags = tags.filter((_, i) => i !== Number(b.dataset.rm));
        opts.onChange(tags);
        draw(true);
      }));
      host.querySelectorAll('[data-i]').forEach((li) => li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(list[Number(li.dataset.i)]); }));
    }
    function pick(t) {
      const name = t.create || t;
      const next = F.addTag(tags, name);
      if (next !== tags) {
        tags = next;
        if (!opts.all.some((x) => x.toLowerCase() === name.toLowerCase())) opts.all.push(name);
        opts.onChange(tags);
      }
      host.querySelector('input').value = '';
      active = 0;
      draw(true);
    }
    draw(false);
  }

  // ================================================================ runner
  // One renderer for the coach's preview and the client's real form.
  //   opts: { content, name, description, mode: 'preview'|'client',
  //           device: 'phone'|'desktop'|'client', answers, onChange(answers),
  //           onSubmit(answers) -> Promise, onStep(step), startAt, closeHref }
  function createRunner(host, opts) {
    const o = opts;
    let content = F.normalise(o.content);
    let answers = F.reconcile(content, o.answers || {});
    let list = F.steps(content);
    let at = 0;
    let error = '';
    let submitting = null;
    let saveState = o.mode === 'client' ? 'idle' : 'preview';
    let device = o.device;

    if (o.at) {
      const i = list.findIndex((x) => (o.at.questionId ? x.questionId === o.at.questionId : x.kind === o.at.kind));
      if (i >= 0) at = i;
    } else if (o.startAt === 'resume') {
      const firstOpen = list.findIndex((s) => s.kind === 'question' && F.isEmpty(answers[s.questionId]));
      const anyAnswered = Object.keys(answers).length > 0;
      at = anyAnswered ? (firstOpen >= 0 ? firstOpen : list.length - 2) : 0;
    }

    const step = () => list[at];
    const qOf = (s) => content.sections[s.si].questions[s.qi];
    const lastQuestion = () => { for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].kind === 'question') return i; return -1; };

    function inputHTML(q) {
      const v = answers[q.id];
      const name = `fr-${q.id}`;
      const other = (type) => (q.allowOther ? `<label class="fr-opt"><input type="${type}" name="${name}" value="${F.OTHER}"${(type === 'radio' ? v === F.OTHER : Array.isArray(v) && v.includes(F.OTHER)) ? ' checked' : ''}><span>Other</span></label>
        ${(type === 'radio' ? v === F.OTHER : Array.isArray(v) && v.includes(F.OTHER)) ? `<input class="fr-text fr-other" type="text" data-other maxlength="200" aria-label="Other, tell me more" placeholder="Tell me more" value="${esc(answers[`${q.id}.other`] || '')}">` : ''}` : '');
      switch (q.type) {
        case 'short':
          return `<input class="fr-text" id="${name}" type="text" maxlength="${q.maxLength || 250}" placeholder="${esc(q.placeholder || 'Type your answer')}" value="${esc(v || '')}" aria-describedby="${name}-err">`;
        case 'long':
          return `<textarea class="fr-text" id="${name}" rows="4" maxlength="${q.maxLength || 1000}" placeholder="${esc(q.placeholder || 'Type your answer')}" aria-describedby="${name}-err">${esc(v || '')}</textarea>
            <small class="fr-count">${String(v || '').length}/${q.maxLength || 1000}</small>`;
        case 'number':
          return `<input class="fr-text" id="${name}" type="number" inputmode="decimal" step="any"${q.min !== undefined && q.min !== null && q.min !== '' ? ` min="${esc(q.min)}"` : ''}${q.max !== undefined && q.max !== null && q.max !== '' ? ` max="${esc(q.max)}"` : ''} placeholder="${esc(q.placeholder || '')}" value="${v === undefined ? '' : esc(v)}" aria-describedby="${name}-err">`;
        case 'date':
          return `<input class="fr-text" id="${name}" type="date" value="${esc(v || '')}" aria-describedby="${name}-err">`;
        case 'single':
          return `<div class="fr-opts">${q.options.map((op) => `<label class="fr-opt"><input type="radio" name="${name}" value="${esc(op.id)}"${v === op.id ? ' checked' : ''}><span>${esc(op.label)}</span></label>`).join('')}${other('radio')}</div>`;
        case 'multi':
          return `<div class="fr-opts">${q.options.map((op) => `<label class="fr-opt"><input type="checkbox" name="${name}" value="${esc(op.id)}"${Array.isArray(v) && v.includes(op.id) ? ' checked' : ''}><span>${esc(op.label)}</span></label>`).join('')}${other('checkbox')}</div>`;
        case 'yesno':
          return `<div class="fr-yn">${[[true, 'Yes'], [false, 'No']].map(([val, l]) => `<label class="fr-pick"><input type="radio" name="${name}" value="${val}"${v === val ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
        case 'scale': {
          const nums = [];
          for (let n = Number(q.min); n <= Number(q.max); n += 1) nums.push(n);
          return `<div class="fr-scale">${nums.map((n) => `<label class="fr-pick"><input type="radio" name="${name}" value="${n}"${v === n ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div>
            ${q.lowLabel || q.highLabel ? `<div class="fr-scale-ends"><span>${esc(q.lowLabel || '')}</span><span>${esc(q.highLabel || '')}</span></div>` : ''}`;
        }
        case 'ack':
          return `<label class="fr-opt fr-ack"><input type="checkbox" name="${name}" value="yes"${v === true ? ' checked' : ''}><span>I confirm</span></label>`;
        default:
          return '';
      }
    }

    function read(q) {
      const card = host.querySelector('.fr-card');
      const name = `fr-${q.id}`;
      const field = card.querySelector(`#${CSS.escape(name)}`);
      const checked = [...card.querySelectorAll(`input[name="${CSS.escape(name)}"]:checked`)].map((i) => i.value);
      let v;
      switch (q.type) {
        case 'short': case 'long': case 'date':
          v = field.value; break;
        case 'number':
          v = field.value === '' ? undefined : Number(field.value); break;
        case 'single': v = checked[0]; break;
        case 'multi': v = checked; break;
        case 'yesno': v = checked.length ? checked[0] === 'true' : undefined; break;
        case 'scale': v = checked.length ? Number(checked[0]) : undefined; break;
        case 'ack': v = checked.length ? true : undefined; break;
        default:
      }
      if (F.isEmpty(v)) delete answers[q.id];
      else answers[q.id] = v;
      const otherBox = card.querySelector('[data-other]');
      if (otherBox) answers[`${q.id}.other`] = otherBox.value;
    }

    function headHTML(s) {
      const si = s.kind === 'question' ? s.si : s.kind === 'thanks' ? content.sections.length - 1 : 0;
      const sec = content.sections[si];
      const where = s.kind === 'welcome' ? 'Welcome' : s.kind === 'thanks' ? 'All done' : `${sec ? esc(sec.title || `Section ${si + 1}`) : ''} · Section ${si + 1} of ${content.sections.length}`;
      return `<header class="fr-head">
        <span class="fr-brand" aria-label="Rewired">R<i>.</i></span>
        <label class="fr-where"><span>${where}</span>${content.sections.length > 1 && s.kind === 'question' ? `${IC.chev}<select aria-label="Jump to section" data-jump>${content.sections.map((x, i) => `<option value="${esc(x.id)}"${i === si ? ' selected' : ''}${x.questions.length ? '' : ' disabled'}>${esc(x.title || `Section ${i + 1}`)}</option>`).join('')}</select>` : ''}</label>
        ${o.closeHref ? `<a class="fr-close" href="${o.closeHref}" aria-label="Close and come back later">${IC.x}</a>` : '<span></span>'}
      </header>`;
    }

    function saveLine() {
      if (saveState === 'preview') return '<p class="fr-save">Preview · answers here are never saved or sent</p>';
      if (saveState === 'saving') return '<p class="fr-save" role="status">Saving…</p>';
      if (saveState === 'error') return '<p class="fr-save bad" role="alert">Couldn’t save your last answer. <button type="button" data-retry-save>Retry</button></p>';
      if (saveState === 'saved') return '<p class="fr-save" role="status">Saved · your answers save as you go.</p>';
      return '<p class="fr-save">Your answers save as you go.</p>';
    }

    function cardHTML(s) {
      if (s.kind === 'welcome') {
        const c = F.counts(content);
        return `<div class="fr-card fr-welcome">
          <p class="fr-k">${F.plural(c.sections, 'section')} · ${F.plural(c.questions, 'question')}</p>
          <h2 class="fr-q">${esc(content.welcome.title || o.name || 'Welcome')}</h2>
          ${content.welcome.text ? `<p class="fr-intro-text">${esc(content.welcome.text)}</p>` : ''}
          <div class="fr-actions"><span></span>${device === 'desktop' ? `<span class="fr-hint">press Enter ${IC.enter}</span>` : ''}<button type="button" class="fr-go" data-next>${esc(content.welcome.button || 'Start')}</button></div>
        </div>`;
      }
      if (s.kind === 'thanks') {
        return `<div class="fr-card fr-thanks">
          <span class="fr-tick" aria-hidden="true">${IC.check}</span>
          <h2 class="fr-q" tabindex="-1">${esc(content.thanks.title || 'Thank you')}</h2>
          ${content.thanks.text ? `<p class="fr-intro-text">${esc(content.thanks.text)}</p>` : ''}
          ${o.mode === 'preview' ? '<p class="fr-note">End of the preview. Nothing was sent.</p><div class="fr-actions"><span></span><button type="button" class="fr-go" data-restart>Start again</button></div>' : ''}
          ${o.mode === 'client' && o.closeHref ? `<div class="fr-actions"><span></span><a class="fr-go" href="${o.closeHref}">Done</a></div>` : ''}
        </div>`;
      }
      const sec = content.sections[s.si];
      const q = qOf(s);
      const isLast = at === lastQuestion();
      const name = `fr-${q.id}`;
      const group = !['short', 'long', 'number', 'date'].includes(q.type);
      const labelTag = group ? 'legend' : `label for="${name}"`;
      const endTag = group ? 'legend' : 'label';
      return `<div class="fr-card">
        <${group ? 'fieldset' : 'div'} class="fr-field"${group ? ` aria-describedby="${name}-err"` : ''}>
          <p class="fr-k">${esc(sec.title || `Section ${s.si + 1}`)} · Question ${s.qi + 1} of ${sec.questions.length}</p>
          ${s.qi === 0 && sec.description ? `<p class="fr-sec-desc">${esc(sec.description)}</p>` : ''}
          <${labelTag} class="fr-q" id="${name}-label">${esc(q.label || 'Untitled question')}${q.required ? ' <span class="fr-req" aria-hidden="true">*</span><span class="sr-only"> (required)</span>' : ''}</${endTag}>
          ${q.help ? `<p class="fr-help">${esc(q.help)}</p>` : ''}
          ${inputHTML(q)}
        </${group ? 'fieldset' : 'div'}>
        <p class="fr-err" id="${name}-err" role="alert">${esc(error)}</p>
        <div class="fr-actions">
          ${at > 0 ? '<button type="button" class="fr-back" data-prev>Back</button>' : '<span></span>'}
          ${device === 'desktop' && q.type !== 'long' ? `<span class="fr-hint">press Enter ${IC.enter}</span>` : ''}
          <button type="button" class="fr-go" data-next${submitting ? ' disabled' : ''}>${isLast ? (submitting ? 'Sending…' : o.mode === 'preview' ? 'Submit (preview)' : 'Submit') : 'Continue'}</button>
        </div>
      </div>`;
    }

    function render(focusCard) {
      const s = step();
      host.innerHTML = `<div class="fr fr-${device} fr-${o.mode}">
        ${headHTML(s)}
        <div class="fr-body">
          ${s.kind !== 'thanks' ? `<div class="fr-intro"><h1 class="fr-title">${esc(o.name || 'Untitled form')}</h1>${o.description ? `<p class="fr-desc">${esc(o.description)}</p>` : ''}${saveLine()}</div>` : ''}
          ${cardHTML(s)}
        </div>
      </div>`;
      if (o.onStep) o.onStep(s);
      if (focusCard) {
        const el = host.querySelector('.fr-card input:not([type=hidden]), .fr-card textarea, .fr-card .fr-q[tabindex], .fr-card [data-next]');
        if (el) el.focus({ preventScroll: device !== 'client' });
      }
    }

    function goto(i) {
      at = Math.max(0, Math.min(list.length - 1, i));
      error = '';
      render(true);
    }

    async function next() {
      const s = step();
      if (s.kind === 'question') {
        read(qOf(s));
        const msg = F.answerError(qOf(s), answers);
        if (msg) {
          error = msg;
          render(false);
          const f = host.querySelector('.fr-card input, .fr-card textarea');
          if (f) f.focus();
          return;
        }
        if (at === lastQuestion()) return submit();
      }
      if (s.kind === 'thanks') return;
      goto(at + 1);
    }

    async function submit() {
      if (submitting) return submitting;
      // Every required answer, not just this one, before anything is sent.
      for (let i = 0; i < list.length; i += 1) {
        if (list[i].kind !== 'question') continue;
        const msg = F.answerError(qOf(list[i]), answers);
        if (msg) {
          at = i;
          error = msg;
          render(true);
          return null;
        }
      }
      submitting = (async () => {
        render(false);
        try {
          await o.onSubmit(answers);
          at = list.length - 1;
          error = '';
          submitting = null;
          render(true);
        } catch (err) {
          submitting = null;
          error = `${explain(err)} Your answers are kept. Try Submit again.`;
          render(false);
        }
      })();
      return submitting;
    }

    host.addEventListener('input', (e) => {
      const s = step();
      if (s.kind !== 'question' || !e.target.closest('.fr-card')) return;
      const q = qOf(s);
      read(q);
      if (e.target.matches('textarea')) {
        const c = host.querySelector('.fr-count');
        if (c) c.textContent = `${e.target.value.length}/${q.maxLength || 1000}`;
      }
      if (error) {
        error = '';
        host.querySelector('.fr-err').textContent = '';
      }
      if (o.onChange) o.onChange(answers);
    });
    host.addEventListener('change', (e) => {
      if (e.target.matches('[data-jump]')) {
        const i = list.findIndex((s) => s.kind === 'question' && s.sectionId === e.target.value);
        if (i >= 0) goto(i);
        return;
      }
      const s = step();
      if (s.kind !== 'question') return;
      const q = qOf(s);
      // The Other box appears and disappears with its option.
      if ((q.type === 'single' || q.type === 'multi') && q.allowOther && e.target.type !== 'text') {
        read(q);
        const showing = Boolean(host.querySelector('[data-other]'));
        const want = q.type === 'single' ? answers[q.id] === F.OTHER : (answers[q.id] || []).includes(F.OTHER);
        if (showing !== want) {
          render(false);
          const box = host.querySelector('[data-other]');
          if (box) box.focus();
        }
      }
    });
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-next]')) next();
      else if (e.target.closest('[data-prev]')) {
        const s = step();
        if (s.kind === 'question') read(qOf(s));
        goto(at - 1);
      } else if (e.target.closest('[data-restart]')) {
        answers = {};
        goto(0);
      } else if (e.target.closest('[data-retry-save]') && o.onRetry) o.onRetry();
    });
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !e.target.closest('.fr-card')) return;
      if (e.target.matches('textarea, button, a, select')) return;
      e.preventDefault();
      next();
    });

    render(false);

    return {
      setContent(c, meta) {
        const cur = step();
        const s = cur.kind === 'question' ? cur : null;
        if (s) read(qOf(s));
        content = F.normalise(c);
        if (meta) Object.assign(o, meta);
        answers = F.reconcile(content, answers);
        list = F.steps(content);
        // Stay on the same question if it still exists, else its section.
        let i = -1;
        if (s) i = list.findIndex((x) => x.questionId === s.questionId);
        if (i < 0 && s) i = list.findIndex((x) => x.sectionId === s.sectionId);
        if (i < 0) i = list.findIndex((x) => x.kind === cur.kind);
        at = i < 0 ? 0 : i;
        render(false);
      },
      setDevice(d) {
        const s = step();
        if (s.kind === 'question') read(qOf(s));
        device = d;
        render(false);
      },
      goTo(target) {
        if (target === 'welcome' || target === 'thanks') {
          const i = list.findIndex((x) => x.kind === target);
          if (i >= 0) goto(i);
        } else {
          const i = list.findIndex((x) => x.sectionId === target);
          if (i >= 0) goto(i);
        }
      },
      setSaveState(st) {
        saveState = st;
        const line = host.querySelector('.fr-save');
        if (line) line.outerHTML = saveLine();
      },
      step,
      answers: () => answers,
    };
  }

  // ================================================================ coach: library

  const lib = { q: '', category: '', status: '', tag: '', page: 1, per: 10 };

  async function loadForms() {
    const [forms, assigns] = await Promise.all([
      sb.from('forms').select('id, name, category, description, tags, is_default, draft_rev, published_rev, published_version_id, archived_at, created_at, updated_at').order('updated_at', { ascending: false }),
      sb.from('form_assignments').select('form_id, client_id, status'),
    ]);
    if (forms.error) throw forms.error;
    if (assigns.error) throw assigns.error;
    const sent = new Map();
    for (const a of assigns.data) {
      if (a.status === 'cancelled') continue;
      if (!sent.has(a.form_id)) sent.set(a.form_id, new Set());
      sent.get(a.form_id).add(a.client_id);
    }
    return forms.data.map((f) => ({ ...f, sentTo: sent.has(f.id) ? sent.get(f.id).size : 0 }));
  }

  async function library() {
    h.state.coachView = { section: 'forms' };
    const head = `<div class="fl-top">
        <p class="fl-lede">Onboarding, health screens, contracts and feedback you reuse across clients</p>
        <button type="button" class="f-btn f-dark" data-new>${IC.plus}<span>New Form</span></button>
      </div>`;
    h.shell('Forms', '', `<div class="fl">${head}<div class="fl-panel" aria-busy="true"><div class="fl-skel"></div><div class="fl-skel"></div><div class="fl-skel"></div></div></div>`);
    const renderId = h.state.renderId;
    let forms;
    try {
      forms = await loadForms();
    } catch (err) {
      if (renderId !== h.state.renderId) return;
      root().querySelector('.fl-panel').outerHTML = `<div class="fl-panel fl-state"><b>Couldn’t load your forms</b><p>${esc(explain(err))}</p><button type="button" class="f-btn" data-reload>Try again</button></div>`;
      bindLibrary([]);
      return;
    }
    if (renderId !== h.state.renderId) return;
    drawLibrary(forms);
  }

  const root = () => document.getElementById('root');

  function drawLibrary(forms) {
    const el = root().querySelector('.fl');
    const allTags = [...new Set(forms.flatMap((f) => f.tags || []))].sort((a, b) => a.localeCompare(b));
    const visible = forms.filter((f) => {
      const st = F.status(f).key;
      if (lib.status ? (lib.status === 'published' ? !['published', 'changed'].includes(st) : st !== lib.status) : st === 'archived') return false;
      if (lib.category && f.category !== lib.category) return false;
      if (lib.tag && !(f.tags || []).includes(lib.tag)) return false;
      if (lib.q && !f.name.toLowerCase().includes(lib.q.toLowerCase())) return false;
      return true;
    });
    visible.sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)));
    const pages = Math.max(1, Math.ceil(visible.length / lib.per));
    if (lib.page > pages) lib.page = pages;
    const rows = visible.slice((lib.page - 1) * lib.per, lib.page * lib.per);
    const sel = (name, label, values, cur) => `<label class="fl-filter"><span class="sr-only">${label}</span><select data-filter="${name}">
        <option value="">${label}</option>${values.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${IC.chev}</label>`;
    const toolbar = `<div class="fl-tools">
        <label class="fl-search">${IC.search}<span class="sr-only">Search forms</span><input type="search" placeholder="Search forms" value="${esc(lib.q)}" data-search></label>
        ${sel('category', 'Category', F.CATEGORIES.map((c) => [c, c]), lib.category)}
        ${sel('status', 'Status', [['draft', 'In draft'], ['published', 'Ready'], ['archived', 'Archived']], lib.status)}
        ${sel('tag', 'Tags', allTags.map((t) => [t, t]), lib.tag)}
      </div>`;
    let body;
    if (!forms.length) {
      body = `<div class="fl-state fl-empty"><span class="fl-empty-ic" aria-hidden="true">${IC.forms}</span><b>No forms yet</b>
        <p>Build your onboarding form once, then send it to every new client. Start blank or from the onboarding template.</p>
        <button type="button" class="f-btn f-dark" data-new>${IC.plus}<span>Create your first form</span></button></div>`;
    } else if (!visible.length) {
      body = '<div class="fl-state"><b>No forms match</b><p>Try another search or clear the filters.</p><button type="button" class="f-btn" data-clear>Clear filters</button></div>';
    } else {
      body = `<table class="fl-table">
        <thead><tr><th scope="col">Name</th><th scope="col">Date added</th><th scope="col">Sent to</th><th scope="col">Status</th><th scope="col">Tag</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map((f) => {
          const st = F.status(f);
          return `<tr data-id="${f.id}">
            <td><a class="fl-name" href="#forms/${f.id}">${esc(f.name)}</a>${f.is_default ? ' <span class="fl-default">Default</span>' : ''}<small>${esc(f.category)} · edited ${esc(day(f.updated_at))}</small></td>
            <td>${esc(day(f.created_at))}</td>
            <td>${f.sentTo}</td>
            <td><span class="f-status ${st.key}">${esc(st.label)}</span></td>
            <td class="fl-tags-cell">${(f.tags || []).map((t) => `<span class="f-tag">${esc(t)}</span>`).join(' ')}<button type="button" class="fl-addtag" data-addtag="${f.id}" aria-label="${(f.tags || []).length ? 'Edit tags' : 'Add a tag'} for ${esc(f.name)}">${(f.tags || []).length ? IC.pen : `${IC.plus}<span>Add Tag</span>`}</button></td>
            <td class="fl-more-cell"><button type="button" class="fl-more" data-menu="${f.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${esc(f.name)}">${IC.dots}</button></td>
          </tr>`;
        }).join('')}</tbody></table>`;
    }
    const foot = visible.length
      ? `<div class="fl-foot"><span>Showing ${(lib.page - 1) * lib.per + 1}–${Math.min(lib.page * lib.per, visible.length)} of ${visible.length}</span>
        <label class="fl-per"><span class="sr-only">Forms per page</span><select data-per>${[10, 25, 50].map((n) => `<option value="${n}"${lib.per === n ? ' selected' : ''}>${n} per page</option>`).join('')}</select></label>
        <nav class="fl-pages" aria-label="Pages"><button type="button" data-page="${lib.page - 1}"${lib.page <= 1 ? ' disabled' : ''} aria-label="Previous page">${IC.back}</button>
        ${Array.from({ length: pages }, (_, i) => `<button type="button" data-page="${i + 1}"${i + 1 === lib.page ? ' aria-current="page"' : ''}>${i + 1}</button>`).join('')}
        <button type="button" data-page="${lib.page + 1}"${lib.page >= pages ? ' disabled' : ''} aria-label="Next page" class="flip">${IC.back}</button></nav></div>`
      : '';
    el.innerHTML = `${el.querySelector('.fl-top').outerHTML}${forms.length ? toolbar : ''}<div class="fl-panel">${body}${foot}</div>`;
    bindLibrary(forms, allTags);
  }

  function bindLibrary(forms, allTags) {
    const el = root().querySelector('.fl');
    el.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => newFormModal(allTags || [])));
    const reload = el.querySelector('[data-reload]');
    if (reload) reload.addEventListener('click', library);
    const search = el.querySelector('[data-search]');
    if (search) {
      search.addEventListener('input', () => {
        lib.q = search.value;
        lib.page = 1;
        const pos = search.selectionStart;
        drawLibrary(forms);
        const s = root().querySelector('[data-search]');
        s.focus();
        s.setSelectionRange(pos, pos);
      });
    }
    el.querySelectorAll('[data-filter]').forEach((s) => s.addEventListener('change', () => {
      lib[s.dataset.filter] = s.value;
      lib.page = 1;
      drawLibrary(forms);
    }));
    const clear = el.querySelector('[data-clear]');
    if (clear) clear.addEventListener('click', () => { Object.assign(lib, { q: '', category: '', status: '', tag: '', page: 1 }); drawLibrary(forms); });
    const per = el.querySelector('[data-per]');
    if (per) per.addEventListener('change', () => { lib.per = Number(per.value); lib.page = 1; drawLibrary(forms); });
    el.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { lib.page = Number(b.dataset.page); drawLibrary(forms); }));
    el.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => rowMenu(b, forms.find((f) => f.id === b.dataset.menu), forms)));
    el.querySelectorAll('[data-addtag]').forEach((b) => b.addEventListener('click', () => tagPopover(b, forms.find((f) => f.id === b.dataset.addtag), forms, allTags)));
  }

  function rowMenu(btn, f, forms) {
    document.querySelectorAll('.fl-menu').forEach((m) => m.remove());
    const st = F.status(f).key;
    const live = st !== 'archived';
    const items = [
      live && f.published_version_id ? ['send', 'Send a form'] : null,
      ['duplicate', 'Copy form'],
      live ? (f.is_default ? ['undefault', 'Remove default'] : ['default', 'Make default']) : null,
      ['edit', 'Edit'],
      ['preview', 'Preview'],
      ['responses', 'Responses'],
      st === 'archived' ? ['restore', 'Restore'] : f.published_version_id ? ['archive', 'Archive'] : ['delete', 'Delete'],
    ].filter(Boolean);
    const menu = document.createElement('div');
    menu.className = 'fl-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map(([k, l]) => `<button type="button" role="menuitem" data-act="${k}"${k === 'delete' || k === 'archive' ? ' class="danger"' : ''}>${l}</button>`).join('');
    btn.parentElement.appendChild(menu);
    btn.setAttribute('aria-expanded', 'true');
    const buttons = [...menu.querySelectorAll('button')];
    buttons[0].focus();
    const close = () => {
      menu.remove();
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', outside);
    };
    const outside = (e) => { if (!menu.contains(e.target) && e.target !== btn) close(); };
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
    menu.addEventListener('keydown', (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
      if (e.key === 'Escape') { close(); btn.focus(); }
    });
    menu.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      close();
      const act = b.dataset.act;
      try {
        if (act === 'edit') location.hash = `#forms/${f.id}`;
        else if (act === 'preview') location.hash = `#forms/${f.id}?preview`;
        else if (act === 'responses') location.hash = `#forms/${f.id}/responses`;
        else if (act === 'send') sendModal(f, () => library());
        else if (act === 'default' || act === 'undefault') {
          // One default per category: clear the old one first.
          if (act === 'default') h.must(await sb.from('forms').update({ is_default: false }).eq('category', f.category).eq('is_default', true).select('id'));
          h.must(await sb.from('forms').update({ is_default: act === 'default' }).eq('id', f.id).select('id'));
          notify(act === 'default' ? `${f.name} is now your default ${f.category.toLowerCase()} form.` : `${f.name} is no longer the default.`);
          library();
        }
        else if (act === 'duplicate') {
          const id = await duplicateForm(f.id);
          location.hash = `#forms/${id}`;
        } else if (act === 'archive' || act === 'restore') {
          h.must(await sb.from('forms').update({ archived_at: act === 'archive' ? new Date().toISOString() : null }).eq('id', f.id).select('id'));
          notify(act === 'archive' ? `${f.name} archived. Responses are kept.` : `${f.name} restored.`, act === 'archive' ? {
            action: 'Undo',
            onAction: async () => { await sb.from('forms').update({ archived_at: null }).eq('id', f.id); library(); },
          } : {});
          library();
        } else if (act === 'delete') {
          if (!window.confirm(`Delete “${f.name}”? It has never been published, so no client has it.`)) return;
          const r = h.must(await sb.from('forms').delete().eq('id', f.id).select('id'));
          if (!r.length) throw new Error('Published forms can only be archived.');
          notify(`${f.name} deleted.`);
          library();
        }
      } catch (err) {
        notify(explain(err), { error: true });
      }
    });
  }

  // Tags straight from the list, without opening the builder.
  function tagPopover(btn, f, forms, allTags) {
    document.querySelectorAll('.fl-tagpop').forEach((m) => m.remove());
    const pop = document.createElement('div');
    pop.className = 'fl-tagpop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', `Tags for ${f.name}`);
    pop.innerHTML = '<div class="fl-tagpop-in"></div><div class="fm-foot"><button type="button" class="f-btn f-small" data-x>Cancel</button><button type="button" class="f-btn f-dark f-small" data-ok>Save tags</button></div>';
    btn.parentElement.appendChild(pop);
    let tags = (f.tags || []).slice();
    tagPicker(pop.querySelector('.fl-tagpop-in'), { tags, all: (allTags || []).slice(), onChange: (t) => { tags = t; } });
    pop.querySelector('input').focus();
    const close = () => { pop.remove(); document.removeEventListener('mousedown', outside); btn.focus(); };
    const outside = (e) => { if (!pop.contains(e.target) && e.target !== btn) close(); };
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.querySelector('[aria-expanded="true"]')) close(); });
    pop.querySelector('[data-x]').addEventListener('click', close);
    pop.querySelector('[data-ok]').addEventListener('click', async () => {
      try {
        h.must(await sb.from('forms').update({ tags }).eq('id', f.id).select('id'));
        pop.remove();
        notify('Tags saved.');
        library();
      } catch (err) {
        notify(explain(err), { error: true });
      }
    });
  }

  // New ids for every section, question and option, so a copy never shares
  // anything with the original.
  function reId(content) {
    const c = F.normalise(content);
    for (const s of c.sections) {
      s.id = F.uid('s');
      for (const q of s.questions) {
        q.id = F.uid('q');
        for (const o of q.options || []) o.id = F.uid('o');
      }
    }
    return c;
  }

  async function duplicateForm(id) {
    const f = h.must(await sb.from('forms').select('*').eq('id', id).single());
    const row = h.must(await sb.from('forms').insert({
      name: `${f.name} (copy)`.slice(0, 120), category: f.category, description: f.description, tags: f.tags, notes: f.notes, draft: reId(f.draft),
    }).select('id').single());
    notify('Copy created. It starts as a draft.');
    return row.id;
  }

  // ---------------------------------------------------------------- New Form

  function newFormModal(allTags) {
    const st = { name: '', category: 'Onboarding', start: 'blank', tags: [], description: '', busy: false };
    const d = dialog(`<div class="fm" role="dialog" aria-modal="true" aria-labelledby="fm-h">
        <div class="fm-head"><h2 id="fm-h">New form</h2><button type="button" class="fm-x" data-close aria-label="Close">${IC.x}</button></div>
        <label class="sr-only" for="fm-name">Form name (required)</label>
        <input id="fm-name" class="fm-name" type="text" placeholder="Name this form" maxlength="120" required aria-required="true" autocomplete="off" autofocus>
        <label class="fm-l" for="fm-cat">Category</label>
        <div class="fm-select"><select id="fm-cat">${F.CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select>${IC.chev}</div>
        <p class="fm-k" id="fm-start-l">Start from</p>
        <div class="fm-starts" role="radiogroup" aria-labelledby="fm-start-l"></div>
        <p class="fm-l" id="fm-tags-l">Tags</p>
        <div class="fm-tags"></div>
        <div class="fm-row"><label class="fm-l" for="fm-desc">Description</label><span class="fm-count" aria-live="polite">0/200</span></div>
        <textarea id="fm-desc" rows="3" maxlength="200" aria-describedby="fm-desc-help"></textarea>
        <p class="fm-help" id="fm-desc-help">Optional · clients see this under the form name</p>
        <p class="fm-err" role="alert"></p>
        <div class="fm-foot"><button type="button" class="f-btn" data-close>Cancel</button><button type="button" class="f-btn f-dark" data-create disabled>Create Form</button></div>
      </div>`, { canClose: () => !st.busy });
    const box = d.box;
    const name = box.querySelector('#fm-name');
    const cat = box.querySelector('#fm-cat');
    const desc = box.querySelector('#fm-desc');
    const create = box.querySelector('[data-create]');
    const err = box.querySelector('.fm-err');

    function drawStarts() {
      const temps = F.templatesFor(st.category);
      if (st.start !== 'blank' && !temps.some((t) => t.id === st.start)) st.start = 'blank';
      const card = (id, title, sub, icon) => `<button type="button" role="radio" class="fm-start" data-start="${id}" aria-checked="${st.start === id}" tabindex="${st.start === id ? 0 : -1}">
          <span class="fm-start-ic" aria-hidden="true">${icon}</span><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></button>`;
      box.querySelector('.fm-starts').innerHTML = card('blank', 'Blank', 'Start from scratch', IC.plus)
        + (temps.length
          ? temps.map((t) => {
            const c = F.counts(t.content);
            return card(t.id, t.name, `${F.plural(c.sections, 'section')} · ${F.plural(c.questions, 'question')}`, IC.forms);
          }).join('')
          : `<div class="fm-start fm-none"><span><b>No ${esc(st.category.toLowerCase())} templates yet</b><small>Start blank and build your own</small></span></div>`);
    }
    function valid() {
      create.disabled = st.busy || !name.value.trim();
    }
    drawStarts();
    tagPicker(box.querySelector('.fm-tags'), { tags: st.tags, all: allTags.slice(), labelledby: 'fm-tags-l', onChange: (t) => { st.tags = t; } });
    name.addEventListener('input', () => { err.textContent = ''; valid(); });
    cat.addEventListener('change', () => { st.category = cat.value; drawStarts(); });
    desc.addEventListener('input', () => { box.querySelector('.fm-count').textContent = `${desc.value.length}/200`; });
    box.querySelector('.fm-starts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-start]');
      if (!b) return;
      st.start = b.dataset.start;
      drawStarts();
      box.querySelector(`[data-start="${st.start}"]`).focus();
    });
    box.querySelector('.fm-starts').addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      const all = [...box.querySelectorAll('[data-start]')];
      const i = all.findIndex((b) => b.dataset.start === st.start);
      const n = all[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
      e.preventDefault();
      st.start = n.dataset.start;
      drawStarts();
      box.querySelector(`[data-start="${st.start}"]`).focus();
    });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !create.disabled) create.click(); });
    create.addEventListener('click', async () => {
      if (st.busy || !name.value.trim()) return;
      st.busy = true;
      valid();
      create.textContent = 'Creating…';
      err.textContent = '';
      try {
        const draft = st.start === 'blank' ? F.blankContent() : F.fromTemplate(st.start);
        const row = h.must(await sb.from('forms').insert({
          name: name.value.trim(), category: st.category, description: desc.value.trim() || null, tags: st.tags, draft,
        }).select('id').single());
        st.busy = false;
        d.remove();
        notify('Form created.');
        location.hash = `#forms/${row.id}`;
      } catch (e) {
        st.busy = false;
        create.textContent = 'Create Form';
        valid();
        err.textContent = explain(e);
      }
    });
  }

  // ================================================================ coach: builder

  let B = null; // the open builder

  async function builder(id) {
    const r = await sb.from('forms').select('*').eq('id', id).maybeSingle();
    if (r.error) throw new Error(explain(r.error));
    if (!r.data) {
      h.state.coachView = { section: 'forms' };
      h.shell('Form not found', '', '<div class="fl-panel fl-state"><b>This form isn’t here</b><p>It may have been deleted.</p><a class="f-btn" href="#forms">Back to Forms</a></div>');
      return;
    }
    const f = r.data;
    const [assigns, clients] = await Promise.all([
      sb.from('form_assignments').select('id, status').eq('form_id', id),
      sb.from('forms').select('tags'),
    ]);
    B = {
      form: f,
      content: F.normalise(f.draft),
      rev: f.draft_rev,
      dirty: false,
      saving: null,
      again: false,
      failed: null,
      sel: { kind: 'section', sid: null },
      open: null,
      tab: 'add',
      sentCount: assigns.error ? 0 : assigns.data.filter((a) => a.status !== 'cancelled').length,
      allTags: [...new Set((clients.data || []).flatMap((x) => x.tags || []))],
      pv: { open: /[?&]preview\b/.test(location.hash), device: 'phone', runner: null },
      undo: null,
    };
    B.sel.sid = B.content.sections.length ? B.content.sections[0].id : null;
    if (!B.sel.sid) B.sel = { kind: 'welcome' };
    document.body.classList.add('fb-body');
    drawBuilder();
  }

  const curSection = () => B.content.sections.find((s) => s.id === B.sel.sid) || null;

  function saveText() {
    if (B.failed) return `<span class="fb-save bad" role="alert">Unable to save <button type="button" data-act="retry-save">Retry</button></span>`;
    if (B.saving || B.dirty) return '<span class="fb-save" role="status">Saving…</span>';
    return '<span class="fb-save" role="status">Saved</span>';
  }

  function topHTML() {
    const st = F.status({ ...B.form, draft_rev: B.rev });
    const published = Boolean(B.form.published_version_id);
    return `<header class="fb-top">
      <a class="fb-iconbtn" href="#forms" aria-label="Back to Forms">${IC.back}</a>
      <label class="fb-name"><span class="sr-only">Form name</span><input data-bind="f:name" value="${esc(B.form.name)}" maxlength="120" size="${Math.max(4, Math.min(36, B.form.name.length))}">${IC.pen}</label>
      <span class="f-cat">${esc(B.form.category)}</span>
      <span class="fb-status">${esc(st.label)}</span>
      ${saveText()}
      <span class="fb-grow"></span>
      <button type="button" class="f-btn" data-act="preview" aria-pressed="${B.pv.open}">${IC.eye}<span>Preview</span></button>
      ${published && !B.form.archived_at ? `<button type="button" class="f-btn" data-act="send">${IC.send}<span>Send</span></button>` : ''}
      ${B.form.archived_at ? '<button type="button" class="f-btn f-dark" data-act="restore">Restore</button>' : `<button type="button" class="f-btn f-dark" data-act="publish"${st.key === 'published' ? ' disabled' : ''}>${published ? (st.key === 'published' ? 'Published' : 'Update published version') : 'Publish'}</button>`}
    </header>`;
  }

  function healthHTML() {
    const p = F.problems(B.content);
    return `<div class="fb-health" aria-live="polite">
      <p class="fb-k">Form health</p>
      <b>${p.length ? `${F.plural(p.length, 'thing')} to fix` : 'Ready to publish'}</b>
      <span class="fb-meter${p.length ? ' warn' : ''}"><i style="width:${p.length ? Math.max(12, 100 - p.length * 18) : 100}%"></i></span>
      ${p.length ? `<ul>${p.slice(0, 5).map((x) => `<li><button type="button" data-act="goto-problem" data-where="${esc(x.where)}" data-q="${esc(x.questionId || '')}">${esc(x.message)}</button></li>`).join('')}${p.length > 5 ? `<li>and ${p.length - 5} more</li>` : ''}</ul>` : '<small>Every item is ready</small>'}
    </div>`;
  }

  function outlineHTML() {
    const c = B.content;
    let n = 0;
    const secs = c.sections.map((s, si) => {
      const on = B.sel.kind === 'section' && B.sel.sid === s.id;
      const qs = s.questions.map((q) => { n += 1; return { q, n }; });
      return `<li class="fb-o-sec${on ? ' on' : ''}" data-drop-section="${s.id}">
        <button type="button" class="fb-o-row" data-act="select-section" data-sid="${s.id}" aria-current="${on}"
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"><span class="fb-o-t" data-label="s:${s.id}">${esc(s.title || `Section ${si + 1}`)}</span><span class="fb-o-n">${s.questions.length}</span></button>
        ${on && qs.length ? `<ol class="fb-o-qs">${qs.map(({ q }, i) => `<li><button type="button" data-act="open-q" data-qid="${q.id}"${B.open === q.id ? ' aria-current="true"' : ''}><span>${i + 1}</span>${IC.t[q.type] || ''}<span class="fb-o-t" data-label="q:${q.id}">${esc(q.label || 'Untitled question')}</span></button></li>`).join('')}</ol>` : ''}
      </li>`;
    }).join('');
    return `<nav class="fb-outline" aria-label="Form outline">
      <p class="fb-k">Sections</p>
      <ul class="fb-o">
        <li><button type="button" class="fb-o-row fb-o-screen${B.sel.kind === 'welcome' ? ' on' : ''}" data-act="select-welcome" aria-current="${B.sel.kind === 'welcome'}">${IC.wave}<span><span class="fb-o-t">Welcome screen</span><small>${c.welcome.enabled ? 'Before section 1' : 'Off'}</small></span></button></li>
        ${secs}
        <li><button type="button" class="fb-o-row fb-o-screen${B.sel.kind === 'thanks' ? ' on' : ''}" data-act="select-thanks" aria-current="${B.sel.kind === 'thanks'}">${IC.check}<span><span class="fb-o-t">Thank-you screen</span><small>After submit</small></span></button></li>
      </ul>
      <button type="button" class="fb-add-sec" data-act="add-section">${IC.plus}<span>Add Section</span></button>
      ${healthHTML()}
    </nav>`;
  }

  function field(label, input, extra) {
    return `<label class="fb-field${extra ? ` ${extra}` : ''}"><span>${label}</span>${input}</label>`;
  }
  const val = (v) => (v === undefined || v === null ? '' : esc(v));

  function settingsHTML(q) {
    const b = (k) => `q:${q.id}:${k}`;
    if (q.type === 'single' || q.type === 'multi') {
      const mark = q.type === 'single' ? '<span class="fb-radio" aria-hidden="true"></span>' : '<span class="fb-box" aria-hidden="true"></span>';
      return `<p class="fb-k">Options</p>
        <ol class="fb-opts" data-opts="${q.id}">${q.options.map((o, i) => `<li class="fb-opt" data-oid="${o.id}" draggable="true">
          <button type="button" class="fb-grip" data-act="grip-opt" data-qid="${q.id}" data-oid="${o.id}" aria-label="Move option ${i + 1}. Use the up and down arrow keys">${IC.grip}</button>
          ${mark}<input data-bind="o:${q.id}:${o.id}" value="${val(o.label)}" maxlength="120" aria-label="Option ${i + 1}" placeholder="Option ${i + 1}">
          <button type="button" class="fb-icon danger" data-act="del-opt" data-qid="${q.id}" data-oid="${o.id}" aria-label="Remove option ${i + 1}">${IC.trash}</button></li>`).join('')}</ol>
        <div class="fb-opt-actions"><button type="button" class="fb-link" data-act="add-opt" data-qid="${q.id}">${IC.plus}<span>Add Option</span></button>
          <button type="button" class="fb-link" data-act="paste-opts" data-qid="${q.id}">Paste a List</button></div>
        <div class="fb-paste" data-paste="${q.id}" hidden><label class="fb-field"><span>One option per line</span><textarea rows="4"></textarea></label>
          <div class="fb-row-end"><button type="button" class="f-btn" data-act="paste-cancel">Cancel</button><button type="button" class="f-btn f-dark" data-act="paste-add" data-qid="${q.id}">Add options</button></div></div>
        <p class="fb-k">List</p>
        <label class="fb-check"><input type="checkbox" data-bind="${b('allowOther')}"${q.allowOther ? ' checked' : ''}><span>Add “Other” with a text box</span></label>
        ${q.type === 'multi' ? `<div class="fb-grid2">${field('Minimum picks', `<input type="number" min="0" step="1" inputmode="numeric" data-bind="${b('minPicks')}" value="${val(q.minPicks)}" placeholder="No limit">`)}${field('Maximum picks', `<input type="number" min="1" step="1" inputmode="numeric" data-bind="${b('maxPicks')}" value="${val(q.maxPicks)}" placeholder="No limit">`)}</div>` : ''}`;
    }
    if (q.type === 'short' || q.type === 'long') {
      return `<p class="fb-k">Answer</p><div class="fb-grid2">
        ${field('Length', `<span class="fb-select"><select data-bind="${b('maxLength')}">${F.LENGTHS[q.type].map((n) => `<option value="${n}"${Number(q.maxLength) === n ? ' selected' : ''}>Up to ${n} characters</option>`).join('')}</select>${IC.chev}</span>`)}
        ${field('Placeholder', `<input data-bind="${b('placeholder')}" value="${val(q.placeholder)}" maxlength="80" placeholder="Shown in the empty field">`)}</div>`;
    }
    if (q.type === 'number') {
      return `<p class="fb-k">Answer</p><div class="fb-grid3">
        ${field('Lowest', `<input type="number" step="any" data-bind="${b('min')}" value="${val(q.min)}" placeholder="No limit">`)}
        ${field('Highest', `<input type="number" step="any" data-bind="${b('max')}" value="${val(q.max)}" placeholder="No limit">`)}
        ${field('Placeholder', `<input data-bind="${b('placeholder')}" value="${val(q.placeholder)}" maxlength="80" placeholder="e.g. 82.5">`)}</div>`;
    }
    if (q.type === 'scale') {
      const range = (k, from, to) => `<span class="fb-select"><select data-bind="${b(k)}">${Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => `<option value="${n}"${Number(q[k]) === n ? ' selected' : ''}>${n}</option>`).join('')}</select>${IC.chev}</span>`;
      return `<p class="fb-k">Scale settings</p><div class="fb-grid2">${field('From', range('min', 0, 1))}${field('To', range('max', 3, 10))}</div>
        <div class="fb-grid2">${field('Low end label', `<input data-bind="${b('lowLabel')}" value="${val(q.lowLabel)}" maxlength="40" placeholder="Optional">`)}${field('High end label', `<input data-bind="${b('highLabel')}" value="${val(q.highLabel)}" maxlength="40" placeholder="Optional">`)}</div>`;
    }
    if (q.type === 'ack') return '<p class="fb-note">Clients tick “I confirm” under this statement. It records that they ticked it. It is not a verified electronic signature.</p>';
    if (q.type === 'date') return '<p class="fb-note">Clients pick a date from a calendar.</p>';
    if (q.type === 'yesno') return '<p class="fb-note">Clients choose Yes or No. A No is kept as an answer, never mixed up with a skipped question.</p>';
    return '';
  }

  function questionHTML(s, q, i) {
    const label = esc(q.label || 'Untitled question');
    if (B.open !== q.id) {
      return `<li class="fb-q" data-qid="${q.id}" draggable="true">
        <button type="button" class="fb-q-head" data-act="open-q" data-qid="${q.id}" aria-expanded="false">
          <span class="fb-num">${i + 1}</span><span class="fb-q-txt"><b data-label="q:${q.id}">${label}</b><small>${esc(F.summary(q))}</small></span>
          ${q.required ? '<span class="fb-pill">Required</span>' : ''}<span class="fb-chev" aria-hidden="true">${IC.chev}</span></button>
        <button type="button" class="fb-grip" data-act="grip-q" data-qid="${q.id}" aria-label="Move question ${i + 1}. Use the up and down arrow keys">${IC.grip}</button>
      </li>`;
    }
    const b = (k) => `q:${q.id}:${k}`;
    return `<li class="fb-q open" data-qid="${q.id}">
      <div class="fb-q-main">
        <div class="fb-q-top"><p class="fb-k teal">Question ${i + 1} of ${s.questions.length}</p>
          <button type="button" class="fb-icon" data-act="close-q" aria-label="Collapse question" aria-expanded="true">${IC.up}</button></div>
        <label class="sr-only" for="lbl-${q.id}">Question</label>
        <input id="lbl-${q.id}" class="fb-q-label" data-bind="${b('label')}" value="${val(q.label)}" maxlength="300" placeholder="Type your question">
        <div class="fb-grid2">
          ${field('Answer type', `<span class="fb-select"><select data-bind="${b('type')}">${F.TYPE_IDS.map((t) => `<option value="${t}"${q.type === t ? ' selected' : ''}>${F.TYPES[t].label}</option>`).join('')}</select>${IC.chev}</span>`)}
          <div class="fb-field"><span id="req-${q.id}">Required</span><button type="button" class="fb-switch" role="switch" aria-checked="${q.required}" aria-labelledby="req-${q.id}" data-act="toggle-req" data-qid="${q.id}"><i></i></button><em>${q.required ? 'On' : 'Off'}</em></div>
        </div>
        ${field('Help text', `<input data-bind="${b('help')}" value="${val(q.help)}" maxlength="300" placeholder="Add help text (optional)">`)}
        <hr>
        ${settingsHTML(q)}
        ${B.content.sections.length > 1 ? `<hr>${field('Section', `<span class="fb-select"><select data-act-change="move-to" data-qid="${q.id}">${B.content.sections.map((x, xi) => `<option value="${x.id}"${x.id === s.id ? ' selected' : ''}>${esc(x.title || `Section ${xi + 1}`)}</option>`).join('')}</select>${IC.chev}</span>`)}` : ''}
      </div>
      <div class="fb-q-tools">
        <button type="button" class="fb-icon" data-act="grip-q" data-qid="${q.id}" aria-label="Move question. Use the up and down arrow keys">${IC.grip}</button>
        <button type="button" class="fb-icon" data-act="up-q" data-qid="${q.id}" aria-label="Move up"${i === 0 ? ' disabled' : ''}>${IC.up}</button>
        <button type="button" class="fb-icon" data-act="down-q" data-qid="${q.id}" aria-label="Move down"${i === s.questions.length - 1 ? ' disabled' : ''}>${IC.down}</button>
        <button type="button" class="fb-icon" data-act="dup-q" data-qid="${q.id}" aria-label="Duplicate question">${IC.copy}</button>
        <button type="button" class="fb-icon teal" data-act="toggle-req" data-qid="${q.id}" aria-label="${q.required ? 'Make optional' : 'Make required'}">${IC.star}</button>
        <button type="button" class="fb-icon danger" data-act="del-q" data-qid="${q.id}" aria-label="Delete question">${IC.trash}</button>
      </div>
    </li>`;
  }

  function canvasHTML() {
    const c = B.content;
    if (B.sel.kind === 'welcome') {
      return `<div class="fb-canvas-in"><p class="fb-k">Welcome screen</p><h2 class="fb-h">The first thing clients see</h2>
        <div class="fb-card">
          <div class="fb-field"><span id="wel-on">Show a welcome screen</span><button type="button" class="fb-switch" role="switch" aria-checked="${c.welcome.enabled}" aria-labelledby="wel-on" data-act="toggle-welcome"><i></i></button><em>${c.welcome.enabled ? 'On' : 'Off'}</em></div>
          ${field('Title', `<input data-bind="w:title" value="${val(c.welcome.title)}" maxlength="120" placeholder="${esc(B.form.name)}">`)}
          ${field('Introduction', `<textarea data-bind="w:text" rows="4" maxlength="600" placeholder="What this form is for and how long it takes">${val(c.welcome.text)}</textarea>`)}
          ${field('Start button', `<input data-bind="w:button" value="${val(c.welcome.button)}" maxlength="30">`)}
          <p class="fb-note">Clients see the form name${B.form.description ? ' and description' : ''} above this card. Change them in the Form tab.</p>
        </div></div>`;
    }
    if (B.sel.kind === 'thanks') {
      return `<div class="fb-canvas-in"><p class="fb-k">Thank-you screen</p><h2 class="fb-h">Shown once the answers are sent</h2>
        <div class="fb-card">
          ${field('Title', `<input data-bind="t:title" value="${val(c.thanks.title)}" maxlength="120">`)}
          ${field('Message', `<textarea data-bind="t:text" rows="4" maxlength="600">${val(c.thanks.text)}</textarea>`)}
        </div></div>`;
    }
    const s = curSection();
    if (!s) return '<div class="fb-canvas-in"><div class="fb-card fb-empty"><b>No sections yet</b><p>Add a section to start adding questions.</p><button type="button" class="f-btn f-dark" data-act="add-section">Add Section</button></div></div>';
    const si = c.sections.indexOf(s);
    const nextSec = c.sections[si + 1];
    return `<div class="fb-canvas-in">
      <div class="fb-sec-head"><div>
        <p class="fb-k">Section ${si + 1} of ${c.sections.length}</p>
        <label class="sr-only" for="sec-t-${s.id}">Section title</label>
        <input id="sec-t-${s.id}" class="fb-sec-title" data-bind="s:${s.id}:title" value="${val(s.title)}" maxlength="80" placeholder="Section title">
        <label class="sr-only" for="sec-d-${s.id}">Section description</label>
        <input id="sec-d-${s.id}" class="fb-sec-desc" data-bind="s:${s.id}:description" value="${val(s.description)}" maxlength="200" placeholder="Tell clients what this section is about">
      </div><button type="button" class="fb-icon" data-act="tab-section" aria-label="Section settings">${IC.dots}</button></div>
      <ol class="fb-qs" data-section="${s.id}">${s.questions.map((q, i) => questionHTML(s, q, i)).join('')}</ol>
      ${s.questions.length ? '' : '<p class="fb-hint">No questions yet. Pick a type on the right, or add one below.</p>'}
      <button type="button" class="fb-add-q" data-act="add-q-menu" aria-expanded="false">${IC.plus}<span>Add Question</span></button>
      <div class="fb-addmenu" hidden>${F.TYPE_IDS.map((t) => `<button type="button" data-act="add-q" data-type="${t}">${IC.t[t]}<span>${F.TYPES[t].label}</span></button>`).join('')}</div>
      <p class="fb-end"><span>End of ${esc(s.title || `Section ${si + 1}`)}${nextSec ? ` · next is ${esc(nextSec.title || `Section ${si + 2}`)}` : ' · then the thank-you screen'}</span></p>
    </div>`;
  }

  function panelHTML() {
    const tabs = [['add', 'Add'], ['section', 'Section'], ['form', 'Form']];
    const s = curSection();
    let body = '';
    if (B.tab === 'add') {
      const groups = {};
      for (const t of F.TYPE_IDS) (groups[F.TYPES[t].group] = groups[F.TYPES[t].group] || []).push(t);
      body = `<p class="fb-k">Question types</p><p class="fb-sub">Adds to ${s ? `“${esc(s.title || 'this section')}”` : 'the first section'}</p>
        ${Object.entries(groups).map(([g, ts]) => `<p class="fb-group">${g}</p><div class="fb-types">${ts.map((t) => `<button type="button" data-act="add-q" data-type="${t}">${IC.t[t]}<span>${F.TYPES[t].label}</span></button>`).join('')}</div>`).join('')}`;
    } else if (B.tab === 'section') {
      if (!s) body = '<p class="fb-sub">Pick a section in the outline to change it.</p>';
      else {
        const si = B.content.sections.indexOf(s);
        body = `<p class="fb-k">Section ${si + 1} of ${B.content.sections.length}</p>
          ${field('Title', `<input data-bind="s:${s.id}:title" value="${val(s.title)}" maxlength="80">`)}
          ${field('Description', `<textarea data-bind="s:${s.id}:description" rows="3" maxlength="200">${val(s.description)}</textarea>`)}
          <div class="fb-row-btns"><button type="button" class="f-btn" data-act="sec-up"${si === 0 ? ' disabled' : ''}>${IC.up}<span>Move up</span></button>
          <button type="button" class="f-btn" data-act="sec-down"${si === B.content.sections.length - 1 ? ' disabled' : ''}>${IC.down}<span>Move down</span></button></div>
          <div class="fb-row-btns"><button type="button" class="f-btn" data-act="add-section">${IC.plus}<span>Add Section</span></button>
          <button type="button" class="f-btn f-danger" data-act="del-section">${IC.trash}<span>Delete Section</span></button></div>`;
      }
    } else {
      const f = B.form;
      body = `<p class="fb-k">Form type</p>
        <div class="fb-select fb-cat"><label class="sr-only" for="fb-cat">Category</label><select id="fb-cat" data-bind="f:category">${F.CATEGORIES.map((c) => `<option${c === f.category ? ' selected' : ''}>${c}</option>`).join('')}</select>${IC.chev}</div>
        <p class="fb-k" id="fb-tags-l">Tags</p><div class="fb-tags"></div>
        <div class="fm-row"><label class="fm-l" for="fb-desc">Description</label><span class="fm-count" data-count="desc">${(f.description || '').length}/200</span></div>
        <textarea id="fb-desc" data-bind="f:description" rows="3" maxlength="200">${val(f.description)}</textarea>
        <p class="fm-help">Optional · clients see this under the form name</p>
        <div class="fm-row"><label class="fm-l" for="fb-notes">Notes · only you see these</label><span class="fm-count" data-count="notes">${(f.notes || '').length}/1000</span></div>
        <textarea id="fb-notes" data-bind="f:notes" rows="4" maxlength="1000">${val(f.notes)}</textarea>
        <p class="fb-k">Sending</p>
        <p class="fb-sub">${f.published_version_id ? `Sent to ${F.plural(B.sentCount, 'client')}. ` : 'Publish to send it to clients. '}<a href="#forms/${f.id}/responses">See responses</a></p>
        <div class="fb-row-btns"><button type="button" class="f-btn" data-act="duplicate">${IC.copy}<span>Duplicate Form</span></button>
          ${f.archived_at ? '<button type="button" class="f-btn" data-act="restore">Restore Form</button>' : f.published_version_id ? `<button type="button" class="f-btn f-danger" data-act="archive">${IC.trash}<span>Archive Form</span></button>` : `<button type="button" class="f-btn f-danger" data-act="delete-form">${IC.trash}<span>Delete Form</span></button>`}</div>
        ${f.published_version_id ? '<p class="fb-note">Archiving hides the form from your list. Clients who have it, and their answers, are kept.</p>' : ''}`;
    }
    return `<aside class="fb-panel" aria-label="Builder tools">
      <div class="fb-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${B.tab === k}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="fb-panel-in" role="tabpanel">${body}</div>
    </aside>`;
  }

  function previewHTML() {
    const items = [];
    if (B.content.welcome.enabled) items.push(['welcome', 'Welcome screen']);
    B.content.sections.forEach((s, i) => items.push([s.id, s.title || `Section ${i + 1}`]));
    items.push(['thanks', 'Thank-you screen']);
    const cur = B.pv.at || (items[0] && items[0][0]);
    const curLabel = (items.find((x) => x[0] === cur) || items[0])[1];
    return `<section class="fb-pv ${B.pv.device}" aria-label="Preview">
      <div class="fb-pv-bar">
        <b>Preview</b>
        <div class="fb-seg" role="group" aria-label="Preview size"><button type="button" data-act="pv-device" data-device="phone" aria-pressed="${B.pv.device === 'phone'}">Phone</button><button type="button" data-act="pv-device" data-device="desktop" aria-pressed="${B.pv.device === 'desktop'}">Desktop</button></div>
        <div class="fb-pv-pick"><button type="button" class="fb-pv-sel" data-act="pv-menu" aria-haspopup="listbox" aria-expanded="false"><span>${esc(curLabel)}</span>${IC.chev}</button>
          <ul class="fb-pv-list" role="listbox" aria-label="Jump to" hidden>${items.map(([k, l]) => `<li role="option" tabindex="-1" data-act="pv-go" data-to="${esc(k)}" aria-selected="${k === cur}">${esc(l)}${k === cur ? IC.check : ''}</li>`).join('')}</ul></div>
        <span class="fb-grow"></span>
        <button type="button" class="fb-iconbtn" data-act="preview" aria-label="Close preview">${IC.x}</button>
      </div>
      <div class="fb-pv-stage">${B.pv.device === 'phone' ? '<div class="fb-phone"><div class="fb-phone-bar"><span>9:41</span><i></i><span class="fb-phone-ic"></span></div><div class="fb-pv-host"></div><div class="fb-phone-home"></div></div>' : '<div class="fb-pv-host"></div>'}</div>
      <p class="fb-pv-foot">Preview of your unsaved draft. Nothing here is saved, sent or marked complete.</p>
    </section>`;
  }

  function drawBuilder() {
    const app = document.getElementById('root');
    // Keep focus and caret across a redraw.
    const a = document.activeElement;
    const keep = a && a.dataset && (a.dataset.bind || a.dataset.act) ? { bind: a.dataset.bind, act: a.dataset.act, qid: a.dataset.qid, oid: a.dataset.oid, start: a.selectionStart, end: a.selectionEnd } : null;
    const answers = B.pv.runner ? B.pv.runner.answers() : null;
    const step = B.pv.runner ? B.pv.runner.step() : null;
    app.innerHTML = `<div class="fbld${B.pv.open ? ` pv-${B.pv.device}` : ''}">${topHTML()}${outlineHTML()}<main class="fb-canvas">${canvasHTML()}</main>${panelHTML()}${B.pv.open ? previewHTML() : ''}</div>`;
    const tags = app.querySelector('.fb-tags');
    if (tags) tagPicker(tags, { tags: B.form.tags || [], all: B.allTags, labelledby: 'fb-tags-l', onChange: (t) => { B.form.tags = t; queueSave(); } });
    B.pv.runner = null;
    if (B.pv.open) mountPreview(answers, step);
    if (keep) {
      let sel = null;
      if (keep.bind) sel = `[data-bind="${CSS.escape(keep.bind)}"]`;
      else if (keep.act) sel = `[data-act="${keep.act}"]${keep.qid ? `[data-qid="${keep.qid}"]` : ''}${keep.oid ? `[data-oid="${keep.oid}"]` : ''}`;
      const el = sel && app.querySelector(sel);
      if (el) {
        el.focus({ preventScroll: true });
        if (keep.start !== null && keep.start !== undefined && el.setSelectionRange && /text|search|undefined/.test(el.type || 'text')) {
          try { el.setSelectionRange(keep.start, keep.end); } catch (_) { /* not a text field */ }
        }
      }
    }
  }

  function mountPreview(answers, step) {
    const host = document.querySelector('.fb-pv-host');
    B.pv.runner = createRunner(host, {
      content: B.content, name: B.form.name, description: B.form.description, mode: 'preview', device: B.pv.device, answers: answers || {}, at: step,
      onSubmit: () => Promise.resolve(),
      onStep: (s) => {
        B.pv.at = s.kind === 'question' ? s.sectionId : s.kind;
        const pick = document.querySelector('.fb-pv-sel span');
        if (!pick) return;
        const li = document.querySelector(`.fb-pv-list [data-to="${CSS.escape(B.pv.at)}"]`);
        pick.textContent = li ? li.textContent : '';
        document.querySelectorAll('.fb-pv-list li').forEach((x) => {
          const on = x.dataset.to === B.pv.at;
          x.setAttribute('aria-selected', on);
          x.innerHTML = `${esc(x.textContent)}${on ? IC.check : ''}`;
        });
      },
    });
  }

  // Light updates while typing, so the field keeps focus.
  let pvTimer = null;
  function refreshLive() {
    const set = (sel, html) => { const el = document.querySelector(sel); if (el) el.outerHTML = html; };
    set('.fb-health', healthHTML());
    const top = document.querySelector('.fb-top .fb-save');
    if (top) top.outerHTML = saveText();
    const status = document.querySelector('.fb-top .fb-status');
    if (status) status.textContent = F.status({ ...B.form, draft_rev: B.rev + (B.dirty ? 1 : 0) }).label;
    const pub = document.querySelector('[data-act="publish"]');
    if (pub && B.dirty) {
      pub.disabled = false;
      pub.textContent = B.form.published_version_id ? 'Update published version' : 'Publish';
    }
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      if (B && B.pv.runner) B.pv.runner.setContent(B.content, { name: B.form.name, description: B.form.description });
    }, 120);
  }

  // ---------- saving: one request at a time, newest content always wins

  let saveTimer = null;
  function queueSave() {
    B.dirty = true;
    B.failed = null;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 600);
    refreshLive();
  }

  async function flush() {
    clearTimeout(saveTimer);
    const b = B;
    if (!b) return;
    if (b.saving) {
      b.again = true;
      return b.saving;
    }
    if (!b.dirty) return;
    b.dirty = false;
    const rev = b.rev + 1;
    const f = b.form;
    const body = {
      name: f.name.trim() || 'Untitled form', category: f.category, description: (f.description || '').trim() || null,
      tags: f.tags || [], notes: (f.notes || '').trim() || null, draft: b.content, draft_rev: rev,
    };
    b.saving = (async () => {
      try {
        const r = await sb.from('forms').update(body).eq('id', f.id).select('draft_rev, updated_at, tags').single();
        if (r.error) throw r.error;
        b.rev = r.data.draft_rev;
        f.draft_rev = r.data.draft_rev;
        f.updated_at = r.data.updated_at;
      } catch (err) {
        b.dirty = true;
        b.failed = err;
        b.again = false;
      }
    })();
    await b.saving;
    b.saving = null;
    if (b !== B) return;
    if (b.failed) {
      refreshLive();
      notify(`Unable to save. ${explain(b.failed)}`, { error: true, action: 'Retry', onAction: () => { b.failed = null; flush(); } });
      return;
    }
    if (b.again || b.dirty) {
      b.again = false;
      return flush();
    }
    refreshLive();
  }

  // Leaving with changes still on their way (or failed) asks first.
  window.addEventListener('beforeunload', (e) => {
    if (B && (B.dirty || B.saving || B.failed)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  let lastHash = location.hash;
  let ignoreHash = false;
  window.addEventListener('hashchange', (e) => {
    if (ignoreHash) {
      ignoreHash = false;
      e.stopImmediatePropagation();
      return;
    }
    const stays = B && new RegExp(`^#forms/${B.form.id}(\\?|$)`).test(location.hash);
    if (B && !stays) {
      if ((B.dirty || B.saving || B.failed) && !window.confirm('Your latest changes haven’t saved yet. Leave anyway?')) {
        e.stopImmediatePropagation();
        ignoreHash = true;
        location.hash = lastHash;
        return;
      }
      if (B.dirty && !B.failed) flush();
      B = null;
    }
    if (!/^#forms\/[^/?]+(\?|$)/.test(location.hash)) document.body.classList.remove('fb-body');
    lastHash = location.hash;
  });

  // ---------- edits

  function bind(el) {
    const [kind, a, b2, c] = el.dataset.bind.split(':');
    const value = el.type === 'checkbox' ? el.checked : el.value;
    let structural = false;
    if (kind === 'f') {
      B.form[a] = value;
      if (a === 'category') structural = true;
      if (a === 'description' || a === 'notes') {
        const cnt = document.querySelector(`[data-count="${a === 'description' ? 'desc' : 'notes'}"]`);
        if (cnt) cnt.textContent = `${value.length}/${a === 'description' ? 200 : 1000}`;
      }
      if (a === 'name') el.size = Math.max(4, Math.min(36, value.length));
    } else if (kind === 'w') B.content.welcome[a] = value;
    else if (kind === 't') B.content.thanks[a] = value;
    else if (kind === 's') {
      const s = B.content.sections.find((x) => x.id === a);
      s[b2] = value;
      document.querySelectorAll(`[data-label="s:${a}"]`).forEach((x) => { x.textContent = value || 'Untitled section'; });
      if (el.closest('.fb-panel')) {
        const other = document.querySelector(`.fb-canvas [data-bind="${CSS.escape(el.dataset.bind)}"]`);
        if (other) other.value = value;
      } else {
        const other = document.querySelector(`.fb-panel [data-bind="${CSS.escape(el.dataset.bind)}"]`);
        if (other) other.value = value;
      }
    } else if (kind === 'q') {
      const found = F.findQuestion(B.content, a);
      const q = found.question;
      const numeric = ['min', 'max', 'minPicks', 'maxPicks', 'maxLength'];
      if (b2 === 'type') {
        const fresh = F.newQuestion(value);
        const keep = { id: q.id, label: q.label, help: q.help, required: q.required };
        // Choice to choice keeps the options.
        if ((value === 'single' || value === 'multi') && q.options) Object.assign(keep, { options: q.options, allowOther: q.allowOther });
        found.section.questions[found.qi] = { ...fresh, ...keep };
        structural = true;
      } else if (numeric.includes(b2)) {
        q[b2] = value === '' ? null : Number(value);
        if (b2 === 'maxLength') structural = true;
      } else {
        q[b2] = value;
        if (b2 === 'allowOther') structural = true;
      }
      if (b2 === 'label') document.querySelectorAll(`[data-label="q:${a}"]`).forEach((x) => { x.textContent = value || 'Untitled question'; });
    } else if (kind === 'o') {
      const q = F.findQuestion(B.content, a).question;
      q.options.find((o) => o.id === b2).label = value;
    }
    void c;
    queueSave();
    if (structural) drawBuilder();
  }

  function withUndo(message, change) {
    const before = F.clone(B.content);
    const sel = { ...B.sel };
    change();
    queueSave();
    drawBuilder();
    const b = B;
    notify(message, {
      action: 'Undo',
      onAction: () => {
        if (b !== B) return;
        B.content = before;
        B.sel = sel;
        queueSave();
        drawBuilder();
      },
    });
  }

  function move(arr, i, j) {
    if (j < 0 || j >= arr.length) return false;
    const [x] = arr.splice(i, 1);
    arr.splice(j, 0, x);
    return true;
  }

  function addQuestion(type) {
    let s = curSection();
    if (!s) {
      s = B.content.sections[0];
      if (!s) {
        s = F.newSection('Section 1');
        B.content.sections.push(s);
      }
      B.sel = { kind: 'section', sid: s.id };
    }
    const q = F.newQuestion(type);
    s.questions.push(q);
    B.open = q.id;
    queueSave();
    drawBuilder();
    const el = document.getElementById(`lbl-${q.id}`);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  async function onAct(btn, e) {
    const act = btn.dataset.act;
    const qid = btn.dataset.qid;
    const c = B.content;
    const found = qid ? F.findQuestion(c, qid) : null;
    switch (act) {
      case 'select-welcome': B.sel = { kind: 'welcome' }; B.open = null; drawBuilder(); break;
      case 'select-thanks': B.sel = { kind: 'thanks' }; B.open = null; drawBuilder(); break;
      case 'select-section': B.sel = { kind: 'section', sid: btn.dataset.sid }; B.open = null; drawBuilder(); break;
      case 'open-q':
        B.sel = { kind: 'section', sid: found.section.id };
        B.open = B.open === qid && btn.classList.contains('fb-q-head') ? null : qid;
        drawBuilder();
        if (B.open) {
          const el = document.getElementById(`lbl-${qid}`);
          if (el) { el.focus({ preventScroll: true }); el.closest('.fb-q').scrollIntoView({ block: 'nearest' }); }
        }
        break;
      case 'close-q': {
        const id = B.open;
        B.open = null;
        drawBuilder();
        const head = document.querySelector(`.fb-q-head[data-qid="${id}"]`);
        if (head) head.focus();
        break;
      }
      case 'add-section': {
        const s = F.newSection(`Section ${c.sections.length + 1}`);
        c.sections.push(s);
        B.sel = { kind: 'section', sid: s.id };
        B.open = null;
        queueSave();
        drawBuilder();
        const t = document.getElementById(`sec-t-${s.id}`);
        if (t) { t.focus(); t.select(); }
        break;
      }
      case 'del-section': {
        const s = curSection();
        if (!s) break;
        const i = c.sections.indexOf(s);
        withUndo(`Section “${s.title || i + 1}” deleted${s.questions.length ? ` with ${F.plural(s.questions.length, 'question')}` : ''}.`, () => {
          c.sections.splice(i, 1);
          const n = c.sections[Math.max(0, i - 1)];
          B.sel = n ? { kind: 'section', sid: n.id } : { kind: 'welcome' };
        });
        break;
      }
      case 'sec-up': case 'sec-down': {
        const s = curSection();
        const i = c.sections.indexOf(s);
        if (move(c.sections, i, i + (act === 'sec-up' ? -1 : 1))) { queueSave(); drawBuilder(); }
        break;
      }
      case 'add-q-menu': {
        const menu = btn.nextElementSibling;
        menu.hidden = !menu.hidden;
        btn.setAttribute('aria-expanded', String(!menu.hidden));
        if (!menu.hidden) menu.querySelector('button').focus();
        break;
      }
      case 'add-q': addQuestion(btn.dataset.type); break;
      case 'dup-q': {
        const copy = F.clone(found.question);
        copy.id = F.uid('q');
        for (const o of copy.options || []) o.id = F.uid('o');
        found.section.questions.splice(found.qi + 1, 0, copy);
        B.open = copy.id;
        queueSave();
        drawBuilder();
        notify('Question duplicated.');
        break;
      }
      case 'del-q':
        withUndo('Question deleted.', () => {
          found.section.questions.splice(found.qi, 1);
          if (B.open === qid) B.open = null;
        });
        break;
      case 'up-q': case 'down-q':
        if (move(found.section.questions, found.qi, found.qi + (act === 'up-q' ? -1 : 1))) {
          queueSave();
          drawBuilder();
        }
        break;
      case 'toggle-req':
        found.question.required = !found.question.required;
        queueSave();
        drawBuilder();
        break;
      case 'add-opt': {
        const o = { id: F.uid('o'), label: '' };
        found.question.options.push(o);
        queueSave();
        drawBuilder();
        const el = document.querySelector(`[data-bind="o:${qid}:${o.id}"]`);
        if (el) el.focus();
        break;
      }
      case 'del-opt': {
        const opts = found.question.options;
        const i = opts.findIndex((o) => o.id === btn.dataset.oid);
        withUndo(`Option “${opts[i].label || i + 1}” removed.`, () => opts.splice(i, 1));
        break;
      }
      case 'paste-opts': {
        const box = document.querySelector(`[data-paste="${qid}"]`);
        box.hidden = false;
        box.querySelector('textarea').focus();
        break;
      }
      case 'paste-cancel': btn.closest('.fb-paste').hidden = true; break;
      case 'paste-add': {
        const box = btn.closest('.fb-paste');
        const q = found.question;
        const have = new Set(q.options.map((o) => o.label.trim().toLowerCase()));
        const lines = box.querySelector('textarea').value.split(/\r?\n/).map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);
        // An empty first option (a new question) is replaced by the list.
        q.options = q.options.filter((o) => o.label.trim());
        for (const l of lines) {
          if (have.has(l.toLowerCase())) continue;
          have.add(l.toLowerCase());
          q.options.push({ id: F.uid('o'), label: l.slice(0, 120) });
        }
        queueSave();
        drawBuilder();
        break;
      }
      case 'toggle-welcome':
        c.welcome.enabled = !c.welcome.enabled;
        queueSave();
        drawBuilder();
        break;
      case 'tab': B.tab = btn.dataset.tab; drawBuilder(); break;
      case 'tab-section': B.tab = 'section'; drawBuilder(); break;
      case 'goto-problem': {
        const where = btn.dataset.where;
        if (where === 'welcome' || where === 'thanks') B.sel = { kind: where };
        else if (where !== 'form') B.sel = { kind: 'section', sid: where };
        B.open = btn.dataset.q || null;
        drawBuilder();
        const el = B.open ? document.getElementById(`lbl-${B.open}`) : document.querySelector('.fb-canvas input');
        if (el) el.focus();
        break;
      }
      case 'preview':
        B.pv.open = !B.pv.open;
        drawBuilder();
        if (B.pv.open) document.querySelector('.fb-pv [data-device][aria-pressed="true"]').focus();
        else document.querySelector('[data-act="preview"]').focus();
        break;
      case 'pv-device':
        B.pv.device = btn.dataset.device;
        // The same runner keeps its place and answers.
        document.querySelector('.fbld').className = `fbld pv-${B.pv.device}`;
        document.querySelector('.fb-pv').className = `fb-pv ${B.pv.device}`;
        document.querySelectorAll('[data-act="pv-device"]').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
        {
          const stage = document.querySelector('.fb-pv-stage');
          const host = document.querySelector('.fb-pv-host');
          if (B.pv.device === 'phone') {
            stage.innerHTML = '<div class="fb-phone"><div class="fb-phone-bar"><span>9:41</span><i></i><span class="fb-phone-ic"></span></div><div class="fb-phone-slot"></div><div class="fb-phone-home"></div></div>';
            stage.querySelector('.fb-phone-slot').replaceWith(host);
          } else {
            stage.innerHTML = '';
            stage.appendChild(host);
          }
          B.pv.runner.setDevice(B.pv.device);
        }
        break;
      case 'pv-menu': {
        const list = btn.nextElementSibling;
        list.hidden = !list.hidden;
        btn.setAttribute('aria-expanded', String(!list.hidden));
        if (!list.hidden) (list.querySelector('[aria-selected="true"]') || list.firstElementChild).focus();
        break;
      }
      case 'pv-go': {
        const list = btn.closest('.fb-pv-list');
        list.hidden = true;
        list.previousElementSibling.setAttribute('aria-expanded', 'false');
        B.pv.runner.goTo(btn.dataset.to);
        list.previousElementSibling.focus();
        break;
      }
      case 'retry-save': B.failed = null; flush(); break;
      case 'publish': await publish(btn); break;
      case 'send': await flush(); sendModal(B.form, () => { B.sentCount += 1; drawBuilder(); }); break;
      case 'duplicate': {
        await flush();
        try { location.hash = `#forms/${await duplicateForm(B.form.id)}`; } catch (err) { notify(explain(err), { error: true }); }
        break;
      }
      case 'archive': case 'restore': {
        try {
          const at = act === 'archive' ? new Date().toISOString() : null;
          h.must(await sb.from('forms').update({ archived_at: at }).eq('id', B.form.id).select('id'));
          B.form.archived_at = at;
          drawBuilder();
          notify(act === 'archive' ? 'Form archived. Clients who have it, and their answers, are kept.' : 'Form restored.');
        } catch (err) { notify(explain(err), { error: true }); }
        break;
      }
      case 'delete-form': {
        if (!window.confirm(`Delete “${B.form.name}”? This can’t be undone.`)) break;
        try {
          const r = h.must(await sb.from('forms').delete().eq('id', B.form.id).select('id'));
          if (!r.length) throw new Error('Published forms can only be archived.');
          B = null;
          document.body.classList.remove('fb-body');
          notify('Form deleted.');
          location.hash = '#forms';
        } catch (err) { notify(explain(err), { error: true }); }
        break;
      }
      default:
    }
    void e;
  }

  async function publish(btn) {
    const p = F.problems(B.content);
    if (p.length) {
      notify(`Fix ${F.plural(p.length, 'thing')} before publishing. They’re listed under Form health.`, { error: true });
      const first = document.querySelector('.fb-health button');
      if (first) first.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    await flush();
    if (B.failed) {
      btn.disabled = false;
      btn.textContent = 'Publish';
      return;
    }
    try {
      const v = h.must(await sb.rpc('publish_form', { p_form: B.form.id, p_rev: B.rev }));
      const ver = Array.isArray(v) ? v[0] : v;
      B.form.published_version_id = ver.id;
      B.form.published_rev = B.rev;
      drawBuilder();
      notify(`Published as version ${ver.version}. Clients who already have this form keep the version they were sent.`, { action: 'Send to clients', onAction: () => sendModal(B.form, () => { B.sentCount += 1; }) });
    } catch (err) {
      notify(explain(err), { error: true });
      drawBuilder();
    }
  }

  // Drag and drop for questions (within and across sections) and options.
  // Keyboard users move the same things with the grip buttons' arrow keys.
  let drag = null;
  function bindBuilderEvents() {
    const app = document.getElementById('root');
    app.addEventListener('input', (e) => {
      if (!B || !e.target.dataset.bind) return;
      if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') return;
      bind(e.target);
    });
    app.addEventListener('change', (e) => {
      if (!B) return;
      if (e.target.dataset.bind && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox')) bind(e.target);
      if (e.target.dataset.actChange === 'move-to') {
        const found = F.findQuestion(B.content, e.target.dataset.qid);
        const to = B.content.sections.find((s) => s.id === e.target.value);
        found.section.questions.splice(found.qi, 1);
        to.questions.push(found.question);
        B.sel = { kind: 'section', sid: to.id };
        queueSave();
        drawBuilder();
        notify(`Moved to ${to.title || 'that section'}.`);
      }
    });
    app.addEventListener('click', (e) => {
      if (!B) return;
      const btn = e.target.closest('[data-act]');
      if (btn && !btn.disabled && app.contains(btn)) onAct(btn, e);
      if (!e.target.closest('.fb-pv-pick')) {
        const l = document.querySelector('.fb-pv-list');
        if (l && !l.hidden) { l.hidden = true; l.previousElementSibling.setAttribute('aria-expanded', 'false'); }
      }
    });
    app.addEventListener('keydown', (e) => {
      if (!B) return;
      const t = e.target;
      // Grips: arrow keys move the question or option.
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && t.dataset && (t.dataset.act === 'grip-q' || t.dataset.act === 'grip-opt')) {
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? -1 : 1;
        const found = F.findQuestion(B.content, t.dataset.qid);
        if (t.dataset.act === 'grip-q') {
          const qs = found.section.questions;
          if (!move(qs, found.qi, found.qi + dir)) {
            // Past the end of a section: into the next or previous one.
            const si = found.si + dir;
            const to = B.content.sections[si];
            if (!to) return;
            qs.splice(found.qi, 1);
            if (dir < 0) to.questions.push(found.question);
            else to.questions.unshift(found.question);
            B.sel = { kind: 'section', sid: to.id };
          }
        } else {
          const opts = found.question.options;
          const i = opts.findIndex((o) => o.id === t.dataset.oid);
          if (!move(opts, i, i + dir)) return;
        }
        queueSave();
        drawBuilder();
        const pos = t.dataset.act === 'grip-q' ? F.findQuestion(B.content, t.dataset.qid) : null;
        const live = document.getElementById('fb-live');
        if (live && pos) live.textContent = `Question moved to position ${pos.qi + 1} in ${B.content.sections[pos.si].title}`;
        return;
      }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey && t.dataset && t.dataset.act === 'select-section') {
        e.preventDefault();
        const i = B.content.sections.findIndex((s) => s.id === t.dataset.sid);
        if (move(B.content.sections, i, i + (e.key === 'ArrowUp' ? -1 : 1))) { queueSave(); drawBuilder(); }
        return;
      }
      if (e.key === 'Escape') {
        const l = document.querySelector('.fb-pv-list:not([hidden])');
        if (l) { l.hidden = true; l.previousElementSibling.setAttribute('aria-expanded', 'false'); l.previousElementSibling.focus(); return; }
        const m = document.querySelector('.fb-addmenu:not([hidden])');
        if (m) { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); m.previousElementSibling.focus(); return; }
        if (B.pv.open && !document.querySelector('.f-back')) { B.pv.open = false; drawBuilder(); }
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && t.closest('.fb-pv-list')) {
        e.preventDefault();
        const n = e.key === 'ArrowDown' ? t.nextElementSibling : t.previousElementSibling;
        if (n) n.focus();
      }
      if ((e.key === 'Enter' || e.key === ' ') && t.closest('.fb-pv-list') && t.dataset.act === 'pv-go') {
        e.preventDefault();
        onAct(t, e);
      }
    });
    app.addEventListener('dragstart', (e) => {
      if (!B) return;
      const opt = e.target.closest && e.target.closest('.fb-opt');
      const q = e.target.closest && e.target.closest('.fb-q:not(.open)');
      if (opt) drag = { kind: 'opt', qid: opt.closest('[data-opts]').dataset.opts, oid: opt.dataset.oid };
      else if (q) drag = { kind: 'q', qid: q.dataset.qid };
      else return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'rewired-form');
      (opt || q).classList.add('dragging');
    });
    app.addEventListener('dragend', () => {
      drag = null;
      document.querySelectorAll('.dragging, .drop-before, .drop-after, .drop-into').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after', 'drop-into'));
    });
    app.addEventListener('dragover', (e) => {
      if (!drag) return;
      const target = drag.kind === 'opt' ? e.target.closest('.fb-opt') : e.target.closest('.fb-q, [data-drop-section]');
      if (!target) return;
      e.preventDefault();
      document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
      if (target.dataset.dropSection) target.classList.add('drop-into');
      else {
        const r = target.getBoundingClientRect();
        target.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
      }
    });
    app.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      const d = drag;
      drag = null;
      if (d.kind === 'opt') {
        const t = e.target.closest('.fb-opt');
        if (!t) return;
        const opts = F.findQuestion(B.content, d.qid).question.options;
        const from = opts.findIndex((o) => o.id === d.oid);
        const [x] = opts.splice(from, 1);
        let to = opts.findIndex((o) => o.id === t.dataset.oid);
        if (to < 0) to = opts.length;
        const r = t.getBoundingClientRect();
        opts.splice(e.clientY < r.top + r.height / 2 ? to : to + 1, 0, x);
      } else {
        const found = F.findQuestion(B.content, d.qid);
        const secTarget = e.target.closest('[data-drop-section]');
        const qTarget = e.target.closest('.fb-q');
        found.section.questions.splice(found.qi, 1);
        if (qTarget && qTarget.dataset.qid !== d.qid) {
          const tf = F.findQuestion(B.content, qTarget.dataset.qid);
          const r = qTarget.getBoundingClientRect();
          tf.section.questions.splice(e.clientY < r.top + r.height / 2 ? tf.qi : tf.qi + 1, 0, found.question);
        } else if (secTarget) {
          const s = B.content.sections.find((x) => x.id === secTarget.dataset.dropSection);
          s.questions.push(found.question);
          B.sel = { kind: 'section', sid: s.id };
        } else {
          found.section.questions.splice(found.qi, 0, found.question);
        }
      }
      queueSave();
      drawBuilder();
    });
  }
  let builderEventsBound = false;
  function ensureBuilderEvents() {
    if (builderEventsBound) return;
    builderEventsBound = true;
    bindBuilderEvents();
    const live = document.createElement('div');
    live.id = 'fb-live';
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
  }

  // ================================================================ send

  async function sendModal(form, after) {
    const [clients, assigns, version] = await Promise.all([
      sb.from('profiles').select('id, full_name, email').eq('role', 'client').order('full_name'),
      sb.from('form_assignments').select('id, client_id, status, submitted_at, assigned_at').eq('form_id', form.id).order('assigned_at', { ascending: false }),
      sb.from('form_versions').select('version').eq('id', form.published_version_id).single(),
    ]);
    if (clients.error || assigns.error || version.error) {
      notify(explain(clients.error || assigns.error || version.error), { error: true });
      return;
    }
    const open = new Map();
    const done = new Map();
    for (const a of assigns.data) {
      if (a.status === 'not_started' || a.status === 'in_progress') open.set(a.client_id, a);
      else if (a.status === 'completed' && !done.has(a.client_id)) done.set(a.client_id, a);
    }
    const unpublished = form.published_rev !== (B && B.form.id === form.id ? B.rev : form.draft_rev);
    const picked = new Set();
    let busy = false;
    const d = dialog(`<div class="fm fs" role="dialog" aria-modal="true" aria-labelledby="fs-h">
        <div class="fm-head"><h2 id="fs-h">Send form</h2><button type="button" class="fm-x" data-close aria-label="Close">${IC.x}</button></div>
        <p class="fs-name">${esc(form.name)} · version ${version.data.version}</p>
        <p class="fm-help">Clients get this version. Later edits won’t change their copy.${unpublished ? ' <b>You have edits that aren’t published yet.</b> Publish first to include them.' : ''}</p>
        <label class="fl-search fs-search">${IC.search}<span class="sr-only">Search clients</span><input type="search" placeholder="Search clients" autofocus></label>
        <ul class="fs-list" aria-label="Clients"></ul>
        <p class="fm-err" role="alert"></p>
        <div class="fm-foot"><button type="button" class="f-btn" data-close>Cancel</button><button type="button" class="f-btn f-dark" data-send disabled>Send</button></div>
      </div>`, { canClose: () => !busy });
    const box = d.box;
    const list = box.querySelector('.fs-list');
    const send = box.querySelector('[data-send]');
    const draw = () => {
      const q = box.querySelector('input[type=search]').value.toLowerCase();
      const rows = clients.data.filter((c) => `${c.full_name || ''} ${c.email || ''}`.toLowerCase().includes(q));
      list.innerHTML = rows.length ? rows.map((c) => {
        const a = open.get(c.id);
        const prior = done.get(c.id);
        return `<li><label class="fs-row${a ? ' off' : ''}"><input type="checkbox" value="${c.id}"${a ? ' disabled' : ''}${picked.has(c.id) ? ' checked' : ''}>
          <span><b>${esc(c.full_name || c.email)}</b><small>${a ? `Already sent · ${a.status === 'in_progress' ? 'In progress' : 'Not started'}` : prior ? `Completed ${esc(day(prior.submitted_at))} · sending again starts a new copy` : esc(c.email || '')}</small></span></label></li>`;
      }).join('') : '<li class="fs-none">No clients match.</li>';
      send.disabled = busy || !picked.size;
      send.textContent = picked.size ? `Send to ${F.plural(picked.size, 'client')}` : 'Send';
    };
    draw();
    box.querySelector('input[type=search]').addEventListener('input', draw);
    list.addEventListener('change', (e) => {
      if (e.target.checked) picked.add(e.target.value);
      else picked.delete(e.target.value);
      draw();
    });
    send.addEventListener('click', async () => {
      if (busy || !picked.size) return;
      busy = true;
      send.disabled = true;
      send.textContent = 'Sending…';
      try {
        const rows = h.must(await sb.rpc('assign_form', { p_form: form.id, p_clients: [...picked] }));
        const made = rows.filter((r) => r.created).length;
        const skipped = rows.length - made;
        busy = false;
        d.remove();
        notify(`Sent to ${F.plural(made, 'client')}.${skipped ? ` ${skipped} already had it open.` : ''} It’s on their Home screen now.`);
        if (after) after(made);
      } catch (err) {
        busy = false;
        box.querySelector('.fm-err').textContent = explain(err);
        draw();
      }
    });
  }

  // ================================================================ responses

  async function responses(formId, assignmentId) {
    h.state.coachView = { section: 'forms' };
    const f = await sb.from('forms').select('id, name, category, published_version_id').eq('id', formId).maybeSingle();
    if (f.error) throw new Error(explain(f.error));
    if (!f.data) return h.shell('Form not found', '', '<div class="fl-panel fl-state"><b>This form isn’t here</b><a class="f-btn" href="#forms">Back to Forms</a></div>');
    const form = f.data;
    const [assigns, versions, clients] = await Promise.all([
      sb.from('form_assignments').select('*').eq('form_id', formId).order('assigned_at', { ascending: false }),
      sb.from('form_versions').select('id, version, name, content').eq('form_id', formId),
      sb.from('profiles').select('id, full_name, email').eq('role', 'client'),
    ]).then((rs) => rs.map(h.must));
    const vOf = new Map(versions.map((v) => [v.id, v]));
    const who = new Map(clients.map((c) => [c.id, c.full_name || c.email]));
    const crumbs = `<p class="fr-crumbs"><a href="#forms">Forms</a> › <a href="#forms/${form.id}">${esc(form.name)}</a> › ${assignmentId ? `<a href="#forms/${form.id}/responses">Responses</a> › Answers` : 'Responses'}</p>`;
    const statusLabel = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', cancelled: 'Withdrawn' };

    if (assignmentId) {
      const a = assigns.find((x) => x.id === assignmentId);
      if (!a) return h.shell('Response not found', '', `${crumbs}<div class="fl-panel fl-state"><b>Not found</b></div>`);
      const v = vOf.get(a.version_id);
      let detail;
      if (a.status !== 'completed') {
        detail = `<div class="fl-panel fl-state"><b>${esc(statusLabel[a.status])}</b><p>Answers show here once ${esc(who.get(a.client_id) || 'the client')} submits the form.</p></div>`;
      } else {
        const r = h.must(await sb.from('form_responses').select('answers, submitted_at').eq('assignment_id', a.id).maybeSingle());
        detail = r ? answersHTML(v.content, r.answers) : '<div class="fl-panel fl-state"><b>Answers not available</b></div>';
      }
      h.shell(who.get(a.client_id) || 'Client', `${form.name} · version ${v.version}`, `${crumbs}
        <div class="fr-meta"><span class="f-status ${a.status}">${esc(statusLabel[a.status])}</span><span>Sent ${esc(stamp(a.assigned_at))}</span>${a.submitted_at ? `<span>Submitted ${esc(stamp(a.submitted_at))}</span>` : ''}</div>
        ${detail}`);
      return;
    }

    const rows = assigns.map((a) => {
      const v = vOf.get(a.version_id);
      return `<tr>
        <td><b>${esc(who.get(a.client_id) || 'Client')}</b></td>
        <td>v${v ? v.version : '?'}</td>
        <td><span class="f-status ${a.status}">${esc(statusLabel[a.status])}</span></td>
        <td>${esc(stamp(a.assigned_at))}</td>
        <td>${esc(stamp(a.submitted_at))}</td>
        <td class="fr-row-act">${a.status === 'completed' ? `<a class="f-btn f-small" href="#forms/${form.id}/responses/${a.id}">View answers</a>` : ''}
          ${a.status === 'not_started' || a.status === 'in_progress' ? `<button type="button" class="f-btn f-small" data-withdraw="${a.id}">Withdraw</button>` : ''}</td>
      </tr>`;
    }).join('');
    h.shell(form.name, 'Responses', `${crumbs}
      <div class="fl-panel">${assigns.length ? `<table class="fl-table"><thead><tr><th scope="col">Client</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Sent</th><th scope="col">Submitted</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table>`
        : `<div class="fl-state"><b>Not sent to anyone yet</b><p>${form.published_version_id ? 'Send it from the builder or the Forms list.' : 'Publish the form, then send it to clients.'}</p><a class="f-btn" href="#forms/${form.id}">Open the builder</a></div>`}</div>
      <p class="fm-help">You see answers once a client submits. Until then you see whether they’ve started.</p>`);
    document.querySelectorAll('[data-withdraw]').forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Withdraw this form? The client won’t see it any more.')) return;
      try {
        h.must(await sb.rpc('cancel_form_assignment', { p_assignment: b.dataset.withdraw }));
        notify('Form withdrawn.');
        responses(formId);
      } catch (err) {
        notify(explain(err), { error: true });
      }
    }));
  }

  function answersHTML(content, answers) {
    const c = F.normalise(content);
    let n = 0;
    return c.sections.map((s) => `<section class="fr-review">
      <h2>${esc(s.title)}</h2>
      <dl>${s.questions.map((q) => {
        n += 1;
        const a = F.answerText(q, answers || {});
        return `<div><dt><span>${n}.</span> ${esc(q.label)}${q.required ? '' : ' <small>(optional)</small>'}</dt><dd class="${a.empty ? 'empty' : ''}">${esc(a.text)}</dd></div>`;
      }).join('')}</dl></section>`).join('');
  }

  // ================================================================ client

  // The client's open and finished forms. Empty until the forms SQL is run.
  async function myForms() {
    const a = await sb.from('form_assignments').select('id, version_id, status, assigned_at, started_at, submitted_at')
      .eq('client_id', h.state.me.id).neq('status', 'cancelled').order('assigned_at', { ascending: false });
    if (a.error) {
      if (missingTable(a.error)) return [];
      throw a.error;
    }
    if (!a.data.length) return [];
    const v = h.must(await sb.from('form_versions').select('id, name, description, content').in('id', [...new Set(a.data.map((x) => x.version_id))]));
    const byId = new Map(v.map((x) => [x.id, x]));
    return a.data.map((x) => ({ ...x, version: byId.get(x.version_id) })).filter((x) => x.version);
  }

  const CLIENT_STATUS = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };

  function formRow(x) {
    const c = F.counts(x.version.content);
    return `<a class="cf-row" href="#form/${x.id}">
      <span class="cf-ic" aria-hidden="true">${IC.forms}</span>
      <span class="cf-txt"><b>${esc(x.version.name)}</b><small>${x.status === 'completed' ? `Sent ${esc(day(x.submitted_at))}` : `${F.plural(c.questions, 'question')}${x.version.description ? ` · ${esc(x.version.description)}` : ''}`}</small></span>
      <span class="f-status ${x.status}">${CLIENT_STATUS[x.status]}</span></a>`;
  }

  // Home card: forms still to do. Nothing when there are none.
  async function homeCardHTML() {
    let list;
    try { list = await myForms(); } catch (_) { return ''; }
    const todo = list.filter((x) => x.status !== 'completed');
    if (!todo.length) return '';
    return `<section class="cf-home">
      <h2 class="sec-title">Forms from ${esc(h.COACH)}</h2>
      <p class="sec-sub">${todo.length === 1 ? 'One form to fill in' : `${todo.length} forms to fill in`}. Your answers save as you go.</p>
      <div class="cf-list">${todo.map(formRow).join('')}</div>
      ${list.length > todo.length ? '<a class="trend-link" href="#forms">All your forms <span aria-hidden="true">›</span></a>' : ''}
    </section>`;
  }

  async function clientList() {
    const list = await myForms();
    const todo = list.filter((x) => x.status !== 'completed');
    const done = list.filter((x) => x.status === 'completed');
    h.shell('Forms', '', `
      <h2 class="sec-title">To fill in</h2>
      ${todo.length ? `<div class="cf-list">${todo.map(formRow).join('')}</div>` : `<p class="sec-sub">Nothing to fill in right now. ${esc(h.COACH)} will send forms here when there’s one for you.</p>`}
      ${done.length ? `<h2 class="sec-title">Sent</h2><div class="cf-list">${done.map(formRow).join('')}</div>` : ''}`, 'forms');
  }

  async function clientForm(id) {
    const a = await sb.from('form_assignments').select('*').eq('id', id).maybeSingle();
    if (a.error) throw new Error(explain(a.error));
    if (!a.data || a.data.status === 'cancelled') {
      h.shell('Form', '', `<div class="plan-empty"><div><b>This form isn’t available</b><p>${esc(h.COACH)} may have withdrawn it.</p><a class="btn-dark" href="#home">Back to Home</a></div></div>`, 'forms');
      return;
    }
    const [v, r] = await Promise.all([
      sb.from('form_versions').select('*').eq('id', a.data.version_id).single(),
      sb.from('form_responses').select('*').eq('assignment_id', id).maybeSingle(),
    ]).then((rs) => rs.map(h.must));
    const version = v;
    if (a.data.status === 'completed') {
      h.shell(version.name, `Sent ${day(a.data.submitted_at)}`, `<div class="cf-done"><p class="kicker">Your answers</p>${answersHTML(version.content, (r && r.answers) || {})}</div>`, 'forms');
      return;
    }

    document.body.dataset.tab = 'form';
    const page = document.getElementById('root');
    page.innerHTML = '<div class="fr-page"></div>';
    window.scrollTo(0, 0);
    let seq = (r && r.seq) || 0;
    let pending = null;
    let inflight = null;
    let timer = null;
    let runner = null;
    const myRender = h.state.renderId;

    async function save() {
      clearTimeout(timer);
      if (inflight) { pending = true; return inflight; }
      if (!pending) return;
      pending = false;
      seq += 1;
      const body = { p_assignment: id, p_answers: F.clone(runner.answers()), p_seq: seq };
      runner.setSaveState('saving');
      inflight = (async () => {
        try {
          h.must(await sb.rpc('save_form_answers', body));
          if (h.state.renderId === myRender) runner.setSaveState(pending ? 'saving' : 'saved');
        } catch (err) {
          pending = true;
          if (h.state.renderId === myRender) runner.setSaveState('error');
        }
      })();
      await inflight;
      inflight = null;
      if (pending && runner && h.state.renderId === myRender && !document.querySelector('.fr-save.bad')) return save();
    }

    runner = createRunner(page.firstElementChild, {
      content: version.content,
      name: version.name,
      description: version.description,
      mode: 'client',
      device: 'client',
      answers: (r && r.answers) || {},
      startAt: 'resume',
      closeHref: '#home',
      onChange: () => {
        pending = true;
        clearTimeout(timer);
        timer = setTimeout(save, 700);
      },
      onRetry: () => { pending = true; save(); },
      onSubmit: async (answers) => {
        clearTimeout(timer);
        pending = false;
        if (inflight) await inflight;
        seq += 1;
        h.must(await sb.rpc('submit_form_assignment', { p_assignment: id, p_answers: answers, p_seq: seq }));
        h.invalidate(h.state.me.id);
      },
    });
  }

  window.RewiredFormsUI = {
    init, createRunner, library, builder: async (id) => { ensureBuilderEvents(); return builder(id); }, responses,
    homeCardHTML, clientList, clientForm, answersHTML,
  };
})();
