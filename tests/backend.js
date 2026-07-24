/* Backend API tests against the local dev server (:4400). Run: node --env-file=.env.local tests/backend.js */
const { createClient } = require('../node_modules/@supabase/supabase-js');
const admin = require('../db/client.js');
const BASE = 'http://localhost:4400';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ' — ' + extra : ''}`); }

async function api(path, tok, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

(async () => {
  const cfg = await (await fetch(BASE + '/api/config')).json();
  const mk = () => createClient(cfg.supabaseUrl, cfg.anonKey);
  const signIn = async (email) => (await mk().auth.signInWithPassword({ email, password: 'findit4you-demo' })).data.session.access_token;

  const buyerTok = await signIn('ashley@demo.findit4you.app');
  const finderTok = await signIn('jayme@demo.findit4you.app');
  const otherTok = await signIn('carla@demo.findit4you.app');
  ok('sign in demo accounts', buyerTok && finderTok && otherTok);

  // ---- full-info signup → profile persisted ----
  const email = `test_${Date.now()}@demo.findit4you.app`;
  const sb = mk();
  const su = await sb.auth.signUp({ email, password: 'findit4you-demo', options: { data: { full_name: 'Test User' } } });
  ok('signup returns session', !!su.data.session, su.error?.message);
  const newTok = su.data.session.access_token;
  const prof = await api('/api/profile', newTok, 'POST', {
    full_name: 'Test User', phone: '615-555-0100', role: 'both',
    address_line1: '1 Test St', city: 'Nashville', state: 'TN', postal_code: '37201',
  });
  ok('profile PATCH full info', prof.status === 200 && prof.j.city === 'Nashville' && prof.j.role === 'both', JSON.stringify(prof.j.state));
  const me = await api('/api/me', newTok);
  ok('/api/me returns profile + walletCents', me.status === 200 && me.j.phone === '615-555-0100' && typeof me.j.walletCents === 'number');

  // ---- wallet: deposit + balance + ledger ----
  const dep = await api('/api/wallet/deposit', newTok, 'POST', { amountCents: 5000 });
  ok('wallet deposit', dep.status === 201 && dep.j.balanceCents === 5000, 'bal=' + dep.j.balanceCents);
  const dep2 = await api('/api/wallet/deposit', newTok, 'POST', { amountCents: 2500 });
  ok('wallet deposit accrues', dep2.j.balanceCents === 7500);
  const wallet = await api('/api/wallet', newTok);
  ok('wallet ledger', wallet.j.balanceCents === 7500 && wallet.j.entries.length === 2 && wallet.j.entries[0].kind === 'deposit');
  const badDep = await api('/api/wallet/deposit', newTok, 'POST', { amountCents: 10 });
  ok('deposit min guard (400)', badDep.status === 400);

  // ---- buyer posts a find ----
  const created = await api('/api/requests', buyerTok, 'POST', { title: 'TEST — Owala 24oz', category: 'Drinkware', maxPrice: 30, reward: 10, region: 'Nashville, TN' });
  const fid = created.j.id;
  ok('post find', created.status === 201 && fid);

  // ---- watchlist add/list/remove ----
  const wadd = await api(`/api/watchlist/${fid}`, finderTok, 'POST');
  ok('watchlist add', wadd.status === 201);
  const wlist = await api('/api/watchlist', finderTok);
  ok('watchlist list contains find', wlist.status === 200 && wlist.j.some((f) => f.id === fid));
  const wdel = await api(`/api/watchlist/${fid}`, finderTok, 'DELETE');
  const wlist2 = await api('/api/watchlist', finderTok);
  ok('watchlist remove', wdel.status === 200 && !wlist2.j.some((f) => f.id === fid));

  // ---- claim + guards ----
  const claim = await api(`/api/requests/${fid}/claim`, finderTok, 'POST');
  ok('finder claims', claim.status === 200 && claim.j.status === 'claimed');
  const dbl = await api(`/api/requests/${fid}/claim`, otherTok, 'POST');
  ok('double-claim guard (409)', dbl.status === 409);
  const noauth = await api(`/api/requests/${fid}/claim`, null, 'POST');
  ok('claim needs auth (401)', noauth.status === 401);

  // ---- upload proof (sign → PUT → advance) ----
  const sign = await api('/api/uploads/sign', finderTok, 'POST', { findId: fid, contentType: 'image/png' });
  ok('upload sign scoped', sign.status === 200 && sign.j.path.startsWith(`finds/${fid}/`));
  const up = await mk().storage.from('proofs').uploadToSignedUrl(sign.j.path, sign.j.token, PNG, { contentType: 'image/png' });
  ok('upload to signed url', !up.error, up.error?.message);
  const adv = await api(`/api/requests/${fid}/advance`, finderTok, 'POST', { proof: 'Found at Target — $24.99', photoPath: sign.j.path });
  ok('advance→found with photo', adv.status === 200 && adv.j.status === 'found' && !!adv.j.photoUrl);
  const badSign = await api('/api/uploads/sign', otherTok, 'POST', { findId: fid, contentType: 'image/png' });
  ok('upload sign guard non-party (403)', badSign.status === 403);
  const img = await fetch(adv.j.photoUrl);
  ok('signed photo fetch', img.status === 200 && (img.headers.get('content-type') || '').startsWith('image/'));

  // ---- buyer releases (receipt confirm → completed) ----
  const rel = await api(`/api/requests/${fid}/advance`, buyerTok, 'POST');
  ok('buyer releases → completed', rel.status === 200 && rel.j.status === 'completed');

  // ---- chat ----
  const post = await api(`/api/finds/${fid}/messages`, buyerTok, 'POST', { body: 'Thanks!' });
  ok('chat post', post.status === 201);
  const read = await api(`/api/finds/${fid}/messages`, finderTok);
  ok('chat read (finder)', read.status === 200 && read.j.length === 1 && read.j[0].body === 'Thanks!');
  const blocked = await api(`/api/finds/${fid}/messages`, otherTok);
  ok('chat guard non-party (403)', blocked.status === 403);
  const empty = await api(`/api/finds/${fid}/messages`, buyerTok, 'POST', { body: '  ' });
  ok('empty message (400)', empty.status === 400);

  // ---- account summary ----
  const acct = await api('/api/account', buyerTok);
  ok('account summary', acct.status === 200 && Array.isArray(acct.j.pastOrders) && acct.j.pastOrders.some((f) => f.id === fid) && typeof acct.j.wallet.balanceCents === 'number');

  // ---- cleanup test data ----
  await admin.supabase.storage.from('proofs').remove([sign.j.path]);
  await admin.supabase.from('finds').delete().eq('id', fid);
  await admin.supabase.auth.admin.deleteUser(su.data.user.id);

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH:', e.message); process.exit(1); });
