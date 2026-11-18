import supabase from './db-client.js';
import { cors, okOptions } from './_helpers.js';

/** Lightweight connectivity check so the desk can verify Supabase is reachable. */
export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  const checks = {};
  try {
    const tables = ['sections', 'articles', 'team_members', 'settings', 'ads'];
    for (const t of tables) {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      checks[t] = error ? { ok: false, error: error.message } : { ok: true, count: count ?? 0 };
    }
    const allOk = Object.values(checks).every((c) => c.ok);
    return res.status(allOk ? 200 : 503).json({
      ok: allOk,
      service: '180news-cms',
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      tables: checks,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
