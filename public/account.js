/* FindIt4You — My Account dashboard. Uses window.FI (lib.js). */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let acct = null;

  const STATUS_LABEL = { open: 'Open', claimed: 'Claimed', found: 'Found', completed: 'Completed', cancelled: 'Cancelled' };
  const KIND_LABEL = { deposit: 'Pre-load', hold: 'Escrow hold', release: 'Release', refund: 'Refund', payout: 'Payout', fee: 'Fee', adjustment: 'Adjustment' };

  // compact find card for the dashboard
  function miniCard(f, { release } = {}) {
    const photo = f.photoUrl ? `<a class="mini-thumb" href="${f.photoUrl}" target="_blank" rel="noopener"><img src="${f.photoUrl}" alt="proof" loading="lazy"/></a>` : '';
    const relBtn = (release && f.status === 'found')
      ? `<button class="btn btn-sm" data-release="${f.id}">Review & release</button>` : '';
    return `
      <article class="mini">
        ${photo}
        <div class="mini-main">
          <div class="mini-top"><h4>${FI.esc(f.title)}</h4><span class="chip ${f.status}">${STATUS_LABEL[f.status]}</span></div>
          <div class="mini-meta">
            <span>Max ${FI.dollars(f.maxPrice)}</span><span>Fee ${FI.dollars(f.reward)}</span>
            ${f.finderName ? `<span>Finder: ${FI.esc(f.finderName)}</span>` : ''}
            ${f.region ? `<span>📍 ${FI.esc(f.region)}</span>` : ''}
          </div>
          ${f.proof ? `<div class="mini-proof">📸 ${FI.esc(f.proof)}</div>` : ''}
          <div class="mini-actions"><a class="link" href="/#market">Open in marketplace →</a>${relBtn}</div>
        </div>
      </article>`;
  }
  const list = (arr, opts) => arr.length ? `<div class="mini-list">${arr.map((f) => miniCard(f, opts)).join('')}</div>` : `<div class="empty">Nothing here yet.</div>`;

  function renderOverview() {
    const p = $('[data-panel="overview"]');
    const w = acct.wallet;
    p.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><span class="stat-n">${FI.money(w.balanceCents)}</span><span class="stat-l">Wallet balance</span></div>
        <div class="stat"><span class="stat-n">${acct.buying.length}</span><span class="stat-l">Current buys</span></div>
        <div class="stat"><span class="stat-n">${acct.finding.length}</span><span class="stat-l">Active finder jobs</span></div>
        <div class="stat"><span class="stat-n">${acct.watchlist.length}</span><span class="stat-l">On your watchlist</span></div>
      </div>
      <div class="overview-cols">
        <div><h3>Recent buys</h3>${list(acct.buying.slice(0, 3))}</div>
        <div><h3>Recent finder jobs</h3>${list(acct.finding.slice(0, 3))}</div>
      </div>`;
  }
  const renderBuying = () => { $('[data-panel="buying"]').innerHTML = `<h3>Current Buys</h3><p class="muted">Finds you've posted that are still in progress.</p>${list(acct.buying, { release: true })}`; };
  const renderOrders = () => { $('[data-panel="orders"]').innerHTML = `<h3>Past Orders</h3><p class="muted">Completed & cancelled finds.</p>${list(acct.pastOrders)}`; };
  const renderFinding = () => {
    $('[data-panel="finding"]').innerHTML =
      `<h3>Active jobs</h3><p class="muted">Finds you've claimed and are working.</p>${list(acct.finding)}
       <h3 style="margin-top:28px">Completed</h3>${list(acct.finderPast)}`;
  };
  const renderWatchlist = () => { $('[data-panel="watchlist"]').innerHTML = `<h3>Watchlist</h3><p class="muted">Finds you're keeping an eye on.</p>${list(acct.watchlist)}`; };

  function renderWallet() {
    const w = acct.wallet;
    const rows = w.entries.length
      ? w.entries.map((e) => `<tr><td>${FI.fmtDate(e.createdAt)}</td><td>${KIND_LABEL[e.kind] || e.kind}</td>
          <td class="${e.amountCents >= 0 ? 'pos' : 'neg'}">${e.amountCents >= 0 ? '+' : ''}${FI.money(e.amountCents)}</td>
          <td class="muted">${FI.esc(e.note || '')}</td></tr>`).join('')
      : `<tr><td colspan="4" class="muted">No transactions yet.</td></tr>`;
    $('[data-panel="wallet"]').innerHTML = `
      <div class="wallet-head">
        <div><span class="wlabel">Balance</span><div class="wbal-lg">${FI.money(w.balanceCents)}</div></div>
        <button class="btn" id="wallet-preload">⚡ Pre-load funds</button>
      </div>
      <p class="preload-note">Demo balance — no real charge. Secure Stripe funding is coming; this lets you feel the flow.</p>
      <h3>Transaction history</h3>
      <table class="ledger"><thead><tr><th>When</th><th>Type</th><th>Amount</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
    $('#wallet-preload').addEventListener('click', preload);
  }

  function renderProfile() {
    const p = acct.profile;
    const roles = ['buyer', 'finder', 'both', 'undecided'];
    $('[data-panel="profile"]').innerHTML = `
      <h3>Your profile</h3>
      <form id="profile-form" class="profile-form">
        <div class="role-opts small">
          ${roles.map((r) => `<button type="button" class="roleopt ${p.role === r ? 'is-on' : ''}" data-prole="${r}">${r === 'undecided' ? 'Not sure' : r[0].toUpperCase() + r.slice(1)}</button>`).join('')}
        </div>
        <div class="grid2">
          <label>Full name<input name="full_name" value="${FI.esc(p.full_name || '')}"/></label>
          <label>Phone<input name="phone" value="${FI.esc(p.phone || '')}"/></label>
        </div>
        <label>Email<input value="${FI.esc(p.email || '')}" disabled/></label>
        <label>Street address<input name="address_line1" value="${FI.esc(p.address_line1 || '')}"/></label>
        <label>Apt / unit<input name="address_line2" value="${FI.esc(p.address_line2 || '')}"/></label>
        <div class="grid3">
          <label>City<input name="city" value="${FI.esc(p.city || '')}"/></label>
          <label>State<input name="state" value="${FI.esc(p.state || '')}" maxlength="2"/></label>
          <label>ZIP<input name="postal_code" value="${FI.esc(p.postal_code || '')}"/></label>
        </div>
        <button class="btn" type="submit">Save changes</button>
        <span class="save-ok" id="save-ok" hidden>✓ Saved</span>
        <p class="fi-err" id="profile-err"></p>
      </form>`;
    let prole = p.role;
    $$('[data-prole]').forEach((b) => b.addEventListener('click', () => { prole = b.dataset.prole; $$('[data-prole]').forEach((x) => x.classList.toggle('is-on', x === b)); }));
    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#profile-err'); err.textContent = '';
      const body = Object.fromEntries(new FormData(e.target)); body.role = prole;
      try { await FI.api('/api/profile', { method: 'POST', body }); $('#save-ok').hidden = false; setTimeout(() => ($('#save-ok').hidden = true), 2000); await FI.renderNav(); }
      catch (ex) { err.textContent = ex.message; }
    });
  }

  const RENDER = { overview: renderOverview, buying: renderBuying, orders: renderOrders, finding: renderFinding, watchlist: renderWatchlist, wallet: renderWallet, profile: renderProfile };

  function renderAll() {
    $('#acct-name').textContent = acct.profile.full_name || acct.profile.email;
    $('#acct-email').textContent = acct.profile.email;
    $('#acct-role').textContent = acct.profile.role === 'undecided' ? 'Not sure yet' : acct.profile.role;
    $('#acct-balance').textContent = FI.money(acct.wallet.balanceCents);
    Object.values(RENDER).forEach((fn) => fn());
  }

  async function load() {
    acct = await FI.api('/api/account');
    renderAll();
    $('#acct-loading').classList.add('hidden');
    $('#acct-body').classList.remove('hidden');
    $('#acct-signedout').classList.add('hidden');
  }

  async function preload() {
    const val = window.prompt('Pre-load amount (USD). Demo — no real charge.', '50');
    if (val == null) return;
    const cents = Math.round(parseFloat(val) * 100);
    if (!cents || cents < 100) { alert('Enter at least $1.'); return; }
    try { await FI.api('/api/wallet/deposit', { method: 'POST', body: { amountCents: cents } }); await load(); await FI.renderNav(); }
    catch (ex) { alert(ex.message); }
  }

  function wireTabs() {
    $$('.atab').forEach((t) => t.addEventListener('click', () => {
      $$('.atab').forEach((x) => x.classList.toggle('is-on', x === t));
      $$('.atab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== t.dataset.tab));
    }));
    $('#preload-btn').addEventListener('click', preload);
    document.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-release]'); if (!r) return;
      if (!window.confirm('Release funds to the Finder? Only do this if the proof looks right.')) return;
      try { await FI.api(`/api/requests/${r.dataset.release}/advance`, { method: 'POST' }); await load(); } catch (ex) { alert(ex.message); }
    });
  }

  function onAuth() {
    if (FI.session) { load().catch((e) => { $('#acct-loading').textContent = e.message; }); }
    else { $('#acct-loading').classList.add('hidden'); $('#acct-body').classList.add('hidden'); $('#acct-signedout').classList.remove('hidden'); }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    wireTabs();
    $('#so-login').addEventListener('click', () => FI.openModal('login'));
    await FI.boot();
    FI.onAuth(onAuth);
    onAuth();
  });
})();
