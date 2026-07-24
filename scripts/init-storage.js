/**
 * Create the storage bucket(s) the app needs. Idempotent.
 * Run against whichever env is loaded (e.g. node --env-file=.env.local scripts/init-storage.js).
 */
require('dotenv').config();
const { supabase, isConfigured } = require('../db/client.js');

(async () => {
  if (!isConfigured) { console.error('Supabase not configured'); process.exit(1); }
  const { data: existing } = await supabase.storage.getBucket('proofs');
  if (existing) { console.log('· proofs bucket already exists'); return; }
  const { error } = await supabase.storage.createBucket('proofs', {
    public: false,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic'],
  });
  console.log(error ? '✗ ' + error.message : '✓ created private bucket: proofs');
})().catch((e) => { console.error(e.message); process.exit(1); });
