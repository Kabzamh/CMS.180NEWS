import supabase from './db-client.js';
import { cors, okOptions, fail, requireMember } from './_helpers.js';

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('articles').select('tags');
      if (error) throw error;
      const map = new Map();
      for (const row of data || []) {
        for (const t of row.tags || []) {
          const tag = String(t).trim();
          if (!tag) continue;
          const key = tag.toLowerCase();
          const cur = map.get(key) || { tag, count: 0 };
          cur.count += 1;
          map.set(key, cur);
        }
      }
      const list = [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
      return res.status(200).json(list);
    }

    if (req.method === 'PUT') {
      if (!['owner', 'editor'].includes(auth.member.role)) {
        return fail(res, 403, 'Only editors can rename tags.');
      }
      const from = String(req.body?.from || '').trim();
      const to = String(req.body?.to || '').trim();
      if (!from || !to) return fail(res, 400, 'Provide from and to tag names.');

      const { data: arts, error } = await supabase.from('articles').select('id, tags');
      if (error) throw error;
      let changed = 0;
      for (const a of arts || []) {
        const tags = a.tags || [];
        let dirty = false;
        const next = tags.map((t) => {
          if (String(t).toLowerCase() === from.toLowerCase()) {
            dirty = true;
            return to;
          }
          return t;
        });
        const deduped = [...new Set(next.map((t) => t))];
        if (dirty) {
          await supabase.from('articles').update({ tags: deduped }).eq('id', a.id);
          changed += 1;
        }
      }
      return res.status(200).json({ ok: true, changed });
    }

    if (req.method === 'DELETE') {
      if (!['owner', 'editor'].includes(auth.member.role)) {
        return fail(res, 403, 'Only editors can remove tags.');
      }
      const tag = String(req.body?.tag || '').trim();
      if (!tag) return fail(res, 400, 'Missing tag.');
      const { data: arts } = await supabase.from('articles').select('id, tags');
      for (const a of arts || []) {
        const next = (a.tags || []).filter((t) => String(t).toLowerCase() !== tag.toLowerCase());
        if (next.length !== (a.tags || []).length) {
          await supabase.from('articles').update({ tags: next }).eq('id', a.id);
        }
      }
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('tags error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
