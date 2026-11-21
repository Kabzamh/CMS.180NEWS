import supabase from './db-client.js';
import { requireMember, logActivity, clean, slugify, fail } from './_lib.js';

async function listWithCounts() {
  const [sections, articles] = await Promise.all([
    supabase.from('sections').select('*').order('position', { ascending: true }).order('id', { ascending: true }),
    supabase.from('articles').select('section').limit(5000),
  ]);
  if (sections.error) throw sections.error;
  if (articles.error) throw articles.error;
  const counts = {};
  for (const a of articles.data) if (a.section) counts[a.section] = (counts[a.section] || 0) + 1;
  return sections.data.map((s) => ({ ...s, count: counts[s.slug] || 0 }));
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
      return res.status(200).json(await listWithCounts());
    }

    const member = await requireMember(req, res, ['owner', 'editor']);
    if (!member) return;

    if (req.method === 'POST') {
      const label = clean(req.body?.label, 40);
      if (label.length < 2) {
        return res.status(400).json({ error: 'Give the category a name.', fields: { label: 'Give the category a name (at least 2 characters).' } });
      }
      const slug = slugify(label);
      if (!slug) return res.status(400).json({ error: 'Use letters or numbers in the name.', fields: { label: 'Use letters or numbers in the name.' } });
      const { data: all, error: allError } = await supabase.from('sections').select('slug, label, position');
      if (allError) throw allError;
      if (all.some((s) => s.slug === slug || s.label.toLowerCase() === label.toLowerCase())) {
        return res.status(400).json({ error: 'There is already a category with that name.', fields: { label: 'There is already a category with that name.' } });
      }
      const position = all.reduce((max, s) => Math.max(max, s.position || 0), 0) + 1;
      const { data, error } = await supabase.from('sections').insert({ slug, label, enabled: true, position }).select().single();
      if (error) throw error;
      await logActivity(member, 'created', 'section', data.id, `${member.name} added the ${label} category`);
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      if (body.action === 'reorder') {
        const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
        if (!ids.length) return res.status(400).json({ error: 'Nothing to reorder.' });
        const results = await Promise.all(
          ids.map((id, index) => supabase.from('sections').update({ position: index + 1 }).eq('id', id)),
        );
        const failed = results.find((r) => r.error);
        if (failed) throw failed.error;
        return res.status(200).json(await listWithCounts());
      }

      const id = Number(body.id);
      if (!id) return res.status(400).json({ error: 'Missing category id.' });
      const { data: existing, error: findError } = await supabase.from('sections').select('*').eq('id', id).maybeSingle();
      if (findError) throw findError;
      if (!existing) return res.status(404).json({ error: 'That category no longer exists.' });

      const patch = {};
      if (body.label !== undefined) {
        const label = clean(body.label, 40);
        if (label.length < 2) {
          return res.status(400).json({ error: 'Give the category a name.', fields: { label: 'Give the category a name (at least 2 characters).' } });
        }
        const { data: clash, error: clashError } = await supabase.from('sections').select('id, label').neq('id', id);
        if (clashError) throw clashError;
        if (clash.some((s) => s.label.toLowerCase() === label.toLowerCase())) {
          return res.status(400).json({ error: 'There is already a category with that name.', fields: { label: 'There is already a category with that name.' } });
        }
        patch.label = label;
      }
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change.' });

      const { data, error } = await supabase.from('sections').update(patch).eq('id', id).select().single();
      if (error) throw error;
      const summary =
        patch.label && patch.label !== existing.label
          ? `${member.name} renamed the ${existing.label} category to ${patch.label}`
          : `${member.name} switched the ${data.label} category ${data.enabled ? 'on' : 'off'}`;
      await logActivity(member, 'updated', 'section', id, summary);
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = Number(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Missing category id.' });
      const { data: existing, error: findError } = await supabase.from('sections').select('*').eq('id', id).maybeSingle();
      if (findError) throw findError;
      if (!existing) return res.status(200).json({ ok: true });
      const { data: used, error: usedError } = await supabase.from('articles').select('id').eq('section', existing.slug).limit(1);
      if (usedError) throw usedError;
      if (used.length) {
        return res.status(400).json({
          error: `${existing.label} still has stories in it. Move or delete them first, or switch the category off instead.`,
        });
      }
      const { error } = await supabase.from('sections').delete().eq('id', id);
      if (error) throw error;
      await logActivity(member, 'deleted', 'section', id, `${member.name} removed the ${existing.label} category`);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    fail(res, err);
  }
}
