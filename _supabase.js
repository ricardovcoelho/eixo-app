// api/_supabase.js — conexão segura com Supabase (credenciais nunca expostas)
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY; // service key — nunca vai ao frontend
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function getSupabaseWithAuth(token) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  return client;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getUserId(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  // Decode JWT to get user id (without verification — Supabase RLS handles that)
  try {
    const token = auth.split(' ')[1];
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub;
  } catch { return null; }
}

module.exports = { getSupabase, getSupabaseWithAuth, cors, getUserId };
