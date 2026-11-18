import supabase from './db-client.js';
import { requireMember, logActivity, clean, fail } from './_lib.js';

const STATUSES = ['pending', 'approved', 'rejected', 'spam'];
const VERB = { approved: 'approved', rejected: 'rejected', spam: 'marked as spam', pending: 'moved back to pending' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const member = await requireMember(req, res, ['owner', 'editor']);
    if (!member) return;

    if (req.method === 'GET') {
      if (req.query.counts) {
        const { count, error } = await supabase.from('comments').select('id', { count: 'exact', head: true }).eq('status', 'pending');
        if (error) throw error;
        return res.status(200).json({ pending: count || 0 });
      }

      let query = supabase.from('comments').select('*').order('created_at', { ascending: false }).limit(200);
      if (STATUSES.includes(req.query.status)) query = query.eq('status', req.query.status);
      const search = clean(req.query.q, 80).replace(/[%_,()\\]/g, ' ').trim();
      if (search) query = query.ilike('body', `%${search}%`);

      const [list, all] = await Promise.all([query, supabase.from('comments').select('status').limit(10000)]);
      if (list.error) throw list.error;
      if (all.error) throw all.error;
      const counts = { all: all.data.length, pending: 0, approved: 0, rejected: 0, spam: 0 };
      for (const row of all.data) counts[row.status] = (counts[row.status] || 0) + 1;

      const ids = [...new Set(list.data.map((c) => c.article_id))];
      const headlines = new Map();
      if (ids.length) {
        const { data, error } = await supabase.from('articles').select('id, headline').in('id', ids);
        if (error) throw error;
        for (const a of data) headlines.set(a.id, a.headline);
      }
      return res.status(200).json({
        items: list.data.map((c) => ({ ...c, article_headline: headlines.get(c.article_id) || null })),
        counts,
      });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
      if (!ids.length) return res.status(400).json({ error: 'Missing comment.' });
      if (!STATUSES.includes(body.status)) return res.status(400).json({ error: 'Unknown status.' });
      const { data, error } = await supabase
        .from('comments')
        .update({ status: body.status, moderated_by: member.name, moderated_at: new Date().toISOString() })
        .in('id', ids)
        .select('id, author_name');
      if (error) throw error;
      if (data.length) {
        const what = data.length === 1 ? `a comment from ${data[0].author_name}` : `${data.length} comments`;
        await logActivity(member, 'updated', 'comment', data.length === 1 ? data[0].id : null, `${member.name} ${VERB[body.status]} ${what}`);
      }
      return res.status(200).json({ ok: true, changed: data.length });
    }

    if (req.method === 'DELETE') {
      const id = Number(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Missing comment.' });
      const { data: existing, error: findError } = await supabase.from('comments').select('id, author_name').eq('id', id).maybeSingle();
      if (findError) throw findError;
      if (!existing) return res.status(200).json({ ok: true });
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw error;
      await logActivity(member, 'deleted', 'comment', id, `${member.name} deleted a comment from ${existing.author_name}`);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    fail(res, err);
  }
}
