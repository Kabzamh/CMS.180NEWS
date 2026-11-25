// Browser-side persistence layer for the 180news demo.
//
// The real CMS (see DEPLOY.md / database/schema.sql in this repository)
// talks to Supabase through the serverless functions in /api. This static
// deployment has no server, so every /api call is served from this module
// instead: the same shapes, the same rules, the same roles — just backed by
// localStorage rather than Postgres. Data seeded from the live 180news feed
// at duplication time lives in `demoData.ts`.

import demoSeed from './demoData';

export type Role = 'owner' | 'editor' | 'writer';

export interface StoreArticle {
  id: number;
  headline: string;
  summary: string;
  body: string;
  section: string;
  tags: string[];
  image_url: string | null;
  image_caption: string;
  image_credit: string;
  author_name: string;
  author_id: number | null;
  placement: 'none' | 'main' | 'headline';
  status: 'draft' | 'review' | 'scheduled' | 'published' | 'hidden';
  publish_at: string | null;
  media: unknown[];
  views: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  assigned_to: number | null;
  due_at: string | null;
}

export interface StoreSection {
  id: number;
  slug: string;
  label: string;
  enabled: boolean;
  sort_order: number;
}

export interface StoreAuthor {
  id: number;
  name: string;
  title: string;
  bio: string;
  email: string;
  photo_url: string | null;
  active: boolean;
}

