// FindIt4You — front-end: Supabase Auth + authenticated API calls.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let sb = null;          // supabase browser client
let session = null;     // current auth session
let profile = null;     // current user's profile (from /api/me)
let cache = [];         // finds
let authMode = 'login';

// ---- API helper (adds bearer token when signed in) --------------------------
async function api(path, { method = 'GET', body } = {}) {
  const token = session?.access_token;
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || ('HTTP ' + r.status));
  return json;
}

// ---- rendering --------------------------------------------------------------
const STATUS_LABEL = { open: 'Open', claimed: 'Claimed', found: 'Found', completed: 'Completed' };

function escrowState(status) {
  if (status === 'open') return { cls: '', icon: '○', text: 'No funds held yet — escrow starts when a Finder claims this.' };
  if (status === 'completed') return { cls: 'released', icon: '✅', text: `Escrow released — Finder paid back cost + finder's fee.` };
  return { cls: 'held', icon: '🔒', text: 'Funds held in escrow — released only on confirmed handoff.' };
}
const money = (n) => (n ? '$' + Number(n).toLocaleString() : '—');

function actionsFor(r) {
  if (!session) return '';
  const me = profile?.id;
  const isBuyer = r.buyerId === me;
  const isFinder = r.finderId === me;
  if (r.status === 'open' && !isBuyer)
    return `<div class="actions"><button class="btn btn-sm" data-act="claim" data-id="${r.id}">Claim this find</button></div>`;
  if (r.status === 'claimed' && isFinder)
    return `<div class="actions"><button class="btn btn-sm" data-act="found" data-id="${r.id}">📸 Mark found + add proof</button></div>`;
  if (r.status === 'found' && (isFinder || isBuyer))
    return `<div class="actions"><button class="btn btn-sm" data-act="complete" data-id="${r.id}">Confirm handoff → release funds</button></div>`;
  return '';
}

function findCard(r) {
  const esc = escrowState(r.status);
  const photo = r.photoUrl ? `<a class="proof-img" href="${r.photoUrl}" target="_blank" rel="noopener"><img src="${r.photoUrl}" alt="proof photo" loading="lazy" /></a>` : '';
  const proof = r.proof ? `<div class="proof">📸 ${r.proof}</div>` : '';
  const finderLine = r.finderName ? ` · Finder: <b>${r.finderName}</b>` : '';
  return `
    <article class="find">
      <div class="find-top">
        <div>
          <h4>${r.title}</h4>
          ${r.detail ? `<p class="detail">${r.detail}</p>` : ''}
        </div>
        <span class="chip ${r.status}">${STATUS_LABEL[r.status]}</span>
      </div>
      <div class="tags">
        <span class="tag">${r.category}</span>
        ${r.size ? `<span class="tag">${r.size}</span>` : ''}
        ${r.region ? `<span class="tag">📍 ${r.region}</span>` : ''}
        <span class="tag">⏱ ${r.deadline}</span>
      </div>
      <div class="meta">
        <span>Max price: <b>${money(r.maxPrice)}</b></span>
        <span>Finder's fee: <b>${money(r.reward)}</b></span>
        <span>Buyer: <b>${r.buyerName}</b>${finderLine}</span>
      </div>
      <div class="escrow ${esc.cls}"><span>${esc.icon}</span><span>${esc.text}</span></div>
      ${photo}
      ${proof}
      ${actionsFor(r)}
    </article>`;
}

function renderFeed() {
  const feed = $('#feed');
  $('#feed-count').textContent = cache.length ? `${cache.length} finds` : '';
  feed.innerHTML = cache.length ? cache.map(findCard).join('') : `<p class="muted">No finds yet — post one!</p>`;
}

