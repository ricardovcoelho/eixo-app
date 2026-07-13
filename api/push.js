// api/push.js — inscreve/desinscreve o dispositivo do usuário para notificações push
const { getSupabaseWithAuth, cors, getVerifiedUserId } = require('./_supabase');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const userId = await getVerifiedUserId(token);
  if (!userId) return res.status(401).json({ error: 'Token inválido ou expirado.' });

  const sb = getSupabaseWithAuth(token);

  try {
    // POST — salva/atualiza a inscrição deste navegador
    if (req.method === 'POST') {
      const { endpoint, keys } = req.body || {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Assinatura push inválida.' });
      }
      const { data, error } = await sb
        .from('push_subscriptions')
        .upsert(
          { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
          { onConflict: 'endpoint' }
        )
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json(data);
    }

    // DELETE — remove a inscrição deste navegador (desativar notificações)
    if (req.method === 'DELETE') {
      const endpoint = req.query.endpoint || req.body?.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'Endpoint obrigatório.' });
      const { error } = await sb
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
        .eq('user_id', userId);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
