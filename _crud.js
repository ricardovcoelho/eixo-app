// api/_crud.js — handler genérico de CRUD com RLS por usuário
const { getSupabaseWithAuth, cors, getUserId } = require('./_supabase');

async function handleCrud(req, res, table, extraSelect) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });

  const sb = getSupabaseWithAuth(token);
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Token inválido.' });

  try {
    // GET — list all
    if (req.method === 'GET') {
      let q = sb.from(table).select(extraSelect || '*').eq('user_id', userId).order('created_at', { ascending: true });
      const { data, error } = await q;
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    // POST — create
    if (req.method === 'POST') {
      const body = { ...req.body, user_id: userId };
      const { data, error } = await sb.from(table).insert(body).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json(data);
    }

    // PATCH — update
    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'ID obrigatório.' });
      const { data, error } = await sb.from(table).update(req.body).eq('id', id).eq('user_id', userId).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    // DELETE
    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'ID obrigatório.' });
      const { error } = await sb.from(table).delete().eq('id', id).eq('user_id', userId);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

module.exports = { handleCrud };
