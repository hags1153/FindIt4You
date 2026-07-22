/**
 * Finder — zero-dependency prototype server.
 * Serves the /public web prototype and a small JSON API backed by data/requests.json.
 * No npm install needed: pure Node http/fs. Start with `node server.js`.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4200;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'requests.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---- Seed data: real TJ Maxx / Marshalls / HomeGoods "finds" behavior ----
const SEED = [
  {
    title: 'Le Creuset 5.5qt Dutch Oven',
    detail: 'Any color, but cerise (red) is the dream. Round, not oval.',
    category: 'Home',
    size: '5.5 qt',
    maxPrice: 220,
    reward: 35,
    region: 'Nashville, TN',
    deadline: 'This week',
    buyerName: 'Ashley R.',
    status: 'open',
  },
  {
    title: 'Stanley Quencher 40oz — Rose Quartz',
    detail: 'The pink one everyone sells out of. Must be 40oz with handle.',
    category: 'Drinkware',
    size: '40 oz',
    maxPrice: 45,
    reward: 15,
    region: 'Nashville, TN',
    deadline: '3 days',
    buyerName: 'Mia T.',
    finderName: 'Jayme',
    status: 'claimed',
  },
  {
    title: 'Barefoot Dreams CozyChic blanket',
    detail: 'Throw size, cream or oatmeal. The soft ribbed one.',
    category: 'Home',
    size: 'Throw',
    maxPrice: 120,
    reward: 25,
    region: 'Franklin, TN',
    deadline: 'Flexible',
    buyerName: 'Dana K.',
    finderName: 'Jayme',
    status: 'found',
    proof: 'Found at HomeGoods Cool Springs — cream, $99.99. Photo attached.',
  },
  {
    title: 'UGG Tasman slippers — Women’s 8, Chestnut',
    detail: 'The suede moccasin slippers. Chestnut color, size 8.',
    category: 'Shoes',
    size: 'W8',
    maxPrice: 90,
    reward: 20,
    region: 'Nashville, TN',
    deadline: '1 week',
    buyerName: 'Priya S.',
    finderName: 'Carla',
    status: 'completed',
    proof: 'Picked up at Marshalls Green Hills, $79.99. Buyer confirmed pickup.',
  },
  {
    title: 'Diptyque Baies candle',
    detail: '190g classic size. Marshalls/TJ Maxx sometimes gets these.',
    category: 'Beauty',
    size: '190 g',
    maxPrice: 55,
    reward: 15,
    region: 'Brentwood, TN',
    deadline: '2 weeks',
    buyerName: 'Rebecca L.',
    status: 'open',
  },
];

// ---- Tiny JSON "DB" ----
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (_) { /* fall through to seed */ }
  return seed();
}

function seed() {
  const now = Date.now();
  const data = SEED.map((r, i) => ({
    id: 'req_' + (i + 1),
    photo: null,
    createdAt: now - (SEED.length - i) * 3600_000,
    ...r,
  }));
  saveData(data);
  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let requests = loadData();

// ---- helpers ----
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC)) { send(res, 403, { error: 'forbidden' }); return; }
  fs.readFile(filePath, (err, buf) => {
    if (err) { send(res, 404, { error: 'not found' }); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

const STATUS_FLOW = ['open', 'claimed', 'found', 'completed'];

// ---- server ----
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // API
  if (url.startsWith('/api/')) {
    // GET all requests
    if (url === '/api/requests' && req.method === 'GET') {
      return send(res, 200, requests);
    }
    // POST new request (buyer)
    if (url === '/api/requests' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.title) return send(res, 400, { error: 'title required' });
      const item = {
        id: 'req_' + Math.random().toString(36).slice(2, 9),
        title: String(b.title).slice(0, 120),
        detail: String(b.detail || '').slice(0, 500),
        category: b.category || 'Other',
        size: b.size || '',
        maxPrice: Number(b.maxPrice) || 0,
        reward: Number(b.reward) || 0,
        region: b.region || '',
        deadline: b.deadline || 'Flexible',
        buyerName: b.buyerName || 'You',
        finderName: null,
        status: 'open',
        proof: null,
        photo: null,
        createdAt: Date.now(),
      };
      requests.unshift(item);
      saveData(requests);
      return send(res, 201, item);
    }
    // POST claim  /api/requests/:id/claim
    const claimMatch = url.match(/^\/api\/requests\/([^/]+)\/claim$/);
    if (claimMatch && req.method === 'POST') {
      const b = await readBody(req);
      const item = requests.find((r) => r.id === claimMatch[1]);
      if (!item) return send(res, 404, { error: 'not found' });
      item.status = 'claimed';
      item.finderName = b.finderName || 'A Finder';
      saveData(requests);
      return send(res, 200, item);
    }
    // POST advance status  /api/requests/:id/advance
    const advMatch = url.match(/^\/api\/requests\/([^/]+)\/advance$/);
    if (advMatch && req.method === 'POST') {
      const b = await readBody(req);
      const item = requests.find((r) => r.id === advMatch[1]);
      if (!item) return send(res, 404, { error: 'not found' });
      const idx = STATUS_FLOW.indexOf(item.status);
      if (idx < STATUS_FLOW.length - 1) item.status = STATUS_FLOW[idx + 1];
      if (b.proof) item.proof = String(b.proof).slice(0, 500);
      saveData(requests);
      return send(res, 200, item);
    }
    // POST reset
    if (url === '/api/reset' && req.method === 'POST') {
      requests = seed();
      return send(res, 200, { ok: true, count: requests.length });
    }
    return send(res, 404, { error: 'unknown endpoint' });
  }

  // static
  return serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Finder prototype running → http://localhost:${PORT}\n`);
});
