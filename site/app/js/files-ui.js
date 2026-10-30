// Coach Files workspace and the matching client library.
(function () {
  'use strict';
  let h;
  let searchTimer;
  const BUCKET = 'coach-files';
  const view = { search: '', filter: 'all', page: 0 };
  const e = (value) => h.esc(value);
  const icon = (kind) => kind === 'link'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2.2-2.2a5 5 0 0 0-7.1-7.1L10.5 5.4"/><path d="M14 11a5 5 0 0 0-7.1 0l-2.2 2.2a5 5 0 0 0 7.1 7.1l1.7-1.7"/></svg>'
    : kind === 'folder'
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h4.2a2 2 0 0 1 1.5.7L12.7 5H19a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h5M8 12h7M8 16h7"/></svg>';
  const date = (value) => value ? new Date(value).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
  const size = (n) => n == null ? '–' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const fail = (r) => { if (r.error) throw r.error; return r.data; };
  function init(helpers) { h = helpers; }

  function dialog(title, body) {
    const el = document.createElement('dialog');
    el.className = 'files-dialog';
    el.innerHTML = `<header><h2>${e(title)}</h2><button type="button" data-close aria-label="Close">×</button></header>${body}`;
    document.body.appendChild(el);
    el.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => el.close());
    el.addEventListener('close', () => el.remove(), { once: true });
    el.showModal();
    el.querySelector('input,button')?.focus();
    return el;
  }
  const option = (p, selected) => `<label class="files-person"><input type="checkbox" value="${e(p.id)}"${selected.includes(p.id) ? ' checked' : ''}><span><b>${e(p.full_name || p.email || 'Client')}</b><small>${e(p.email || '')}</small></span></label>`;
  function audience(form, people, current, allowCoach) {
    const scope = current?.access_scope || (allowCoach ? 'coach' : 'selected');
    return `<fieldset class="files-permissions"><legend>Who has access</legend>
      ${allowCoach ? `<label><input type="radio" name="access_scope" value="coach"${scope === 'coach' ? ' checked' : ''}> Only me</label>` : ''}
      <label><input type="radio" name="access_scope" value="all"${scope === 'all' ? ' checked' : ''}> All clients</label>
      <label><input type="radio" name="access_scope" value="selected"${scope === 'selected' ? ' checked' : ''}> Selected clients</label>
      <div class="files-people" data-people>${people.map((p) => option(p, current?.client_ids || [])).join('') || '<p>No clients yet.</p>'}</div>
      <p class="files-help">Choose specific clients for private sharing. You can change access later.</p>
    </fieldset>`;
  }
  function selectedAudience(form) {
    const scope = form.querySelector('[name="access_scope"]:checked')?.value || 'coach';
    return { access_scope: scope, client_ids: scope === 'selected' ? [...form.querySelectorAll('[data-people] input:checked')].map((x) => x.value) : [] };
  }
  function bindAudience(form) {
    const update = () => { form.querySelector('[data-people]').hidden = form.querySelector('[name="access_scope"]:checked')?.value !== 'selected'; };
    form.querySelectorAll('[name="access_scope"]').forEach((x) => x.addEventListener('change', update));
    update();
  }
  async function coachData() {
    const [folders, files, people] = await Promise.all([
      h.sb.from('shared_folders').select('*').eq('coach_id', h.state.me.id).order('updated_at', { ascending: false }),
      h.sb.from('shared_files').select('*').eq('coach_id', h.state.me.id).order('updated_at', { ascending: false }),
      h.sb.from('profiles').select('id,full_name,email').eq('role', 'client').order('full_name'),
    ]);
    return { folders: fail(folders), files: fail(files), people: fail(people) };
  }
  async function folderEditor(folder, people) {
    const el = dialog(folder ? 'Edit folder' : 'Add folder', `<form class="files-form"><nav class="files-modal-nav"><button type="button" class="on" data-step="info">Folder info</button><button type="button" data-step="permissions">Folder permissions</button></nav><div class="files-modal-main"><div data-pane="info"><label>Folder name <small>40 characters max</small><input name="name" maxlength="40" required value="${e(folder?.name || '')}" placeholder="e.g. Onboarding pack"></label><label>Folder description<textarea name="description" maxlength="1000" rows="5" placeholder="What will clients find here?">${e(folder?.description || '')}</textarea></label></div><div data-pane="permissions" hidden>${audience(null, people, folder, true)}</div><p class="files-error" role="alert"></p></div><footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn">${folder ? 'Save changes' : 'Create folder'}</button></footer></form>`);
    const form = el.querySelector('form'); bindAudience(form);
    el.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
      el.querySelectorAll('[data-step]').forEach((x) => x.classList.toggle('on', x === b));
      el.querySelectorAll('[data-pane]').forEach((x) => x.hidden = x.dataset.pane !== b.dataset.step);
    });
    form.onsubmit = async (event) => {
      event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true;
      try {
        const values = { name: form.elements.namedItem('name').value.trim(), description: form.elements.namedItem('description').value.trim() || null, ...selectedAudience(form) };
        if (!values.name) throw Error('Enter a folder name.');
        if (values.access_scope === 'selected' && !values.client_ids.length) throw Error('Choose at least one client, or keep the folder private.');
        if (folder) fail(await h.sb.from('shared_folders').update(values).eq('id', folder.id).eq('coach_id', h.state.me.id));
        else fail(await h.sb.from('shared_folders').insert({ ...values, coach_id: h.state.me.id }));
        el.close(); h.toast('Folder saved.'); await coach(folder?.id);
      } catch (err) { form.querySelector('.files-error').textContent = h.friendlyError(err); button.disabled = false; }
    };
  }
  async function fileEditor(folder, file, people) {
    const eligible = folder.access_scope === 'selected' ? people.filter((p) => folder.client_ids.includes(p.id)) : people;
    const initial = file || { access_scope: folder.access_scope, client_ids: folder.access_scope === 'selected' ? folder.client_ids : [] };
    const el = dialog(file ? 'Edit item' : 'Add to folder', `<form class="files-form"><div class="files-modal-main"><div class="files-kind"><label><input type="radio" name="kind" value="upload"${initial.kind !== 'link' ? ' checked' : ''}${file ? ' disabled' : ''}> Upload file</label><label><input type="radio" name="kind" value="link"${initial.kind === 'link' ? ' checked' : ''}${file ? ' disabled' : ''}> Add link</label></div><label>Title<input name="title" maxlength="120" required value="${e(file?.title || '')}" placeholder="e.g. Training guide"></label><label>Description<textarea name="description" maxlength="1000" rows="3" placeholder="Optional context for clients">${e(file?.description || '')}</textarea></label><label data-upload>Choose file <small>Photos, videos, PDFs and other documents · up to 100 MB</small><input type="file" name="file"></label><label data-link>Link URL<input type="url" name="url" placeholder="https://example.com" value="${e(file?.external_url || '')}"></label>${folder.access_scope === 'coach' ? '<p class="files-help">This folder is private. Share the folder before clients can open its items.</p>' : ''}${audience(null, eligible, initial, true)}<p class="files-error" role="alert"></p></div><footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn">${file ? 'Save changes' : 'Add item'}</button></footer></form>`);
    const form = el.querySelector('form'); bindAudience(form);
    const kind = () => file?.kind || form.querySelector('[name="kind"]:checked')?.value;
    const updateKind = () => { form.querySelector('[data-upload]').hidden = kind() !== 'upload' || !!file; form.querySelector('[data-link]').hidden = kind() !== 'link'; };
    form.querySelectorAll('[name="kind"]').forEach((x) => x.onchange = updateKind); updateKind();
    form.onsubmit = async (event) => {
      event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true;
      let uploaded;
      try {
        const access = selectedAudience(form);
        if (access.access_scope === 'selected' && !access.client_ids.length) throw Error('Choose at least one client for this item.');
        const values = { title: form.elements.namedItem('title').value.trim(), description: form.elements.namedItem('description').value.trim() || null, ...access };
        if (!values.title) throw Error('Enter a title.');
        if (kind() === 'link') {
          const url = new URL(form.elements.namedItem('url').value.trim());
          if (!['http:', 'https:'].includes(url.protocol)) throw Error('Use an http or https link.');
          values.external_url = url.href;
        } else if (!file) {
          const blob = form.querySelector('[name="file"]').files[0];
          if (!blob) throw Error('Choose a file to upload.');
          if (blob.size > 104857600) throw Error('Files must be 100 MB or smaller.');
          const id = crypto.randomUUID();
          uploaded = `${h.state.me.id}/${id}/${crypto.randomUUID()}-${blob.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90)}`;
          fail(await h.sb.storage.from(BUCKET).upload(uploaded, blob, { contentType: blob.type || 'application/octet-stream', upsert: false }));
          values.storage_path = uploaded; values.mime_type = blob.type || 'application/octet-stream'; values.size_bytes = blob.size;
        }
        if (file) fail(await h.sb.from('shared_files').update(values).eq('id', file.id).eq('coach_id', h.state.me.id));
        else fail(await h.sb.from('shared_files').insert({ ...values, coach_id: h.state.me.id, folder_id: folder.id, kind: kind() }));
        el.close(); h.toast('Item saved.'); await coach(folder.id);
      } catch (err) {
        if (uploaded) await h.sb.storage.from(BUCKET).remove([uploaded]);
        form.querySelector('.files-error').textContent = h.friendlyError(err); button.disabled = false;
      }
    };
  }
  async function openFile(file) {
    const tab = file?.kind === 'upload' ? window.open('about:blank', '_blank') : null;
    if (tab) tab.opener = null;
    try {
      if (file.kind === 'link') { window.open(file.external_url, '_blank', 'noopener,noreferrer'); return; }
      const signed = fail(await h.sb.storage.from(BUCKET).createSignedUrl(file.storage_path, 600));
      if (tab) tab.location.href = signed.signedUrl;
      else window.location.href = signed.signedUrl;
    } catch (err) { tab?.close(); h.toast(h.friendlyError(err), true); }
  }
  async function removeFile(file, folderId) {
    if (!confirm(`Delete “${file.title}”? Clients will lose access.`)) return;
    try {
      fail(await h.sb.from('shared_files').delete().eq('id', file.id).eq('coach_id', h.state.me.id));
      if (file.storage_path) fail(await h.sb.storage.from(BUCKET).remove([file.storage_path]));
      h.toast('Item deleted.'); coach(folderId);
    } catch (err) { h.toast(h.friendlyError(err), true); }
  }
  async function removeFolder(folder, files) {
    if (!confirm(`Delete “${folder.name}” and its ${files.length} item${files.length === 1 ? '' : 's'}? Clients will lose access.`)) return;
    try {
      fail(await h.sb.from('shared_folders').delete().eq('id', folder.id).eq('coach_id', h.state.me.id));
      const paths = files.map((x) => x.storage_path).filter(Boolean);
      if (paths.length) fail(await h.sb.storage.from(BUCKET).remove(paths));
      h.toast('Folder deleted.');
      if (location.hash === '#files') coach(); else location.hash = '#files';
    } catch (err) { h.toast(h.friendlyError(err), true); }
  }
  function row(folder, files) {
    const scope = folder.access_scope === 'coach' ? 'Only me' : folder.access_scope === 'all' ? 'All clients' : `${folder.client_ids?.length || 0} clients`;
    return `<tr><td><a class="files-name" href="#files/${e(folder.id)}"><span class="files-icon">${icon('folder')}</span><span><b>${e(folder.name)}</b><small>${e(folder.description || scope)}</small></span></a></td><td>${date(folder.updated_at || folder.created_at)}</td><td>${files.length ? `${files.length} item${files.length === 1 ? '' : 's'}` : 'No items'}</td><td>${size(files.reduce((a, f) => a + (f.size_bytes || 0), 0))}</td><td><span class="files-scope">${e(scope)}</span></td><td><button type="button" class="files-icon-btn" data-folder-menu="${e(folder.id)}" aria-label="Manage ${e(folder.name)}">⋯</button></td></tr>`;
  }
  async function coach(folderId) {
    const { folders, files, people } = await coachData();
    const folder = folderId && folders.find((x) => x.id === folderId);
    if (folderId && !folder) { location.hash = '#files'; return; }
    if (!folder) {
      const list = folders.filter((f) => (view.filter === 'all' || view.filter === 'coach' && f.access_scope === 'coach' || view.filter === 'client' && f.access_scope !== 'coach') && (`${f.name} ${f.description || ''}`).toLowerCase().includes(view.search.toLowerCase()));
      const pages = Math.max(1, Math.ceil(list.length / 10)); view.page = Math.min(view.page, pages - 1);
      const shown = list.slice(view.page * 10, view.page * 10 + 10);
      h.state.coachView = { section: 'files', actions: '<button type="button" class="btn btn-small files-primary" data-add-folder>＋ Add folder</button>' };
      h.shell('Files', 'Share guides, photos, videos and links with selected clients.', `<div class="files-toolbar"><input type="search" data-search placeholder="Search folders" value="${e(view.search)}" aria-label="Search folders"><div class="files-filters" role="group" aria-label="Filter folders">${[['all','All'],['coach','Coach'],['client','Client']].map(([id,label]) => `<button type="button" data-filter="${id}"${view.filter === id ? ' class="on"' : ''}>${label}</button>`).join('')}</div></div><section class="files-table-wrap"><table class="files-table"><thead><tr><th>Name</th><th>Last updated</th><th>Content</th><th>Size</th><th>Access</th><th></th></tr></thead><tbody>${shown.map((f) => row(f, files.filter((x) => x.folder_id === f.id))).join('') || '<tr><td colspan="6" class="files-empty">No folders yet. Add a folder to start sharing.</td></tr>'}</tbody></table><footer><span>Showing ${list.length ? view.page * 10 + 1 : 0}–${Math.min(list.length, view.page * 10 + 10)} of ${list.length}</span><span><button type="button" data-prev ${view.page === 0 ? 'disabled' : ''}>‹</button> ${view.page + 1} / ${pages} <button type="button" data-next ${view.page >= pages - 1 ? 'disabled' : ''}>›</button></span></footer></section>`);
      h.root.querySelector('[data-add-folder]').onclick = () => folderEditor(null, people);
      h.root.querySelector('[data-search]').oninput = (ev) => { view.search = ev.target.value; view.page = 0; clearTimeout(searchTimer); searchTimer = setTimeout(async () => { await coach(); h.root.querySelector('[data-search]')?.focus(); }, 180); };
      h.root.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => { view.filter = b.dataset.filter; view.page = 0; coach(); });
      h.root.querySelector('[data-prev]').onclick = () => { view.page--; coach(); };
      h.root.querySelector('[data-next]').onclick = () => { view.page++; coach(); };
      h.root.querySelectorAll('[data-folder-menu]').forEach((b) => b.onclick = () => {
        const f = folders.find((x) => x.id === b.dataset.folderMenu);
        const el = dialog(f.name, `<div class="files-menu"><button type="button" data-edit>Edit folder and permissions</button><button type="button" data-open>Open folder</button><button type="button" class="danger" data-delete>Delete folder</button></div>`);
        el.querySelector('[data-edit]').onclick = () => { el.close(); folderEditor(f, people); };
        el.querySelector('[data-open]').onclick = () => { el.close(); location.hash = `#files/${f.id}`; };
        el.querySelector('[data-delete]').onclick = () => { el.close(); removeFolder(f, files.filter((x) => x.folder_id === f.id)); };
      });
      return;
    }
    const items = files.filter((x) => x.folder_id === folder.id);
    h.state.coachView = { section: 'files', actions: '<button type="button" class="btn btn-small files-primary" data-add-item>＋ Add item</button>' };
    h.shell(folder.name, folder.description || 'Manage the items and client access in this folder.', `<nav class="files-breadcrumb"><a href="#files">Files</a><span>›</span><b>${e(folder.name)}</b></nav><div class="files-folder-top"><span class="files-scope">${folder.access_scope === 'coach' ? 'Only you' : folder.access_scope === 'all' ? 'All clients' : `${folder.client_ids.length} selected clients`}</span><button type="button" class="btn btn-ghost btn-small" data-edit-folder>Edit folder access</button></div><div class="files-item-grid">${items.map((f) => `<article class="files-card"><span class="files-icon ${f.kind}">${icon(f.kind)}</span><div><b>${e(f.title)}</b><p>${e(f.description || (f.kind === 'link' ? f.external_url : f.mime_type || 'File'))}</p><small>${f.kind === 'link' ? 'Link' : size(f.size_bytes)} · ${f.access_scope === 'all' ? 'All folder clients' : `${f.client_ids.length} selected client${f.client_ids.length === 1 ? '' : 's'}`}</small></div><footer><button type="button" data-open-item="${e(f.id)}">Open ↗</button><button type="button" data-edit-item="${e(f.id)}">Edit</button><button type="button" data-delete-item="${e(f.id)}">Delete</button></footer></article>`).join('') || '<div class="files-empty-card"><span class="files-icon">▤</span><h2>No items yet</h2><p>Add a file or link and choose who can see it.</p></div>'}</div>`);
    h.root.querySelector('[data-add-item]').onclick = () => fileEditor(folder, null, people);
    h.root.querySelector('[data-edit-folder]').onclick = () => folderEditor(folder, people);
    h.root.querySelectorAll('[data-open-item]').forEach((b) => b.onclick = () => openFile(items.find((x) => x.id === b.dataset.openItem)));
    h.root.querySelectorAll('[data-edit-item]').forEach((b) => b.onclick = () => fileEditor(folder, items.find((x) => x.id === b.dataset.editItem), people));
    h.root.querySelectorAll('[data-delete-item]').forEach((b) => b.onclick = () => removeFile(items.find((x) => x.id === b.dataset.deleteItem), folder.id));
  }
  const galleryIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 3-4 5 6"/></svg>';
  const photoFolder = (href, title, detail, symbol = icon('folder')) => `<a class="files-client-card" href="${href}"><span class="files-icon">${symbol}</span><span><b>${e(title)}</b><small>${e(detail)}</small></span><span aria-hidden="true">›</span></a>`;
  async function photoUrls(rows) {
    const paths = rows.map((row) => row.storage_path);
    if (!paths.length) return {};
    const result = fail(await h.sb.storage.from('progress-photos').createSignedUrls(paths, 3600));
    return Object.fromEntries(result.filter((row) => row.signedUrl).map((row) => [row.path, row.signedUrl]));
  }
  async function gallery(section, week) {
    const uid = h.state.me.id;
    if (!section) {
      h.shell('Gallery', 'Your personal photo library', `<div class="files-client"><a class="files-back" href="#files">‹ Files</a>${photoFolder('#files/gallery/checkins', 'Check-in Photos', 'Progress photos grouped by program week and date', galleryIcon)}${photoFolder('#files/gallery/other', 'Other Photos', 'Photos you add outside check-ins', galleryIcon)}</div>`, 'hub');
      return;
    }
    if (section === 'checkins') {
      const photos = fail(await h.sb.from('progress_photos').select('*').eq('user_id', uid).order('created_at', { ascending: false }));
      if (week != null) {
        const chosen = photos.filter((row) => row.week_number === Number(week));
        if (!Number.isInteger(Number(week)) || Number(week) < 0 || Number(week) > 12) { location.hash = '#files/gallery/checkins'; return; }
        const urls = await photoUrls(chosen);
        const title = Number(week) === 0 ? 'Start of program' : `Week ${Number(week)} of program`;
        h.shell(title, chosen.length ? `Check-in photos · ${date(chosen[chosen.length - 1].created_at)}` : 'Check-in photos', `<div class="files-client"><a class="files-back" href="#files/gallery/checkins">‹ Check-in Photos</a>${chosen.length ? `<div class="files-photo-grid">${chosen.map((row) => `<a class="files-photo" href="${e(urls[row.storage_path] || '#')}" target="_blank" rel="noopener noreferrer">${urls[row.storage_path] ? `<img src="${e(urls[row.storage_path])}" alt="${e(row.pose)} view">` : galleryIcon}<span><b>${e(row.pose[0].toUpperCase() + row.pose.slice(1))} view</b><small>${date(row.created_at)}</small></span></a>`).join('')}</div>` : '<div class="card files-empty">No check-in photos in this week.</div>'}<a class="files-gallery-action" href="#photos/${Number(week)}">View or update this check-in →</a></div>`, 'hub');
        return;
      }
      const groups = new Map();
      for (const row of photos) {
        if (!groups.has(row.week_number)) groups.set(row.week_number, []);
        groups.get(row.week_number).push(row);
      }
      const folders = [...groups].sort((a, b) => b[0] - a[0]).map(([n, rows]) => photoFolder(`#files/gallery/checkins/${n}`, n === 0 ? 'Start of program' : `Week ${n} of program`, `${date(rows[rows.length - 1].created_at)} · ${rows.length} photo${rows.length === 1 ? '' : 's'}`, galleryIcon)).join('');
      h.shell('Check-in Photos', 'Organised by program week and upload date', `<div class="files-client"><a class="files-back" href="#files/gallery">‹ Gallery</a>${folders || '<div class="card files-empty">No check-in photos uploaded yet. Photos you add during a check-in will appear here.</div>'}</div>`, 'hub');
      return;
    }
    if (section !== 'other') { location.hash = '#files/gallery'; return; }
    const photos = fail(await h.sb.from('client_other_photos').select('*').eq('user_id', uid).order('created_at', { ascending: false }));
    const urls = await photoUrls(photos);
    h.shell('Other Photos', 'Photos outside your check-ins', `<div class="files-client"><a class="files-back" href="#files/gallery">‹ Gallery</a><button type="button" class="files-gallery-action" data-add-photo>＋ Add photo</button>${photos.length ? `<div class="files-photo-grid">${photos.map((row) => `<article class="files-photo">${urls[row.storage_path] ? `<a href="${e(urls[row.storage_path])}" target="_blank" rel="noopener noreferrer"><img src="${e(urls[row.storage_path])}" alt="${e(row.caption || 'Other photo')}"></a>` : galleryIcon}<span><b>${e(row.caption || 'Photo')}</b><small>${date(row.created_at)}</small></span><button type="button" data-delete-photo="${e(row.id)}" aria-label="Delete ${e(row.caption || 'photo')}">Delete</button></article>`).join('')}</div>` : '<div class="card files-empty">No other photos yet. Add a photo to keep it here.</div>'}</div>`, 'hub');
    h.root.querySelector('[data-add-photo]').onclick = () => {
      const el = dialog('Add photo', '<form class="files-form"><div class="files-modal-main"><label>Photo<input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required></label><label>Label (optional)<input type="text" name="caption" maxlength="120" placeholder="e.g. Starting progress"></label><p class="files-error" role="alert"></p></div><footer><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn">Add photo</button></footer></form>');
      const form = el.querySelector('form');
      form.onsubmit = async (event) => {
        event.preventDefault();
        const button = form.querySelector('[type="submit"]'); button.disabled = true;
        let path;
        try {
          const blob = form.elements.namedItem('photo').files[0];
          if (!blob || !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(blob.type)) throw Error('Choose a JPEG, PNG, WebP or HEIC photo.');
          if (blob.size > 10485760) throw Error('Photos must be 10 MB or smaller.');
          const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }[blob.type];
          path = `${uid}/gallery/${crypto.randomUUID()}.${ext}`;
          fail(await h.sb.storage.from('progress-photos').upload(path, blob, { contentType: blob.type, upsert: false }));
          fail(await h.sb.from('client_other_photos').insert({ user_id: uid, storage_path: path, caption: form.elements.namedItem('caption').value.trim() || null }));
          el.close(); h.toast('Photo added.'); await gallery('other');
        } catch (err) {
          if (path) await h.sb.storage.from('progress-photos').remove([path]);
          form.querySelector('.files-error').textContent = h.friendlyError(err); button.disabled = false;
        }
      };
    };
    h.root.querySelectorAll('[data-delete-photo]').forEach((button) => button.onclick = async () => {
      const photo = photos.find((row) => row.id === button.dataset.deletePhoto);
      if (!photo || !confirm('Delete this photo?')) return;
      try {
        fail(await h.sb.from('client_other_photos').delete().eq('id', photo.id).eq('user_id', uid));
        fail(await h.sb.storage.from('progress-photos').remove([photo.storage_path]));
        h.toast('Photo deleted.'); await gallery('other');
      } catch (err) { h.toast(h.friendlyError(err), true); }
    });
  }
  async function client(folderId, section, week) {
    if (folderId === 'gallery') return gallery(section, week);
    const [fResult, iResult] = await Promise.all([h.sb.from('shared_folders').select('*').order('name'), h.sb.from('shared_files').select('*').order('created_at', { ascending: false })]);
    const folders = fail(fResult), items = fail(iResult);
    const folder = folderId && folders.find((x) => x.id === folderId);
    if (folderId && !folder) { location.hash = '#files'; return; }
    const cards = folder ? items.filter((x) => x.folder_id === folder.id).map((f) => `<article class="files-client-card"><span class="files-icon ${f.kind}">${icon(f.kind)}</span><span><b>${e(f.title)}</b><small>${e(f.description || (f.kind === 'link' ? 'Link' : size(f.size_bytes)))}</small></span><button type="button" data-open-item="${e(f.id)}" aria-label="Open ${e(f.title)}">↗</button></article>`).join('') : folders.map((f) => photoFolder(`#files/${e(f.id)}`, f.name, f.description || `${items.filter((x) => x.folder_id === f.id).length} items`)).join('');
    h.shell(folder ? folder.name : 'Files', folder ? 'Shared with you by your coach' : 'Resources your coach has shared with you', `<div class="files-client">${folder ? '<a class="files-back" href="#files">‹ Files</a>' : `<h2 class="files-client-heading">Your gallery</h2>${photoFolder('#files/gallery', 'Gallery', 'Check-in Photos and Other Photos', galleryIcon)}<h2 class="files-client-heading">Shared by your coach</h2>`}${cards || '<div class="card files-empty">No files have been shared with you yet.</div>'}</div>`, 'hub');
    h.root.querySelectorAll('[data-open-item]').forEach((b) => b.onclick = () => openFile(items.find((x) => x.id === b.dataset.openItem)));
  }
  window.RewiredFilesUI = { init, coach, client };
})();
