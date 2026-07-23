/**
 * Migration runner — applies db/migrations/*.sql in order, once each.
 * Tracks applied files in a _migrations table. Idempotent + transactional.
 *
 * Needs DATABASE_URL in .env (Supabase → Project Settings → Database →
 * Connection string → URI). Run: npm run migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set. Add it to .env (Supabase → Settings → Database → Connection string → URI).');
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('create table if not exists _migrations (name text primary key, applied_at timestamptz default now())');

  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const f of files) {
    const { rowCount } = await client.query('select 1 from _migrations where name=$1', [f]);
    if (rowCount) { console.log('· skip', f); continue; }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations(name) values($1)', [f]);
      await client.query('commit');
      console.log('✓ applied', f);
    } catch (e) {
      await client.query('rollback');
      console.error('✗ failed', f, '→', e.message);
      await client.end();
      process.exit(1);
    }
  }
  await client.end();
  console.log('migrations up to date');
})().catch((e) => { console.error('migrate error:', e.message); process.exit(1); });