export interface StoreTeamMember {
  id: number;
  user_id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface StoreMedia {
  id: number;
  url: string;
  file_name: string;
  content_type: string;
  alt: string;
  width: number | null;
  height: number | null;
  size: number | null;
  path: string;
  kind: string;
  created_at: string;
}

export interface StoreAd {
  id: number;
  slot: string;
  slot_name: string;
  advertiser: string;
  link_url: string;
  image_url: string | null;
  position: string;
  enabled: boolean;
  width: number | null;
  height: number | null;
}

export interface StoreComment {
  id: number;
  article_id: number;
  name: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected' | 'spam';
  created_at: string;
}

export interface StoreNotification {
  id: number;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  email_to: string;
  email_status: string;
  created_at: string;
}

export interface StoreMail {
  id: number;
  from_user_id: string | null;
  from_name: string;
  from_email: string;
  to_user_id: string | null;
  to_email: string;
  to_name: string;
  subject: string;
  body: string;
  folder: string;
  read: boolean;
  starred: boolean;
  archived: boolean;
  deleted: boolean;
  draft: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoreNote {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface StoreReminder {
  id: number;
  title: string;
  note: string;
  due_at: string | null;
  done: boolean;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface StoreTranscriptSegment {
  start: number;
  speaker: string;
  text: string;
}

export interface StoreInterview {
  id: number;
  title: string;
  guest_name: string;
  host_name: string;
  audio_url: string;
  duration: number;
  transcript: string;
  segments: StoreTranscriptSegment[];
  status: 'draft' | 'transcribed' | 'linked';
  article_id: number | null;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export type StoreAutomationEvent = 'article_published' | 'article_scheduled' | 'breaking_set' | 'comment_received';
export type StoreAutomationAction = 'notify_team' | 'site_banner' | 'social_reminder' | 'webhook';

export interface StoreAutomation {
  id: number;
  name: string;
  event: StoreAutomationEvent;
  action: StoreAutomationAction;
  config: { message?: string; webhook_url?: string };
  enabled: boolean;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreAutomationRun {
  id: number;
  automation_id: number;
  automation_name: string;
  trigger_label: string;
  action: StoreAutomationAction;
  detail: string;
  created_at: string;
}

export const MAIL_DOMAIN = '180news.co.za';

export interface StoreEmailAccount {
  id: number;
  local_part: string;
  email: string;
  display_name: string;
  forward_to_user_id: string | null;
  active: boolean;
  created_at: string;
}

export interface StoreProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  title: string;
  role: string;
  bio: string;
  photo_url: string | null;
  active: boolean;
  show_in_directory: boolean;
}

export interface AuthUser {
  email: string;
  password: string;
  user_id: string;
}

export interface NotificationPrefs {
  user_id: string;
  email: string;
  notify_publish: boolean;
  notify_review: boolean;
  notify_comments: boolean;
  notify_schedule: boolean;
  notify_team: boolean;
  digest: 'instant' | 'daily' | 'off';
}

interface Store {
  articles: StoreArticle[];
  sections: StoreSection[];
  authors: StoreAuthor[];
  team: StoreTeamMember[];
  media: StoreMedia[];
  ads: StoreAd[];
  comments: StoreComment[];
  notifications: StoreNotification[];
  mail: StoreMail[];
  notes: StoreNote[];
  reminders: StoreReminder[];
  interviews: StoreInterview[];
  automations: StoreAutomation[];
  automationRuns: StoreAutomationRun[];
  emailAccounts: StoreEmailAccount[];
  profiles: StoreProfile[];
  settings: Record<string, unknown>;
  authUsers: AuthUser[];
  prefs: NotificationPrefs[];
  events: {
    article_views: { article_id: number; viewed_at: string }[];
    page_visits: { path: string; visited_at: string }[];
    ad_impressions: { ad_id: number; viewed_at: string }[];
    ad_clicks: { ad_id: number; clicked_at: string }[];
    ad_rates: { ad_id: number; cost_per_click: number; cost_per_mille: number; currency: string }[];
  };
  seq: Record<string, number>;
}

const STORAGE_KEY = 'cms180_demo_store_v9';

function buildDefaultStore(): Store {
  const seed = demoSeed as any;
  const team: StoreTeamMember[] = (seed.team || []).map((t: any) => ({ ...t }));
  const authUsers: AuthUser[] = team.map((t) => ({ email: t.email, password: 'newsroom180', user_id: t.user_id }));
  const prefs: NotificationPrefs[] = team.map((t) => ({
    user_id: t.user_id,
    email: t.email,
    notify_publish: true,
    notify_review: true,
    notify_comments: true,
    notify_schedule: true,
    notify_team: t.role === 'owner',
    digest: 'instant',
  }));
  const profiles: StoreProfile[] = (seed.profiles || []).map((p: any) => ({ ...p, show_in_directory: true }));

  const maxId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0);

  return {
    articles: (seed.articles || []).map((a: any) => ({ ...a, media: a.media || [], assigned_to: a.assigned_to ?? null, due_at: a.due_at ?? null })),
    sections: (seed.sections || []).map((s: any) => ({
      id: s.id,
      slug: s.slug,
      label: s.label,
      enabled: s.enabled !== false,
      sort_order: s.sort_order ?? s.id,
    })),
    authors: (seed.authors || []).map((a: any) => ({ ...a })),
    team,
    media: (seed.media || []).map((m: any) => ({ ...m })),
    ads: (seed.ads || []).map((a: any) => ({ ...a })),
    comments: (seed.comments || []).map((c: any) => ({
      id: c.id,
      article_id: c.article_id,
      name: c.name,
      body: c.body,
      status: c.status,
      created_at: c.created_at,
    })),
    notifications: (seed.notifications || []).map((n: any) => ({ ...n, user_id: team[0]?.user_id || 'demo-owner' })),
    mail: (seed.mail || []).map((m: any) => ({
      id: m.id,
      from_user_id: m.from_email === 'editor@180news.co.za' ? team.find((t) => t.email === 'editor@180news.co.za')?.user_id || null : null,
      from_name: m.from_name,
      from_email: m.from_email,
      to_user_id: team.find((t) => t.email === m.to_email)?.user_id || null,
      to_email: m.to_email,
      to_name: m.to_name,
      subject: m.subject,
      body: m.body,
      folder: 'inbox',
      read: m.read,
      starred: false,
      archived: false,
      deleted: false,
      draft: false,
      created_at: m.created_at,
      updated_at: m.created_at,
    })),
    notes: [],
    reminders: [],
    interviews: [],
    // A few sensible automations enabled by default, so new desks get a
    // working "when this happens, do that" setup for the news app without
    // having to build one from scratch first.
    automations: [
      {
        id: 1,
        name: 'Notify the team on publish',
        event: 'article_published',
        action: 'notify_team',
        config: {},
        enabled: true,
        run_count: 0,
        last_run_at: null,
        created_at: '2026-01-10T08:00:00.000Z',
        updated_at: '2026-01-10T08:00:00.000Z',
      },
      {
        id: 2,
        name: 'Site banner for breaking news',
        event: 'breaking_set',
        action: 'site_banner',
        config: { message: 'BREAKING: {headline}' },
        enabled: true,
        run_count: 0,
        last_run_at: null,
        created_at: '2026-01-10T08:00:00.000Z',
        updated_at: '2026-01-10T08:00:00.000Z',
      },
      {
        id: 3,
        name: 'Remind author to share on socials',
        event: 'article_published',
        action: 'social_reminder',
        config: {},
        enabled: true,
        run_count: 0,
        last_run_at: null,
        created_at: '2026-01-10T08:00:00.000Z',
        updated_at: '2026-01-10T08:00:00.000Z',
      },
      {
        id: 4,
        name: 'Notify editors of new comments',
        event: 'comment_received',
        action: 'notify_team',
        config: {},
        enabled: false,
        run_count: 0,
        last_run_at: null,
        created_at: '2026-01-10T08:00:00.000Z',
        updated_at: '2026-01-10T08:00:00.000Z',
      },
    ],
    automationRuns: [],
    // Newsroom mailboxes on the 180news.co.za domain, forwarded to a staff
    // member's desk inbox — separate from personal staff logins.
    emailAccounts: [
      {
        id: 1,
        local_part: 'newsroom',
        email: `newsroom@${MAIL_DOMAIN}`,
        display_name: 'Newsroom desk',
        forward_to_user_id: team.find((t) => t.role === 'owner')?.user_id || null,
        active: true,
        created_at: '2026-01-10T08:00:00.000Z',
      },
      {
        id: 2,
        local_part: 'tips',
        email: `tips@${MAIL_DOMAIN}`,
        display_name: 'Reader tips',
        forward_to_user_id: team.find((t) => t.role === 'editor')?.user_id || team[0]?.user_id || null,
        active: true,
        created_at: '2026-01-10T08:00:00.000Z',
      },
    ],
    profiles,
    settings: { ...(seed.settings || {}) },
    authUsers,
    prefs,
    events: {
      article_views: seed.events?.article_views || [],
      page_visits: seed.events?.page_visits || [],
      ad_impressions: seed.events?.ad_impressions || [],
      ad_clicks: seed.events?.ad_clicks || [],
      ad_rates: seed.events?.ad_rates || [],
    },
    seq: {
      articles: maxId(seed.articles || []) + 1,
      sections: maxId(seed.sections || []) + 1,
      authors: maxId(seed.authors || []) + 1,
      team: maxId(team) + 1,
      media: maxId(seed.media || []) + 1,
      ads: maxId(seed.ads || []) + 1,
      comments: maxId(seed.comments || []) + 1,
      notifications: maxId(seed.notifications || []) + 1,
      mail: maxId(seed.mail || []) + 1,
      notes: 1,
      reminders: 1,
      interviews: 1,
      automations: 5,
      automationRuns: 1,
      emailAccounts: 3,
    },
  };
}

let store: Store | null = null;

function load(): Store {
  if (store) return store;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      store = JSON.parse(raw) as Store;
      return store;
    }
  } catch {
    /* ignore corrupted storage */
  }
  store = buildDefaultStore();
  persist();
  return store;
}

function persist() {
  if (!store) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage full — drop oldest events to make room */
    if (store) {
      store.events.page_visits = store.events.page_visits.slice(-500);
      store.events.ad_impressions = store.events.ad_impressions.slice(-500);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      } catch {
        /* give up silently */
      }
    }
  }
}

