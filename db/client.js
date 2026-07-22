/**
 * Supabase client for the server.
 *
 * Uses the SERVICE ROLE key — full DB access, trusted server-side only.
 * NEVER ship this key to the browser. The browser uses the anon key (for auth).
 *
 * Reads config from environment (.env). If Supabase isn't configured yet,
 * `isConfigured` is false and the server falls back to the flat-file demo,
 * so the prototype keeps working until you paste in your keys.
 */
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isConfigured = Boolean(SUPABASE_URL && SERVICE_ROLE);

let supabase = null;
if (isConfigured) {
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Verify a user's access token (from the browser's Supabase session) and
 * return the auth user, or null. Used to authenticate API requests.
 */
async function getUserFromToken(accessToken) {
  if (!isConfigured || !accessToken) return null;
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) return null;
  return data.user || null;
}

module.exports = { supabase, isConfigured, getUserFromToken };
