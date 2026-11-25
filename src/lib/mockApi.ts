// In-browser stand-in for the Vercel functions under /api (see api/*.js in
// this repository). Same routes, same payload shapes, same role rules —
// running entirely against the localStorage-backed store in localStore.ts
// so the duplicated CMS works without a live Supabase project.

import {
  getStore,
  save,
  nextId,
  slugify,
  briefArticle,
  fullArticle,
  findMemberByToken,
  queueNotification,
  storyPath,
  SITE_ORIGIN,
  MAIL_DOMAIN,
  type Role,
  type StoreArticle,
  type StoreTeamMember,
} from './localStore';

export interface MockResponse {
  status: number;
  body: unknown;
}

function ok(body: unknown, status = 200): MockResponse {
  return { status, body };
}

function fail(status: number, message: string, fields: Record<string, string> | null = null, code: string | null = null): MockResponse {
  const body: Record<string, unknown> = { error: message };
  if (code) body.code = code;
  if (fields) body.fields = fields;
  return { status, body };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type MemberAuth =
  | { ok: false; error: string; status: number }
  | { ok: true; member: StoreTeamMember };

function requireMember(token: string | null, roles: Role[] | null = null): MemberAuth {
  const member = findMemberByToken(token);
  if (!member) return { ok: false, error: 'Please sign in to continue.', status: 401 };
  if (roles && !roles.includes(member.role)) {
    return { ok: false, error: 'You do not have permission for this action.', status: 403 };
  }
  return { ok: true, member };
}

function canEditArticle(member: { role: Role; user_id: string }, article: StoreArticle) {
  if (member.role === 'owner' || member.role === 'editor') return true;
  return article.created_by === member.user_id && ['draft', 'review'].includes(article.status);
}

function notifyStory(article: StoreArticle, prevStatus: string | undefined) {
  if (article.status === 'published' && prevStatus !== 'published') {
    queueNotification({
      kind: 'publish',
      title: `Published: ${article.headline}`,
      body: `${article.author_name || 'Someone'} published a story.`,
      link: `/articles/${article.id}`,
      onlyIf: (prefs) => prefs.notify_publish && prefs.digest !== 'off',
    });
  } else if (article.status === 'review' && prevStatus !== 'review') {
    queueNotification({
      kind: 'review',
      title: `In review: ${article.headline}`,
      body: `${article.author_name || 'Someone'} sent a story for review.`,
      link: `/articles/${article.id}`,
      onlyIf: (prefs) => prefs.notify_review && prefs.digest !== 'off',
    });
  } else if (article.status === 'scheduled' && prevStatus !== 'scheduled') {
    queueNotification({
      kind: 'schedule',
      title: `Scheduled: ${article.headline}`,
      body: `Goes live ${article.publish_at || 'later'}.`,
      link: `/articles/${article.id}`,
      onlyIf: (prefs) => prefs.notify_schedule && prefs.digest !== 'off',
    });
  }
}

/** Runs every enabled automation matching an event — the "triggers" that
 * connect newsroom actions (publishing, scheduling, going breaking, a new
 * comment) to things the desk actually wants to happen next: a team
 * notification, a site banner, a share reminder, or a webhook call out.
 * Every run is logged so staff can see exactly what fired and why. */
function runAutomations(
  s: ReturnType<typeof getStore>,
  event: import('./localStore').StoreAutomationEvent,
  article: StoreArticle | null,
  extra?: { label?: string; body?: string },
  onlyId?: number
) {
  const matches = s.automations.filter((a) => a.enabled && a.event === event && (onlyId === undefined || a.id === onlyId));
  if (!matches.length) return;
  const label = article ? article.headline : extra?.label || event.replace(/_/g, ' ');
  const now = new Date().toISOString();

  for (const auto of matches) {
    let detail = '';
    switch (auto.action) {
      case 'notify_team':
        queueNotification({
          kind: 'automation',
          title: auto.name,
          body: article ? article.headline : extra?.body || '',
          link: article ? `/articles/${article.id}` : '/automations',
          onlyIf: () => true,
        });
        detail = 'Queued a notification for the newsroom team.';
        break;
      case 'site_banner': {
        const template = auto.config.message || '{headline}';
        const message = template.replace('{headline}', label);
        (s.settings as any).notice = { enabled: true, text: message };
        detail = `Updated the site notice banner: "${message}".`;
        break;
      }
      case 'social_reminder': {
        s.reminders.unshift({
          id: nextId('reminders'),
          title: `Share "${label}" on socials`,
          note: 'Post this story to Facebook and WhatsApp now that it is live.',
          due_at: now,
          done: false,
          author_id: article?.created_by || 'system',
          author_name: article?.author_name || 'Automation',
          created_at: now,
          updated_at: now,
        });
        detail = 'Added a reminder to share the story on Facebook & WhatsApp.';
        break;
      }
      case 'webhook':
        detail = auto.config.webhook_url
          ? `Simulated a webhook call to ${auto.config.webhook_url}.`
          : 'No webhook URL configured — nothing was sent.';
        break;
    }
    auto.run_count += 1;
    auto.last_run_at = now;
    auto.updated_at = now;
    s.automationRuns.unshift({
      id: nextId('automationRuns'),
      automation_id: auto.id,
      automation_name: auto.name,
      trigger_label: label,
      action: auto.action,
      detail,
      created_at: now,
    });
  }
  if (s.automationRuns.length > 200) s.automationRuns.length = 200;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

const DEFAULT_PREFS = {
  notify_publish: true,
  notify_review: true,
  notify_comments: true,
  notify_schedule: true,
  notify_team: false,
  digest: 'instant' as const,
};

export async function mockRequest(
  method: string,
  fullPath: string,
  body: unknown,
  token: string | null
): Promise<MockResponse> {
  const url = new URL(fullPath, 'https://local.invalid');
  const pathname = url.pathname;
  const q = url.searchParams;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, any>;
  const s = getStore();

  // ---------- /api/public (no auth required) ----------
  if (pathname === '/api/public') {
    const resource = q.get('resource') || 'homepage';

    if (method === 'POST' && resource === 'contact') {
      const name = String(b.name || '').trim();
      const fromEmail = String(b.email || '').trim().toLowerCase();
      const toEmail = String(b.to_email || '').trim().toLowerCase();
      const subject = String(b.subject || '').trim();
      const msg = String(b.body || '').trim();
      if (!name || !fromEmail || !toEmail || !subject || !msg) {
        return fail(400, 'name, email, to_email, subject and body are required.');
      }
      if (!EMAIL_RE.test(fromEmail) || !EMAIL_RE.test(toEmail)) {
        return fail(400, 'Enter valid email addresses.');
      }
      const member = s.team.find((m) => m.email.toLowerCase() === toEmail && m.active);
      const now = new Date().toISOString();
      const row = {
        id: nextId('mail'),
        from_user_id: null,
        from_name: name,
        from_email: fromEmail,
        to_user_id: member?.user_id || null,
        to_email: toEmail,
        to_name: member?.name || '',
        subject: subject.slice(0, 200),
        body: msg.slice(0, 5000),
        folder: 'inbox',
        read: false,
        starred: false,
        archived: false,
        deleted: false,
        draft: false,
        created_at: now,
        updated_at: now,
      };
      s.mail.unshift(row);
      if (member) {
        s.notifications.unshift({
          id: nextId('notifications'),
          user_id: member.user_id,
          kind: 'mail',
          title: `Reader mail: ${subject.slice(0, 80)}`,
          body: `From ${name} <${fromEmail}>`,
          link: '/mail',
          read: false,
          email_to: toEmail,
          email_status: 'queued',
          created_at: now,
        });
      }
      save();
      return ok({ ok: true, id: row.id }, 201);
    }

    if (resource === 'view') {
      const id = Number(q.get('id') || b.id);
      if (!id) return fail(400, 'Missing article id.');
      const now = new Date();
      s.events.article_views.push({ article_id: id, viewed_at: now.toISOString() });
      const art = s.articles.find((a) => a.id === id);
      if (art) art.views = (art.views || 0) + 1;
      save();
      return ok({ ok: true });
    }

    if (method !== 'GET') return fail(405, 'Method not allowed');

    if (resource === 'config') {
      const map = s.settings as any;
      return ok({
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
      const map = s.settings as any;
      return ok({
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
      return ok(
        s.sections
          .filter((sec) => sec.enabled)
          .sort((a, c) => a.sort_order - c.sort_order)
          .map((sec) => ({ id: sec.slug, label: sec.label }))
      );
    }

    if (resource === 'authors') {
      return ok(s.authors.filter((a) => a.active).sort((a, c) => a.name.localeCompare(c.name)));
    }

    if (resource === 'directory') {
      const contact = (s.settings as any).contact || {};
      return ok({
        newsroom: contact,
        profiles: s.profiles.filter((p) => p.active && p.show_in_directory).sort((a, c) => a.name.localeCompare(c.name)),
        authors: s.authors.filter((a) => a.active).sort((a, c) => a.name.localeCompare(c.name)),
        team: s.team.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, email: t.email, role: t.role })),
      });
    }

    if (resource === 'ads') {
      const raw = (s.settings as any).ads_enabled;
      const adsOn = typeof raw === 'boolean' ? raw : raw?.enabled !== false;
      if (!adsOn) return ok([]);
      return ok(s.ads.filter((a) => a.enabled));
    }

    if (resource === 'articles') {
      const items = s.articles
        .filter((a) => a.status === 'published')
        .sort((a, c) => new Date(c.publish_at || 0).getTime() - new Date(a.publish_at || 0).getTime())
        .slice(0, 100);
      return ok(items.map(briefArticle));
    }

    if (resource === 'article') {
      const id = Number(q.get('id'));
      if (!id) return fail(400, 'Missing id.');
      const art = s.articles.find((a) => a.id === id && a.status === 'published');
      if (!art) return fail(404, 'Story not found.');
      return ok({ ...fullArticle(art), path: storyPath(art.id), url: `${SITE_ORIGIN}${storyPath(art.id)}` });
    }

    if (resource === 'comments') {
      const id = Number(q.get('id'));
      if (!id) return fail(400, 'Missing id.');
      return ok(
        s.comments
          .filter((c) => c.article_id === id && c.status === 'approved')
          .sort((a, c) => new Date(c.created_at).getTime() - new Date(a.created_at).getTime())
          .map((c) => ({ id: c.id, name: c.name, body: c.body, created_at: c.created_at }))
      );
    }

    // Default: homepage payload
    const map = s.settings as any;
    const sections = s.sections.filter((sec) => sec.enabled).sort((a, c) => a.sort_order - c.sort_order);
    const published = s.articles.filter((a) => a.status === 'published');
    const lead = published.find((a) => a.placement === 'main') || published[0] || null;
    const headlines = published.filter((a) => a.placement === 'headline' && a.id !== lead?.id).slice(0, 8);

    const sectionStories = sections.map((sec) => ({
      id: sec.id,
      slug: sec.slug,
      label: sec.label,
      stories: published
        .filter((a) => a.section === sec.slug && a.id !== lead?.id)
        .slice(0, 6)
        .map(briefArticle),
    }));

    const adsOn = typeof map.ads_enabled === 'boolean' ? map.ads_enabled : map.ads_enabled?.enabled !== false;
    const ads = adsOn ? s.ads.filter((a) => a.enabled) : [];

    return ok({
      lead: lead ? fullArticle(lead) : null,
      headlines: headlines.map(briefArticle),
      sections: sectionStories,
      latest: published
        .slice()
        .sort((a, c) => new Date(c.publish_at || 0).getTime() - new Date(a.publish_at || 0).getTime())
        .slice(0, 20)
        .map(briefArticle),
      crawl: map.crawl ?? { enabled: true, speed: 'normal', message: '' },
      notice: map.notice ?? { enabled: false, text: '' },
      elections_update: map.elections_update ?? { enabled: false, title: '', text: '' },
      contact: map.contact ?? {},
      ads,
      ads_enabled: adsOn,
      site_origin: SITE_ORIGIN,
      generated_at: new Date().toISOString(),
    });
  }

  if (pathname === '/api/track') {
    const kind = String(b.kind || '');
    const now = new Date().toISOString();
    if (kind === 'page') {
      s.events.page_visits.push({ path: String(b.path || '/'), visited_at: now });
    } else if (kind === 'ad_impression') {
      s.events.ad_impressions.push({ ad_id: Number(b.ad_id), viewed_at: now });
    } else if (kind === 'ad_click') {
      s.events.ad_clicks.push({ ad_id: Number(b.ad_id), clicked_at: now });
    }
    save();
    return ok({ ok: true });
  }

  // Everything below requires a signed-in team member.
  if (pathname === '/api/team' && method === 'GET' && (q.get('me') === '1' || q.get('resource') === 'me')) {
    const auth = requireMember(token);
    if (!auth.ok) return fail(auth.status, auth.error);
    return ok(auth.member);
  }

  const auth = requireMember(token);
  if (!auth.ok) return fail(auth.status, auth.error);
  const member = auth.member;

  // ---------- /api/articles ----------
  if (pathname === '/api/articles') {
    if (method === 'GET') {
      const id = q.get('id');
      if (id) {
        const art = s.articles.find((a) => String(a.id) === id);
        if (!art) return fail(404, 'Story not found.');
        return ok(fullArticle(art));
      }
      let items = s.articles.slice();
      const status = q.get('status');
      const section = q.get('section');
      const authorId = q.get('author');
      const query = q.get('q');
      const limit = q.get('limit');
      if (status) items = items.filter((a) => a.status === status);
      if (section) items = items.filter((a) => a.section === section);
      if (authorId) items = items.filter((a) => String(a.author_id) === authorId);
      if (query) {
        const qq = query.toLowerCase();
        items = items.filter(
          (a) => a.headline.toLowerCase().includes(qq) || a.summary.toLowerCase().includes(qq) || a.author_name.toLowerCase().includes(qq)
        );
      }
      items.sort((a, c) => new Date(c.updated_at).getTime() - new Date(a.updated_at).getTime());
      if (limit) items = items.slice(0, Number(limit) || 50);

      const counts = { total: 0, draft: 0, review: 0, scheduled: 0, published: 0, hidden: 0 } as Record<string, number>;
      for (const a of s.articles) {
        counts.total += 1;
        if (counts[a.status] !== undefined) counts[a.status] += 1;
      }
      const brief = q.get('brief') === '1';
      return ok({ items: items.map((a) => (brief ? briefArticle(a) : fullArticle(a))), counts });
    }

    if (method === 'POST') {
      const fields: Record<string, string> = {};
      if (!b.headline || String(b.headline).trim().length < 4) {
        fields.headline = 'Give the story a headline (at least 4 characters).';
      }
      const status = b.status || 'draft';
      if (status !== 'draft' && !b.section) fields.section = 'Choose a category before leaving draft.';
      if (Object.keys(fields).length) return fail(400, 'Check the form.', fields);

      const now = new Date().toISOString();
      const row: StoreArticle = {
        id: nextId('articles'),
        headline: String(b.headline).trim(),
        summary: b.summary || '',
        body: b.body || '',
        section: b.section || '',
        tags: Array.isArray(b.tags) ? b.tags : [],
        image_url: b.image_url || null,
        image_caption: b.image_caption || '',
        image_credit: b.image_credit || '',
        author_name: b.author_name || member.name,
        author_id: null,
        placement: b.placement === 'main' || b.placement === 'headline' ? b.placement : 'none',
        status,
        publish_at: b.publish_at || (status === 'published' ? now : null),
        media: Array.isArray(b.media) ? b.media : [],
        views: 0,
        created_at: now,
        updated_at: now,
        created_by: member.user_id,
        assigned_to: null,
        due_at: null,
      };
      const placementWasMain = row.placement === 'main';
      if (placementWasMain) {
        for (const a of s.articles) if (a.placement === 'main') a.placement = 'headline';
      }
      s.articles.unshift(row);
      notifyStory(row, undefined);
      if (row.status === 'published') runAutomations(s, 'article_published', row);
      if (row.status === 'scheduled') runAutomations(s, 'article_scheduled', row);
      if (placementWasMain) runAutomations(s, 'breaking_set', row);
      save();
      return ok(fullArticle(row), 201);
    }

    if (method === 'PUT') {
      const id = Number(b.id);
      const art = s.articles.find((a) => a.id === id);
      if (!art) return fail(404, 'Story not found.');
      if (!canEditArticle(member, art)) return fail(403, 'You cannot edit this story.');
      const prevStatus = art.status;
      const prevPlacement = art.placement;
      const patch = { ...b };
      delete patch.id;
      Object.assign(art, patch);
      art.updated_at = new Date().toISOString();
      if (patch.placement === 'main') {
        for (const a of s.articles) if (a.id !== art.id && a.placement === 'main') a.placement = 'headline';
      }
      notifyStory(art, prevStatus);
      if (art.status === 'published' && prevStatus !== 'published') runAutomations(s, 'article_published', art);
      if (art.status === 'scheduled' && prevStatus !== 'scheduled') runAutomations(s, 'article_scheduled', art);
      if (art.placement === 'main' && prevPlacement !== 'main') runAutomations(s, 'breaking_set', art);
      save();
      return ok(fullArticle(art));
    }

    if (method === 'DELETE') {
      const id = Number(b.id);
      const idx = s.articles.findIndex((a) => a.id === id);
      if (idx === -1) return fail(404, 'Story not found.');
      s.articles.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/sections ----------
  if (pathname === '/api/sections') {
    if (method === 'GET') {
      const counts: Record<string, number> = {};
      for (const a of s.articles) if (a.section) counts[a.section] = (counts[a.section] || 0) + 1;
      return ok(
        s.sections
          .slice()
          .sort((a, c) => a.sort_order - c.sort_order)
          .map((sec) => ({ ...sec, count: counts[sec.slug] || 0 }))
      );
    }
    if (method === 'POST') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can add categories.');
      const label = String(b.label || '').trim();
      if (label.length < 2) return fail(400, 'Check the form.', { label: 'Give the category a name (at least 2 characters).' });
      let slug = slugify(label);
      if (s.sections.some((sec) => sec.slug === slug)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      const sort_order = Math.max(0, ...s.sections.map((sec) => sec.sort_order)) + 1;
      const row = { id: nextId('sections'), label, slug, enabled: true, sort_order };
      s.sections.push(row);
      save();
      return ok({ ...row, count: 0 }, 201);
    }
    if (method === 'PUT') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can change categories.');
      if (b.action === 'reorder' && Array.isArray(b.ids)) {
        b.ids.forEach((id: number, i: number) => {
          const sec = s.sections.find((x) => x.id === id);
          if (sec) sec.sort_order = i + 1;
        });
        save();
        return ok(s.sections.slice().sort((a, c) => a.sort_order - c.sort_order));
      }
      if (!b.id) return fail(400, 'Missing category id.');
      const sec = s.sections.find((x) => x.id === Number(b.id));
      if (!sec) return fail(404, 'Category not found.');
      if (b.label !== undefined) {
        const label = String(b.label).trim();
        if (label.length < 2) return fail(400, 'Check the form.', { label: 'Give the category a name (at least 2 characters).' });
        sec.label = label;
      }
      if (b.enabled !== undefined) sec.enabled = !!b.enabled;
      save();
      return ok(sec);
    }
    if (method === 'DELETE') {
      if (member.role !== 'owner') return fail(403, 'Only the owner can delete categories.');
      const idx = s.sections.findIndex((x) => x.id === Number(b.id));
      if (idx === -1) return fail(404, 'Category not found.');
      s.sections.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/tags ----------
  if (pathname === '/api/tags') {
    if (method === 'GET') {
      const map = new Map<string, { tag: string; count: number }>();
      for (const a of s.articles) {
        for (const t of a.tags || []) {
          const tag = String(t).trim();
          if (!tag) continue;
          const key = tag.toLowerCase();
          const cur = map.get(key) || { tag, count: 0 };
          cur.count += 1;
          map.set(key, cur);
        }
      }
      return ok([...map.values()].sort((a, c) => c.count - a.count || a.tag.localeCompare(c.tag)));
    }
    if (method === 'PUT') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can rename tags.');
      const from = String(b.from || '').trim();
      const to = String(b.to || '').trim();
      if (!from || !to) return fail(400, 'Provide from and to tag names.');
      let changed = 0;
      for (const a of s.articles) {
        let dirty = false;
        const next = (a.tags || []).map((t) => {
          if (String(t).toLowerCase() === from.toLowerCase()) {
            dirty = true;
            return to;
          }
          return t;
        });
        if (dirty) {
          a.tags = [...new Set(next)];
          changed += 1;
        }
      }
      save();
      return ok({ ok: true, changed });
    }
    if (method === 'DELETE') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can remove tags.');
      const tag = String(b.tag || '').trim();
      if (!tag) return fail(400, 'Missing tag.');
      for (const a of s.articles) {
        a.tags = (a.tags || []).filter((t) => String(t).toLowerCase() !== tag.toLowerCase());
      }
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/team (+ authors resource) ----------
  if (pathname === '/api/team') {
    if (q.get('resource') === 'authors' || q.get('authors') === '1') {
      if (method === 'GET') {
        const byName: Record<string, number> = {};
        for (const a of s.articles) {
          const key = (a.author_name || '').toLowerCase();
          if (key) byName[key] = (byName[key] || 0) + 1;
        }
        const authors = s.authors
          .slice()
          .sort((a, c) => a.name.localeCompare(c.name))
          .map((au) => ({ ...au, stories: byName[au.name.toLowerCase()] || 0 }));
        return ok({ authors });
      }
      if (method === 'POST') {
        if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can add authors.');
        const name = String(b.name || '').trim();
        if (name.length < 2) return fail(400, 'Check the form.', { name: 'Enter a name.' });
        const row = {
          id: nextId('authors'),
          name,
          title: b.title || '',
          bio: b.bio || '',
          email: b.email || '',
          photo_url: b.photo_url || null,
          active: b.active !== false,
        };
        s.authors.push(row);
        save();
        return ok({ ...row, stories: 0, renamed: 0 }, 201);
      }
      if (method === 'PUT') {
        if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can edit authors.');
        if (!b.id) return fail(400, 'Missing author id.');
        const prev = s.authors.find((a) => a.id === Number(b.id));
        if (!prev) return fail(404, 'Author not found.');
        const prevName = prev.name;
        for (const k of ['name', 'title', 'bio', 'email', 'photo_url', 'active']) {
          if (b[k] !== undefined) (prev as any)[k] = b[k];
        }
        let renamed = 0;
        if (prev.name !== prevName) {
          for (const a of s.articles) {
            if (a.author_name === prevName) {
              a.author_name = prev.name;
              renamed += 1;
            }
          }
        }
        save();
        return ok({ ...prev, renamed });
      }
      if (method === 'DELETE') {
        if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can remove authors.');
        const idx = s.authors.findIndex((a) => a.id === Number(b.id));
        if (idx === -1) return fail(404, 'Author not found.');
        s.authors.splice(idx, 1);
        save();
        return ok({ ok: true });
      }
    }

    if (method === 'GET') {
      return ok(
        s.team
          .slice()
          .sort((a, c) => new Date(a.created_at).getTime() - new Date(c.created_at).getTime())
          .map(({ id, user_id, name, email, role, active, created_at }) => ({ id, user_id, name, email, role, active, created_at }))
      );
    }

    if (method === 'POST') {
      if (member.role !== 'owner') return fail(403, 'Only the owner can add users.');
      const name = String(b.name || '').trim();
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      const role: Role = ['owner', 'editor', 'writer'].includes(b.role) ? b.role : 'writer';
      const fields: Record<string, string> = {};
      if (name.length < 2) fields.name = 'Enter their name.';
      if (!EMAIL_RE.test(email)) fields.email = 'Enter their email address.';
      if (password.length < 8) fields.password = 'Use at least 8 characters.';
      if (s.team.some((t) => t.email.toLowerCase() === email)) fields.email = 'That email is already on the team.';
      if (Object.keys(fields).length) return fail(400, 'Check the form.', fields);

      const userId = `demo-${Date.now().toString(36)}`;
      const row = { id: nextId('team'), user_id: userId, name, email, role, active: true, created_at: new Date().toISOString() };
      s.team.push(row);
      s.authUsers.push({ email, password, user_id: userId });
      s.prefs.push({ ...DEFAULT_PREFS, user_id: userId, email });
      save();
      queueNotification({
        kind: 'team',
        title: `Team: ${name} joined`,
        body: `${name} (${email}) added as ${role}.`,
        link: '/users',
        onlyIf: (prefs) => prefs.notify_team && prefs.digest !== 'off',
      });
      return ok({ ...row, password }, 201);
    }

    if (method === 'PUT') {
      if (b.action === 'my_profile') {
        const name = String(b.name || '').trim();
        if (name.length < 2) return fail(400, 'Check the form.', { name: 'Enter your name.' });
        const row = s.team.find((t) => t.user_id === member.user_id);
        if (row) row.name = name;
        save();
        return ok(row);
      }
      if (b.action === 'my_password') {
        const password = String(b.password || '');
        if (password.length < 8) return fail(400, 'Check the form.', { password: 'Use at least 8 characters.' });
        const cred = s.authUsers.find((u) => u.user_id === member.user_id);
        if (cred) cred.password = password;
        save();
        return ok({ ok: true });
      }
      if (member.role !== 'owner') return fail(403, 'Only the owner can update users.');
      if (!b.id) return fail(400, 'Missing user id.');
      const target = s.team.find((t) => t.id === Number(b.id));
      if (!target) return fail(404, 'User not found.');
      if (b.password) {
        if (String(b.password).length < 8) return fail(400, 'Check the form.', { password: 'Use at least 8 characters.' });
        const cred = s.authUsers.find((u) => u.user_id === target.user_id);
        if (cred) cred.password = String(b.password);
        save();
        return ok({ ok: true });
      }
      if (b.name !== undefined) target.name = b.name;
      if (b.role !== undefined && ['owner', 'editor', 'writer'].includes(b.role)) target.role = b.role;
      if (b.active !== undefined) target.active = !!b.active;
      save();
      return ok(target);
    }

    if (method === 'DELETE') {
      if (member.role !== 'owner') return fail(403, 'Only the owner can remove users.');
      const target = s.team.find((t) => t.id === Number(b.id));
      if (!target) return fail(404, 'User not found.');
      if (target.user_id === member.user_id) return fail(400, 'You cannot remove yourself.');
      s.team = s.team.filter((t) => t.id !== target.id);
      s.authUsers = s.authUsers.filter((u) => u.user_id !== target.user_id);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/comments ----------
  if (pathname === '/api/comments') {
    if (method === 'GET') {
      if (q.get('counts') === '1') {
        return ok({ pending: s.comments.filter((c) => c.status === 'pending').length });
      }
      const status = q.get('status');
      let items = s.comments.slice();
      if (status && status !== 'all') items = items.filter((c) => c.status === status);
      items.sort((a, c) => new Date(c.created_at).getTime() - new Date(a.created_at).getTime());
      const out = items.map((c) => ({
        ...c,
        headline: s.articles.find((a) => a.id === c.article_id)?.headline || '',
      }));
      return ok({ items: out });
    }
    if (method === 'PUT') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can moderate comments.');
      const c = s.comments.find((x) => x.id === Number(b.id));
      if (!c) return fail(404, 'Comment not found.');
      if (!b.status) return fail(400, 'Missing id or status.');
      c.status = b.status;
      save();
      return ok(c);
    }
    if (method === 'DELETE') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can delete comments.');
      const idx = s.comments.findIndex((x) => x.id === Number(b.id));
      if (idx === -1) return fail(404, 'Comment not found.');
      s.comments.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/notifications ----------
  if (pathname === '/api/notifications') {
    if (method === 'GET') {
      if (q.get('resource') === 'prefs') {
        const prefs = s.prefs.find((p) => p.user_id === member.user_id);
        return ok({ ...DEFAULT_PREFS, email: member.email, ...(prefs || {}), user_id: member.user_id });
      }
      const mine = s.notifications.filter((n) => n.user_id === member.user_id);
      if (q.get('counts') === '1') {
        return ok({ unread: mine.filter((n) => !n.read).length, total: mine.length });
      }
      return ok(
        mine
          .slice()
          .sort((a, c) => new Date(c.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 100)
      );
    }
    if (method === 'PUT') {
      if (b.action === 'prefs') {
        const email = String(b.email || member.email || '').trim().toLowerCase();
        if (email && !EMAIL_RE.test(email)) return fail(400, 'Check the form.', { email: 'Enter a valid email address.' });
        const patch = {
          user_id: member.user_id,
          email: email || member.email,
          notify_publish: b.notify_publish !== false,
          notify_review: b.notify_review !== false,
          notify_comments: b.notify_comments !== false,
          notify_schedule: b.notify_schedule !== false,
          notify_team: !!b.notify_team,
          digest: (['instant', 'daily', 'off'].includes(b.digest) ? b.digest : 'instant') as 'instant' | 'daily' | 'off',
        };
        const idx = s.prefs.findIndex((p) => p.user_id === member.user_id);
        if (idx >= 0) s.prefs[idx] = patch;
        else s.prefs.push(patch);
        save();
        return ok(patch);
      }
      if (b.action === 'read_all') {
        for (const n of s.notifications) if (n.user_id === member.user_id) n.read = true;
        save();
        return ok({ ok: true });
      }
      if (b.id) {
        const n = s.notifications.find((x) => x.id === Number(b.id) && x.user_id === member.user_id);
        if (!n) return fail(404, 'Notification not found.');
        n.read = b.read !== false;
        save();
        return ok(n);
      }
      return fail(400, 'Unknown action.');
    }
    if (method === 'DELETE') {
      const idx = s.notifications.findIndex((x) => x.id === Number(b.id) && x.user_id === member.user_id);
      if (idx >= 0) s.notifications.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/mail ----------
  // A Gmail-equivalent folder model, kept on the same staff_mail-shaped
  // rows the original CMS used: Inbox, Starred, Sent, Drafts, Archive and
  // Trash, with bulk select actions (archive / trash / restore / mark
  // read-unread) exactly like Gmail's own list toolbar.
  if (pathname === '/api/mail') {
    const myEmail = member.email.toLowerCase();
    const myId = member.user_id;
    const isMine = (m: (typeof s.mail)[number]) =>
      m.to_user_id === myId || m.to_email.toLowerCase() === myEmail || m.from_user_id === myId || m.from_email.toLowerCase() === myEmail;
    const isRecipient = (m: (typeof s.mail)[number]) => m.to_user_id === myId || m.to_email.toLowerCase() === myEmail;
    const isSender = (m: (typeof s.mail)[number]) => m.from_user_id === myId || m.from_email.toLowerCase() === myEmail;

    if (method === 'GET') {
      if (q.get('counts') === '1') {
        const mine = s.mail.filter((m) => isRecipient(m) && m.folder === 'inbox' && !m.archived && !m.deleted && !m.draft);
        return ok({ unread: mine.filter((m) => !m.read).length, total: mine.length });
      }
      if (q.get('resource') === 'directory') {
        return ok({
          authors: s.authors.filter((a) => a.active).sort((a, c) => a.name.localeCompare(c.name)),
          team: s.team
            .filter((t) => t.active)
            .sort((a, c) => a.name.localeCompare(c.name))
            .map(({ id, name, email, role }) => ({ id, name, email, role })),
        });
      }

      const boxParam = q.get('box') || 'inbox';
      const box = ['sent', 'starred', 'drafts', 'archive', 'trash'].includes(boxParam) ? boxParam : 'inbox';
      let items: typeof s.mail;
      if (box === 'trash') {
        items = s.mail.filter((m) => m.deleted && isMine(m));
      } else if (box === 'drafts') {
        items = s.mail.filter((m) => m.draft && isSender(m) && !m.deleted);
      } else if (box === 'sent') {
        items = s.mail.filter((m) => isSender(m) && !m.draft && !m.deleted);
      } else if (box === 'starred') {
        items = s.mail.filter((m) => m.starred && isMine(m) && !m.draft && !m.deleted);
      } else if (box === 'archive') {
        items = s.mail.filter((m) => m.archived && isRecipient(m) && !m.deleted);
      } else {
        items = s.mail.filter((m) => isRecipient(m) && m.folder === 'inbox' && !m.archived && !m.deleted && !m.draft);
      }

      const query = (q.get('q') || '').trim().toLowerCase();
      if (query) {
        items = items.filter(
          (m) =>
            m.subject.toLowerCase().includes(query) ||
            m.body.toLowerCase().includes(query) ||
            m.from_name.toLowerCase().includes(query) ||
            m.from_email.toLowerCase().includes(query) ||
            m.to_name.toLowerCase().includes(query) ||
            m.to_email.toLowerCase().includes(query)
        );
      }

      items = items.slice().sort((a, c) => new Date(c.updated_at || c.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
      return ok({ items, box });
    }

    if (method === 'POST') {
      const now = new Date().toISOString();
      const toEmail = String(b.to_email || '').trim().toLowerCase();
      const subject = String(b.subject || '').trim();
      const msgBody = String(b.body || '').trim();

      // Gmail auto-saves an in-progress compose as a draft — no recipient
      // or subject required, unlike a real send.
      if (b.draft) {
        const toMember = toEmail ? s.team.find((t) => t.email.toLowerCase() === toEmail && t.active) : null;
        const row = {
          id: nextId('mail'),
          from_user_id: myId,
          from_name: member.name,
          from_email: myEmail,
          to_user_id: toMember?.user_id || null,
          to_email: toEmail,
          to_name: toMember?.name || '',
          subject,
          body: msgBody,
          folder: 'draft',
          read: true,
          starred: false,
          archived: false,
          deleted: false,
          draft: true,
          created_at: now,
          updated_at: now,
        };
        s.mail.unshift(row);
        save();
        return ok(row, 201);
      }

      const fields: Record<string, string> = {};
      if (!toEmail || !EMAIL_RE.test(toEmail)) fields.to_email = 'Enter a valid recipient email.';
      if (subject.length < 2) fields.subject = 'Give the message a subject.';
      if (msgBody.length < 1) fields.body = 'Write a message.';
      if (Object.keys(fields).length) return fail(400, 'Check the form.', fields);

      const toMember = s.team.find((t) => t.email.toLowerCase() === toEmail && t.active);
      const toAuthor = !toMember ? s.authors.find((a) => a.email.toLowerCase() === toEmail) : null;

      // Sending from a saved draft replaces it rather than leaving a copy
      // behind in Drafts — the same behaviour as Gmail.
      if (b.draft_id) {
        const idx = s.mail.findIndex((m) => m.id === Number(b.draft_id) && m.draft && isSender(m));
        if (idx !== -1) s.mail.splice(idx, 1);
      }

      const row = {
        id: nextId('mail'),
        from_user_id: myId,
        from_name: member.name,
        from_email: myEmail,
        to_user_id: toMember?.user_id || null,
        to_email: toEmail,
        to_name: toMember?.name || toAuthor?.name || '',
        subject,
        body: msgBody,
        folder: 'inbox',
        read: false,
        starred: false,
        archived: false,
        deleted: false,
        draft: false,
        created_at: now,
        updated_at: now,
      };
      s.mail.unshift(row);
      if (toMember) {
        s.notifications.unshift({
          id: nextId('notifications'),
          user_id: toMember.user_id,
          kind: 'mail',
          title: `Mail: ${subject}`,
          body: `From ${member.name}: ${msgBody.slice(0, 120)}`,
          link: '/mail',
          read: false,
          email_to: toEmail,
          email_status: 'queued',
          created_at: now,
        });
      }
      save();
      return ok(row, 201);
    }

    if (method === 'PUT') {
      const ids: number[] = Array.isArray(b.ids) && b.ids.length ? b.ids.map(Number) : b.id ? [Number(b.id)] : [];
      if (!ids.length) return fail(400, 'Missing id.');
      const targets = s.mail.filter((m) => ids.includes(m.id));
      if (!targets.length) return fail(404, 'Message not found.');
      for (const msg of targets) {
        if (!isMine(msg)) return fail(403, 'Not your message.');
      }

      const now = new Date().toISOString();
      for (const msg of targets) {
        if (b.starred !== undefined) msg.starred = !!b.starred;
        if (b.read !== undefined && isRecipient(msg)) msg.read = b.read !== false;
        if (b.archived !== undefined && isRecipient(msg)) {
          msg.archived = !!b.archived;
          if (msg.archived) msg.folder = 'archive';
          else msg.folder = 'inbox';
        }
        if (b.deleted !== undefined) {
          msg.deleted = !!b.deleted;
        }
        // Editing a draft in place (compose panel autosave / manual save).
        if (msg.draft) {
          if (b.to_email !== undefined) {
            const toEmail = String(b.to_email).trim().toLowerCase();
            const toMember = s.team.find((t) => t.email.toLowerCase() === toEmail && t.active);
            msg.to_email = toEmail;
            msg.to_user_id = toMember?.user_id || null;
            msg.to_name = toMember?.name || msg.to_name;
          }
          if (b.subject !== undefined) msg.subject = b.subject;
          if (b.body !== undefined) msg.body = b.body;
        }
        msg.updated_at = now;
      }
      save();
      return ok(targets.length === 1 ? targets[0] : { ok: true, updated: targets.length });
    }

    if (method === 'DELETE') {
      const ids: number[] = Array.isArray(b.ids) && b.ids.length ? b.ids.map(Number) : b.id ? [Number(b.id)] : [];
      if (!ids.length) return fail(400, 'Missing id.');
      for (const id of ids) {
        const idx = s.mail.findIndex((m) => m.id === id);
        if (idx === -1) continue;
        if (!isMine(s.mail[idx])) return fail(403, 'Not your message.');
        s.mail.splice(idx, 1);
      }
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/notes ----------
  if (pathname === '/api/notes') {
    if (method === 'GET') {
      const query = (q.get('q') || '').trim().toLowerCase();
      let items = s.notes.slice();
      if (query) {
        items = items.filter(
          (n) => n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query)
        );
      }
      items.sort((a, c) => {
        if (a.pinned !== c.pinned) return a.pinned ? -1 : 1;
        return new Date(c.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      return ok({ notes: items, total: items.length });
    }
    if (method === 'POST') {
      const title = String(b.title || '').trim() || 'Untitled note';
      const now = new Date().toISOString();
      const row = {
        id: nextId('notes'),
        title,
        body: b.body || '',
        pinned: false,
        author_id: member.user_id,
        author_name: member.name,
        created_at: now,
        updated_at: now,
      };
      s.notes.unshift(row);
      save();
      return ok(row, 201);
    }
    if (method === 'PUT') {
      const note = s.notes.find((n) => n.id === Number(b.id));
      if (!note) return fail(404, 'Note not found.');
      if (b.title !== undefined) note.title = String(b.title).trim() || 'Untitled note';
      if (b.body !== undefined) note.body = b.body;
      if (b.pinned !== undefined) note.pinned = !!b.pinned;
      note.updated_at = new Date().toISOString();
      save();
      return ok(note);
    }
    if (method === 'DELETE') {
      const idx = s.notes.findIndex((n) => n.id === Number(b.id));
      if (idx === -1) return fail(404, 'Note not found.');
      s.notes.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/reminders ----------
  if (pathname === '/api/reminders') {
    if (method === 'GET') {
      const items = s.reminders.slice().sort((a, c) => {
        if (a.done !== c.done) return a.done ? 1 : -1;
        const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
        const cd = c.due_at ? new Date(c.due_at).getTime() : Infinity;
        if (ad !== cd) return ad - cd;
        return new Date(c.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return ok({ reminders: items, total: items.length });
    }
    if (method === 'POST') {
      const title = String(b.title || '').trim();
      if (title.length < 2) return fail(400, 'Check the form.', { title: 'Give the reminder a short title.' });
      const now = new Date().toISOString();
      const row = {
        id: nextId('reminders'),
        title,
        note: b.note || '',
        due_at: b.due_at || null,
        done: false,
        author_id: member.user_id,
        author_name: member.name,
        created_at: now,
        updated_at: now,
      };
      s.reminders.unshift(row);
      save();
      return ok(row, 201);
    }
    if (method === 'PUT') {
      const reminder = s.reminders.find((r) => r.id === Number(b.id));
      if (!reminder) return fail(404, 'Reminder not found.');
      if (b.title !== undefined) {
        const title = String(b.title).trim();
        if (title.length < 2) return fail(400, 'Check the form.', { title: 'Give the reminder a short title.' });
        reminder.title = title;
      }
      if (b.note !== undefined) reminder.note = b.note;
      if (b.due_at !== undefined) reminder.due_at = b.due_at || null;
      if (b.done !== undefined) reminder.done = !!b.done;
      reminder.updated_at = new Date().toISOString();
      save();
      return ok(reminder);
    }
    if (method === 'DELETE') {
      const idx = s.reminders.findIndex((r) => r.id === Number(b.id));
      if (idx === -1) return fail(404, 'Reminder not found.');
      s.reminders.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/automations ----------
  // User-configurable triggers: "when X happens on the news app, do Y" —
  // publish a story, schedule one, promote it to breaking, or receive a
  // comment, and the desk gets a notification, a site banner, a social
  // share reminder, or a webhook call, automatically. Owners and editors
  // manage the rules; every run is logged for auditing.
  const AUTOMATION_EVENTS = new Set(['article_published', 'article_scheduled', 'breaking_set', 'comment_received']);
  const AUTOMATION_ACTIONS = new Set(['notify_team', 'site_banner', 'social_reminder', 'webhook']);

  if (pathname === '/api/automations') {
    if (method === 'GET') {
      const automations = s.automations.slice().sort((a, c) => a.id - c.id);
      const runs = s.automationRuns.slice(0, 30);
      return ok({ automations, runs });
    }

    if (method === 'POST') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can create automations.');
      const name = String(b.name || '').trim();
      const fields: Record<string, string> = {};
      if (name.length < 3) fields.name = 'Give the automation a short name.';
      if (!AUTOMATION_EVENTS.has(b.event)) fields.event = 'Choose a trigger event.';
      if (!AUTOMATION_ACTIONS.has(b.action)) fields.action = 'Choose an action.';
      if (Object.keys(fields).length) return fail(400, 'Check the form.', fields);

      const now = new Date().toISOString();
      const row = {
        id: nextId('automations'),
        name,
        event: b.event,
        action: b.action,
        config: {
          message: b.config?.message || '',
          webhook_url: b.config?.webhook_url || '',
        },
        enabled: b.enabled !== false,
        run_count: 0,
        last_run_at: null,
        created_at: now,
        updated_at: now,
      };
      s.automations.push(row);
      save();
      return ok(row, 201);
    }

    if (method === 'PUT') {
      const automation = s.automations.find((a) => a.id === Number(b.id));
      if (!automation) return fail(404, 'Automation not found.');

      if (b.action_type === 'run_test') {
        const sample = s.articles.find((a) => a.status === 'published') || s.articles[0] || null;
        const labelByEvent: Record<string, string> = {
          article_published: sample ? sample.headline : 'Sample published story',
          article_scheduled: sample ? sample.headline : 'Sample scheduled story',
          breaking_set: sample ? sample.headline : 'Sample breaking story',
          comment_received: 'A reader comment on a story',
        };
        const wasEnabled = automation.enabled;
        automation.enabled = true;
        runAutomations(
          s,
          automation.event,
          automation.event === 'comment_received' ? null : sample,
          { label: labelByEvent[automation.event], body: 'Test run triggered from the Automations page.' },
          automation.id
        );
        automation.enabled = wasEnabled;
        save();
        return ok({ ok: true, ranAt: new Date().toISOString() });
      }

      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can change automations.');
      if (b.name !== undefined) {
        const name = String(b.name).trim();
        if (name.length < 3) return fail(400, 'Check the form.', { name: 'Give the automation a short name.' });
        automation.name = name;
      }
      if (b.event !== undefined && AUTOMATION_EVENTS.has(b.event)) automation.event = b.event;
      if (b.action !== undefined && AUTOMATION_ACTIONS.has(b.action)) automation.action = b.action;
      if (b.config !== undefined) {
        automation.config = {
          message: b.config?.message ?? automation.config.message,
          webhook_url: b.config?.webhook_url ?? automation.config.webhook_url,
        };
      }
      if (b.enabled !== undefined) automation.enabled = !!b.enabled;
      automation.updated_at = new Date().toISOString();
      save();
      return ok(automation);
    }

    if (method === 'DELETE') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can delete automations.');
      const idx = s.automations.findIndex((a) => a.id === Number(b.id));
      if (idx === -1) return fail(404, 'Automation not found.');
      s.automations.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/email-accounts ----------
  // Newsroom mailboxes on the 180news.co.za domain (tips@, sport@, etc.) —
  // managed from Settings, separate from staff sign-in accounts under
  // Users and roles. Each one can forward to a team member's desk inbox.
  const LOCAL_PART_RE = /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/i;

  if (pathname === '/api/email-accounts') {
    const withTeamName = (row: (typeof s.emailAccounts)[number]) => ({
      ...row,
      forward_to_name: row.forward_to_user_id ? s.team.find((t) => t.user_id === row.forward_to_user_id)?.name || null : null,
    });

    if (method === 'GET') {
      const items = s.emailAccounts.slice().sort((a, c) => a.local_part.localeCompare(c.local_part)).map(withTeamName);
      return ok({ accounts: items, domain: MAIL_DOMAIN });
    }

    if (method === 'POST') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can add email accounts.');
      const localPart = String(b.local_part || '').trim().toLowerCase();
      const fields: Record<string, string> = {};
      if (!LOCAL_PART_RE.test(localPart)) {
        fields.local_part = 'Use letters, numbers, dots or hyphens only, e.g. "sport" or "news-tips".';
      }
      if (s.emailAccounts.some((a) => a.local_part === localPart)) {
        fields.local_part = `${localPart}@${MAIL_DOMAIN} already exists.`;
      }
      const displayName = String(b.display_name || '').trim();
      if (displayName.length < 2) fields.display_name = 'Give the mailbox a name.';
      if (Object.keys(fields).length) return fail(400, 'Check the form.', fields);

      const forwardTo = b.forward_to_user_id ? s.team.find((t) => t.user_id === b.forward_to_user_id && t.active) : null;
      const row = {
        id: nextId('emailAccounts'),
        local_part: localPart,
        email: `${localPart}@${MAIL_DOMAIN}`,
        display_name: displayName,
        forward_to_user_id: forwardTo?.user_id || null,
        active: true,
        created_at: new Date().toISOString(),
      };
      s.emailAccounts.push(row);
      save();
      return ok(withTeamName(row), 201);
    }

    if (method === 'PUT') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can change email accounts.');
      const row = s.emailAccounts.find((a) => a.id === Number(b.id));
      if (!row) return fail(404, 'Email account not found.');
      if (b.display_name !== undefined) {
        const displayName = String(b.display_name).trim();
        if (displayName.length < 2) return fail(400, 'Check the form.', { display_name: 'Give the mailbox a name.' });
        row.display_name = displayName;
      }
      if (b.forward_to_user_id !== undefined) {
        const forwardTo = b.forward_to_user_id ? s.team.find((t) => t.user_id === b.forward_to_user_id && t.active) : null;
        row.forward_to_user_id = forwardTo?.user_id || null;
      }
      if (b.active !== undefined) row.active = !!b.active;
      save();
      return ok(withTeamName(row));
    }

    if (method === 'DELETE') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can remove email accounts.');
      const idx = s.emailAccounts.findIndex((a) => a.id === Number(b.id));
      if (idx === -1) return fail(404, 'Email account not found.');
      s.emailAccounts.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/interviews ----------
  // A standalone recording studio and interview library — independent of
  // any single story. Interviews can be recorded, transcribed, edited and
  // kept in the library, then linked to one or more published/draft
  // articles, which appends the recording + transcript as audio media on
  // that article (same shape the article editor's own recorder produces).
  if (pathname === '/api/interviews') {
    const withArticle = (row: typeof s.interviews[number]) => ({
      ...row,
      article_headline: row.article_id ? s.articles.find((a) => a.id === row.article_id)?.headline || null : null,
    });

    if (method === 'GET') {
      if (q.get('id')) {
        const row = s.interviews.find((r) => r.id === Number(q.get('id')));
        if (!row) return fail(404, 'Interview not found.');
        return ok(withArticle(row));
      }
      const items = s.interviews
        .slice()
        .sort((a, c) => new Date(c.created_at).getTime() - new Date(a.created_at).getTime())
        .map(withArticle);
      return ok({ interviews: items, total: items.length });
    }

    if (method === 'POST') {
      const title = String(b.title || '').trim() || 'Untitled interview';
      if (!b.audio_url) return fail(400, 'Missing recorded audio.');
      const now = new Date().toISOString();
      const row = {
        id: nextId('interviews'),
        title,
        guest_name: String(b.guest_name || 'Guest').trim() || 'Guest',
        host_name: String(b.host_name || member.name).trim() || member.name,
        audio_url: b.audio_url,
        duration: Number(b.duration) || 0,
        transcript: b.transcript || '',
        segments: Array.isArray(b.segments) ? b.segments : [],
        status: (Array.isArray(b.segments) && b.segments.length ? 'transcribed' : 'draft') as 'draft' | 'transcribed',
        article_id: null,
        author_id: member.user_id,
        author_name: member.name,
        created_at: now,
        updated_at: now,
      };
      s.interviews.unshift(row);
      save();
      return ok(withArticle(row), 201);
    }

    if (method === 'PUT') {
      const row = s.interviews.find((r) => r.id === Number(b.id));
      if (!row) return fail(404, 'Interview not found.');

      if (b.action === 'link') {
        const article = s.articles.find((a) => a.id === Number(b.article_id));
        if (!article) return fail(404, 'Story not found.');
        const clean = (row.segments || []).filter((seg) => seg.text.trim());
        const transcriptText =
          row.transcript ||
          (clean.length
            ? clean.map((seg) => `[${Math.floor(seg.start / 60)}:${String(Math.floor(seg.start % 60)).padStart(2, '0')}] ${seg.speaker}: ${seg.text.trim()}`).join('\n')
            : 'No transcript captured — add one by hand.');
        article.media = [
          ...(article.media || []),
          {
            kind: 'audio',
            url: row.audio_url,
            youtube_id: null,
            title: row.title,
            caption: '',
            credit: '',
            slot: 'top',
            width: null,
            height: null,
            content_type: 'audio/webm',
            size: null,
            file_name: `${row.title}.webm`,
            transcript: transcriptText,
            segments: clean,
          },
        ];
        article.updated_at = new Date().toISOString();
        row.article_id = article.id;
        row.status = 'linked';
        row.updated_at = new Date().toISOString();
        save();
        return ok(withArticle(row));
      }

      if (b.action === 'unlink') {
        row.article_id = null;
        row.status = row.segments?.length ? 'transcribed' : 'draft';
        row.updated_at = new Date().toISOString();
        save();
        return ok(withArticle(row));
      }

      if (b.title !== undefined) row.title = String(b.title).trim() || 'Untitled interview';
      if (b.guest_name !== undefined) row.guest_name = String(b.guest_name).trim() || 'Guest';
      if (b.host_name !== undefined) row.host_name = String(b.host_name).trim() || row.host_name;
      if (b.transcript !== undefined) row.transcript = b.transcript;
      if (b.segments !== undefined) row.segments = Array.isArray(b.segments) ? b.segments : row.segments;
      row.updated_at = new Date().toISOString();
      save();
      return ok(withArticle(row));
    }

    if (method === 'DELETE') {
      const idx = s.interviews.findIndex((r) => r.id === Number(b.id));
      if (idx === -1) return fail(404, 'Interview not found.');
      s.interviews.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/media ----------
  if (pathname === '/api/media') {
    if (method === 'GET') {
      return ok(s.media.slice().sort((a, c) => new Date(c.created_at).getTime() - new Date(a.created_at).getTime()));
    }
    if (method === 'POST') {
      const { fileName, fileBase64, contentType, width, height, alt } = b;
      if (!fileBase64 || !fileName) return fail(400, 'Missing file data.');
      const ct = contentType || 'application/octet-stream';
      const kind = ct.startsWith('video/') ? 'video' : ct.startsWith('audio/') ? 'audio' : 'image';
      const url = `data:${ct};base64,${fileBase64}`;
      const row = {
        id: nextId('media'),
        url,
        file_name: fileName,
        content_type: ct,
        alt: alt || '',
        width: width || null,
        height: height || null,
        size: Math.round((String(fileBase64).length * 3) / 4),
        path: `uploads/${Date.now()}-${String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`,
        kind,
        created_at: new Date().toISOString(),
      };
      s.media.unshift(row);
      save();
      return ok(row, 201);
    }
    if (method === 'PUT') {
      const row = s.media.find((m) => m.id === Number(b.id));
      if (!row) return fail(404, 'Media not found.');
      row.alt = b.alt ?? '';
      save();
      return ok(row);
    }
    if (method === 'DELETE') {
      const idx = s.media.findIndex((m) => m.id === Number(b.id));
      if (idx === -1) return fail(404, 'Media not found.');
      s.media.splice(idx, 1);
      save();
      return ok({ ok: true });
    }
  }

  // ---------- /api/ads ----------
  if (pathname === '/api/ads') {
    if (method === 'GET') return ok(s.ads.slice().sort((a, c) => a.id - c.id));
    if (method === 'PUT') {
      if (!['owner', 'editor'].includes(member.role)) return fail(403, 'Only editors can manage ads.');
      if (!b.id) return fail(400, 'Missing ad id.');
      const row = s.ads.find((a) => a.id === Number(b.id));
      if (!row) return fail(404, 'Ad not found.');
      for (const k of ['advertiser', 'link_url', 'image_url', 'position', 'enabled', 'width', 'height', 'slot', 'slot_name']) {
        if (b[k] !== undefined) (row as any)[k] = b[k];
      }
      save();
      return ok(row);
    }
  }

  // ---------- /api/settings ----------
  if (pathname === '/api/settings') {
    const DEFAULTS: Record<string, unknown> = {
      crawl: { enabled: true, speed: 'normal', message: '' },
      notice: { enabled: false, text: '' },
      elections_update: { enabled: false, title: '', text: '' },
      contact: { email: 'newsroom@180news.co.za', phone: '+2781 659 6218', ads_phone: '+2781 659 6218' },
      comments: { enabled: true, hold: true },
      ads_enabled: true,
      live_updates: { enabled: true },
      homepage: { blocks: [] },
      site_link: { sites: [{ name: '180news', origin: SITE_ORIGIN }] },
    };
    if (method === 'GET' && q.get('resource') === 'homepage') {
      const counts: Record<string, number> = {};
      for (const a of s.articles) if (a.status === 'published') counts[a.section] = (counts[a.section] || 0) + 1;
      const saved = ((s.settings as any).homepage?.blocks || []) as Array<{ id: number; enabled?: boolean }>;
      const byId = Object.fromEntries(saved.map((bl) => [bl.id, bl]));
      let blocks = s.sections
        .slice()
        .sort((a, c) => a.sort_order - c.sort_order)
        .map((sec) => ({
          id: sec.id,
          slug: sec.slug,
          label: sec.label,
          enabled: byId[sec.id]?.enabled ?? true,
          categoryEnabled: sec.enabled,
          count: counts[sec.slug] || 0,
        }));
      if (saved.length) {
        const order = saved.map((bl) => bl.id);
        blocks = blocks.sort((a, c) => {
          const ai = order.indexOf(a.id);
          const ci = order.indexOf(c.id);
          if (ai === -1 && ci === -1) return 0;
          if (ai === -1) return 1;
          if (ci === -1) return -1;
          return ai - ci;
        });
      }
      return ok(blocks);
    }
    if (method === 'GET') {
      const map = s.settings as any;
      const out = { ...DEFAULTS, ...map };
      out.site_link = map.site_link || DEFAULTS.site_link;
      const ae = map.ads_enabled;
      out.ads_enabled = typeof ae === 'boolean' ? ae : ae?.enabled !== false;
      return ok(out);
    }
    if (method === 'PUT') {
      const canEdit = ['owner', 'editor'].includes(member.role);
      const { key, value } = b;
      if (!key) return fail(400, 'Missing setting key.');
      if (!canEdit && key !== 'crawl') return fail(403, 'Only editors can change settings.');
      (s.settings as any)[key] = value;
      save();
      const map = s.settings as any;
      const out = { ...DEFAULTS, ...map };
      out.site_link = map.site_link || DEFAULTS.site_link;
      const ae = map.ads_enabled;
      out.ads_enabled = typeof ae === 'boolean' ? ae : ae?.enabled !== false;
      return ok(out);
    }
  }

  // ---------- /api/dashboard ----------
  if (pathname === '/api/dashboard') {
    if (method !== 'GET') return fail(405, 'Method not allowed');
    const report = q.get('report');
    const days = Number(q.get('days')) || 7;

    if (report === 'analytics') {
      const since = daysAgo(days).getTime();
      const views = s.events.article_views.filter((v) => new Date(v.viewed_at).getTime() >= since);
      const artMap = Object.fromEntries(s.articles.map((a) => [a.id, a]));
      const byStory: Record<number, number> = {};
      const byCat: Record<string, number> = {};
      for (const v of views) {
        byStory[v.article_id] = (byStory[v.article_id] || 0) + 1;
        const sec = artMap[v.article_id]?.section || 'other';
        byCat[sec] = (byCat[sec] || 0) + 1;
      }
      const topStories = Object.entries(byStory)
        .map(([id, reads]) => ({
          id: Number(id),
          headline: artMap[Number(id)]?.headline || `Story #${id}`,
          section: artMap[Number(id)]?.section || '',
          reads,
        }))
        .sort((a, c) => c.reads - a.reads)
        .slice(0, 10);
      const byCategory = Object.entries(byCat)
        .map(([section, reads]) => ({ section, reads }))
        .sort((a, c) => c.reads - a.reads);
      const published = s.articles.filter((a) => a.status === 'published' && a.publish_at && new Date(a.publish_at).getTime() >= since).length;

      const visits = s.events.page_visits.filter((v) => new Date(v.visited_at).getTime() >= since);
      const byPath: Record<string, number> = {};
      for (const v of visits) byPath[v.path] = (byPath[v.path] || 0) + 1;
      const topPages = Object.entries(byPath)
        .map(([path, hits]) => ({ path, hits }))
        .sort((a, c) => c.hits - a.hits)
        .slice(0, 15);

      const clicks = s.events.ad_clicks.filter((v) => new Date(v.clicked_at).getTime() >= since);
      const impressions = s.events.ad_impressions.filter((v) => new Date(v.viewed_at).getTime() >= since);
      const adMap = Object.fromEntries(s.ads.map((a) => [a.id, a]));
      const rateMap = Object.fromEntries(s.events.ad_rates.map((r) => [r.ad_id, r]));
      const byAdClicks: Record<number, number> = {};
      const byAdImps: Record<number, number> = {};
      for (const c of clicks) byAdClicks[c.ad_id] = (byAdClicks[c.ad_id] || 0) + 1;
      for (const i of impressions) byAdImps[i.ad_id] = (byAdImps[i.ad_id] || 0) + 1;
      const adIds = new Set([...s.ads.map((a) => a.id), ...Object.keys(byAdClicks).map(Number), ...Object.keys(byAdImps).map(Number)]);
      let totalSpend = 0;
      const adPerformance = [...adIds]
        .map((id) => {
          const ad = adMap[id] || ({} as any);
          const rate = rateMap[id] || { cost_per_click: 0, cost_per_mille: 0, currency: 'ZAR' };
          const c = byAdClicks[id] || 0;
          const im = byAdImps[id] || 0;
          const spend = c * rate.cost_per_click + (im / 1000) * rate.cost_per_mille;
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
        .sort((a, c) => c.clicks - a.clicks || c.impressions - a.impressions);

      // Day-by-day series for the colour-coded timeline chart.
      const daily: Array<{ date: string; reads: number; visits: number; adClicks: number }> = [];
      for (let i = days - 1; i >= 0; i--) {
        const dayStart = daysAgo(i).getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        daily.push({
          date: new Date(dayStart).toISOString().slice(0, 10),
          reads: views.filter((v) => { const t = new Date(v.viewed_at).getTime(); return t >= dayStart && t < dayEnd; }).length,
          visits: visits.filter((v) => { const t = new Date(v.visited_at).getTime(); return t >= dayStart && t < dayEnd; }).length,
          adClicks: clicks.filter((v) => { const t = new Date(v.clicked_at).getTime(); return t >= dayStart && t < dayEnd; }).length,
        });
      }

      // Newsroom activity timeline — one entry per event, deduped across the
      // per-recipient notification rows queued by queueNotification().
      const seenEvents = new Set<string>();
      const timeline = s.notifications
        .filter((n) => new Date(n.created_at).getTime() >= since)
        .filter((n) => {
          const key = `${n.kind}|${n.title}|${n.created_at}`;
          if (seenEvents.has(key)) return false;
          seenEvents.add(key);
          return true;
        })
        .sort((a, c) => new Date(c.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 12)
        .map((n) => ({ kind: n.kind, title: n.title, body: n.body, link: n.link, created_at: n.created_at }));

      return ok({
        days,
        totals: {
          reads: views.length,
          published,
          stories: s.articles.filter((a) => a.status === 'published').length,
          pageVisits: visits.length,
          adClicks: clicks.length,
          adImpressions: impressions.length,
          adSpend: Math.round(totalSpend * 100) / 100,
        },
        topStories,
        byCategory,
        topPages,
        adPerformance,
        daily,
        timeline,
      });
    }

    const counts = { total: 0, draft: 0, review: 0, scheduled: 0, published: 0, hidden: 0 } as Record<string, number>;
    for (const a of s.articles) {
      counts.total += 1;
      if (counts[a.status] !== undefined) counts[a.status] += 1;
    }
    const today = startOfDay(new Date());
    const week = daysAgo(7);
    const publishedToday = s.articles.filter((a) => a.status === 'published' && a.publish_at && new Date(a.publish_at) >= today).length;
    const publishedWeek = s.articles.filter((a) => a.status === 'published' && a.publish_at && new Date(a.publish_at) >= week).length;
    const published = s.articles.filter((a) => a.status === 'published');
    const lead = published.find((a) => a.placement === 'main') || null;
    const headlines = published
      .filter((a) => a.placement === 'headline')
      .sort((a, c) => new Date(c.publish_at || 0).getTime() - new Date(a.publish_at || 0).getTime())
      .slice(0, 8)
      .map(briefArticle);
    const upcoming = s.articles
      .filter((a) => a.status === 'scheduled')
      .sort((a, c) => new Date(a.publish_at || 0).getTime() - new Date(c.publish_at || 0).getTime())
      .slice(0, 8)
      .map(briefArticle);
    const crawl = ((s.settings as any).crawl as any) || { enabled: true, speed: 'normal', message: '' };
    const yesterday = daysAgo(1).getTime();
    const todayMs = today.getTime();
    const viewsToday = s.events.article_views.filter((v) => new Date(v.viewed_at).getTime() >= todayMs).length;
    const viewsYesterday = s.events.article_views.filter((v) => {
      const t = new Date(v.viewed_at).getTime();
      return t >= yesterday && t < todayMs;
    }).length;

    return ok({
      counts,
      publishedToday,
      publishedWeek,
      lead: lead ? briefArticle(lead) : null,
      headlines,
      crawl,
      upcoming,
      traffic: { today: viewsToday, yesterdaySameTime: viewsYesterday },
      recent: s.articles.slice(0, 10).map(briefArticle),
    });
  }

  return fail(404, 'Not found.');
}
