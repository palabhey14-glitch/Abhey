// Messages: one private conversation per client, with the coach. The coach
// sees every client's conversation in Workspace > Messages; a client sees
// only their own, under the Messages tab. New messages arrive live through
// Supabase Realtime when it is on, with a quiet refresh every 10 seconds as
// a fallback.
(function () {
  'use strict';

  let h = null;
  let sb = null;
  let esc = null;
  let live = null; // { channel, timer } for the open conversation

  function init(helpers) {
    h = helpers;
    sb = helpers.sb;
    esc = helpers.esc;
    window.addEventListener('hashchange', stop);
  }

  function stop() {
    if (!live) return;
    clearInterval(live.timer);
    if (live.channel) try { sb.removeChannel(live.channel); } catch (e) { /* realtime off */ }
    live = null;
  }

  const time = (iso) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA');
  function dayLabel(iso) {
    const d = dayKey(iso);
    const today = dayKey(new Date().toISOString());
    const yest = dayKey(new Date(Date.now() - 86400000).toISOString());
    if (d === today) return 'Today';
    if (d === yest) return 'Yesterday';
    return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function ago(iso) {
    if (!iso) return '';
    const d = dayKey(iso);
    if (d === dayKey(new Date().toISOString())) return time(iso);
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }
  const initials = (name) => String(name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const missing = (err) => err && (err.code === '42P01' || err.code === 'PGRST205' || /messages/.test(err.message || '') && /does not exist|schema cache/.test(err.message || ''));

  // Unread messages for the signed-in person (from the other side).
  async function unread() {
    const me = h.state.me;
    if (!me) return [];
    const r = await sb.from('messages').select('client_id').is('read_at', null).neq('sender_id', me.id).limit(500);
    return r.error ? [] : r.data;
  }

  // Puts the unread count on the menu item or tab once the page is drawn.
  async function badge() {
    const list = await unread();
    document.querySelectorAll('[data-msg-badge]').forEach((el) => {
      el.textContent = list.length > 99 ? '99+' : String(list.length);
      el.hidden = !list.length;
    });
  }

  // ------------------------------------------------------------ conversation

  function bubblesHTML(rows, meId) {
    let lastDay = '';
    const mineLast = [...rows].reverse().find((m) => m.sender_id === meId);
    return rows.map((m) => {
      const day = dayKey(m.created_at);
      const sep = day !== lastDay ? `<li class="msg-day"><span>${esc(dayLabel(m.created_at))}</span></li>` : '';
      lastDay = day;
      const mine = m.sender_id === meId;
      const seen = mine && m === mineLast && m.read_at ? '<span class="msg-seen">Seen</span>' : '';
      const state = m.pending ? '<span class="msg-seen">Sending…</span>' : m.failed ? '<button type="button" class="msg-retry" data-retry="' + esc(m.id) + '">Not sent. Tap to retry</button>' : '';
      return `${sep}<li class="msg ${mine ? 'mine' : 'theirs'}${m.failed ? ' failed' : ''}" data-id="${esc(m.id)}"><p>${esc(m.body)}</p><span class="msg-time">${esc(time(m.created_at))}</span>${seen}${state}</li>`;
    }).join('');
  }

  // Mounts a conversation into `host`. otherName labels the composer.
  async function conversation(host, clientId, otherName) {
    stop();
    const me = h.state.me;
    const myRender = h.state.renderId;
    let rows = [];
    const r = await sb.from('messages').select('id, client_id, sender_id, body, created_at, read_at').eq('client_id', clientId).order('created_at', { ascending: true }).limit(500);
    if (r.error) {
      host.innerHTML = missing(r.error)
        ? '<div class="msg-empty"><b>Messages aren’t switched on yet</b><p>Run supabase/migrations/2026-10-29-messages.sql in Supabase, then refresh.</p></div>'
        : `<div class="msg-empty"><b>Couldn’t load messages</b><p>${esc(h.friendlyError(r.error))}</p></div>`;
      return;
    }
    rows = r.data;
    const first = (otherName || '').split(' ')[0] || 'them';
    host.innerHTML = `<div class="msg-thread">
        <div class="msg-scroll" data-scroll><ol class="msg-list" aria-live="polite"></ol></div>
        <form class="msg-compose" autocomplete="off">
          <label class="sr-only" for="msg-input">Message ${esc(first)}</label>
          <textarea id="msg-input" rows="1" maxlength="4000" placeholder="Message ${esc(first)}" enterkeyhint="send"></textarea>
          <button type="submit" class="msg-send" aria-label="Send" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h13M12 5l7 7-7 7"/></svg></button>
        </form>
      </div>`;
    const list = host.querySelector('.msg-list');
    const scroller = host.querySelector('[data-scroll]');
    const input = host.querySelector('textarea');
    const send = host.querySelector('.msg-send');
    const draw = (stick) => {
      const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
      list.innerHTML = rows.length ? bubblesHTML(rows, me.id) : `<li class="msg-empty"><b>No messages yet</b><p>${h.state.me.role === 'coach' ? `Start the conversation with ${esc(first)}. Only the two of you can see it.` : `Message ${esc(first)} here. Only the two of you can see it.`}</p></li>`;
      if (stick || atBottom) scroller.scrollTop = scroller.scrollHeight;
    };
    draw(true);
    const markRead = async () => {
      if (!rows.some((m) => m.sender_id !== me.id && !m.read_at)) return;
      const ok = await sb.rpc('mark_messages_read', { p_client: clientId });
      if (!ok.error) {
        rows.forEach((m) => { if (m.sender_id !== me.id && !m.read_at) m.read_at = new Date().toISOString(); });
        badge();
      }
    };
    markRead();

    const refresh = async () => {
      if (h.state.renderId !== myRender) return stop();
      const got = await sb.from('messages').select('id, client_id, sender_id, body, created_at, read_at').eq('client_id', clientId).order('created_at', { ascending: true }).limit(500);
      if (got.error || h.state.renderId !== myRender) return;
      const local = rows.filter((m) => m.pending || m.failed);
      const before = rows.filter((m) => !m.pending && !m.failed).map((m) => `${m.id}${m.read_at ? 'r' : ''}`).join();
      const after = got.data.map((m) => `${m.id}${m.read_at ? 'r' : ''}`).join();
      if (before === after) return;
      rows = got.data.concat(local);
      draw(false);
      markRead();
    };

    const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; };
    input.addEventListener('input', () => { send.disabled = !input.value.trim(); grow(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(hover: hover)').matches) {
        e.preventDefault();
        host.querySelector('.msg-compose').requestSubmit();
      }
    });
    async function deliver(m) {
      m.pending = true;
      m.failed = false;
      draw(true);
      const ins = await sb.from('messages').insert({ client_id: clientId, body: m.body }).select('id, client_id, sender_id, body, created_at, read_at').single();
      if (h.state.renderId !== myRender) return;
      if (ins.error) {
        m.pending = false;
        m.failed = true;
        h.toast(h.friendlyError(ins.error));
      } else {
        rows[rows.indexOf(m)] = ins.data;
      }
      draw(true);
    }
    host.querySelector('.msg-compose').addEventListener('submit', (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      input.value = '';
      send.disabled = true;
      grow();
      const m = { id: `local-${Date.now()}`, client_id: clientId, sender_id: me.id, body, created_at: new Date().toISOString() };
      rows.push(m);
      deliver(m);
      input.focus();
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-retry]');
      if (!b) return;
      const m = rows.find((x) => x.id === b.dataset.retry);
      if (m) deliver(m);
    });

    live = { timer: setInterval(refresh, 10000), channel: null };
    try {
      live.channel = sb.channel(`messages-${clientId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` }, () => refresh())
        .subscribe();
    } catch (e) { /* realtime off: the timer keeps it fresh */ }
    if (window.matchMedia('(hover: hover)').matches) input.focus();
  }

  // ------------------------------------------------------------ coach

  async function coachInbox(clientId) {
    h.state.coachView = { section: 'messages' };
    const [clients, msgs] = await Promise.all([
      sb.from('profiles').select('id, full_name, email').eq('role', 'client').order('full_name'),
      sb.from('messages').select('client_id, sender_id, body, created_at, read_at').order('created_at', { ascending: false }).limit(1000),
    ]);
    if (clients.error) throw clients.error;
    const off = msgs.error && missing(msgs.error);
    if (msgs.error && !off) throw msgs.error;
    const me = h.state.me;
    const last = new Map();
    const unreadBy = new Map();
    for (const m of off ? [] : msgs.data) {
      if (!last.has(m.client_id)) last.set(m.client_id, m);
      if (m.sender_id !== me.id && !m.read_at) unreadBy.set(m.client_id, (unreadBy.get(m.client_id) || 0) + 1);
    }
    const people = clients.data.map((c) => ({ ...c, name: c.full_name || c.email || 'Client', last: last.get(c.id), unread: unreadBy.get(c.id) || 0 }))
      .sort((a, b) => (b.last ? b.last.created_at : '').localeCompare(a.last ? a.last.created_at : '') || a.name.localeCompare(b.name));
    const current = people.find((p) => p.id === clientId);
    const q = (h.state.msgQ || '').toLowerCase();
    const rowHTML = (p) => `<li><a href="#messages/${p.id}" class="msg-person${p.id === clientId ? ' on' : ''}"${p.id === clientId ? ' aria-current="true"' : ''}>
        <span class="msg-av" aria-hidden="true">${esc(initials(p.name))}</span>
        <span class="msg-who"><b>${esc(p.name)}</b><small>${p.last ? `${p.last.sender_id === me.id ? 'You: ' : ''}${esc(p.last.body.slice(0, 80))}` : 'No messages yet'}</small></span>
        <span class="msg-meta"><small>${esc(ago(p.last && p.last.created_at))}</small>${p.unread ? `<b class="msg-dot" aria-label="${p.unread} unread">${p.unread}</b>` : ''}</span></a></li>`;
    const listHTML = () => {
      const shown = people.filter((p) => !q || `${p.name} ${p.email || ''}`.toLowerCase().includes(q));
      return shown.length ? shown.map(rowHTML).join('') : `<li class="msg-none">${people.length ? 'No clients match.' : 'No clients yet.'}</li>`;
    };
    const totalUnread = people.reduce((n, p) => n + p.unread, 0);
    h.shell('Messages', totalUnread ? `${totalUnread} unread` : 'Private 1 on 1 conversations with your clients', `
      <div class="msg-wrap${clientId ? ' has-thread' : ''}">
        <aside class="msg-people">
          <label class="msg-search"><span class="sr-only">Search clients</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Search clients" value="${esc(h.state.msgQ || '')}" data-msg-q></label>
          <ul class="msg-people-list">${listHTML()}</ul>
        </aside>
        <section class="msg-pane">${current ? `<header class="msg-head"><a class="msg-back" href="#messages" aria-label="All conversations">‹</a><span class="msg-av" aria-hidden="true">${esc(initials(current.name))}</span><span><b>${esc(current.name)}</b><small>${esc(current.email || '')}</small></span><a class="btn btn-ghost btn-small" href="#client/${current.id}/overview">Open client</a></header><div class="msg-host"></div>`
          : `<div class="msg-empty msg-pick"><b>${off ? 'Messages aren’t switched on yet' : 'Pick a client'}</b><p>${off ? 'Run supabase/migrations/2026-10-29-messages.sql in Supabase, then refresh.' : 'Choose someone on the left to read and reply. Each conversation is private between you and that client.'}</p></div>`}</section>
      </div>`);
    const root = document.getElementById('root');
    root.querySelector('[data-msg-q]').addEventListener('input', (e) => {
      h.state.msgQ = e.target.value;
      root.querySelector('.msg-people-list').innerHTML = (() => { const v = e.target.value.toLowerCase(); const shown = people.filter((p) => !v || `${p.name} ${p.email || ''}`.toLowerCase().includes(v)); return shown.length ? shown.map(rowHTML).join('') : '<li class="msg-none">No clients match.</li>'; })();
    });
    if (current && !off) await conversation(root.querySelector('.msg-host'), current.id, current.name);
    badge();
  }

  // ------------------------------------------------------------ client

  async function clientThread() {
    h.shell('Messages', `Just you and ${h.COACH}`, '<div class="msg-client"></div>', 'messages');
    await conversation(document.querySelector('.msg-client'), h.state.me.id, h.COACH);
    badge();
  }

  window.RewiredMessages = { init, coachInbox, clientThread, badge, unread };
})();
