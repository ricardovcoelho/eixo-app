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

// Verifica o token REALMENTE contra o Supabase Auth (assinatura + expiração).
// Usa o client com a ANON key (não a service key) chamando getUser(token),
// que é o jeito correto e documentado de validar um access_token de usuário.
async function getVerifiedUserId(token) {
  if (!token) return null;
  try {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

module.exports = { getSupabase, getSupabaseWithAuth, cors, getVerifiedUserId };
