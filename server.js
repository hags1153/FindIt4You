/**
 * FindIt4You — API server (Supabase-backed).
 *
 * Browsing finds is public. Posting / claiming / advancing / messaging / uploading
 * requires a logged-in user: the browser signs in with Supabase Auth and sends its
 * access token as a Bearer header, which we verify here. All DB access uses the
 * service-role client. Basic per-IP rate limiting + input validation applied to /api.
 */
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase, isConfigured, getUserFromToken } = require('./db/client.js');

const PORT = process.env.PORT || 4200;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const BUCKET = 'proofs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const STATUS_FLOW = ['open', 'claimed', 'found', 'completed'];
const CATEGORIES = ['Home', 'Drinkware', 'Shoes', 'Beauty', 'Kids', 'Clothing', 'Toys', 'Other'];
const UPLOAD_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/heic': 'heic' };

const FIND_SELECT =
  '*, buyer:profiles!finds_buyer_id_fkey(id,full_name,rating), finder:profiles!finds_finder_id_fkey(id,full_name,rating)';

// ---- security: simple per-IP fixed-window rate limiter ----------------------
const RL_WINDOW_MS = 60_000;
const RL_MAX = 300;                 // requests per IP per minute on /api
const rlBuckets = new Map();        // ip -> { count, resetAt }
function rateLimited(ip) {
  const now = Date.now();
  let b = rlBuckets.get(ip);
  if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + RL_WINDOW_MS }; rlBuckets.set(ip, b); }
  b.count += 1;
  return b.count > RL_MAX ? Math.ceil((b.resetAt - now) / 1000) : 0;
}
// occasional cleanup so the map can't grow unbounded
setInterval(() => { const now = Date.now(); for (const [ip, b] of rlBuckets) if (now > b.resetAt) rlBuckets.delete(ip); }, 5 * RL_WINDOW_MS).unref();

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
}

// ---- validation helpers -----------------------------------------------------
const clampStr = (v, n) => String(v ?? '').slice(0, n);
function numOrNull(v, { min = 0, max = 1_000_000 } = {}) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

// ---- helpers ----------------------------------------------------------------
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

function readBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = ''; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('payload too large')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

async function authUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  return getUserFromToken(token);
}

async function getFind(id) {
  const { data } = await supabase.from('finds').select('*').eq('id', id).single();
  return data || null;
}
const isParty = (find, uid) => find && (find.buyer_id === uid || find.finder_id === uid);

// batch-sign photo paths for display (private bucket → time-limited URLs)
async function signPhotos(rows) {
  const paths = rows.map((r) => r.photo_url).filter(Boolean);
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const map = {};
  (data || []).forEach((d) => { if (d.signedUrl && d.path) map[d.path] = d.signedUrl; });
  return map;
}

