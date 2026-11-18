import supabase from './db-client.js';
import {
  cors,
  okOptions,
  fail,
  requireMember,
  briefArticle,
  getSetting,
} from './_helpers.js';

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

    const report = req.query.report;
    const days = Number(req.query.days) || 7;

    if (report === 'analytics') {
      const since = daysAgo(days).toISOString();
      const { data: views } = await supabase
        .from('article_views')
        .select('article_id, viewed_at')
        .gte('viewed_at', since)
        .order('viewed_at', { ascending: false })
        .limit(20000);

      const { data: arts } = await supabase.from('articles').select('id, headline, section, views, status, publish_at');
      const artMap = Object.fromEntries((arts || []).map((a) => [a.id, a]));

      const byStory = {};
      const byCat = {};
      let totalReads = 0;
      for (const v of views || []) {
        totalReads += 1;
        byStory[v.article_id] = (byStory[v.article_id] || 0) + 1;
        const sec = artMap[v.article_id]?.section || 'other';
        byCat[sec] = (byCat[sec] || 0) + 1;
      }

      const topStories = Object.entries(byStory)
        .map(([id, reads]) => ({
          id: Number(id),
          headline: artMap[id]?.headline || `Story #${id}`,
          section: artMap[id]?.section || '',
          reads,
        }))
        .sort((a, b) => b.reads - a.reads)
        .slice(0, 10);

      const byCategory = Object.entries(byCat)
        .map(([section, reads]) => ({ section, reads }))
        .sort((a, b) => b.reads - a.reads);

      const published = (arts || []).filter(
        (a) => a.status === 'published' && a.publish_at && new Date(a.publish_at) >= new Date(since)
      ).length;

      // Page visits
      const { data: visits } = await supabase
        .from('page_visits')
        .select('path, visited_at')
        .gte('visited_at', since)
        .limit(20000);
      const byPath = {};
      let totalVisits = 0;
      for (const v of visits || []) {
        totalVisits += 1;
        const p = v.path || '/';
        byPath[p] = (byPath[p] || 0) + 1;
      }
      const topPages = Object.entries(byPath)
        .map(([path, hits]) => ({ path, hits }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 15);

      // Ad clicks + impressions + CPC
      const { data: clicks } = await supabase
        .from('ad_clicks')
        .select('ad_id, slot, page_path, clicked_at')
        .gte('clicked_at', since)
        .limit(20000);
      const { data: impressions } = await supabase
        .from('ad_impressions')
        .select('ad_id, slot, viewed_at')
        .gte('viewed_at', since)
        .limit(50000);
      const { data: ads } = await supabase.from('ads').select('id, slot, slot_name, advertiser, width, height');
      const { data: rates } = await supabase.from('ad_rates').select('ad_id, cost_per_click, cost_per_mille, currency');
      const adMap = Object.fromEntries((ads || []).map((a) => [a.id, a]));
      const rateMap = Object.fromEntries((rates || []).map((r) => [r.ad_id, r]));
      const byAdClicks = {};
      const byAdImps = {};
      let totalClicks = 0;
      let totalImps = 0;
      for (const c of clicks || []) {
        totalClicks += 1;
        byAdClicks[c.ad_id] = (byAdClicks[c.ad_id] || 0) + 1;
      }
      for (const i of impressions || []) {
        totalImps += 1;
        byAdImps[i.ad_id] = (byAdImps[i.ad_id] || 0) + 1;
      }
      const adIds = new Set([...(ads || []).map((a) => a.id), ...Object.keys(byAdClicks).map(Number), ...Object.keys(byAdImps).map(Number)]);
      let totalSpend = 0;
      const adPerformance = [...adIds]
        .map((id) => {
          const ad = adMap[id] || {};
          const rate = rateMap[id] || { cost_per_click: 0, cost_per_mille: 0, currency: 'ZAR' };
          const c = byAdClicks[id] || 0;
          const im = byAdImps[id] || 0;
          const cpcSpend = c * Number(rate.cost_per_click || 0);
          const cpmSpend = (im / 1000) * Number(rate.cost_per_mille || 0);
          const spend = cpcSpend + cpmSpend;
          totalSpend += spend;
          const ctr = im > 0 ? (c / im) * 100 : 0;
          return {
            id,
            slot: ad.slot || '',
            slot_name: ad.slot_name || `Ad #${id}`,
            advertiser: ad.advertiser || '',
            size: ad.width && ad.height ? `${ad.width}×${ad.height}` : 'fluid',
            clicks: c,
            impressions: im,
            ctr: Math.round(ctr * 100) / 100,
            cpc: Number(rate.cost_per_click || 0),
            cpm: Number(rate.cost_per_mille || 0),
            spend: Math.round(spend * 100) / 100,
            currency: rate.currency || 'ZAR',
          };
        })
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

      return res.status(200).json({
        days,
        totals: {
          reads: totalReads,
          published,
          stories: (arts || []).filter((a) => a.status === 'published').length,
          pageVisits: totalVisits,
          adClicks: totalClicks,
          adImpressions: totalImps,
          adSpend: Math.round(totalSpend * 100) / 100,
        },
        topStories,
        byCategory,
        topPages,
        adPerformance,
      });
    }

    // Main dashboard
    const { data: arts, error } = await supabase.from('articles').select('*').order('updated_at', { ascending: false });
    if (error) throw error;

    const counts = { total: 0, draft: 0, review: 0, scheduled: 0, published: 0, hidden: 0 };
    for (const a of arts || []) {
      counts.total += 1;
      if (counts[a.status] !== undefined) counts[a.status] += 1;
    }

    const today = startOfDay(new Date());
    const yesterday = daysAgo(1);
    const week = daysAgo(7);

    const publishedToday = (arts || []).filter(
      (a) => a.status === 'published' && a.publish_at && new Date(a.publish_at) >= today
    ).length;
    const publishedWeek = (arts || []).filter(
      (a) => a.status === 'published' && a.publish_at && new Date(a.publish_at) >= week
    ).length;

    const published = (arts || []).filter((a) => a.status === 'published');
    const lead = published.find((a) => a.placement === 'main') || null;
    const headlines = published
      .filter((a) => a.placement === 'headline')
      .sort((a, b) => new Date(b.publish_at || 0) - new Date(a.publish_at || 0))
      .slice(0, 8)
      .map(briefArticle);

    const upcoming = (arts || [])
      .filter((a) => a.status === 'scheduled')
      .sort((a, b) => new Date(a.publish_at || 0) - new Date(b.publish_at || 0))
      .slice(0, 8)
      .map(briefArticle);

    const crawl = (await getSetting('crawl', { enabled: true, speed: 'normal', message: '' })) || {
      enabled: true,
      speed: 'normal',
      message: '',
    };

    const todayIso = today.toISOString();
    const yesterdayIso = yesterday.toISOString();
    const now = new Date();
    const yestSame = new Date(yesterday);
    yestSame.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);

    const { data: viewsToday } = await supabase
      .from('article_views')
      .select('id')
      .gte('viewed_at', todayIso);
    const { data: viewsYest } = await supabase
      .from('article_views')
      .select('id')
      .gte('viewed_at', yesterdayIso)
      .lt('viewed_at', yestSame.toISOString());

    return res.status(200).json({
      counts,
      publishedToday,
      publishedWeek,
      lead: lead ? briefArticle(lead) : null,
      headlines,
      crawl,
      upcoming,
      traffic: {
        today: (viewsToday || []).length,
        yesterdaySameTime: (viewsYest || []).length,
      },
      recent: (arts || []).slice(0, 10).map(briefArticle),
    });
  } catch (err) {
    console.error('dashboard error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
