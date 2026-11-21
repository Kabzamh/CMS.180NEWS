import supabase from './db-client.js';

export const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export const isHttpUrl = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

export const canEdit = (m) => m.role === 'owner' || m.role === 'editor';

export function fail(res, err) {
  console.error('API error:', err);
  res.status(500).json({ error: err?.message || 'Something went wrong on the server.' });
}

/*
 * Team membership and roles live in each account's app_metadata, which only
 * the server (service role) can write. Nothing a browser can reach, including
 * the database tables, can grant someone access to the newsroom.
 */
const META_KEY = 'newsroom';
export const ROLES = ['owner', 'editor', 'writer'];

export function memberFromUser(user) {
  const meta = user?.app_metadata?.[META_KEY];
  if (!meta || !ROLES.includes(meta.role)) return null;
  const email = (user.email || '').toLowerCase();
  return {
    id: Number(meta.member_id),
    uid: user.id,
    name: meta.name || email.split('@')[0],
    email,
    role: meta.role,
    active: meta.active !== false,
    created_at: meta.added_at || user.created_at,
    last_seen_at: user.last_sign_in_at || null,
  };
}

export async function listAuthUsers() {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    all.push(...users);
    if (users.length < 200) break;
  }
  return all;
}

export async function listMembers() {
  return (await listAuthUsers())
    .map(memberFromUser)
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

export function memberMeta(user, patch) {
  const current = user?.app_metadata?.[META_KEY] || {};
  return { ...(user?.app_metadata || {}), [META_KEY]: { ...current, ...patch } };
}

export async function setMemberMeta(user, patch) {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: memberMeta(user, patch) });
  if (error) throw error;
  return data.user;
}

/** First run only: with no team yet, the account that was created first becomes the owner. */
async function bootstrapOwner(user) {
  const users = await listAuthUsers();
  if (users.some((u) => memberFromUser(u))) return null;
  const first = users.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
  if (!first || first.id !== user.id) return null;
  const updated = await setMemberMeta(user, {
    role: 'owner',
    active: true,
    member_id: 1,
    name: 'Admin',
    added_at: user.created_at,
  });
  return memberFromUser(updated);
}

/**
 * Verifies the bearer token and checks the signed-in person is an active
 * member of the newsroom team. Sends the error response itself and returns
 * null when the request may not continue.
 */
export async function requireMember(req, res, roles) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return null;
  }
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user) {
    res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
    return null;
  }
  const member = memberFromUser(user) || (await bootstrapOwner(user));
  if (!member || !member.active) {
    res.status(403).json({
      error: 'This account has not been added to the newsroom team.',
      code: 'not_member',
    });
    return null;
  }
  if (roles && !roles.includes(member.role)) {
    res.status(403).json({ error: 'Your role does not allow this.', code: 'role' });
    return null;
  }
  return { ...member, user };
}

