import { createHash } from 'node:crypto';
import supabase from './db-client.js';
import { promoteDue, readSettings, resolveHomepage, stableHost, clean, fail } from './_lib.js';
import { clipKinds, publicClip, readClips } from './_clips.js';
import { adSize } from './_adslots.js';
import { recordStats } from './_stats.js';
import { notifyComment } from './_mail.js';
import { PUBLIC_SITE, seoFor, storyUrl } from './_desk.js';

const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const firstWords = (text, max) => {
  const flat = String(text || '').replace(/^(## |> ?)/gm, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : flat;
};

/**
 * Read-only content feed for the 180news site. No sign-in needed.
 *
 *   /api/public                         everything the front page needs
 *   /api/public?resource=articles       published stories (&section= &tag= &q= &limit=)
 *   /api/public?resource=article&id=12  one published story, with its body, videos and audio
 *   /api/public?resource=sections       sections that are switched on
 *   /api/public?resource=ads            adverts that are switched on
 *   /api/public?resource=settings       crawl, notice, elections update, contact details
 *   /api/public?resource=view&id=12     report that a reader opened a story (GET or POST)
 *   /api/public?resource=stats          POST views and clicks of adverts and headlines, sent by /connect.js
 *   /api/public?resource=comments&id=12 approved reader comments on a story
 *   /api/public?resource=comment        POST { id, name, body } to send a reader comment
 *   /api/public?resource=authors        author profiles that are switched on
 *   /api/public?resource=share&id=12    a page to share on social networks (also at /s/12): it carries the story's
 *                                       headline, description and picture for the preview, and takes readers to the story
 *   /api/public?resource=site           everything /connect.js needs to fill the 180news site (&v= last version seen)
 */

const LIST_COLUMNS =
  'id, slug, headline, summary, section, tags, image_url, image_caption, image_credit, author_name, placement, publish_at, updated_at';

const shape = (a, labels) => ({
  id: a.id,
  slug: a.slug,
  headline: a.headline,
  summary: a.summary,
  ...(a.body !== undefined ? { body: a.body } : {}),
  section: a.section,
  sectionLabel: labels[a.section] || null,
  tags: Array.isArray(a.tags) ? a.tags : [],
  image: a.image_url ? { url: a.image_url, caption: a.image_caption || '', credit: a.image_credit || '' } : null,
  mediaTypes: a.media_kinds || [],
  author: a.author_name,
  placement: a.placement,
  publishedAt: a.publish_at,
  updatedAt: a.updated_at,
});

async function enabledSections() {
  const { data, error } = await supabase
    .from('sections')
    .select('slug, label, position')
    .eq('enabled', true)
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

async function liveAds(settings) {
  if (!settings.ads_enabled) return [];
  const { data, error } = await supabase.from('ads').select('*').eq('enabled', true).order('sort', { ascending: true });
  if (error) throw error;
  return data
    .filter((ad) => ad.image_url)
    .map((ad) => ({
      slot: ad.slot,
      position: ad.position,
      name: ad.advertiser || '',
      image: ad.image_url,
      url: ad.link_url || '',
      w: ad.width,
      h: ad.height,
      size: adSize(ad.slot),
    }));
}

/** Story text as the site shows it: plain paragraphs, without the editor's "## " and "> " marks. */
const siteBody = (body) =>
  String(body || '')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim().replace(/^## +/, '').replace(/^> ?/gm, ''))
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 20000);

/** Remembers which sites have asked for the feed, so the CMS can show whether the site is connected. */
async function noteSite(origin, link, host) {
  if (host && origin === `https://${host}`) return; // the CMS's own pages are not the site
  if (typeof origin !== 'string' || origin.length > 120 || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)) return;
  const sites = Array.isArray(link?.sites) ? link.sites.filter((s) => s && typeof s.origin === 'string') : [];
  const known = sites.find((s) => s.origin === origin);
  const via = String(host || '').toLowerCase();
  if (known && known.via === via && Date.now() - Date.parse(known.at) < 60000) return;
  // "via" is the CMS address the site loaded its connector from. Older versions of this code did not record it.
  const next = [{ origin, at: new Date().toISOString(), via }, ...sites.filter((s) => s.origin !== origin)].slice(0, 4);
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'site_link', value: { sites: next }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) console.error('site check-in failed:', error);
}

const publicSettings = (s) => ({
  crawl: s.crawl,
  notice: s.notice,
  electionsUpdate: s.elections_update,
  liveUpdates: s.live_updates.enabled,
  scheduledPanel: s.scheduled_panel.enabled,
  adsEnabled: s.ads_enabled,
  comments: { enabled: s.comments.enabled },
  contact: { email: s.contact.email, phone: s.contact.phone, adsPhone: s.contact.ads_phone },
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const resource = String(req.query.resource || 'all');

    if (resource === 'stats') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Send the counts with POST.' });
      res.setHeader('Cache-Control', 'no-store');
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = null;
        }
      }
      return res.status(200).json({ ok: true, counted: await recordStats(body?.items) });
    }

    if (resource === 'view') {
      if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      res.setHeader('Cache-Control', 'no-store');
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = null;
        }
      }
      const id = Number(req.query.id ?? body?.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Add ?id= with the story id.' });
      const { data: story, error: storyError } = await supabase.from('articles').select('id, section, status').eq('id', id).maybeSingle();
      if (storyError) throw storyError;
      if (!story || story.status !== 'published') return res.status(404).json({ error: 'Story not found.' });
      const { error: viewError } = await supabase
        .from('article_views')
        .insert({ article_id: story.id, section: story.section, viewed_at: new Date().toISOString() });
      if (viewError) throw viewError;
      return res.status(200).json({ ok: true });
    }

    if (resource === 'comment') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Send the comment with POST.' });
      res.setHeader('Cache-Control', 'no-store');
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = null;
        }
      }
      const commentSettings = (await readSettings()).comments;
      if (!commentSettings.enabled) return res.status(403).json({ error: 'Comments are closed.' });
      const id = Number(body?.id ?? req.query.id);
      const name = clean(body?.name, 60);
      const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 2000) : '';
      const fields = {};
      if (name.length < 2) fields.name = 'Enter your name.';
      if (text.length < 2) fields.body = 'Write your comment.';
      if (Object.keys(fields).length) return res.status(400).json({ error: 'Check the highlighted fields.', fields });
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Add the story id.' });
      const { data: story, error: storyError } = await supabase.from('articles').select('id, status, headline').eq('id', id).maybeSingle();
      if (storyError) throw storyError;
      if (!story || story.status !== 'published') return res.status(404).json({ error: 'Story not found.' });
      // A filled-in hidden "website" field or a pile of links is treated as spam.
      const links = (text.match(/https?:\/\/|www\./gi) || []).length;
      const status = clean(body?.website, 200) || links > 2 ? 'spam' : commentSettings.hold ? 'pending' : 'approved';
      const { error: insertError } = await supabase
        .from('comments')
        .insert({ article_id: story.id, author_name: name, body: text, status, created_at: new Date().toISOString() });
      if (insertError) throw insertError;
      if (status === 'pending') await notifyComment(story);
      return res.status(201).json({ ok: true, status: status === 'approved' ? 'approved' : 'pending' });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    if (resource === 'config') {
      let demoLogin = null;
      try {
        const { data } = await supabase.from('settings').select('value').eq('key', 'demo_login').maybeSingle();
        demoLogin = data?.value ?? null;
      } catch {
        demoLogin = null;
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        demoLogin,
        // The address that always serves the newest version of this CMS, when the host says what it is.
        cmsUrl: stableHost() ? `https://${stableHost()}` : '',
      });
    }

    await promoteDue();
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

    const sections = await enabledSections();
    const labels = Object.fromEntries(sections.map((s) => [s.slug, s.label]));
    const slugs = sections.map((s) => s.slug);

    if (resource === 'share') {
      // Social networks read this page for the preview card; they do not run scripts, so they stay here.
      // A reader's browser does run the script, and goes on to the story on the site.
      const id = Number(req.query.id);
      const { data: story, error } = id ? await supabase.from('articles').select('id, headline, summary, body, section, image_url, status').eq('id', id).maybeSingle() : { data: null, error: null };
      if (error) throw error;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (!story || story.status !== 'published' || !slugs.includes(story.section)) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).end(`<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Story not found | 180news</title></head><body><p>This story is not available. <a href="${PUBLIC_SITE}/">Go to 180news</a></p></body></html>`);
      }
      const seo = (await seoFor([story.id])).get(story.id);
      const title = escapeHtml(seo?.title || story.headline);
      const description = escapeHtml(seo?.description || story.summary || firstWords(story.body, 160));
      const target = storyUrl(story.id);
      const self = req.headers.host ? `https://${req.headers.host}/s/${story.id}` : target;
      const image = story.image_url ? `<meta property="og:image" content="${escapeHtml(story.image_url)}"><meta name="twitter:image" content="${escapeHtml(story.image_url)}">` : '';
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
      return res.status(200).end(
        `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | 180news</title>` +
          `<meta name="description" content="${description}"><link rel="canonical" href="${target}">` +
          `<meta property="og:type" content="article"><meta property="og:site_name" content="180news"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${escapeHtml(self)}">${image}` +
          `<meta name="twitter:card" content="${story.image_url ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}">` +
          `<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script></head>` +
          `<body style="font-family:system-ui,sans-serif;margin:2rem"><p><a href="${target}">${escapeHtml(story.headline)}</a></p><p>Continue to 180news.</p></body></html>`,
      );
    }

    if (resource === 'site') {
      const settings = await readSettings();
      const [allSections, storyRows, adRows] = await Promise.all([
        supabase.from('sections').select('slug, enabled'),
        slugs.length
          ? supabase
              .from('articles')
              .select('id, headline, summary, body, section, tags, image_url, image_caption, image_credit, author_name, placement, publish_at, updated_at')
              .eq('status', 'published')
              .in('section', slugs)
              .order('publish_at', { ascending: false })
              .limit(50)
          : { data: [], error: null },
        supabase.from('ads').select('*').order('sort', { ascending: true }),
      ]);
      if (allSections.error) throw allSections.error;
      if (storyRows.error) throw storyRows.error;
      if (adRows.error) throw adRows.error;

      const clipsByStory = new Map();
      if (storyRows.data.length) {
        const { data, error } = await supabase
          .from('article_media')
          .select('*')
          .in('article_id', storyRows.data.map((a) => a.id))
          .order('position', { ascending: true })
          .order('id', { ascending: true });
        if (error) throw error;
        for (const clip of data) clipsByStory.set(clip.article_id, [...(clipsByStory.get(clip.article_id) || []), clip]);
      }

      const seo = await seoFor(storyRows.data.map((a) => a.id));
      let leadTaken = false;
      const stories = storyRows.data.map((a) => {
        const clips = clipsByStory.get(a.id) || [];
        const pinned = a.placement === 'main' && !leadTaken;
        if (pinned) leadTaken = true;
        return {
          n: a.id,
          title: a.headline,
          // The headline and description for search engines, where the newsroom wrote its own.
          seoTitle: seo.get(a.id)?.title || '',
          seoDescription: seo.get(a.id)?.description || '',
          summary: a.summary || '',
          body: siteBody(a.body),
          author: a.author_name || 'Staff reporter',
          section: a.section,
          image: a.image_url || null,
          // Shown under the story's picture by the site connector.
          imageCaption: a.image_url ? a.image_caption || '' : '',
          imageCredit: a.image_url ? a.image_credit || '' : '',
          tags: Array.isArray(a.tags) ? a.tags : [],
          // YouTube videos play in the site's own player; a portrait one is passed as a Short.
          links: clips
            .filter((c) => c.kind === 'youtube' && c.youtube_id)
            .slice(0, 6)
            .map((c) => (c.height > c.width ? `https://www.youtube.com/shorts/${c.youtube_id}` : `https://www.youtube.com/watch?v=${c.youtube_id}`)),
          clips: clips
            .filter((c) => c.kind === 'video' || c.kind === 'audio')
            .map((c) => ({
              kind: c.kind,
              url: c.url,
              title: c.title || '',
              caption: c.caption || '',
              credit: c.credit || '',
              position: c.slot === 'bottom' ? 'after' : 'before',
              width: c.width,
              height: c.height,
            })),
          publishedAt: Date.parse(a.publish_at) || Date.parse(a.updated_at) || Date.now(),
          updatedAt: Date.parse(a.updated_at) || Date.now(),
          pinned,
          headline: a.placement !== 'none',
        };
      });

      const payload = {
        stories,
        settings: {
          crawlEnabled: settings.crawl.enabled,
          crawlSpeed: settings.crawl.speed,
          crawlMessage: String(settings.crawl.message || '').slice(0, 140),
          showScheduled: settings.scheduled_panel.enabled,
          adsOn: settings.ads_enabled,
          email: settings.contact.email,
          phone: settings.contact.phone,
          adPhone: settings.contact.ads_phone,
          hiddenSections: allSections.data.filter((s) => s.enabled === false).map((s) => s.slug),
        },
        ads: Object.fromEntries(
          adRows.data.map((ad) => [
            ad.slot,
            { enabled: ad.enabled === true, position: ad.position, image: ad.image_url || null, w: ad.width, h: ad.height, name: ad.advertiser || '', url: ad.link_url || '', size: adSize(ad.slot) },
          ]),
        ),
      };
      const version = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
      await noteSite(req.headers.origin, settings.site_link, req.headers.host);
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
      // "cms" lets a connector that was loaded from a frozen, older copy of this CMS move to the current one.
      const cms = stableHost() ? `https://${stableHost()}` : null;
      if (req.query.v === version) return res.status(200).json({ version, unchanged: true, cms });
      return res.status(200).json({ version, cms, ...payload });
    }

    if (resource === 'sections') return res.status(200).json(sections.map((s) => ({ id: s.slug, label: s.label })));

    if (resource === 'settings') return res.status(200).json(publicSettings(await readSettings()));

    if (resource === 'ads') return res.status(200).json(await liveAds(await readSettings()));

    if (resource === 'article') {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'Add ?id= with the story id.' });
      const { data, error } = await supabase.from('articles').select('*').eq('id', id).eq('status', 'published').maybeSingle();
      if (error) throw error;
      if (!data || !slugs.includes(data.section)) return res.status(404).json({ error: 'Story not found.' });
      let authorProfile = null;
      if (data.author_name) {
        const { data: profile } = await supabase
          .from('authors')
          .select('name, title, bio, photo_url, email')
          .eq('active', true)
          .eq('name', data.author_name)
          .maybeSingle();
        if (profile) authorProfile = { name: profile.name, title: profile.title || '', bio: profile.bio || '', photo: profile.photo_url || null, email: profile.email || '' };
      }
      const clips = await readClips(data.id);
      data.media_kinds = [...new Set(clips.map((clip) => clip.kind))];
      const seo = (await seoFor([data.id])).get(data.id);
      return res.status(200).json({ ...shape(data, labels), media: clips.map(publicClip), authorProfile, seo: { title: seo?.title || data.headline, description: seo?.description || data.summary || firstWords(data.body, 160) }, shareUrl: req.headers.host ? `https://${req.headers.host}/s/${data.id}` : null });
    }

    if (resource === 'comments') {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'Add ?id= with the story id.' });
      const [commentSettings, list] = await Promise.all([
        readSettings(),
        supabase.from('comments').select('id, author_name, body, created_at').eq('article_id', id).eq('status', 'approved').order('created_at', { ascending: true }).limit(500),
      ]);
      if (list.error) throw list.error;
      return res.status(200).json({
        open: commentSettings.comments.enabled,
        comments: list.data.map((c) => ({ id: c.id, name: c.author_name, body: c.body, createdAt: c.created_at })),
      });
    }

    if (resource === 'authors') {
      const { data, error } = await supabase.from('authors').select('name, title, bio, photo_url, email').eq('active', true).order('name', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data.map((a) => ({ name: a.name, title: a.title || '', bio: a.bio || '', photo: a.photo_url || null, email: a.email || '' })));
    }

    const published = async (limit) => {
      if (!slugs.length) return [];
      let query = supabase
        .from('articles')
        .select(LIST_COLUMNS)
        .eq('status', 'published')
        .in('section', slugs)
        .order('publish_at', { ascending: false })
        .limit(limit);
      const section = clean(req.query.section, 60);
      if (section) query = query.eq('section', section);
      const search = clean(req.query.q, 80).replace(/[%_,()\\]/g, ' ').trim();
      if (search) query = query.ilike('headline', `%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      const kinds = await clipKinds(data.map((a) => a.id));
      for (const a of data) a.media_kinds = kinds.get(a.id) || [];
      const tag = clean(req.query.tag, 30).toLowerCase();
      return tag ? data.filter((a) => (a.tags || []).some((t) => String(t).toLowerCase() === tag)) : data;
    };

    if (resource === 'articles') {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      return res.status(200).json((await published(limit)).map((a) => shape(a, labels)));
    }

    const settings = await readSettings();
    const [rows, ads] = await Promise.all([published(60), liveAds(settings)]);
    const lead = rows.find((a) => a.placement === 'main') || null;
    const blocks = resolveHomepage(settings, sections.map((s) => ({ ...s, enabled: true }))).filter((b) => b.enabled);
    const headlineCount = blocks.find((b) => b.id === 'headlines')?.count ?? 6;
    const headlines = rows.filter((a) => a.placement === 'headline' || (a.placement === 'main' && a !== lead)).slice(0, headlineCount);
    const homepage = blocks.map((b) => ({
      id: b.id,
      type: b.type,
      label: b.label,
      count: b.count,
      ...(b.type === 'category'
        ? { section: b.slug, stories: rows.filter((a) => a.section === b.slug).slice(0, b.count).map((a) => shape(a, labels)) }
        : {}),
    }));

    let scheduled = [];
    if (settings.scheduled_panel.enabled && slugs.length) {
      const { data, error } = await supabase
        .from('articles')
        .select('id, headline, section, publish_at')
        .eq('status', 'scheduled')
        .in('section', slugs)
        .order('publish_at', { ascending: true })
        .limit(10);
      if (error) throw error;
      scheduled = data.map((a) => ({ id: a.id, headline: a.headline, section: a.section, sectionLabel: labels[a.section] || null, publishAt: a.publish_at }));
    }

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      lead: lead ? shape(lead, labels) : null,
      headlines: headlines.map((a) => shape(a, labels)),
      latest: rows.map((a) => shape(a, labels)),
      scheduled,
      sections: sections.map((s) => ({ id: s.slug, label: s.label })),
      homepage,
      ads,
      settings: publicSettings(settings),
    });
  } catch (err) {
    fail(res, err);
  }
}
