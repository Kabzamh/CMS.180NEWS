import supabase from './db-client.js';
import {
  cors,
  okOptions,
  fail,
  briefArticle,
  fullArticle,
  allSettings,
  getSetting,
  SITE_ORIGIN,
  storyPath,
} from './_helpers.js';
import { queueNotification } from './notifications.js';

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const resource = req.query.resource || 'homepage';

    if (req.method === 'POST' && resource === 'contact') {
      const { name, email, to_email, subject, body } = req.body || {};
      const n = String(name || '').trim();
      const fromEmail = String(email || '').trim().toLowerCase();
      const toEmail = String(to_email || '').trim().toLowerCase();
      const sub = String(subject || '').trim();
      const msg = String(body || '').trim();
      if (!n || !fromEmail || !toEmail || !sub || !msg) {
        return fail(res, 400, 'name, email, to_email, subject and body are required.');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fromEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(toEmail)) {
        return fail(res, 400, 'Enter valid email addresses.');
      }
      let toUserId = null;
      let toName = '';
      const { data: member } = await supabase
        .from('team_members')
        .select('*')
        .eq('email', toEmail)
        .eq('active', true)
        .maybeSingle();
      if (member) {
        toUserId = member.user_id;
        toName = member.name;
      } else {
        const { data: author } = await supabase.from('authors').select('*').ilike('email', toEmail).maybeSingle();
        if (author) toName = author.name;
      }
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('staff_mail')
        .insert({
          from_user_id: null,
          from_name: n,
          from_email: fromEmail,
          to_user_id: toUserId,
          to_email: toEmail,
          to_name: toName,
          subject: sub.slice(0, 200),
          body: msg.slice(0, 5000),
          folder: 'inbox',
          read: false,
          created_at: now,
        })
        .select()
        .single();
      if (error) throw error;
      if (toUserId) {
        try {
          await supabase.from('notifications').insert({
            user_id: toUserId,
            email_to: toEmail,
            kind: 'mail',
            title: `Reader mail: ${sub.slice(0, 80)}`,
            body: `From ${n} <${fromEmail}>`,
            link: '/mail',
            read: false,
            email_status: 'queued',
            created_at: now,
          });
        } catch (_) {}
      }
      return res.status(201).json({ ok: true, id: data.id });
    }

    if (req.method === 'POST' && resource === 'comment') {
      const { id, name, body } = req.body || {};
      if (!id || !name || !body) return fail(res, 400, 'id, name and body are required.');
      const comments = await getSetting('comments', { enabled: true, hold: true });
      if (!comments?.enabled) return fail(res, 403, 'Comments are switched off.');
      const status = comments.hold ? 'pending' : 'approved';
      const { data, error } = await supabase
        .from('comments')
        .insert({
          article_id: Number(id),
          name: String(name).trim().slice(0, 80),
          body: String(body).trim().slice(0, 2000),
          status,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      try {
        await queueNotification({
          kind: 'comment',
          title: status === 'pending' ? 'New comment awaiting approval' : 'New reader comment',
          body: `${String(name).trim()}: ${String(body).trim().slice(0, 120)}`,
          link: '/comments',
          onlyIf: (prefs) => prefs.notify_comments && prefs.digest !== 'off',
        });
      } catch (_) {}
      return res.status(201).json({ ok: true, status: data.status, id: data.id });
    }

    if (req.method !== 'GET' && !(req.method === 'POST' && resource === 'view')) {
      // view can be GET
    }

    if (resource === 'view') {
      const id = Number(req.query.id || req.body?.id);
      if (!id) return fail(res, 400, 'Missing article id.');
      const now = new Date();
      await supabase.from('article_views').insert({
        article_id: id,
        viewed_at: now.toISOString(),
        day: now.toISOString().slice(0, 10),
      });
      const { data: art } = await supabase.from('articles').select('views').eq('id', id).maybeSingle();
      if (art) {
        await supabase.from('articles').update({ views: (art.views || 0) + 1 }).eq('id', id);
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

    if (resource === 'config') {
      const map = await allSettings();
      return res.status(200).json({
        site: '180news',
        origin: SITE_ORIGIN,
        ads_enabled: typeof map.ads_enabled === 'boolean' ? map.ads_enabled : map.ads_enabled?.enabled !== false,
        live_updates: map.live_updates ?? { enabled: true },
        comments: map.comments ?? { enabled: true, hold: true },
        contact: map.contact ?? {},
        crawl: map.crawl ?? { enabled: true, speed: 'normal', message: '' },
        notice: map.notice ?? { enabled: false, text: '' },
        elections_update: map.elections_update ?? { enabled: false, title: '', text: '' },
      });
    }

    if (resource === 'settings') {
      const map = await allSettings();
      return res.status(200).json({
        crawl: map.crawl ?? { enabled: true, speed: 'normal', message: '' },
        notice: map.notice ?? { enabled: false, text: '' },
        elections_update: map.elections_update ?? { enabled: false, title: '', text: '' },
        contact: map.contact ?? {},
        comments: map.comments ?? { enabled: true, hold: true },
        ads_enabled: typeof map.ads_enabled === 'boolean' ? map.ads_enabled : map.ads_enabled?.enabled !== false,
        live_updates: map.live_updates ?? { enabled: true },
      });
    }

    if (resource === 'sections') {
      const { data } = await supabase
        .from('sections')
        .select('*')
        .eq('enabled', true)
        .order('sort_order', { ascending: true });
      return res.status(200).json(data || []);
    }

    if (resource === 'authors') {
      const { data } = await supabase.from('authors').select('*').eq('active', true).order('name');
      return res.status(200).json(data || []);
    }

    if (resource === 'directory') {
      const map = await allSettings();
      const contact = map.contact || {};
      const { data: authors } = await supabase
        .from('authors')
        .select('id, name, title, bio, email, photo_url')
        .eq('active', true)
        .order('name');
      const { data: team } = await supabase
        .from('team_members')
        .select('id, name, email, role')
        .eq('active', true)
        .order('name');
      return res.status(200).json({
        newsroom: contact,
        authors: authors || [],
        team: team || [],
      });
    }

    if (resource === 'ads') {
      const rawAds = await getSetting('ads_enabled', true);
      const adsOn = typeof rawAds === 'boolean' ? rawAds : rawAds?.enabled !== false;
      if (!adsOn) return res.status(200).json([]);
      const { data } = await supabase.from('ads').select('*').eq('enabled', true);
      return res.status(200).json(data || []);
    }

    if (resource === 'articles') {
      const { data } = await supabase
        .from('articles')
        .select('*')
        .eq('status', 'published')
        .order('publish_at', { ascending: false })
        .limit(100);
      return res.status(200).json((data || []).map(briefArticle));
    }

    if (resource === 'article') {
      const id = Number(req.query.id);
      if (!id) return fail(res, 400, 'Missing id.');
      const { data } = await supabase.from('articles').select('*').eq('id', id).eq('status', 'published').maybeSingle();
      if (!data) return fail(res, 404, 'Story not found.');
      return res.status(200).json({
        ...fullArticle(data),
        path: storyPath(data.id),
        url: `${SITE_ORIGIN}${storyPath(data.id)}`,
      });
    }

    if (resource === 'comments') {
      const id = Number(req.query.id);
      if (!id) return fail(res, 400, 'Missing id.');
      const { data } = await supabase
        .from('comments')
        .select('id, name, body, created_at')
        .eq('article_id', id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
      return res.status(200).json(data || []);
    }

    // Default: homepage payload
    const map = await allSettings();
    const { data: sections } = await supabase
      .from('sections')
      .select('*')
      .eq('enabled', true)
      .order('sort_order', { ascending: true });

    const { data: published } = await supabase
      .from('articles')
      .select('*')
      .eq('status', 'published')
      .order('publish_at', { ascending: false });

    const items = published || [];
    const lead = items.find((a) => a.placement === 'main') || items[0] || null;
    const headlines = items.filter((a) => a.placement === 'headline' && a.id !== lead?.id).slice(0, 8);

    const homeBlocks = map.homepage?.blocks || [];
    let orderedSections = sections || [];
    if (homeBlocks.length) {
      const order = homeBlocks.filter((b) => b.enabled !== false).map((b) => b.id);
      orderedSections = [...orderedSections].sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return a.sort_order - b.sort_order;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }).filter((s) => {
        const b = homeBlocks.find((x) => x.id === s.id);
        return !b || b.enabled !== false;
      });
    }

    const sectionStories = orderedSections.map((s) => ({
      ...s,
      stories: items.filter((a) => a.section === s.slug && a.id !== lead?.id).slice(0, 6).map(briefArticle),
    }));

    const adsOn = typeof map.ads_enabled === 'boolean' ? map.ads_enabled : map.ads_enabled?.enabled !== false;
    const { data: ads } = adsOn
      ? await supabase.from('ads').select('*').eq('enabled', true)
      : { data: [] };

    return res.status(200).json({
      lead: lead ? fullArticle(lead) : null,
      headlines: headlines.map(briefArticle),
      sections: sectionStories,
      latest: items.slice(0, 20).map(briefArticle),
      crawl: map.crawl ?? { enabled: true, speed: 'normal', message: '' },
      notice: map.notice ?? { enabled: false, text: '' },
      elections_update: map.elections_update ?? { enabled: false, title: '', text: '' },
      contact: map.contact ?? {},
      ads: ads || [],
      ads_enabled: adsOn,
      site_origin: SITE_ORIGIN,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('public error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
