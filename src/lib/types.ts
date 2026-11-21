export type Role = 'owner' | 'editor' | 'writer';
export type ArticleStatus = 'draft' | 'review' | 'scheduled' | 'published' | 'hidden';
export type Placement = 'none' | 'main' | 'headline';

export interface Member {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
  last_seen_at: string | null;
}

export interface Author {
  id: number;
  name: string;
  role: Role;
}

export interface Article {
  id: number;
  headline: string;
  slug: string;
  summary: string;
  body?: string;
  section: string | null;
  tags: string[];
  image_url: string | null;
  image_caption?: string;
  image_credit?: string;
  author_name: string;
  author_id: number | null;
  placement: Placement;
  status: ArticleStatus;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  /** Video and audio on the story. Sent with a single story. */
  media?: ArticleClip[];
  /** Which kinds of clip the story carries. Sent with lists. */
  media_kinds?: ClipKind[];
}

export type ClipKind = 'youtube' | 'video' | 'audio';

export interface ArticleClip {
  id?: number;
  kind: ClipKind;
  url: string;
  youtube_id: string | null;
  title: string;
  caption: string;
  credit: string;
  slot: 'top' | 'bottom';
  width: number | null;
  height: number | null;
  content_type: string | null;
  size: number | null;
  file_name: string | null;
}

export interface Section {
  id: number;
  slug: string;
  label: string;
  enabled: boolean;
  position: number;
  count: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface AdSlot {
  id: number;
  slot: string;
  slot_name: string;
  description: string;
  shape: string | null;
  positions: [string, string][];
  position: string;
  advertiser: string | null;
  image_url: string | null;
  link_url: string | null;
  enabled: boolean;
  width: number | null;
  height: number | null;
  updated_at: string | null;
  /** The banner size the position is built for. Null for a position this version does not know. */
  size: AdSize | null;
  /** True when the site connector draws this position, false when the news app does. */
  connector: boolean;
}

export interface AdSize {
  w: number;
  h: number;
  /** The trade name of the size, e.g. Leaderboard. */
  format: string;
  /** The position takes any shape; this size is the one that fills it best. */
  flexible?: boolean;
}

export interface MediaItem {
  id: number;
  file_name: string;
  path: string | null;
  url: string;
  content_type: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  uploaded_by: string;
  uploader_id: number | null;
  created_at: string;
  in_use?: boolean;
}

export interface Activity {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string;
  created_at: string;
}

export interface Settings {
  ads_enabled: boolean;
  crawl: { enabled: boolean; speed: 'slow' | 'normal' | 'fast'; message: string };
  notice: { enabled: boolean; text: string };
  elections_update: { enabled: boolean; title: string; text: string };
  live_updates: { enabled: boolean };
  scheduled_panel: { enabled: boolean };
  contact: { email: string; phone: string; ads_phone: string };
  comments: { enabled: boolean; hold: boolean };
  homepage: { blocks: { id: string; enabled: boolean; count: number | null }[] };
  site_link: SiteLink;
}

/** Sites that load /connect.js, newest check-in first. */
export interface SiteLink {
  /** outdated: the site loads the connector from an address that no longer gets updates. */
  sites: { origin: string; at: string; outdated?: boolean }[];
  /** The address that always serves the newest connector, when the host says what it is. */
  cms_url?: string | null;
}

export interface TrafficSnapshot {
  today: number;
  yesterdaySameTime: number;
  week: number;
  /** 24 hourly buckets, oldest first; the last one is the current hour. */
  hourly: { t: string; count: number }[];
  sampled: boolean;
}

export interface TrendingStory {
  id: number;
  headline: string;
  section: string | null;
  reads: number;
}

export interface DashboardData {
  generatedAt: string;
  counts: { total: number; draft: number; review: number; scheduled: number; published: number; hidden: number };
  publishedToday: number;
  publishedWeek: number;
  bySection: { slug: string; label: string; enabled: boolean; count: number }[];
  upcoming: Article[];
  review: Article[];
  mine: Article[];
  lead: Article | null;
  headlines: Article[];
  crawl: Settings['crawl'];
  siteLink?: SiteLink;
  activity: Activity[];
  /** null when the read counts could not be loaded. */
  traffic: TrafficSnapshot | null;
  trending: TrendingStory[];
}

export interface AuthorProfile {
  id: number;
  name: string;
  title: string | null;
  bio: string | null;
  email: string | null;
  photo_url: string | null;
  active: boolean;
  created_at: string;
  stories: number;
  published: number;
}

export interface AuthorsResponse {
  authors: AuthorProfile[];
  unlinked: { name: string; stories: number }[];
}

export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'spam';

export interface ReaderComment {
  id: number;
  article_id: number;
  article_headline: string | null;
  author_name: string;
  body: string;
  status: CommentStatus;
  created_at: string;
  moderated_by: string | null;
  moderated_at: string | null;
}

export interface CommentsResponse {
  items: ReaderComment[];
  counts: Record<CommentStatus | 'all', number>;
}

export interface HomeBlock {
  id: string;
  type: 'headlines' | 'elections-update' | 'scheduled' | 'latest' | 'category';
  slug: string | null;
  label: string;
  description: string;
  enabled: boolean;
  count: number | null;
  min: number | null;
  max: number | null;
  locked: boolean;
  managedIn: string | null;
  managedPath: string | null;
  categoryEnabled: boolean | null;
}

export interface AnalyticsData {
  days: number;
  from: string;
  totals: { reads: number; prevReads: number; published: number; prevPublished: number; storiesRead: number; comments: number | null; pendingComments: number | null };
  daily: { t: string; reads: number; published: number }[];
  topStories: { id: number; headline: string; section: string | null; author: string; reads: number }[];
  byCategory: { slug: string; label: string; reads: number }[];
  byAuthor: { name: string; published: number; reads: number }[];
  sampled: boolean;
}

export const canEdit = (m: { role: Role }) => m.role === 'owner' || m.role === 'editor';
