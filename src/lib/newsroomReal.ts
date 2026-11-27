/**
 * Staged Supabase newsroom client.
 * Not wired into the live CMS yet: the current browser-local CMS has additional
 * features that must not silently fall back to demo data during migration.
 * Only a Supabase publishable/anon key may be used in this browser module.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const TARGET_PROJECT = 'javkaoplhtexqslyphqe';
let client: SupabaseClient | null = null;

export function newsroomClient(): SupabaseClient {
  if (client) return client;
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  if (url !== `https://${TARGET_PROJECT}.supabase.co` || !key) {
    throw new Error('Newsroom Supabase settings are missing or point to the wrong project.');
  }
  // Allow a modern publishable key or a legacy anon JWT; never embed a service key.
  let isPublicKey = key.startsWith('sb_publishable_');
  if (!isPublicKey && key.split('.').length === 3) {
    try {
      const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const parsed = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { role?: string };
      isPublicKey = parsed.role === 'anon';
    } catch { /* Invalid key is rejected below. */ }
  }
  if (!isPublicKey) throw new Error('Only a Supabase publishable or anon key may be used in browser code.');
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export interface NewsroomMember {
  user_id: string;
  email: string;
  name: string;
  role: 'owner' | 'editor' | 'writer';
  active: boolean;
}
export interface NewsroomArticle extends Record<string, unknown> {
  id: number;
  revision: number;
  headline: string;
  status: 'draft' | 'review' | 'scheduled' | 'published' | 'hidden';
}
export type ArticlePatch = Partial<Omit<NewsroomArticle, 'id' | 'revision'>> & { id?: number };

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await newsroomClient().rpc(name, args);
  if (error) throw new Error(error.message || 'Newsroom request failed.');
  if (data == null) throw new Error('Newsroom returned an empty response.');
  return data as T;
}

export const getNewsroomMember = () => rpc<NewsroomMember>('newsroom_me');
export const listNewsroomArticles = () => rpc<NewsroomArticle[]>('newsroom_articles_read', { p_id: null });
export const getNewsroomArticle = (id: number) => rpc<NewsroomArticle>('newsroom_articles_read', { p_id: id });
export const readNewsroomCollection = (collection: 'sections' | 'authors' | 'media' | 'ads' | 'comments' | 'settings') =>
  rpc<Array<Record<string, unknown>>>('newsroom_collection_read', { p_collection: collection });

export function saveNewsroomSetting(key: string, value: unknown, expectedRevision: number) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('Reload this setting before saving.');
  return rpc<Record<string, unknown>>('newsroom_setting_save', {p_key: key, p_value: value, p_expected_revision: expectedRevision});
}
export function saveNewsroomAd(id: number, patch: Record<string, unknown>, expectedRevision: number) {
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('Reload this advert before saving.');
  return rpc<Record<string, unknown>>('newsroom_ad_save', {p_id: id, p_patch: patch, p_expected_revision: expectedRevision});
}

/** Existing articles require the revision from the version the editor opened. */
export function saveNewsroomArticle(patch: ArticlePatch, expectedRevision?: number): Promise<NewsroomArticle> {
  if (patch.id != null && (!Number.isSafeInteger(expectedRevision) || (expectedRevision ?? 0) < 1)) {
    throw new Error('Reload this story before saving: its revision is missing.');
  }
  return rpc<NewsroomArticle>('newsroom_article_save', {
    p_patch: patch,
    p_expected_revision: expectedRevision ?? null,
  });
}
