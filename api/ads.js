import supabase from './db-client.js';
import { cors, okOptions, fail, requireMember } from './_helpers.js';

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('ads').select('*').order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'PUT') {
      if (!['owner', 'editor'].includes(auth.member.role)) {
        return fail(res, 403, 'Only editors can manage ads.');
      }
      const b = req.body || {};
      if (!b.id) return fail(res, 400, 'Missing ad id.');
      const patch = {};
      for (const k of ['advertiser', 'link_url', 'image_url', 'position', 'enabled', 'width', 'height', 'slot', 'slot_name']) {
        if (b[k] !== undefined) patch[k] = b[k];
      }
      const { data, error } = await supabase.from('ads').update(patch).eq('id', b.id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('ads error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
