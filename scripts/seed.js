/**
 * Seed demo users + finds so the marketplace looks alive.
 * Idempotent-ish: skips creating a user that already exists, then (re)inserts finds.
 * Run: node scripts/seed.js
 *
 * Demo accounts all use the same password so you can log in and click around:
 *   password: findit4you-demo
 */
require('dotenv').config();
const { supabase, isConfigured } = require('../db/client.js');

const DEMO_PW = 'findit4you-demo';

const USERS = [
  { email: 'ashley@demo.findit4you.app', name: 'Ashley R.', role: 'buyer',  region: 'Nashville, TN' },
  { email: 'mia@demo.findit4you.app',    name: 'Mia T.',    role: 'buyer',  region: 'Nashville, TN' },
  { email: 'dana@demo.findit4you.app',   name: 'Dana K.',   role: 'buyer',  region: 'Franklin, TN' },
  { email: 'rebecca@demo.findit4you.app',name: 'Rebecca L.',role: 'buyer',  region: 'Brentwood, TN' },
  { email: 'priya@demo.findit4you.app',  name: 'Priya S.',  role: 'buyer',  region: 'Nashville, TN' },
  { email: 'jayme@demo.findit4you.app',  name: 'Jayme',     role: 'both',   region: 'Nashville, TN', rating: 4.9, ratings_count: 37 },
  { email: 'carla@demo.findit4you.app',  name: 'Carla',     role: 'finder', region: 'Nashville, TN', rating: 4.7, ratings_count: 12 },
];

const FINDS = [
  { buyer: 'ashley@demo.findit4you.app', title: 'Le Creuset 5.5qt Dutch Oven',
    detail: 'Any color, but cerise (red) is the dream. Round, not oval.',
    category: 'Home', size: '5.5 qt', max_price: 220, reward: 35, region: 'Nashville, TN', deadline: 'This week', status: 'open' },
  { buyer: 'mia@demo.findit4you.app', finder: 'jayme@demo.findit4you.app', title: 'Stanley Quencher 40oz — Rose Quartz',
    detail: 'The pink one everyone sells out of. Must be 40oz with handle.',
    category: 'Drinkware', size: '40 oz', max_price: 45, reward: 15, region: 'Nashville, TN', deadline: '3 days', status: 'claimed' },
  { buyer: 'dana@demo.findit4you.app', finder: 'jayme@demo.findit4you.app', title: 'Barefoot Dreams CozyChic blanket',
    detail: 'Throw size, cream or oatmeal. The soft ribbed one.',
    category: 'Home', size: 'Throw', max_price: 120, reward: 25, region: 'Franklin, TN', deadline: 'Flexible', status: 'found',
    proof: 'Found at HomeGoods Cool Springs — cream, $99.99. Photo attached.' },
  { buyer: 'priya@demo.findit4you.app', finder: 'carla@demo.findit4you.app', title: 'UGG Tasman slippers — Women’s 8, Chestnut',
    detail: 'The suede moccasin slippers. Chestnut color, size 8.',
    category: 'Shoes', size: 'W8', max_price: 90, reward: 20, region: 'Nashville, TN', deadline: '1 week', status: 'completed',
    proof: 'Picked up at Marshalls Green Hills, $79.99. Buyer confirmed pickup.' },
  { buyer: 'rebecca@demo.findit4you.app', title: 'Diptyque Baies candle',
    detail: '190g classic size. Marshalls/TJ Maxx sometimes gets these.',
    category: 'Beauty', size: '190 g', max_price: 55, reward: 15, region: 'Brentwood, TN', deadline: '2 weeks', status: 'open' },
];

async function findUserByEmail(email) {
  // paginate through auth users to find an existing one
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureUser(u) {
  let existing = await findUserByEmail(u.email);
  let id;
  if (existing) {
    id = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email, password: DEMO_PW, email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error) throw error;
    id = data.user.id;
  }
  // upsert profile fields (trigger creates the row; we enrich it)
  const { error: pErr } = await supabase.from('profiles').update({
    full_name: u.name, role: u.role, region: u.region,
    rating: u.rating || 0, ratings_count: u.ratings_count || 0,
  }).eq('id', id);
  if (pErr) throw pErr;
  return id;
}

(async () => {
  if (!isConfigured) { console.error('Supabase not configured — set .env first.'); process.exit(1); }

  console.log('Seeding users…');
  const ids = {};
  for (const u of USERS) { ids[u.email] = await ensureUser(u); console.log('  ✓', u.name, '→', u.email); }

  console.log('Resetting demo finds…');
  // wipe existing finds owned by demo buyers so re-seeding is clean
  const demoIds = Object.values(ids);
  await supabase.from('finds').delete().in('buyer_id', demoIds);

  console.log('Inserting finds…');
  for (const f of FINDS) {
    const row = {
      buyer_id: ids[f.buyer], finder_id: f.finder ? ids[f.finder] : null,
      title: f.title, detail: f.detail, category: f.category, size: f.size,
      max_price: f.max_price, reward: f.reward, region: f.region, deadline: f.deadline,
      status: f.status, proof: f.proof || null,
    };
    const { error } = await supabase.from('finds').insert(row);
    if (error) throw error;
    console.log('  ✓', f.title, `(${f.status})`);
  }

  console.log('\nDone. Demo login password for all accounts:', DEMO_PW);
})().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
