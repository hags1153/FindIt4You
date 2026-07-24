/* FindIt4You — shared client library (FI). Loaded on every page after vendor/supabase.js. */
window.FI = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  let sb = null;
  let session = null;
  let profile = null;
  const authCbs = [];

  const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

  // ---------- formatting ----------
  const money = (cents) => '$' + ((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dollars = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString());
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
           d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- api ----------
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

  // ---------- image compression (canvas → JPEG ~1200px) ----------
  function compressImage(file, maxDim = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale); height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('compression failed')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read image')); };
      img.src = url;
    });
  }

  // upload a proof/receipt image for a find; returns the stored path
  async function uploadProof(findId, file) {
    const blob = await compressImage(file);
    const sign = await api('/api/uploads/sign', { method: 'POST', body: { findId, contentType: 'image/jpeg' } });
    const up = await sb.storage.from('proofs').uploadToSignedUrl(sign.path, sign.token, blob, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    return sign.path;
  }

  // ---------- auth modal (injected once) ----------
  const stateOpts = US_STATES.map((s) => `<option>${s}</option>`).join('');
  const MODAL_HTML = `
  <div id="fi-modal" class="modal hidden" aria-hidden="true">
    <div class="modal-card">
      <button class="modal-x" data-close aria-label="close">✕</button>

      <div data-panel="login">
        <h3 class="modal-title">Welcome back</h3>
        <form data-form="login" class="fi-form">
          <label>Email<input name="email" type="email" required autocomplete="email" placeholder="you@email.com"/></label>
          <label>Password<input name="password" type="password" required autocomplete="current-password" placeholder="••••••••"/></label>
          <button class="btn btn-block" type="submit">Log in</button>
          <p class="fi-err" data-err></p>
        </form>
        <p class="modal-switch">New here? <a href="#" data-goto="signup">Create an account</a></p>
      </div>

      <div data-panel="signup" hidden>
        <h3 class="modal-title">Create your account</h3>
        <p class="modal-sub">Full details up front — so deals go smoothly and everyone's protected.</p>
        <form data-form="signup" class="fi-form">
          <div class="role-choose" data-rolechoose>
            <span class="role-choose-label">I want to…</span>
            <div class="role-opts">
              <button type="button" class="roleopt" data-role="buyer"><b>Buy</b><small>post finds</small></button>
              <button type="button" class="roleopt" data-role="finder"><b>Find</b><small>get paid</small></button>
              <button type="button" class="roleopt" data-role="both"><b>Both</b><small>either side</small></button>
              <button type="button" class="roleopt" data-role="undecided"><b>Not sure</b><small>decide later</small></button>
            </div>
          </div>
          <div class="grid2">
            <label>Full name<input name="full_name" required autocomplete="name" placeholder="Jane Doe"/></label>
            <label>Phone<input name="phone" type="tel" required autocomplete="tel" placeholder="(615) 555-0123"/></label>
          </div>
          <div class="grid2">
            <label>Email<input name="email" type="email" required autocomplete="email" placeholder="you@email.com"/></label>
            <label>Password<input name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="6+ characters"/></label>
          </div>
          <label>Street address<input name="address_line1" required autocomplete="address-line1" placeholder="123 Main St"/></label>
          <label>Apt / unit <span class="opt">(optional)</span><input name="address_line2" autocomplete="address-line2" placeholder="Apt 4B"/></label>
          <div class="grid3">
            <label>City<input name="city" required autocomplete="address-level2" placeholder="Nashville"/></label>
            <label>State<select name="state" required><option value="">—</option>${stateOpts}</select></label>
            <label>ZIP<input name="postal_code" required autocomplete="postal-code" inputmode="numeric" placeholder="37201"/></label>
          </div>
          <button class="btn btn-block" type="submit">Create account →</button>
          <p class="fi-err" data-err></p>
        </form>
        <p class="modal-switch">Already have an account? <a href="#" data-goto="login">Log in</a></p>
      </div>

      <div data-panel="preload" hidden>
        <h3 class="modal-title">⚡ Pre-load your account</h3>
        <p class="modal-sub">The best finds vanish fast. Keep a balance ready and you can lock in a deal the
          second it's posted — <b>no scramble for a card</b> while someone else grabs it.</p>
        <div class="preload-amts" data-amts>
          <button type="button" class="amtbtn" data-amt="2500">$25</button>
          <button type="button" class="amtbtn is-on" data-amt="5000">$50</button>
          <button type="button" class="amtbtn" data-amt="10000">$100</button>
          <button type="button" class="amtbtn" data-amt="20000">$200</button>
        </div>
        <p class="preload-note">Demo balance — no real charge, no card needed. Real funding arrives with secure Stripe checkout.</p>
        <button class="btn btn-block" data-preload-go>Pre-load <span data-amtlabel>$50.00</span></button>
        <button class="btn btn-ghost btn-block" data-preload-skip>Maybe later</button>
        <p class="fi-err" data-err></p>
      </div>
    </div>
  </div>`;

  let pendingRole = 'buyer';

  function mountModal() {
    if ($('#fi-modal')) return;
    document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
    const modal = $('#fi-modal');
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.hasAttribute('data-close')) closeModal(); });
    $$('[data-goto]', modal).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); showPanel(a.dataset.goto); }));
    // role picker
    $$('.roleopt', modal).forEach((b) => b.addEventListener('click', () => {
      pendingRole = b.dataset.role;
      $$('.roleopt', modal).forEach((x) => x.classList.toggle('is-on', x === b));
    }));
    // login
    $('[data-form="login"]', modal).addEventListener('submit', onLogin);
    // signup
    $('[data-form="signup"]', modal).addEventListener('submit', onSignup);
    // preload
    $$('.amtbtn', modal).forEach((b) => b.addEventListener('click', () => {
      $$('.amtbtn', modal).forEach((x) => x.classList.toggle('is-on', x === b));
      $('[data-amtlabel]', modal).textContent = money(Number(b.dataset.amt));
    }));
    $('[data-preload-go]', modal).addEventListener('click', onPreload);
    $('[data-preload-skip]', modal).addEventListener('click', async () => { await finishOnboarding(); closeModal(); });
  }

  function showPanel(name) {
    const modal = $('#fi-modal');
    $$('[data-panel]', modal).forEach((p) => (p.hidden = p.dataset.panel !== name));
    $$('[data-err]', modal).forEach((e) => (e.textContent = ''));
  }
  function openModal(mode = 'login', role) {
    mountModal();
    if (role) { pendingRole = role; }
    const modal = $('#fi-modal');
    $$('.roleopt', modal).forEach((x) => x.classList.toggle('is-on', x.dataset.role === pendingRole));
    showPanel(mode);
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    const modal = $('#fi-modal');
    if (modal) { modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true'); }
  }

  async function onLogin(e) {
    e.preventDefault();
    const f = e.target; const err = $('[data-err]', f.closest('[data-panel]'));
    err.textContent = ''; const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const fd = Object.fromEntries(new FormData(f));
      const { error } = await sb.auth.signInWithPassword({ email: fd.email, password: fd.password });
      if (error) throw error;
      f.reset(); closeModal();
    } catch (ex) { err.textContent = ex.message || 'Could not log in.'; }
    finally { btn.disabled = false; }
  }

  async function onSignup(e) {
    e.preventDefault();
    const f = e.target; const err = $('[data-err]', f.closest('[data-panel]'));
    err.textContent = ''; const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const fd = Object.fromEntries(new FormData(f));
      if (!fd.state) throw new Error('Please choose your state.');
      const { error } = await sb.auth.signUp({
        email: fd.email, password: fd.password, options: { data: { full_name: fd.full_name } },
      });
      if (error) throw error;
      // wait for session (email confirm is off), then save full profile
      await refreshSession();
      await api('/api/profile', { method: 'POST', body: {
        full_name: fd.full_name, phone: fd.phone, role: pendingRole,
        address_line1: fd.address_line1, address_line2: fd.address_line2,
        city: fd.city, state: fd.state, postal_code: fd.postal_code,
      } });
      await refreshProfile();
      f.reset();
      showPanel('preload'); // nudge to pre-load
    } catch (ex) { err.textContent = ex.message || 'Could not create account.'; }
    finally { btn.disabled = false; }
  }

  async function onPreload(e) {
    const btn = e.currentTarget; const modal = $('#fi-modal');
    const err = $('[data-err]', $('[data-panel="preload"]', modal));
    const amt = Number(($('.amtbtn.is-on', modal) || {}).dataset?.amt || 5000);
    err.textContent = ''; btn.disabled = true;
    try {
      await api('/api/wallet/deposit', { method: 'POST', body: { amountCents: amt } });
      await finishOnboarding();
      closeModal();
      window.location.href = '/account.html';
    } catch (ex) { err.textContent = ex.message || 'Could not pre-load.'; btn.disabled = false; }
  }

  async function finishOnboarding() {
    try { await api('/api/profile', { method: 'POST', body: { onboarding_complete: true } }); await refreshProfile(); } catch {}
  }

  // ---------- session ----------
  async function refreshSession() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    return session;
  }
  async function refreshProfile() {
    profile = session ? await api('/api/me').catch(() => null) : null;
    return profile;
  }

  // ---------- top nav ----------
  function renderNav() {
    const slot = $('#auth-slot');
    if (!slot) return;
    if (session && profile) {
      slot.innerHTML = `
        <a class="nav-wallet" href="/account.html" title="Wallet balance">💳 ${money(profile.walletCents)}</a>
        <a class="btn btn-sm btn-ghost" href="/account.html">My Account</a>
        <button class="btn btn-sm" data-logout>Log out</button>`;
      $('[data-logout]', slot).addEventListener('click', logout);
    } else {
      slot.innerHTML = `
        <button class="btn btn-sm btn-ghost" data-login>Log in</button>
        <button class="btn btn-sm" data-signup>Sign up</button>`;
      $('[data-login]', slot).addEventListener('click', () => openModal('login'));
      $('[data-signup]', slot).addEventListener('click', () => openModal('signup'));
    }
  }

  async function logout() { await sb.auth.signOut(); session = null; profile = null; emit(); }

  function onAuth(cb) { authCbs.push(cb); }
  function emit() { renderNav(); authCbs.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } }); }

  // ---------- boot ----------
  async function boot() {
    const cfg = await (await fetch('/api/config')).json();
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.anonKey);
    mountModal();
    await refreshSession();
    await refreshProfile();
    sb.auth.onAuthStateChange(async (_e, s) => { session = s; await refreshProfile(); emit(); });
    emit();
  }

  return {
    boot, api, openModal, closeModal, logout, onAuth, renderNav,
    money, dollars, fmtDate, esc, uploadProof, compressImage,
    get sb() { return sb; }, get session() { return session; }, get profile() { return profile; },
    requireAuth: (mode = 'login') => { if (!session) { openModal(mode); return false; } return true; },
  };
})();
