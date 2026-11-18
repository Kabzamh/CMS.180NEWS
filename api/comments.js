import supabase from './db-client.js';
import { cors, okOptions, fail, requireMember } from './_helpers.js';

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    if (req.method === 'GET') {
      if (req.query.counts === '1') {
        const { data } = await supabase.from('comments').select('status');
        const pending = (data || []).filter((c) => c.status === 'pending').length;
        return res.status(200).json({ pending });
      }

      let query = supabase
        .from('comments')
        .select('*, articles(id, headline)')
        .order('created_at', { ascending: false });
      if (req.query.status && req.query.status !== 'all') query = query.eq('status', req.query.status);
      if (req.query.q) query = query.or(`name.ilike.%${req.query.q}%,body.ilike.%${req.query.q}%`);

      const { data, error } = await query;
      if (error) throw error;

      const items = (data || []).map((c) => ({
        id: c.id,
        article_id: c.article_id,
        name: c.name,
        body: c.body,
        status: c.status,
        created_at: c.created_at,
        headline: c.articles?.headline || '',
      }));
      return res.status(200).json({ items });
    }

    if (req.method === 'PUT') {
      if (!['owner', 'editor'].includes(auth.member.role)) {
        return fail(res, 403, 'Only editors can moderate comments.');
      }
      const { id, status } = req.body || {};
      if (!id || !status) return fail(res, 400, 'Missing id or status.');
      const { data, error } = await supabase
        .from('comments')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!['owner', 'editor'].includes(auth.member.role)) {
        return fail(res, 403, 'Only editors can delete comments.');
      }
      const { id } = req.body || {};
      if (!id) return fail(res, 400, 'Missing id.');
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('comments error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