export function getStore(): Store {
  return load();
}

export function save() {
  persist();
}

export function nextId(table: keyof Store['seq']): number {
  const s = load();
  const id = s.seq[table];
  s.seq[table] = id + 1;
  return id;
}

export function resetDemoStore() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  store = null;
  load();
}

export function slugify(text: string): string {
  return (
    String(text || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

export function briefArticle(a: StoreArticle) {
  return {
    id: a.id,
    headline: a.headline,
    summary: a.summary,
    section: a.section,
    tags: a.tags || [],
    image_url: a.image_url,
    author_name: a.author_name,
    author_id: a.author_id,
    placement: a.placement || 'none',
    status: a.status,
    publish_at: a.publish_at,
    views: a.views || 0,
    created_at: a.created_at,
    updated_at: a.updated_at,
    assigned_to: a.assigned_to ?? null,
    due_at: a.due_at ?? null,
  };
}

export function fullArticle(a: StoreArticle) {
  return {
    ...briefArticle(a),
    body: a.body || '',
    image_caption: a.image_caption || '',
    image_credit: a.image_credit || '',
    media: a.media || [],
    created_by: a.created_by || null,
  };
}

export function findMemberByToken(token: string | null): StoreTeamMember | null {
  if (!token) return null;
  const s = load();
  const userId = token.startsWith('demo-token-') ? token.slice('demo-token-'.length) : null;
  if (!userId) return null;
  return s.team.find((m) => m.user_id === userId && m.active) || null;
}

export function queueNotification(opts: {
  kind: string;
  title: string;
  body?: string;
  link?: string;
  onlyIf?: (prefs: NotificationPrefs, member: StoreTeamMember) => boolean;
}) {
  const s = load();
  const now = new Date().toISOString();
  for (const member of s.team.filter((m) => m.active)) {
    const prefs = s.prefs.find((p) => p.user_id === member.user_id) || {
      user_id: member.user_id,
      email: member.email,
      notify_publish: true,
      notify_review: true,
      notify_comments: true,
      notify_schedule: true,
      notify_team: false,
      digest: 'instant' as const,
    };
    if (opts.onlyIf && !opts.onlyIf(prefs, member)) continue;
    s.notifications.unshift({
      id: nextId('notifications'),
      user_id: member.user_id,
      kind: opts.kind,
      title: opts.title,
      body: opts.body || '',
      link: opts.link || '',
      read: false,
      email_to: prefs.email || member.email,
      email_status: 'queued',
      created_at: now,
    });
  }
  persist();
}

export const SITE_ORIGIN = 'https://www.180news.co.za';

export function storyPath(id: number) {
  return `/story/my-cms${String(id).padStart(7, '0')}`;
}
