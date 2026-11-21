import supabase from './db-client.js';
import { AD_SLOTS } from './_adslots.js';

/*
 * Views and clicks, for "Clicks per view" in Analytics.
 *
 * The site connector (/connect.js) counts, in the reader's browser:
 *   - a view when an advert, or a story's headline in a list, has been at least half on screen for a second;
 *   - a click when a reader taps it.
 * It sends them here in small batches. They are added up by day for each advert position and each
 * story (table click_stats), so the table stays small however busy the site is.
 */

const TABLE = 'click_stats';
const MAX_ITEMS = 80; // most things one batch may report
const MAX_PER_ITEM = 20; // most views or clicks of one thing in one batch
// Each day's count for one thing is spread over this many rows, picked at random, so that many
// readers can be counted at the same moment without waiting on one another.
const SHARDS = 8;
const ATTEMPTS = 14;
const SLOTS = new Set(AD_SLOTS.map((def) => def.slot));

/** The calendar day in South Africa (UTC+2, no summer time) that a moment falls on, as YYYY-MM-DD. */
export const statsDay = (ms) => new Date(ms + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);

const count = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PER_ITEM) : 0;
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Adds one count to the row it was aimed at. Returns false when somebody else changed that row
 * first, so nothing was added and the caller should try again.
 */
async function addTo(job, row) {
  const updated_at = new Date().toISOString();
  if (!row) {
    const { error } = await supabase.from(TABLE).insert({ key: job.key, day: job.day, kind: job.kind, ref: job.ref, views: job.views, clicks: job.clicks, updated_at });
    if (!error) return true;
    if (error.code === '23505') return false; // someone else made the row a moment ago
    throw error;
  }
  // The update only goes through if the row still holds the numbers that were read.
  const { data, error } = await supabase
    .from(TABLE)
    .update({ views: row.views + job.views, clicks: row.clicks + job.clicks, updated_at })
    .eq('key', job.key)
    .eq('views', row.views)
    .eq('clicks', row.clicks)
    .select('key');
  if (error) throw error;
  return data.length > 0;
}

/**
 * Records one batch from the site: { "ad:footer": [views, clicks], "story:14": [views, clicks], ... }.
 * Anything that is not a known advert position or a published story is ignored.
 */
export async function recordStats(items) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return 0;
  const ads = [];
  const stories = new Map();
  for (const [name, pair] of Object.entries(items).slice(0, MAX_ITEMS)) {
    const match = /^(ad|story):([a-z0-9]{1,24})$/.exec(name);
    if (!match || !Array.isArray(pair)) continue;
    const views = count(pair[0]);
    const clicks = count(pair[1]);
    if (!views && !clicks) continue;
    if (match[1] === 'ad') {
      if (SLOTS.has(match[2])) ads.push({ kind: 'ad', ref: match[2], views, clicks });
    } else if (/^[1-9]\d{0,8}$/.test(match[2])) {
      stories.set(Number(match[2]), { kind: 'story', ref: match[2], views, clicks });
    }
  }

  let published = [];
  if (stories.size) {
    const { data, error } = await supabase.from('articles').select('id').in('id', [...stories.keys()]).eq('status', 'published');
    if (error) throw error;
    published = data.map((row) => stories.get(row.id));
  }

  const day = statsDay(Date.now());
  const jobs = [...ads, ...published].map((job) => ({ ...job, day }));
  let waiting = jobs;
  for (let attempt = 0; attempt < ATTEMPTS && waiting.length; attempt += 1) {
    if (attempt) await pause(10 + Math.random() * 30 * Math.min(attempt, 6));
    // A fresh row is picked at every attempt, which moves a count away from a busy row.
    for (const job of waiting) job.key = `${job.day}|${job.kind}|${job.ref}|${Math.floor(Math.random() * SHARDS)}`;
    const { data, error } = await supabase.from(TABLE).select('key, views, clicks').in('key', waiting.map((job) => job.key));
    if (error) throw error;
    const rows = new Map(data.map((row) => [row.key, row]));
    const done = await Promise.all(waiting.map((job) => addTo(job, rows.get(job.key))));
    waiting = waiting.filter((_, index) => !done[index]);
  }
  if (waiting.length) console.error('click_stats: could not record', waiting.map((job) => `${job.kind}:${job.ref}`).join(', '));
  return jobs.length - waiting.length;
}

/**
 * Views and clicks since a moment, for the Analytics page: every advert position, the ten stories
 * whose headlines were seen most, and the totals.
 */
export async function clickReport(fromMs, articles) {
  const fromDay = statsDay(fromMs);
  const page = (index, withCount) =>
    supabase
      .from(TABLE)
      .select('kind, ref, views, clicks', withCount ? { count: 'exact' } : undefined)
      .gte('day', fromDay)
      .order('key', { ascending: true })
      .range(index * 1000, index * 1000 + 999);
  const first = await page(0, true);
  if (first.error) throw first.error;
  const rows = [...first.data];
  const pages = Math.min(Math.ceil((first.count || 0) / 1000), 60);
  for (let index = 1; index < pages; index += 6) {
    const more = await Promise.all(Array.from({ length: Math.min(6, pages - index) }, (_, i) => page(index + i, false)));
    for (const result of more) {
      if (result.error) throw result.error;
      rows.push(...result.data);
    }
  }

  const sums = new Map();
  for (const row of rows) {
    const name = `${row.kind}:${row.ref}`;
    const sum = sums.get(name) || { views: 0, clicks: 0 };
    sum.views += row.views || 0;
    sum.clicks += row.clicks || 0;
    sums.set(name, sum);
  }
  const of = (name) => sums.get(name) || { views: 0, clicks: 0 };

  const { data: adRows, error: adError } = await supabase.from('ads').select('slot, slot_name');
  if (adError) throw adError;
  const names = new Map(adRows.map((row) => [row.slot, row.slot_name]));
  const ads = AD_SLOTS.map((def) => ({ slot: def.slot, name: names.get(def.slot) || def.slot_name, size: { w: def.size.w, h: def.size.h }, ...of(`ad:${def.slot}`) }));

  const headlines = new Map(articles.map((a) => [String(a.id), a.headline]));
  const allStories = [...sums.entries()].filter(([name]) => name.startsWith('story:')).map(([name, sum]) => ({ id: Number(name.slice(6)), ...sum }));
  const stories = allStories
    .filter((s) => headlines.has(String(s.id)))
    .sort((a, b) => b.views - a.views || b.clicks - a.clicks)
    .slice(0, 10)
    .map((s) => ({ id: s.id, headline: headlines.get(String(s.id)), views: s.views, clicks: s.clicks }));

  const total = (list) => list.reduce((sum, item) => ({ views: sum.views + item.views, clicks: sum.clicks + item.clicks }), { views: 0, clicks: 0 });
  return { ads, stories, totals: { ads: total(ads), stories: total(allStories) } };
}
