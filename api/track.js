import supabase from './db-client.js';
import { cors, okOptions, fail } from './_helpers.js';

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

    const body = req.body || {};
    const kind = body.kind || req.query.kind;
    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    if (kind === 'page') {
      const path = String(body.path || '/').slice(0, 500);
      const referrer = String(body.referrer || '').slice(0, 500);
      const { error } = await supabase.from('page_visits').insert({
        path,
        referrer,
        visited_at: now.toISOString(),
        day,
      });
      if (error) throw error;
      return res.status(201).json({ ok: true });
    }

    if (kind === 'ad_click') {
      const adId = Number(body.ad_id);
      if (!adId) return fail(res, 400, 'Missing ad_id');
      const { error } = await supabase.from('ad_clicks').insert({
        ad_id: adId,
        slot: String(body.slot || '').slice(0, 80),
        page_path: String(body.page_path || '').slice(0, 500),
        clicked_at: now.toISOString(),
        day,
      });
      if (error) throw error;
      return res.status(201).json({ ok: true });
    }

    if (kind === 'ad_impression') {
      const adId = Number(body.ad_id);
      if (!adId) return fail(res, 400, 'Missing ad_id');
      const { error } = await supabase.from('ad_impressions').insert({
        ad_id: adId,
        slot: String(body.slot || '').slice(0, 80),
        page_path: String(body.page_path || '').slice(0, 500),
        viewed_at: now.toISOString(),
        day,
      });
      if (error) throw error;
      return res.status(201).json({ ok: true });
    }

    return fail(res, 400, 'Unknown kind. Use page, ad_click or ad_impression.');
  } catch (err) {
    console.error('track error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
