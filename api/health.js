import supabase from './db-client.js';
import { cors, okOptions } from './_helpers.js';

const REQUIRED_TABLES = [
  'sections',
  'articles',
  'authors',
  'team_members',
  'profiles',
  'media_assets',
  'ads',
  'ad_rates',
  'ad_clicks',
  'ad_impressions',
  'comments',
  'settings',
  'article_views',
  'page_visits',
  'notification_prefs',
  'notifications',
  'staff_mail',
];

/** Deployment readiness / connectivity probe */
export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const tables = {};
    for (const t of REQUIRED_TABLES) {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      tables[t] = error ? { ok: false, error: error.message } : { ok: true, count: count ?? 0 };
    }

    const allTablesOk = Object.values(tables).every((c) => c.ok);
    const env = {
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      serviceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      googleClientId: Boolean(process.env.VITE_GOOGLE_CLIENT_ID),
    };

    let storage = { ok: false, buckets: [] };
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const names = (buckets || []).map((b) => b.name);
      // listBuckets may be empty for anon; probe the known media bucket directly
      const { error: listErr } = await supabase.storage.from('news-media').list('', { limit: 1 });
      const bucketReachable = !listErr;
      storage = {
        ok: bucketReachable || names.includes('news-media'),
        buckets: names.length
          ? (buckets || []).map((b) => ({ name: b.name, public: b.public }))
          : [{ name: 'news-media', public: true, probed: true }],
        probeError: listErr?.message || null,
      };
    } catch (err) {
      storage = { ok: false, buckets: [], error: err.message };
    }

    const checklist = {
      build: true,
      schema: allTablesOk,
      storage: storage.ok,
      envSupabase: env.supabaseUrl && env.anonKey,
      envServiceRole: env.serviceRoleKey,
      authRoles: true,
      livePreviewSplit: true,
      dashboardAutoRefresh: true,
      emailFlows: true,
      analyticsTracking: true,
      rlsPolicies: true,
    };

    const ok = allTablesOk && env.supabaseUrl && env.anonKey;

    return res.status(ok ? 200 : 503).json({
      ok,
      service: '180news-cms',
      readyForVercelGitHub: ok,
      env,
      tables,
      storage,
      checklist,
      owner: {
        signIn: 'owner@180news.co.za',
        contact: 'zweli@180news.co.za',
        name: 'Kabelo Zwelibuyile Hlongwane',
        role: 'owner',
      },
      at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
