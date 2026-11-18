import supabase from './db-client.js';

const DAY = 24 * 60 * 60 * 1000;
const VIEW_CAP = 20000;
const iso = (ms) => new Date(ms).toISOString();

async function countRows(table, column, fromMs, toMs, status) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true }).gte(column, iso(fromMs));
  if (toMs) query = query.lt(column, iso(toMs));
  if (status) query = query.eq('status', status);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

/**
 * Analytics summary for the last 7, 30 or 90 days, today included.
 * Reads are the ones the site reports through /api/public?resource=view.
 */
export async function analyticsReport(query) {
  const now = Date.now();
  const days = [7, 30, 90].includes(Number(query.days)) ? Number(query.days) : 7;
  const rawOffset = Number(query.tz);
  const offset = Number.isFinite(rawOffset) ? Math.max(-840, Math.min(840, Math.round(rawOffset))) : 0;
  const startToday = Math.floor((now - offset * 60000) / DAY) * DAY + offset * 60000;
  const from = startToday - (days - 1) * DAY;
  const prevFrom = from - days * DAY;

  const [reads, prevReads, articles, sections] = await Promise.all([
    countRows('article_views', 'viewed_at', from),
    countRows('article_views', 'viewed_at', prevFrom, from),
    supabase.from('articles').select('id, headline, section, author_name, status, publish_at').limit(5000),
    supabase.from('sections').select('slug, label, position').order('position', { ascending: true }),
  ]);
  if (articles.error) throw articles.error;
  if (sections.error) throw sections.error;

  const views = [];
  for (let page = 0; page < 40 && views.length < VIEW_CAP; page += 1) {
    const { data, error } = await supabase
      .from('article_views')
      .select('article_id, section, viewed_at')
      .gte('viewed_at', iso(from))
      .order('viewed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(views.length, views.length + 999);
    if (error) throw error;
    if (!data.length) break;
    views.push(...data);
  }

  const daily = Array.from({ length: days }, (_, i) => ({ t: iso(from + i * DAY), reads: 0, published: 0 }));
  const perStory = new Map();
  const perCategory = new Map();
  for (const view of views) {
    const index = Math.floor((new Date(view.viewed_at).getTime() - from) / DAY);
    if (index >= 0 && index < days) daily[index].reads += 1;
    perStory.set(view.article_id, (perStory.get(view.article_id) || 0) + 1);
    if (view.section) perCategory.set(view.section, (perCategory.get(view.section) || 0) + 1);
  }

  const byId = new Map(articles.data.map((a) => [a.id, a]));
  const authors = new Map();
  const author = (name) => {
    const label = String(name || '').trim() || 'No byline';
    if (!authors.has(label)) authors.set(label, { name: label, published: 0, reads: 0 });
    return authors.get(label);
  };
  let published = 0;
  let prevPublished = 0;
  for (const a of articles.data) {
    const storyReads = perStory.get(a.id) || 0;
    if (storyReads) author(a.author_name).reads += storyReads;
    if (a.status !== 'published' || !a.publish_at) continue;
    const at = new Date(a.publish_at).getTime();
    if (at >= from) {
      published += 1;
      author(a.author_name).published += 1;
      const index = Math.floor((at - from) / DAY);
      if (index >= 0 && index < days) daily[index].published += 1;
    } else if (at >= prevFrom) {
      prevPublished += 1;
    }
  }

  const labels = new Map(sections.data.map((s) => [s.slug, s.label]));
  const topStories = [...perStory.entries()]
    .map(([id, count]) => ({ story: byId.get(id), reads: count }))
    .filter((entry) => entry.story)
    .sort((a, b) => b.reads - a.reads)
    .slice(0, 10)
    .map(({ story, reads: count }) => ({ id: story.id, headline: story.headline, section: story.section, author: story.author_name, reads: count }));

  let comments = null;
  let pendingComments = null;
  try {
    [comments, pendingComments] = await Promise.all([countRows('comments', 'created_at', from), countRows('comments', 'created_at', 0, null, 'pending')]);
  } catch (err) {
    console.error('comment counts failed:', err);
  }

  return {
    days,
    from: iso(from),
    totals: { reads, prevReads, published, prevPublished, storiesRead: perStory.size, comments, pendingComments },
    daily,
    topStories,
    byCategory: sections.data
      .map((s) => ({ slug: s.slug, label: labels.get(s.slug), reads: perCategory.get(s.slug) || 0 }))
      .sort((a, b) => b.reads - a.reads),
    byAuthor: [...authors.values()].sort((a, b) => b.reads - a.reads || b.published - a.published).slice(0, 12),
    sampled: views.length >= VIEW_CAP,
  };
}
