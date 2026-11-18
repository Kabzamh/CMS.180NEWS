import supabase from './db-client.js';
import { cors, okOptions, fail, requireMember, slugify } from './_helpers.js';

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('sections')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;

      const { data: arts } = await supabase.from('articles').select('section, status');
      const counts = {};
      for (const a of arts || []) {
        if (!a.section) continue;
        counts[a.section] = (counts[a.section] || 0) + 1;
      }
      return res.status(200).json(
        (data || []).map((s) => ({ ...s, count: counts[s.slug] || 0 }))
      );
    }

    if (req.method === 'POST') {
      if (!['owner', 'editor'].includes(auth.member.role)) {
        return fail(res, 403, 'Only editors can add categories.');
      }
      const label = String(req.body?.label || '').trim();
      if (label.length < 2) {
        return fail(res, 400, 'Check the form.', { label: 'Give the category a name (at least 2 characters).' });
      }
      let slug = slugify(label);
      const { data: existing } = await supabase.from('sections').select('id').eq('slug', slug).maybeSingle();
      if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

      const { data: maxRow } = await supabase
        .from('sections')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      const sort_order = (maxRow?.sort_order ?? 0) + 1;

      const { data, error } = await supabase
        .from('sections')
        .insert({ label, slug, enabled: true, sort_order })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ ...data, count: 0 });
    }

    if (req.method === 'PUT') {
      if (!['owner', 'editor'].includes(auth.member.role)) {
        return fail(res, 403, 'Only editors can change categories.');
      }
      const body = req.body || {};

      if (body.action === 'reorder' && Array.isArray(body.ids)) {
        for (let i = 0; i < body.ids.length; i++) {
          await supabase.from('sections').update({ sort_order: i + 1 }).eq('id', body.ids[i]);
        }
        const { data } = await supabase.from('sections').select('*').order('sort_order');
        return res.status(200).json(data || []);
      }

      if (!body.id) return fail(res, 400, 'Missing category id.');
      const patch = {};
      if (body.label !== undefined) {
        const label = String(body.label).trim();
        if (label.length < 2) {
          return fail(res, 400, 'Check the form.', { label: 'Give the category a name (at least 2 characters).' });
        }
        patch.label = label;
      }
      if (body.enabled !== undefined) patch.enabled = !!body.enabled;

      const { data, error } = await supabase
        .from('sections')
        .update(patch)
        .eq('id', body.id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (auth.member.role !== 'owner') return fail(res, 403, 'Only the owner can delete categories.');
      const { id } = req.body || {};
      if (!id) return fail(res, 400, 'Missing category id.');
      const { error } = await supabase.from('sections').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('sections error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
