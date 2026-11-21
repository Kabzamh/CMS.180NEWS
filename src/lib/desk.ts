import { api } from './api';
import type { ArticleStatus, Author } from './types';

/** Everything the news desk asks the server goes to this one address. */
export const DESK = '/api/team?resource=desk';

export const desk = <T,>(action: string, body: Record<string, unknown> = {}) => api<T>(DESK, { method: 'POST', body: { action, ...body } });

/** A story on its way to being published, with who has it and when it is due. */
export interface DeskStory {
  id: number;
  headline: string;
  section: string | null;
  status: ArticleStatus;
  author_name: string;
  author_id: number | null;
  publish_at: string | null;
  updated_at: string;
  updated_by: string | null;
  assigned_to: number | null;
  assigned_name: string | null;
  deadline: string | null;
  brief: string;
  review_note: string | null;
}

export interface DeskBoard {
  stories: DeskStory[];
  people: Author[];
  me: number;
}

/** A story as it was at one save. */
export interface Snapshot {
  headline: string;
  summary: string;
  body: string;
  section: string | null;
  tags: string[];
  image_url: string | null;
  image_caption: string;
  image_credit: string;
  author_name: string;
  placement: string;
  seo_title: string;
  seo_description: string;
  clips: { kind: string; url: string; title: string }[];
}

export interface Revision {
  id: number;
  status: ArticleStatus;
  saved_by: string | null;
  created_at: string;
  headline: string;
}

const DAY = 24 * 60 * 60 * 1000;
const clock = (d: Date) => d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const span = (ms: number) => {
  const hours = Math.round(ms / 3600000);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(ms / DAY);
  return `${days} days`;
};

/** How a deadline reads, and how pressing it is. Times are in this device's time zone. */
export function dueLabel(deadline: string, now = new Date()): { text: string; tone: 'late' | 'soon' | 'ahead' } {
  const due = new Date(deadline);
  const gap = due.getTime() - now.getTime();
  if (gap < 0) return { text: `Overdue by ${span(-gap)}`, tone: 'late' };
  const tomorrow = new Date(now.getTime() + DAY);
  if (sameDay(due, now)) return { text: `Due today at ${clock(due)}`, tone: 'soon' };
  if (sameDay(due, tomorrow)) return { text: `Due tomorrow at ${clock(due)}`, tone: gap < DAY ? 'soon' : 'ahead' };
  return { text: `Due ${due.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} at ${clock(due)}`, tone: 'ahead' };
}

export const DUE_TONE = { late: 'text-brand', soon: 'text-warn-deep', ahead: 'text-body' } as const;