function renderAuthUI() {
  const slot = $('#auth-slot');
  const bar = $('#demo-auth');
  if (session && profile) {
    const roles = ['buyer', 'finder', 'both'];
    slot.innerHTML = `<span class="user-chip">👤 ${profile.full_name || profile.email}</span>
      <button class="btn btn-ghost btn-sm" id="logout-btn">Log out</button>`;
    bar.innerHTML = `
      <div class="signed-in">
        <span>Signed in as <b>${profile.full_name || profile.email}</b>
          ${profile.rating ? `· ⭐ ${profile.rating}` : ''}</span>
        <span class="role-pick">I want to:
          ${roles.map((x) => `<button class="rolepill ${profile.role === x ? 'on' : ''}" data-role="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}
        </span>
      </div>`;
    $('#post-panel').classList.remove('hidden');
    $('#logout-btn').addEventListener('click', doLogout);
    $$('.rolepill').forEach((b) => b.addEventListener('click', () => setRole(b.dataset.role)));
  } else {
    slot.innerHTML = `<button class="btn btn-ghost btn-sm" data-open="login">Log in</button>
      <button class="btn btn-sm" data-open="signup">Sign up</button>`;
    bar.innerHTML = `<div class="signed-out">👋 <b>Log in or sign up</b> to post a find or claim one. Browsing is open to everyone.
      <button class="btn btn-sm" data-open="signup">Get started</button></div>`;
    $('#post-panel').classList.add('hidden');
    $$('[data-open]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.open)));
  }
  renderFeed(); // action buttons depend on auth state
}

// ---- data -------------------------------------------------------------------
async function refreshFinds() {
  cache = await api('/api/requests');
  renderFeed();
}
async function refreshMe() {
  profile = session ? await api('/api/me').catch(() => null) : null;
}

// ---- auth actions -----------------------------------------------------------
function openModal(mode) { setMode(mode); $('#auth-modal').classList.remove('hidden'); }
function closeModal() { $('#auth-modal').classList.add('hidden'); $('#auth-error').textContent = ''; }
function setMode(mode) {
  authMode = mode;
  $$('.mtab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
  $('#auth-submit').textContent = mode === 'signup' ? 'Create account' : 'Log in';
  $('#name-row').style.display = mode === 'signup' ? 'flex' : 'none';
}

async function doLogout() {
  await sb.auth.signOut();
  session = null; profile = null;
  renderAuthUI();
}

async function setRole(role) {
  profile = await api('/api/profile', { method: 'POST', body: { role } });
  renderAuthUI();
}

// ---- boot -------------------------------------------------------------------
(async () => {
  const cfg = await (await fetch('/api/config')).json();
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.anonKey);

  // restore any existing session
  const { data } = await sb.auth.getSession();
  session = data.session;

  // react to login/logout
  sb.auth.onAuthStateChange(async (_evt, s) => {
    session = s;
    await refreshMe();
    renderAuthUI();
    await refreshFinds();
  });

  await refreshMe();
  renderAuthUI();
  await refreshFinds();

  // modal wiring
  $('#modal-close').addEventListener('click', closeModal);
  $('#auth-modal').addEventListener('click', (e) => { if (e.target.id === 'auth-modal') closeModal(); });
  $$('.mtab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#auth-error'); err.textContent = '';
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (authMode === 'signup') {
        const { error } = await sb.auth.signUp({
          email: fd.email, password: fd.password,
          options: { data: { full_name: fd.full_name || '' } },
        });
        if (error) throw error;
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: fd.email, password: fd.password });
        if (error) throw error;
      }
      closeModal();
      e.target.reset();
    } catch (ex) {
      err.textContent = ex.message || 'Something went wrong.';
    }
  });

  // post a find
  $('#post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/api/requests', { method: 'POST', body });
      e.target.reset();
      await refreshFinds();
      $('#feed').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) { alert(ex.message); }
  });

  // claim / advance actions on the feed
  $('#feed').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    btn.disabled = true;
    try {
      if (act === 'claim') await api(`/api/requests/${id}/claim`, { method: 'POST' });
      else if (act === 'found') {
        const proof = prompt('Add proof — where you found it, price, condition:', 'Found at Marshalls Green Hills — $39.99, great condition.');
        if (proof === null) { btn.disabled = false; return; }
        await api(`/api/requests/${id}/advance`, { method: 'POST', body: { proof } });
      } else if (act === 'complete') await api(`/api/requests/${id}/advance`, { method: 'POST' });
      await refreshFinds();
    } catch (ex) { alert(ex.message); btn.disabled = false; }
  });
})();
