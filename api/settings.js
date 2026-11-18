import supabase from './db-client.js';
import {
  cors,
  okOptions,
  fail,
  requireMember,
  allSettings,
  setSetting,
  SITE_ORIGIN,
} from './_helpers.js';

const DEFAULTS = {
  crawl: { enabled: true, speed: 'normal', message: '' },
  notice: { enabled: false, text: '' },
  elections_update: { enabled: false, title: '', text: '' },
  contact: { email: 'newsroom@180news.co.za', phone: '+2781 659 6218', ads_phone: '+2781 659 6218' },
  comments: { enabled: true, hold: true },
  ads_enabled: true,
  live_updates: { enabled: true },
  homepage: { blocks: [] },
  site_link: {
    sites: [{ name: '180news', origin: SITE_ORIGIN }],
  },
};

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    if (req.method === 'GET' && req.query.resource === 'homepage') {
      const map = await allSettings();
      const sections = (
        await supabase.from('sections').select('*').order('sort_order', { ascending: true })
      ).data || [];
      const arts = (await supabase.from('articles').select('section, status').eq('status', 'published')).data || [];
      const counts = {};
      for (const a of arts) counts[a.section] = (counts[a.section] || 0) + 1;

      const saved = map.homepage?.blocks || [];
      const byId = Object.fromEntries(saved.map((b) => [b.id, b]));
      const blocks = sections.map((s) => ({
        id: s.id,
        slug: s.slug,
        label: s.label,
        enabled: byId[s.id]?.enabled ?? true,
        categoryEnabled: s.enabled,
        count: counts[s.slug] || 0,
      }));

      // preserve custom order if saved
      if (saved.length) {
        const order = saved.map((b) => b.id);
        blocks.sort((a, b) => {
          const ai = order.indexOf(a.id);
          const bi = order.indexOf(b.id);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      }
      return res.status(200).json(blocks);
    }

    if (req.method === 'GET') {
      const map = await allSettings();
      const out = { ...DEFAULTS, ...map };
      out.site_link = map.site_link || DEFAULTS.site_link;
      const ae = map.ads_enabled;
      out.ads_enabled = typeof ae === 'boolean' ? ae : ae?.enabled !== false;
      return res.status(200).json(out);
    }

    if (req.method === 'PUT') {
      if (!['owner', 'editor'].includes(auth.member.role) && auth.member.role !== 'writer') {
        // writers can update crawl via breaking page if editor - actually writers shouldn't
      }
      const canEdit = ['owner', 'editor'].includes(auth.member.role);
      const { key, value } = req.body || {};
      if (!key) return fail(res, 400, 'Missing setting key.');

      // crawl can be edited by editors; writers who can publish might update breaking line - allow editors+
      if (!canEdit && key !== 'crawl') {
        return fail(res, 403, 'Only editors can change settings.');
      }
      if (!canEdit && key === 'crawl' && auth.member.role === 'writer') {
        // allow writers to update crawl message for breaking news workflow
      }

      const storeValue = key === 'ads_enabled' && typeof value === 'boolean' ? value : value;
      await setSetting(key, storeValue);
      const map = await allSettings();
      const out = { ...DEFAULTS, ...map };
      out.site_link = map.site_link || DEFAULTS.site_link;
      const ae = map.ads_enabled;
      out.ads_enabled = typeof ae === 'boolean' ? ae : ae?.enabled !== false;
      return res.status(200).json(out);
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('settings error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
