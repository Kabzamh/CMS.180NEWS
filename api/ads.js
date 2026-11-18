import supabase from './db-client.js';
import { requireMember, logActivity, clean, isHttpUrl, fail } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const member = await requireMember(req, res, ['owner', 'editor']);
    if (!member) return;

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('ads').select('*').order('sort', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const id = Number(body.id);
      if (!id) return res.status(400).json({ error: 'Missing advert slot.' });
      const { data: slot, error: findError } = await supabase.from('ads').select('*').eq('id', id).maybeSingle();
      if (findError) throw findError;
      if (!slot) return res.status(404).json({ error: 'That advert slot no longer exists.' });

      const fields = {};
      const advertiser = clean(body.advertiser, 80);
      const imageUrl = clean(body.image_url, 600);
      const linkUrl = clean(body.link_url, 600);
      const enabled = body.enabled === true;
      const positions = Array.isArray(slot.positions) ? slot.positions.map((p) => p[0]) : [];
      const position = positions.includes(body.position) ? body.position : slot.position;

      if (linkUrl && !isHttpUrl(linkUrl)) fields.link_url = 'Enter a full web address that starts with https://';
      if (imageUrl && !isHttpUrl(imageUrl)) fields.image_url = 'The image link is not valid. Upload the image again.';
      if (enabled && !imageUrl) fields.image_url = 'Add the advert image before switching this slot on.';
      if (Object.keys(fields).length) return res.status(400).json({ error: 'Check the highlighted fields.', fields });

      const { data, error } = await supabase
        .from('ads')
        .update({
          advertiser,
          image_url: imageUrl || null,
          link_url: linkUrl || null,
          position,
          enabled,
          width: Number(body.width) > 0 && imageUrl ? Math.round(Number(body.width)) : null,
          height: Number(body.height) > 0 && imageUrl ? Math.round(Number(body.height)) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await logActivity(member, 'updated', 'ad', id, `${member.name} updated the ${slot.slot_name} advert`);
      return res.status(200).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    fail(res, err);
  }
}
