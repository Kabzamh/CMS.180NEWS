export type Role = 'owner' | 'editor' | 'writer';

export type ArticleStatus = 'draft' | 'review' | 'scheduled' | 'published' | 'hidden';
export type Placement = 'none' | 'main' | 'headline';

export interface TeamMember {
  id: number;
  user_id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at?: string;
}

export interface Article {
  id: number;
  headline: string;
  summary: string;
  body: string;
  section: string;
  tags: string[];
  image_url: string | null;
  image_caption?: string;
  image_credit?: string;
  author_name: string;
  author_id?: number | null;
  placement: Placement;
  status: ArticleStatus;
  publish_at: string | null;
  media: MediaEmbed[];
  views?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  assigned_to?: number | null;
  due_at?: string | null;
}

export interface TranscriptSegment {
  start: number;
  speaker: string;
  text: string;
}

export interface MediaEmbed {
  kind: 'video' | 'audio' | 'youtube';
  url: string;
  youtube_id?: string | null;
  title?: string;
  caption?: string;
  credit?: string;
  slot?: string;
  width?: number | null;
  height?: number | null;
  content_type?: string | null;
  size?: number | null;
  file_name?: string | null;
  transcript?: string;
  segments?: TranscriptSegment[];
}

export interface Section {
  id: number;
  slug: string;
  label: string;
  enabled: boolean;
  sort_order: number;
  count?: number;
  categoryEnabled?: boolean;
}

export interface Author {
  id: number;
  name: string;
  title: string;
  bio: string;
  email: string;
  photo_url: string | null;
  active: boolean;
  stories?: number;
}

export interface MediaAsset {
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

export interface AdSlot {
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

/** Standard IAB-style banner sizes used in Ads control */
export const AD_SIZE_PRESETS = [
  { id: 'leaderboard', label: 'Leaderboard', width: 728, height: 90, hint: 'Top / bottom desktop strip' },
  { id: 'billboard', label: 'Billboard', width: 970, height: 250, hint: 'Wide mid-page unit' },
  { id: 'superleader', label: 'Super leaderboard', width: 970, height: 90, hint: 'Wide top strip' },
  { id: 'mpu', label: 'MPU', width: 300, height: 250, hint: 'Sidebar / in-article square' },
  { id: 'halfpage', label: 'Half page', width: 300, height: 600, hint: 'Tall sidebar' },
  { id: 'mobile', label: 'Mobile banner', width: 320, height: 50, hint: 'Phone strip' },
  { id: 'mobile-lg', label: 'Large mobile', width: 320, height: 100, hint: 'Larger phone unit' },
  { id: 'fluid', label: 'Fluid / responsive', width: 0, height: 0, hint: 'Scales to container width' },
] as const;

export interface CommentRow {
  id: number;
  article_id: number;
  name: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected' | 'spam';
  created_at: string;
  headline?: string;
}

export interface NoteRow {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface ReminderRow {
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

export interface InterviewRow {
  id: number;
  title: string;
  guest_name: string;
  host_name: string;
  audio_url: string;
  duration: number;
  transcript: string;
  segments: TranscriptSegment[];
  status: 'draft' | 'transcribed' | 'linked';
  article_id: number | null;
  article_headline: string | null;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export type AutomationEvent = 'article_published' | 'article_scheduled' | 'breaking_set' | 'comment_received';
export type AutomationAction = 'notify_team' | 'site_banner' | 'social_reminder' | 'webhook';

export interface AutomationRow {
  id: number;
  name: string;
  event: AutomationEvent;
  action: AutomationAction;
  config: { message?: string; webhook_url?: string };
  enabled: boolean;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRunRow {
  id: number;
  automation_id: number;
  automation_name: string;
  trigger_label: string;
  action: AutomationAction;
  detail: string;
  created_at: string;
}

/** A newsroom mailbox on the 180news.co.za domain — e.g. tips@180news.co.za
 * or sport@180news.co.za — distinct from a staff login account. Mail sent
 * to it can be forwarded to a team member's desk inbox. */
export interface EmailAccountRow {
  id: number;
  local_part: string;
  email: string;
  display_name: string;
  forward_to_user_id: string | null;
  forward_to_name: string | null;
  active: boolean;
  created_at: string;
}