export async function logActivity(member, action, entityType, entityId, summary) {
  try {
    await supabase.from('activity').insert({
      actor: member.name,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      summary,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('activity log failed:', err);
  }
}

/** Scheduled stories whose time has come are switched to published. */
export async function promoteDue() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('articles')
    .update({ status: 'published' })
    .eq('status', 'scheduled')
    .lte('publish_at', now)
    .select('id, placement, publish_at, author_id, headline');
  if (error) {
    console.error('promoteDue failed:', error);
    return;
  }
  if (data?.length) {
    // Tell the authors. Loaded only when needed, because the mail code itself uses this file.
    const { notifyLive } = await import('./_mail.js');
    await notifyLive(data);
  }
  // A scheduled story set as the main headline takes over from the previous one.
  const leads = (data || [])
    .filter((a) => a.placement === 'main')
    .sort((a, b) => new Date(b.publish_at) - new Date(a.publish_at));
  if (leads.length) {
    const { error: demoteError } = await supabase
      .from('articles')
      .update({ placement: 'headline' })
      .eq('placement', 'main')
      .eq('status', 'published')
      .neq('id', leads[0].id);
    if (demoteError) console.error('demote main failed:', demoteError);
  }
}

export const SETTING_DEFAULTS = {
  ads_enabled: true,
  crawl: { enabled: true, speed: 'normal', message: '' },
  notice: { enabled: false, text: '' },
  elections_update: { enabled: false, title: 'Elections update', text: '' },
  live_updates: { enabled: true },
  scheduled_panel: { enabled: true },
  contact: { email: '', phone: '', ads_phone: '' },
  comments: { enabled: true, hold: true },
  homepage: { blocks: [] },
  // Written by the public feed when the 180news site checks in. Not editable.
  site_link: { sites: [] },
};

/** The address that always serves the newest version of this CMS, when the host says what it is (Vercel does). */
export const stableHost = () =>
  String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

/**
 * The connected sites as the CMS shows them. A site is "outdated" when it loads /connect.js from an
 * address that is frozen at an older version, so newer features never reach it.
 */
export function siteLinkView(link) {
  const stable = stableHost();
  const sites = (Array.isArray(link?.sites) ? link.sites : [])
    .filter((s) => s && typeof s.origin === 'string')
    .map((s) => ({ origin: s.origin, at: s.at, outdated: !s.via || Boolean(stable && String(s.via).toLowerCase() !== stable) }));
  return { sites, cms_url: stable ? `https://${stable}` : null };
}

const clampCount = (value, def) => {
  if (def.defaultCount == null) return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(def.min, Math.min(def.max, n)) : def.defaultCount;
};

/**
 * The front page as an ordered list of blocks. The saved layout holds only id, enabled and count;
 * this merges it with the fixed blocks and the current categories, so a new category shows up at the
 * end and a deleted one drops out. Two blocks are switched on and off by their own settings.
 */
export function resolveHomepage(settings, sections) {
  const defs = new Map();
  defs.set('headlines', { type: 'headlines', label: 'Headline news', description: 'The main headline with the headline news beside it.', defaultCount: 6, min: 2, max: 8 });
  defs.set('elections-update', {
    type: 'elections-update',
    label: 'Elections update',
    description: 'The panel with your elections line.',
    locked: settings.elections_update.enabled,
    managedIn: 'Settings',
    managedPath: '/settings',
  });
  defs.set('scheduled', {
    type: 'scheduled',
    label: 'Coming up',
    description: 'A short list of scheduled stories and when they go live.',
    locked: settings.scheduled_panel.enabled,
    managedIn: 'Scheduled posts',
    managedPath: '/scheduled',
  });
  defs.set('latest', { type: 'latest', label: 'Latest headlines', description: 'The newest stories from every category.', defaultCount: 10, min: 4, max: 20 });
  for (const s of sections) {
    defs.set(`category:${s.slug}`, {
      type: 'category',
      slug: s.slug,
      label: s.label,
      description: `The newest stories in ${s.label}.`,
      categoryEnabled: s.enabled !== false,
      defaultCount: 4,
      min: 2,
      max: 12,
    });
  }

  const build = (id, def, saved) => ({
    id,
    type: def.type,
    slug: def.slug ?? null,
    label: def.label,
    description: def.description,
    enabled: def.locked !== undefined ? def.locked : saved ? saved.enabled !== false : true,
    count: clampCount(saved?.count ?? def.defaultCount, def),
    min: def.min ?? null,
    max: def.max ?? null,
    locked: def.locked !== undefined,
    managedIn: def.managedIn ?? null,
    managedPath: def.managedPath ?? null,
    categoryEnabled: def.categoryEnabled ?? null,
  });

  const saved = Array.isArray(settings.homepage?.blocks) ? settings.homepage.blocks : [];
  const out = [];
  const seen = new Set();
  for (const block of saved) {
    const def = block && defs.get(block.id);
    if (!def || seen.has(block.id)) continue;
    seen.add(block.id);
    out.push(build(block.id, def, block));
  }
  for (const [id, def] of defs) if (!seen.has(id)) out.push(build(id, def, null));
  return out;
}

export async function readSettings() {
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error) throw error;
  const out = { ...SETTING_DEFAULTS };
  for (const row of data || []) {
    if (!(row.key in SETTING_DEFAULTS)) continue;
    const base = SETTING_DEFAULTS[row.key];
    out[row.key] =
      base && typeof base === 'object' && row.value && typeof row.value === 'object'
        ? { ...base, ...row.value }
        : row.value;
  }
  return out;
}
