import supabase from './db-client.js';
import { requireMember, promoteDue, readSettings, canEdit, fail } from './_lib.js';
import { analyticsReport } from './_analytics.js';
import './_mail.js'; // scheduled stories going live send alerts from here too

const COLUMNS =
  'id, headline, section, author_name, author_id, placement, status, publish_at, created_at, updated_at, image_url';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VIEW_CAP = 5000;

async function countViews(fromMs, toMs) {
  let query = supabase
    .from('article_views')
    .select('id', { count: 'exact', head: true })
    .gte('viewed_at', new Date(fromMs).toISOString());
  if (toMs) query = query.lt('viewed_at', new Date(toMs).toISOString());
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

/**
 * Reads reported by the site through /api/public?resource=view.
 * Totals are exact counts; the hourly chart and the trending list are built
 * from the last 24 hours of reads, capped at VIEW_CAP rows.
 */
async function loadTraffic(now, startToday, published) {
  const [today, yesterdaySameTime, week] = await Promise.all([
    countViews(startToday),
    countViews(startToday - DAY, now - DAY),
    countViews(now - 7 * DAY),
  ]);

  const since = new Date(now - DAY).toISOString();
  const rows = [];
  for (let page = 0; page < 12 && rows.length < VIEW_CAP; page += 1) {
    const { data, error } = await supabase
      .from('article_views')
      .select('article_id, viewed_at')
      .gte('viewed_at', since)
      .order('viewed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(rows.length, rows.length + 999);
    if (error) throw error;
    if (!data.length) break;
    rows.push(...data);
  }

  const firstBucket = Math.floor(now / HOUR) * HOUR - 23 * HOUR;
  const hourly = Array.from({ length: 24 }, (_, i) => ({ t: new Date(firstBucket + i * HOUR).toISOString(), count: 0 }));
  const perStory = new Map();
  for (const row of rows) {
    const index = Math.floor((new Date(row.viewed_at).getTime() - firstBucket) / HOUR);
    if (index >= 0 && index < 24) hourly[index].count += 1;
    perStory.set(row.article_id, (perStory.get(row.article_id) || 0) + 1);
  }

  const trending = [...perStory.entries()]
    .map(([id, reads]) => ({ story: published.get(id), reads }))
    .filter((entry) => entry.story)
    .sort((a, b) => b.reads - a.reads || new Date(b.story.publish_at || 0) - new Date(a.story.publish_at || 0))
    .slice(0, 5)
    .map(({ story, reads }) => ({ id: story.id, headline: story.headline, section: story.section, reads }));

  return { traffic: { today, yesterdaySameTime, week, hourly, sampled: rows.length >= VIEW_CAP }, trending };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const member = await requireMember(req, res);
    if (!member) return;

    if (req.query.report === 'analytics') {
      if (!canEdit(member)) return res.status(403).json({ error: 'Your role does not allow this.', code: 'role' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(await analyticsReport(req.query));
    }

    await promoteDue();

    // "Today" is the reader's own day: tz is Date#getTimezoneOffset() from the browser.
    const now = Date.now();
    const rawOffset = Number(req.query.tz);
    const offset = Number.isFinite(rawOffset) ? Math.max(-840, Math.min(840, Math.round(rawOffset))) : 0;
    const startToday = Math.floor((now - offset * 60000) / DAY) * DAY + offset * 60000;

    const [articles, sections, activity, settings] = await Promise.all([
      supabase.from('articles').select(COLUMNS).order('updated_at', { ascending: false }).limit(3000),
      supabase.from('sections').select('*').order('position', { ascending: true }),
      supabase.from('activity').select('*').order('created_at', { ascending: false }).limit(10),
      readSettings(),
    ]);
    if (articles.error) throw articles.error;
    if (sections.error) throw sections.error;
    if (activity.error) throw activity.error;

    const rows = articles.data;
    const counts = { total: rows.length, draft: 0, review: 0, scheduled: 0, published: 0, hidden: 0 };
    const perSection = {};
    const published = new Map();
    let publishedToday = 0;
    let publishedWeek = 0;
    for (const a of rows) {
      counts[a.status] = (counts[a.status] || 0) + 1;
      if (a.status !== 'published') continue;
      published.set(a.id, a);
      if (a.section) perSection[a.section] = (perSection[a.section] || 0) + 1;
      const at = a.publish_at ? new Date(a.publish_at).getTime() : 0;
      if (at >= startToday) publishedToday += 1;
      if (at >= now - 7 * DAY) publishedWeek += 1;
    }

    const byPublishDesc = (a, b) => new Date(b.publish_at || 0) - new Date(a.publish_at || 0);
    const upcoming = rows
      .filter((a) => a.status === 'scheduled' && a.publish_at)
      .sort((a, b) => new Date(a.publish_at) - new Date(b.publish_at))
      .slice(0, 5);
    const review = rows.filter((a) => a.status === 'review').slice(0, 5);
    const mine = rows.filter((a) => a.author_id === member.id && (a.status === 'draft' || a.status === 'review')).slice(0, 5);
    const lead = [...published.values()].filter((a) => a.placement === 'main').sort(byPublishDesc)[0] || null;
    const headlines = [...published.values()].filter((a) => a.placement === 'headline').sort(byPublishDesc).slice(0, 3);

    let traffic = null;
    let trending = [];
    try {
      ({ traffic, trending } = await loadTraffic(now, startToday, published));
    } catch (err) {
      console.error('traffic failed:', err);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      generatedAt: new Date(now).toISOString(),
      counts,
      publishedToday,
      publishedWeek,
      bySection: sections.data.map((s) => ({ slug: s.slug, label: s.label, enabled: s.enabled, count: perSection[s.slug] || 0 })),
      upcoming,
      review,
      mine,
      lead,
      headlines,
      crawl: settings.crawl,
      siteLink: settings.site_link,
      activity: activity.data,
      traffic,
      trending,
    });
  } catch (err) {
    fail(res, err);
  }
}
