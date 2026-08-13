// api/auth.js — login, cadastro, logout, refresh, perfil, senha
const { getSupabase, getSupabaseWithAuth, cors } = require('./_supabase');
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
      if (!refresh_token) return res.status(401).json({ error: 'Sem refresh token.' });
      const { data, error } = await sb.auth.refreshSession({ refresh_token });
      if (error || !data.session) return res.status(401).json({ error: 'Sessão expirada.' });
      return res.json({ token: data.session.access_token, refresh_token: data.session.refresh_token });
    }

    if (action === 'update_profile') {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Não autenticado.' });
      const { data: userData, error: userErr } = await sb.auth.getUser(token);
      if (userErr || !userData?.user) return res.status(401).json({ error: 'Token inválido.' });
      const { name: newName, email: newEmail } = req.body;
      const updates = { user_metadata: { name: newName } };
      if (newEmail && newEmail !== userData.user.email) updates.email = newEmail;
      const { data, error } = await sb.auth.admin.updateUserById(userData.user.id, updates);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true, user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name } });
    }

    if (action === 'update_password') {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Não autenticado.' });
      const { data: userData, error: userErr } = await sb.auth.getUser(token);
      if (userErr || !userData?.user) return res.status(401).json({ error: 'Token inválido.' });
      const { password: newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Senha precisa ter ao menos 6 caracteres.' });
      const { error } = await sb.auth.admin.updateUserById(userData.user.id, { password: newPassword });
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }

    // Esqueci minha senha — dispara o e-mail de recuperação do próprio Supabase
    if (action === 'request_password_reset') {
      if (!email) return res.status(400).json({ error: 'Informe o email.' });
      const siteUrl = req.headers.origin || 'https://eixo-app-kk8v.vercel.app';
      await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl + '/' });
      // Sempre responde sucesso, exista ou não a conta — evita revelar quais emails têm cadastro
      return res.json({ success: true });
    }

    // Confirma a nova senha usando o token que veio no link do email
    if (action === 'confirm_password_reset') {
      const { access_token, password: newPassword } = req.body;
      if (!access_token) return res.status(400).json({ error: 'Link inválido ou expirado. Peça um novo.' });
      if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Senha precisa ter ao menos 6 caracteres.' });
      const { data: userData, error: userErr } = await sb.auth.getUser(access_token);
      if (userErr || !userData?.user) return res.status(401).json({ error: 'Link inválido ou expirado. Peça um novo.' });
      const { error } = await sb.auth.admin.updateUserById(userData.user.id, { password: newPassword });
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
