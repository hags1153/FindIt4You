// Finder prototype — front-end logic for the live demo.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let role = 'buyer';
let cache = [];

const api = {
  list: () => fetch('/api/requests').then((r) => r.json()),
  create: (body) => fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()),
  claim: (id, finderName) => fetch(`/api/requests/${id}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finderName }) }).then((r) => r.json()),
  advance: (id, proof) => fetch(`/api/requests/${id}/advance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proof }) }).then((r) => r.json()),
  reset: () => fetch('/api/reset', { method: 'POST' }).then((r) => r.json()),
};

const STATUS_LABEL = { open: 'Open', claimed: 'Claimed', found: 'Found', completed: 'Completed' };

function escrowState(status) {
  if (status === 'open') return { cls: '', icon: '○', text: 'No funds held yet — escrow starts when a Finder claims this.' };
  if (status === 'completed') return { cls: 'released', icon: '✅', text: `Escrow released — Finder paid back cost + finder's fee.` };
  return { cls: 'held', icon: '🔒', text: 'Funds held in escrow — released only on confirmed handoff.' };
}

function money(n) { return n ? '$' + Number(n).toLocaleString() : '—'; }

function findCard(r) {
  const esc = escrowState(r.status);
  const isBuyer = role === 'buyer';

  // Action buttons depend on role + status
  let actions = '';
  if (!isBuyer) {
    if (r.status === 'open') {
      actions = `<div class="actions"><button class="btn btn-sm" data-act="claim" data-id="${r.id}">Claim this find</button></div>`;
    } else if (r.status === 'claimed') {
      actions = `<div class="actions"><button class="btn btn-sm" data-act="found" data-id="${r.id}">📸 Mark found + add proof</button></div>`;
    } else if (r.status === 'found') {
      actions = `<div class="actions"><button class="btn btn-sm" data-act="complete" data-id="${r.id}">Confirm handoff → release funds</button></div>`;
    }
  }

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
      ${proof}
      ${actions}
    </article>`;
}

function render() {
  const feed = $('#feed');
  let items = cache;
  // Finders primarily care about open + their active finds; buyers see everything.
  $('#feed-title').textContent = role === 'buyer' ? 'All finds' : 'Finds you can work';
  if (!items.length) { feed.innerHTML = `<p class="muted">No finds yet — post one!</p>`; return; }
  feed.innerHTML = items.map(findCard).join('');
}

async function refresh() {
  cache = await api.list();
  render();
}

// ---- events ----
$$('.role').forEach((b) => b.addEventListener('click', () => {
  $$('.role').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  role = b.dataset.role;
  $('#buyer-panel').classList.toggle('hidden', role !== 'buyer');
  $('#finder-panel').classList.toggle('hidden', role !== 'finder');
  render();
}));

$('#post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  await api.create(body);
  e.target.reset();
  await refresh();
  document.querySelector('#feed').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#feed').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  btn.disabled = true;
  if (act === 'claim') {
    const name = prompt('Claim as which Finder? (this is the demo — any name works)', 'Jayme');
    if (name === null) { btn.disabled = false; return; }
    await api.claim(id, name || 'A Finder');
  } else if (act === 'found') {
    const proof = prompt('Add proof — where did you find it, price, condition:', 'Found at Marshalls Green Hills — $39.99, perfect condition. Photo attached.');
    if (proof === null) { btn.disabled = false; return; }
    await api.advance(id, proof);
  } else if (act === 'complete') {
    await api.advance(id);
  }
  await refresh();
});

$('#reset').addEventListener('click', async () => {
  await api.reset();
  await refresh();
});

refresh();
