import supabase from './db-client.js';
import { requireMember, logActivity, clean, fail } from './_lib.js';

async function allTagged() {
  const { data, error } = await supabase.from('articles').select('id, tags').limit(5000);
  if (error) throw error;
  return data.filter((a) => Array.isArray(a.tags) && a.tags.length);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const member = await requireMember(req, res);
      if (!member) return;
      const rows = await allTagged();
      const map = new Map();
      for (const row of rows) {
        for (const tag of row.tags) {
          const key = String(tag).toLowerCase();
          const entry = map.get(key) || { tag: String(tag), count: 0 };
          entry.count += 1;
          map.set(key, entry);
        }
      }
      const list = [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
      return res.status(200).json(list);
    }

    const member = await requireMember(req, res, ['owner', 'editor']);
    if (!member) return;

    if (req.method === 'PUT') {
      const from = clean(req.body?.from, 30);
      const to = clean(req.body?.to, 30).replace(/\s+/g, ' ');
      if (!from) return res.status(400).json({ error: 'Missing tag.' });
      if (!to) return res.status(400).json({ error: 'Type the new name for the tag.', fields: { to: 'Type the new name for the tag.' } });
      const fromKey = from.toLowerCase();
      const toKey = to.toLowerCase();
      const rows = (await allTagged()).filter((a) => a.tags.some((t) => String(t).toLowerCase() === fromKey));
      const results = await Promise.all(
        rows.map((row) => {
          const seen = new Set();
          const next = [];
          for (const t of row.tags) {
            const value = String(t).toLowerCase() === fromKey ? to : String(t);
            const key = value.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            next.push(key === toKey ? to : value);
          }
          return supabase.from('articles').update({ tags: next }).eq('id', row.id);
        }),
      );
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      await logActivity(member, 'updated', 'tag', null, `${member.name} renamed the tag “${from}” to “${to}” on ${rows.length} ${rows.length === 1 ? 'story' : 'stories'}`);
      return res.status(200).json({ ok: true, changed: rows.length });
    }

    if (req.method === 'DELETE') {
      const tag = clean(req.body?.tag, 30);
      if (!tag) return res.status(400).json({ error: 'Missing tag.' });
      const key = tag.toLowerCase();
      const rows = (await allTagged()).filter((a) => a.tags.some((t) => String(t).toLowerCase() === key));
      const results = await Promise.all(
        rows.map((row) =>
          supabase
            .from('articles')
            .update({ tags: row.tags.filter((t) => String(t).toLowerCase() !== key) })
            .eq('id', row.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      await logActivity(member, 'deleted', 'tag', null, `${member.name} removed the tag “${tag}” from ${rows.length} ${rows.length === 1 ? 'story' : 'stories'}`);
      return res.status(200).json({ ok: true, changed: rows.length });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    fail(res, err);
  }
}
