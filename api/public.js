import supabase from './db-client.js';
import { promoteDue, readSettings, resolveHomepage, clean, fail } from './_lib.js';
import { clipKinds, publicClip, readClips } from './_clips.js';

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
 *   /api/public?resource=comments&id=12 approved reader comments on a story
 *   /api/public?resource=comment        POST { id, name, body } to send a reader comment
 *   /api/public?resource=authors        author profiles that are switched on
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
    }));
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
      const { data: story, error: storyError } = await supabase.from('articles').select('id, status').eq('id', id).maybeSingle();
      if (storyError) throw storyError;
      if (!story || story.status !== 'published') return res.status(404).json({ error: 'Story not found.' });
      // A filled-in hidden "website" field or a pile of links is treated as spam.
      const links = (text.match(/https?:\/\/|www\./gi) || []).length;
      const status = clean(body?.website, 200) || links > 2 ? 'spam' : commentSettings.hold ? 'pending' : 'approved';
      const { error: insertError } = await supabase
        .from('comments')
        .insert({ article_id: story.id, author_name: name, body: text, status, created_at: new Date().toISOString() });
      if (insertError) throw insertError;
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
      });
    }

    await promoteDue();
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

    const sections = await enabledSections();
    const labels = Object.fromEntries(sections.map((s) => [s.slug, s.label]));
    const slugs = sections.map((s) => s.slug);

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
      return res.status(200).json({ ...shape(data, labels), media: clips.map(publicClip), authorProfile });
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
