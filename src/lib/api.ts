import supabase from './supabase';
import { mockRequest } from './mockApi';
import { newsroomReadPreview } from './newsroomReadPreview';

export class ApiError extends Error {
  status: number;
  code: string | null;
  fields: Record<string, string> | null;
  constructor(message: string, status = 500, code: string | null = null, fields: Record<string, string> | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// Routes whose data the public news app (/site) reads. Any successful
// mutation against one of these fires a `site-changed` window event so the
// CMS's live preview — and any other open tab showing /site — can sync
// immediately, instead of waiting for a route change or manual refresh.
const SITE_SYNCED_PATHS = new Set([
  '/api/articles',
  '/api/sections',
  '/api/tags',
  '/api/settings',
  '/api/ads',
  '/api/media',
  '/api/comments',
]);

function notifySiteChangedIfNeeded(path: string, method: string) {
  if (method === 'GET') return;
  let pathname = path;
  let search = '';
  try {
    const url = new URL(path, 'https://local.invalid');
    pathname = url.pathname;
    search = url.search;
  } catch {
    /* relative path without a parseable query — use as-is */
  }
  const isAuthorsUpdate = pathname === '/api/team' && /resource=authors/.test(search);
  if (SITE_SYNCED_PATHS.has(pathname) || isAuthorsUpdate) {
    window.dispatchEvent(new Event('site-changed'));
  }
}

// Every /api/* call in this app is served from mockApi.ts — a browser-side
// stand-in for the Vercel functions in /api that mirrors their routes and
// rules against the localStorage-backed store in localStore.ts. See
// src/lib/localStore.ts for the seed data and src/lib/mockApi.ts for the
// route handlers.
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (import.meta.env.VITE_NEWSROOM_SYNC_PREVIEW === 'true') {
    // Explicit opt-in only. This points at real Supabase data, even on a Vercel preview.
    const allowWrites = import.meta.env.VITE_NEWSROOM_ALLOW_WRITES === 'true';
    const preview = await newsroomReadPreview(opts.method ?? 'GET', path, opts.body, allowWrites);
    if (preview.status < 200 || preview.status >= 300) {
      const body = (preview.body ?? {}) as { error?: string };
      throw new ApiError(body.error || 'Preview request failed', preview.status);
    }
    return preview.body as T;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  const method = opts.method ?? 'GET';

  await new Promise((resolve) => setTimeout(resolve, 90));

  let result: { status: number; body: unknown };
  try {
    result = await mockRequest(method, path, opts.body, token);
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : 'Something went wrong.', 500);
  }

  if (result.status < 200 || result.status >= 300) {
    const g = (result.body ?? {}) as { error?: string; code?: string; fields?: Record<string, string> };
    throw new ApiError(g.error || 'Request failed', result.status, g.code ?? null, g.fields ?? null);
  }
  notifySiteChangedIfNeeded(path, method);
  return result.body as T;
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export const errorMessage = errMsg;
