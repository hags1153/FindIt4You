/* FindIt4You — landing + marketplace. Uses window.FI (lib.js). */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  let finds = [];
  let watched = new Set();
  let filter = 'all';
  const openChats = new Set();     // find ids with chat panel open
  const chatTimers = {};

  // ---- hero copy per mode ----
  const MODES = {
    buyer: {
      pill: 'For buyers',
      title: 'Post what you want.<br/><span class="grad">A Finder gets it.</span>',
      lede: `The good stuff at TJ&nbsp;Maxx, Marshalls &amp; HomeGoods sells out fast — and it's never at <em>your</em> store. Post exactly what you're after, a trusted Finder goes and gets it, and your money is held safe until it's in your hands.`,
      cta: 'Post your first find',
    },
    finder: {
      pill: 'For finders',
      title: 'Shop like you already do.<br/><span class="grad">Get paid to find.</span>',
      lede: `You already know where the deals are. Claim open requests near you, grab the item, snap a photo — and get paid back your cost <em>plus</em> a finder's fee. No inventory, no risk, escrow guarantees you're covered.`,
      cta: 'Start finding',
    },
  };
  let mode = 'buyer';
  function applyMode(m) {
    mode = m;
    const cfg = MODES[m];
    $$('.modebtn').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === m));
    $('[data-hero-pill]').textContent = cfg.pill;
    $('[data-hero-title]').innerHTML = cfg.title;
    $('[data-hero-lede]').innerHTML = cfg.lede;
    $('[data-hero-cta]').textContent = cfg.cta;
  }

  // ---- card rendering ----
  const STATUS_LABEL = { open: 'Open', claimed: 'Claimed', found: 'Found', completed: 'Completed', cancelled: 'Cancelled' };
  function escrow(status) {
    if (status === 'open') return { cls: '', icon: '○', text: 'No funds held yet — escrow starts when a Finder claims this.' };
    if (status === 'completed') return { cls: 'released', icon: '✅', text: 'Escrow released — Finder paid cost + fee.' };
    if (status === 'cancelled') return { cls: '', icon: '—', text: 'Cancelled.' };
    return { cls: 'held', icon: '🔒', text: 'Funds held in escrow — released only on confirmed handoff.' };
  }

  function actions(f) {
    const me = FI.profile?.id;
    if (!me) return '';
    const isBuyer = f.buyerId === me, isFinder = f.finderId === me;
    if (f.status === 'open' && !isBuyer)
      return `<button class="btn btn-sm" data-act="claim" data-id="${f.id}">Claim this find</button>`;
    if (f.status === 'claimed' && isFinder)
      return `<button class="btn btn-sm" data-act="markfound" data-id="${f.id}">📸 Mark found + add proof</button>`;
    if (f.status === 'found' && isFinder)
      return `<span class="await">⏳ Waiting for buyer to confirm & release</span>`;
    if (f.status === 'found' && isBuyer)
      return `<button class="btn btn-sm" data-act="release" data-id="${f.id}">✅ Review proof & release funds</button>`;
    return '';
  }

  function card(f) {
    const me = FI.profile?.id;
    const e = escrow(f.status);
    const canChat = FI.session && (f.buyerId === me || f.finderId === me) && f.finderId;
    const heart = FI.session
      ? `<button class="heart ${watched.has(f.id) ? 'on' : ''}" data-act="watch" data-id="${f.id}" title="Watchlist">${watched.has(f.id) ? '♥' : '♡'}</button>`
      : '';
    const photo = f.photoUrl
      ? `<a class="proof-img" href="${f.photoUrl}" target="_blank" rel="noopener"><img src="${f.photoUrl}" alt="proof" loading="lazy"/></a>` : '';
    const proof = f.proof ? `<div class="proof">📸 ${FI.esc(f.proof)}</div>` : '';
    const finderLine = f.finderName ? ` · Finder: <b>${FI.esc(f.finderName)}</b>` : '';
    const act = actions(f);
    return `
    <article class="find" data-card="${f.id}">
      <div class="find-top">
        <div><h4>${FI.esc(f.title)}</h4>${f.detail ? `<p class="detail">${FI.esc(f.detail)}</p>` : ''}</div>
        <div class="find-top-right">${heart}<span class="chip ${f.status}">${STATUS_LABEL[f.status]}</span></div>
      </div>
      <div class="tags">
        <span class="tag">${FI.esc(f.category)}</span>
        ${f.size ? `<span class="tag">${FI.esc(f.size)}</span>` : ''}
        ${f.region ? `<span class="tag">📍 ${FI.esc(f.region)}</span>` : ''}
        <span class="tag">⏱ ${FI.esc(f.deadline)}</span>
      </div>
      <div class="meta">
        <span>Max price: <b>${FI.dollars(f.maxPrice)}</b></span>
        <span>Finder's fee: <b>${FI.dollars(f.reward)}</b></span>
        <span>Buyer: <b>${FI.esc(f.buyerName)}</b>${finderLine}</span>
      </div>
      <div class="escrow ${e.cls}"><span>${e.icon}</span><span>${e.text}</span></div>
      ${photo}${proof}
      <div class="card-actions">
        ${act}
        ${canChat ? `<button class="btn btn-sm btn-ghost" data-act="chat" data-id="${f.id}">💬 Messages</button>` : ''}
      </div>
      <div class="markfound-slot" data-mf="${f.id}"></div>
      <div class="chat-slot" data-chat="${f.id}"></div>
    </article>`;
  }

  function visible() {
    const me = FI.profile?.id;
    if (filter === 'open') return finds.filter((f) => f.status === 'open');
    if (filter === 'mine') return finds.filter((f) => me && (f.buyerId === me || f.finderId === me));
    return finds;
  }

  function render() {
    const feed = $('#feed');
    const list = visible();
    $('#feed-count').textContent = list.length ? `${list.length} find${list.length === 1 ? '' : 's'}` : '';
    feed.innerHTML = list.length
      ? list.map(card).join('')
      : `<div class="empty">No finds here yet. ${FI.session ? 'Post one above!' : 'Sign up to post the first one.'}</div>`;
    // re-open any chat panels that were open
    openChats.forEach((id) => { if ($(`[data-chat="${id}"]`)) openChat(id); });
    // toggle "mine" tab visibility
    $('.ftab[data-filter="mine"]').style.display = FI.session ? '' : 'none';
  }

  async function loadFinds() {
    finds = await FI.api('/api/requests');
    if (FI.session) {
      try { const wl = await FI.api('/api/watchlist'); watched = new Set(wl.map((f) => f.id)); } catch { watched = new Set(); }
    } else { watched = new Set(); }
    render();
  }

  // ---- actions ----
  async function claim(id) { await FI.api(`/api/requests/${id}/claim`, { method: 'POST' }); await loadFinds(); }

  function markFoundForm(id) {
    const slot = $(`[data-mf="${id}"]`);
    if (slot.dataset.open) { slot.innerHTML = ''; delete slot.dataset.open; return; }
    slot.dataset.open = '1';
    slot.innerHTML = `
      <div class="inline-form">
        <label class="file-drop">
          <input type="file" accept="image/*" data-file="${id}"/>
          <span data-filelabel="${id}">📎 Add a receipt / item photo (recommended)</span>
        </label>
        <textarea data-note="${id}" rows="2" maxlength="500" placeholder="Where you found it, price paid, condition…"></textarea>
        <div class="inline-actions">
          <button class="btn btn-sm" data-act="submitfound" data-id="${id}">Submit — I found it</button>
          <button class="btn btn-sm btn-ghost" data-act="markfound" data-id="${id}">Cancel</button>
        </div>
        <p class="fi-err" data-mferr="${id}"></p>
      </div>`;
    $(`[data-file="${id}"]`).addEventListener('change', (e) => {
      const f = e.target.files[0];
      $(`[data-filelabel="${id}"]`).textContent = f ? `📎 ${f.name}` : '📎 Add a receipt / item photo (recommended)';
    });
  }

  async function submitFound(id) {
    const err = $(`[data-mferr="${id}"]`);
    const note = $(`[data-note="${id}"]`).value.trim();
    const file = $(`[data-file="${id}"]`).files[0];
    const btn = $(`[data-act="submitfound"][data-id="${id}"]`);
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      let photoPath;
      if (file) photoPath = await FI.uploadProof(id, file);
      await FI.api(`/api/requests/${id}/advance`, { method: 'POST', body: { proof: note, photoPath } });
      await loadFinds();
    } catch (ex) { err.textContent = ex.message || 'Failed.'; btn.disabled = false; btn.textContent = 'Submit — I found it'; }
  }

  async function release(id) {
    const f = finds.find((x) => x.id === id);
    const ok = window.confirm(
      `Release funds for "${f.title}"?\n\n` +
      (f.proof ? `Finder's note: ${f.proof}\n` : '') +
      `${f.photoUrl ? 'A proof photo is attached (click the photo to view full size).\n' : 'No photo was attached.\n'}` +
      `\nOnly release if the proof looks right — this pays the Finder their cost + fee.`);
    if (!ok) return;
    await FI.api(`/api/requests/${id}/advance`, { method: 'POST' });
    await loadFinds();
  }

  async function toggleWatch(id) {
    if (!FI.requireAuth('signup')) return;
    if (watched.has(id)) { watched.delete(id); await FI.api(`/api/watchlist/${id}`, { method: 'DELETE' }); }
    else { watched.add(id); await FI.api(`/api/watchlist/${id}`, { method: 'POST' }); }
    render();
  }

  // ---- chat ----
  function openChat(id) {
    openChats.add(id);
    const slot = $(`[data-chat="${id}"]`);
    if (!slot) return;
    if (!slot.dataset.built) {
      slot.dataset.built = '1';
      slot.innerHTML = `
        <div class="chat">
          <div class="chat-msgs" data-msgs="${id}"><div class="muted">Loading…</div></div>
          <form class="chat-form" data-chatform="${id}">
            <input data-chatinput="${id}" maxlength="2000" placeholder="Message…" autocomplete="off"/>
            <button class="btn btn-sm" type="submit">Send</button>
          </form>
        </div>`;
      $(`[data-chatform="${id}"]`).addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = $(`[data-chatinput="${id}"]`);
        const body = input.value.trim(); if (!body) return;
        input.value = '';
        try { await FI.api(`/api/finds/${id}/messages`, { method: 'POST', body: { body } }); await loadChat(id); }
        catch (ex) { alert(ex.message); }
      });
    }
    loadChat(id);
    clearInterval(chatTimers[id]);
    chatTimers[id] = setInterval(() => { if (openChats.has(id) && document.body.contains(slot)) loadChat(id); else clearInterval(chatTimers[id]); }, 5000);
  }

  async function loadChat(id) {
    const box = $(`[data-msgs="${id}"]`);
    if (!box) return;
    try {
      const msgs = await FI.api(`/api/finds/${id}/messages`);
      box.innerHTML = msgs.length
        ? msgs.map((m) => `<div class="msg ${m.mine ? 'mine' : ''}"><span class="msg-who">${FI.esc(m.senderName)}</span>${FI.esc(m.body)}<span class="msg-time">${FI.fmtDate(m.createdAt)}</span></div>`).join('')
        : `<div class="muted">No messages yet — say hi 👋</div>`;
      box.scrollTop = box.scrollHeight;
    } catch (ex) { box.innerHTML = `<div class="fi-err">${ex.message}</div>`; }
  }

  // ---- events ----
  function wire() {
    $$('.modebtn').forEach((b) => b.addEventListener('click', () => applyMode(b.dataset.mode)));
    $('[data-hero-cta]').addEventListener('click', () => FI.openModal('signup', mode === 'finder' ? 'finder' : 'buyer'));
    $$('[data-signup-cta]').forEach((b) => b.addEventListener('click', () => FI.openModal('signup', mode === 'finder' ? 'finder' : 'buyer')));

    $$('.ftab').forEach((t) => t.addEventListener('click', () => {
      filter = t.dataset.filter; $$('.ftab').forEach((x) => x.classList.toggle('is-on', x === t)); render();
    }));

    $('#post-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      try { await FI.api('/api/requests', { method: 'POST', body }); e.target.reset(); filter = 'all';
        $$('.ftab').forEach((x) => x.classList.toggle('is-on', x.dataset.filter === 'all'));
        await loadFinds(); $('#feed').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (ex) { alert(ex.message); }
    });

    $('#feed').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const { act, id } = btn.dataset;
      try {
        if (act === 'claim') { if (!FI.requireAuth()) return; await claim(id); }
        else if (act === 'markfound') markFoundForm(id);
        else if (act === 'submitfound') await submitFound(id);
        else if (act === 'release') await release(id);
        else if (act === 'watch') await toggleWatch(id);
        else if (act === 'chat') {
          const slot = $(`[data-chat="${id}"]`);
          if (openChats.has(id)) { openChats.delete(id); slot.innerHTML = ''; delete slot.dataset.built; }
          else openChat(id);
        }
      } catch (ex) { alert(ex.message); }
    });
  }

  function onAuthChange() {
    const authed = !!FI.session;
    $('#post-panel').classList.toggle('hidden', !authed);
    $('#signed-out-cta').style.display = authed ? 'none' : '';
    loadFinds();
  }

  // ---- boot ----
  document.addEventListener('DOMContentLoaded', async () => {
    applyMode('buyer');
    wire();
    await FI.boot();
    FI.onAuth(onAuthChange);
    onAuthChange();
  });
})();
