/**
 * FindIt4You — API server (Supabase-backed).
 *
 * Browsing finds is public (so the landing demo stays alive without login).
 * Posting / claiming / advancing a find requires a logged-in user: the browser
 * signs in with Supabase Auth and sends its access token as a Bearer header,
 * which we verify here. All DB access uses the service-role client.
 */
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { supabase, isConfigured, getUserFromToken } = require('./db/client.js');

const PORT = process.env.PORT || 4200;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const STATUS_FLOW = ['open', 'claimed', 'found', 'completed'];

// finds + embedded buyer/finder profile names (two FKs to profiles → disambiguate by constraint)
const FIND_SELECT =
  '*, buyer:profiles!finds_buyer_id_fkey(id,full_name,rating), finder:profiles!finds_finder_id_fkey(id,full_name,rating)';

// ---- helpers ----------------------------------------------------------------
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

async function authUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  return getUserFromToken(token);
}

// shape a find row for the frontend
function shapeFind(r) {
  return {
    id: r.id,
    title: r.title, detail: r.detail, category: r.category, size: r.size,
    maxPrice: r.max_price, reward: r.reward, region: r.region, deadline: r.deadline,
    status: r.status, proof: r.proof, photoUrl: r.photo_url,
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

  try {
    // Public: browser needs the anon key to init Supabase Auth client
    if (url === '/api/config' && req.method === 'GET') {
      return send(res, 200, {
        supabaseUrl: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
      });
    }

    // Public: browse finds
    if (url === '/api/requests' && req.method === 'GET') {
      const { data, error } = await supabase
        .from('finds').select(FIND_SELECT).order('created_at', { ascending: false });
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, data.map(shapeFind));
    }

    // Everything below requires auth
    const user = await authUser(req);

    // Who am I? (returns profile)
    if (url === '/api/me' && req.method === 'GET') {
      if (!user) return send(res, 401, { error: 'not logged in' });
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, { email: user.email, ...data });
    }

    // Update my profile (role / name / region)
    if (url === '/api/profile' && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'not logged in' });
      const b = await readBody(req);
      const patch = {};
      if (b.role && ['buyer', 'finder', 'both'].includes(b.role)) patch.role = b.role;
      if (typeof b.full_name === 'string') patch.full_name = b.full_name.slice(0, 120);
      if (typeof b.region === 'string') patch.region = b.region.slice(0, 120);
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select().single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, data);
    }

    // Post a find (buyer)
    if (url === '/api/requests' && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'log in to post a find' });
      const b = await readBody(req);
      if (!b.title) return send(res, 400, { error: 'title required' });
      const { data, error } = await supabase.from('finds').insert({
        buyer_id: user.id,
        title: String(b.title).slice(0, 120),
        detail: String(b.detail || '').slice(0, 500),
        category: b.category || 'Other',
        size: b.size || '',
        max_price: Number(b.maxPrice) || null,
        reward: Number(b.reward) || null,
        region: b.region || '',
        deadline: b.deadline || 'Flexible',
      }).select(FIND_SELECT).single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 201, shapeFind(data));
    }

    // Claim a find (finder)
    const claimMatch = url.match(/^\/api\/requests\/([^/]+)\/claim$/);
    if (claimMatch && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'log in to claim' });
      const { data: find, error: e1 } = await supabase.from('finds').select('*').eq('id', claimMatch[1]).single();
      if (e1 || !find) return send(res, 404, { error: 'find not found' });
      if (find.status !== 'open') return send(res, 409, { error: 'already claimed' });
      if (find.buyer_id === user.id) return send(res, 400, { error: "can't claim your own find" });
      const { data, error } = await supabase.from('finds')
        .update({ finder_id: user.id, status: 'claimed' }).eq('id', find.id).select(FIND_SELECT).single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, shapeFind(data));
    }

    // Advance status (buyer or finder on the find)
    const advMatch = url.match(/^\/api\/requests\/([^/]+)\/advance$/);
    if (advMatch && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'log in' });
      const b = await readBody(req);
      const { data: find, error: e1 } = await supabase.from('finds').select('*').eq('id', advMatch[1]).single();
      if (e1 || !find) return send(res, 404, { error: 'find not found' });
      if (![find.buyer_id, find.finder_id].includes(user.id))
        return send(res, 403, { error: 'not your find' });
      const idx = STATUS_FLOW.indexOf(find.status);
      const patch = {};
      if (idx >= 0 && idx < STATUS_FLOW.length - 1) patch.status = STATUS_FLOW[idx + 1];
      if (b.proof) patch.proof = String(b.proof).slice(0, 500);
      const { data, error } = await supabase.from('finds').update(patch).eq('id', find.id).select(FIND_SELECT).single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, shapeFind(data));
    }

    return send(res, 404, { error: 'unknown endpoint' });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  FindIt4You running → http://localhost:${PORT}  (Supabase: ${isConfigured ? 'connected' : 'NOT configured'})\n`);
});
