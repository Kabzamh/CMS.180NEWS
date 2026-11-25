import type { ArticleStatus, Role } from './types';

export const SITE_URL = 'https://180news-mkvk.arcada.app';

/** The addresses the Live view screen can show: the public site, and the address the app was first published at. */
export const LIVE_SITES = [
  { url: 'https://www.180news.co.za', name: 'www.180news.co.za' },
  { url: SITE_URL, name: SITE_URL.replace('https://', '') },
];

/** The ten sections the 180news site has pages for. A story in any other category is shown under South Africa. */
export const SITE_SECTIONS = ['elections', 'south-africa', 'politics', 'business', 'sport', 'world', 'africa', 'tech', 'life', 'opinion'];

/** Where a published story lives on the site once the site is connected. */
export const siteStoryPath = (id: number) => `/story/my-cms${String(id).padStart(7, '0')}`;

const LOCALE = 'en-ZA';

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(LOCALE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '';

export const fmtShort = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeUntil(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return 'any moment now';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** ISO timestamp -> value for <input type="datetime-local"> in the reader's own time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (value: string) => new Date(value).toISOString();

export const fmtBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: 'Draft',
  review: 'In review',
  scheduled: 'Scheduled',
  published: 'Published',
  hidden: 'Hidden',
};

export const ROLE_LABEL: Record<Role, string> = { owner: 'Admin', editor: 'Editor', writer: 'Reporter' };

export const ROLE_BLURB: Record<Role, string> = {
  owner: 'Everything an editor can do, plus users and roles, backups, the audit log and the database script.',
  editor: 'Assign stories, approve or send them back, publish, schedule and hide them, and send breaking-news alerts. Manage categories, tags, authors, comments, the homepage and adverts.',
  writer: 'Write their own stories and the ones assigned to them, and request approval. Cannot publish.',
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

export type BodyBlock = { kind: 'p' | 'h' | 'quote'; text: string };

/** Story copy is plain text: blank lines split paragraphs, "## " starts a subheading, "> " a quote. */
export function parseBody(body: string): BodyBlock[] {
  return body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (chunk.startsWith('## ')) return { kind: 'h' as const, text: chunk.slice(3).trim() };
      if (chunk.startsWith('> ')) return { kind: 'quote' as const, text: chunk.replace(/^> ?/gm, '').trim() };
      return { kind: 'p' as const, text: chunk };
    });
}

export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