function shapeFind(r, signed = {}) {
  return {
    id: r.id,
    title: r.title, detail: r.detail, category: r.category, size: r.size,
    maxPrice: r.max_price, reward: r.reward, region: r.region, deadline: r.deadline,
    status: r.status, proof: r.proof,
    photoUrl: r.photo_url ? (signed[r.photo_url] || null) : null,
    buyerName: r.buyer?.full_name || 'Someone',
    finderName: r.finder?.full_name || null,
    buyerId: r.buyer_id, finderId: r.finder_id,
    createdAt: r.created_at,
  };
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(filePath, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---- server -----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (!url.startsWith('/api/')) return serveStatic(req, res);
  if (!isConfigured) return send(res, 503, { error: 'Supabase not configured (.env missing)' });

  // rate limit
  const wait = rateLimited(clientIp(req));
  if (wait) return send(res, 429, { error: 'rate limit — slow down' }, { 'Retry-After': String(wait) });

  try {
    // ---- public ----
    if (url === '/api/config' && req.method === 'GET') {
      return send(res, 200, { supabaseUrl: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY });
    }

    if (url === '/api/requests' && req.method === 'GET') {
      const { data, error } = await supabase.from('finds').select(FIND_SELECT).order('created_at', { ascending: false });
      if (error) return send(res, 500, { error: error.message });
      const signed = await signPhotos(data);
      return send(res, 200, data.map((r) => shapeFind(r, signed)));
    }

    // ---- authed ----
    const user = await authUser(req);

    if (url === '/api/me' && req.method === 'GET') {
      if (!user) return send(res, 401, { error: 'not logged in' });
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, { email: user.email, ...data });
    }

    if (url === '/api/profile' && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'not logged in' });
      const b = await readBody(req);
      const patch = {};
      if (b.role && ['buyer', 'finder', 'both'].includes(b.role)) patch.role = b.role;
      if (typeof b.full_name === 'string') patch.full_name = clampStr(b.full_name, 120);
      if (typeof b.region === 'string') patch.region = clampStr(b.region, 120);
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select().single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, data);
    }

    if (url === '/api/requests' && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'log in to post a find' });
      const b = await readBody(req);
      const title = clampStr(b.title, 120).trim();
      if (!title) return send(res, 400, { error: 'title required' });
      const category = CATEGORIES.includes(b.category) ? b.category : 'Other';
      const { data, error } = await supabase.from('finds').insert({
        buyer_id: user.id, title,
        detail: clampStr(b.detail, 500), category, size: clampStr(b.size, 60),
        max_price: numOrNull(b.maxPrice), reward: numOrNull(b.reward),
        region: clampStr(b.region, 120), deadline: clampStr(b.deadline, 60) || 'Flexible',
      }).select(FIND_SELECT).single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 201, shapeFind(data));
    }

    const claimMatch = url.match(/^\/api\/requests\/([^/]+)\/claim$/);
    if (claimMatch && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'log in to claim' });
      const find = await getFind(claimMatch[1]);
      if (!find) return send(res, 404, { error: 'find not found' });
      if (find.status !== 'open') return send(res, 409, { error: 'already claimed' });
      if (find.buyer_id === user.id) return send(res, 400, { error: "can't claim your own find" });
      const { data, error } = await supabase.from('finds')
        .update({ finder_id: user.id, status: 'claimed' }).eq('id', find.id).select(FIND_SELECT).single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, shapeFind(data));
    }

    const advMatch = url.match(/^\/api\/requests\/([^/]+)\/advance$/);
    if (advMatch && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'log in' });
      const b = await readBody(req);
      const find = await getFind(advMatch[1]);
      if (!find) return send(res, 404, { error: 'find not found' });
      if (!isParty(find, user.id)) return send(res, 403, { error: 'not your find' });
      const idx = STATUS_FLOW.indexOf(find.status);
      const patch = {};
      if (idx >= 0 && idx < STATUS_FLOW.length - 1) patch.status = STATUS_FLOW[idx + 1];
      if (b.proof) patch.proof = clampStr(b.proof, 500);
      // accept a proof photo path (must live under this find's folder — prevents pointing at others' files)
      if (b.photoPath && String(b.photoPath).startsWith(`finds/${find.id}/`)) patch.photo_url = String(b.photoPath);
      const { data, error } = await supabase.from('finds').update(patch).eq('id', find.id).select(FIND_SELECT).single();
      if (error) return send(res, 500, { error: error.message });
      const signed = await signPhotos([data]);
      return send(res, 200, shapeFind(data, signed));
    }

    // ---- uploads: issue a signed URL to PUT a proof/receipt image ----
    if (url === '/api/uploads/sign' && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'log in' });
      const b = await readBody(req);
      const find = await getFind(b.findId);
      if (!find) return send(res, 404, { error: 'find not found' });
      if (!isParty(find, user.id)) return send(res, 403, { error: 'not your find' });
      const ext = UPLOAD_EXT[b.contentType];
      if (!ext) return send(res, 400, { error: 'unsupported image type' });
      const objectPath = `finds/${find.id}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(objectPath);
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, { path: objectPath, token: data.token, signedUrl: data.signedUrl });
    }

    // ---- chat: messages on a find (buyer & finder only) ----
    const msgMatch = url.match(/^\/api\/finds\/([^/]+)\/messages$/);
    if (msgMatch) {
      if (!user) return send(res, 401, { error: 'log in' });
      const find = await getFind(msgMatch[1]);
      if (!find) return send(res, 404, { error: 'find not found' });
      if (!isParty(find, user.id)) return send(res, 403, { error: 'not your conversation' });

      if (req.method === 'GET') {
        const { data, error } = await supabase.from('messages')
          .select('id, body, created_at, sender_id, sender:profiles!messages_sender_id_fkey(full_name)')
          .eq('find_id', find.id).order('created_at', { ascending: true });
        if (error) return send(res, 500, { error: error.message });
        return send(res, 200, data.map((m) => ({
          id: m.id, body: m.body, createdAt: m.created_at,
          senderId: m.sender_id, senderName: m.sender?.full_name || 'User',
          mine: m.sender_id === user.id,
        })));
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        const body = clampStr(b.body, 2000).trim();
        if (!body) return send(res, 400, { error: 'empty message' });
        const { data, error } = await supabase.from('messages')
          .insert({ find_id: find.id, sender_id: user.id, body }).select('id, created_at').single();
        if (error) return send(res, 500, { error: error.message });
        return send(res, 201, { id: data.id, createdAt: data.created_at, body, senderId: user.id, mine: true });
      }
    }

    return send(res, 404, { error: 'unknown endpoint' });
  } catch (e) {
    return send(res, e.message === 'payload too large' ? 413 : 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  FindIt4You running → http://localhost:${PORT}  (Supabase: ${isConfigured ? 'connected' : 'NOT configured'})\n`);
});
