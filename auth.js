// api/auth.js — login, cadastro, logout
const { getSupabase, cors } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sb = getSupabase();
  const { action, email, password, name } = req.body || {};

  try {
    if (action === 'signup') {
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password,
        user_metadata: { name: name || email.split('@')[0] },
        email_confirm: true
      });
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true, user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name } });
    }

    if (action === 'login') {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return res.status(401).json({ error: 'Email ou senha incorretos.' });
      return res.json({
        token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || email.split('@')[0]
        }
      });
    }

    if (action === 'refresh') {
      const { refresh_token } = req.body;
      const { data, error } = await sb.auth.refreshSession({ refresh_token });
      if (error) return res.status(401).json({ error: 'Sessão expirada.' });
      return res.json({ token: data.session.access_token, refresh_token: data.session.refresh_token });
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
