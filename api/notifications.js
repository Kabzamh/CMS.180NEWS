import supabase from './db-client.js';
import { cors, okOptions, fail, requireMember } from './_helpers.js';

const DEFAULT_PREFS = {
  notify_publish: true,
  notify_review: true,
  notify_comments: true,
  notify_schedule: true,
  notify_team: false,
  digest: 'instant',
};

export async function queueNotification({ kind, title, body, link, onlyIf }) {
  const { data: members } = await supabase.from('team_members').select('*').eq('active', true);
  if (!members?.length) return;

  const { data: prefsRows } = await supabase.from('notification_prefs').select('*');
  const prefsByUser = Object.fromEntries((prefsRows || []).map((p) => [p.user_id, p]));

  const rows = [];
  for (const m of members) {
    const prefs = { ...DEFAULT_PREFS, email: m.email, ...(prefsByUser[m.user_id] || {}) };
    if (onlyIf && !onlyIf(prefs, m)) continue;
    rows.push({
      user_id: m.user_id,
      email_to: prefs.email || m.email,
      kind,
      title,
      body: body || '',
      link: link || '',
      read: false,
      email_status: 'queued',
      created_at: new Date().toISOString(),
    });
  }
  if (rows.length) await supabase.from('notifications').insert(rows);
}

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    if (req.method === 'GET') {
      if (req.query.resource === 'prefs') {
        const { data } = await supabase
          .from('notification_prefs')
          .select('*')
          .eq('user_id', auth.user.id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        return res.status(200).json({
          ...DEFAULT_PREFS,
          email: auth.member.email,
          ...(data || {}),
          user_id: auth.user.id,
        });
      }

      if (req.query.counts === '1') {
        const { data } = await supabase
          .from('notifications')
          .select('id, read')
          .eq('user_id', auth.user.id);
        const unread = (data || []).filter((n) => !n.read).length;
        return res.status(200).json({ unread, total: (data || []).length });
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'PUT') {
      const body = req.body || {};

      if (body.action === 'prefs') {
        const email = String(body.email || auth.member.email || '').trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          return fail(res, 400, 'Check the form.', { email: 'Enter a valid email address.' });
        }
        const patch = {
          user_id: auth.user.id,
          email: email || auth.member.email,
          notify_publish: body.notify_publish !== false,
          notify_review: body.notify_review !== false,
          notify_comments: body.notify_comments !== false,
          notify_schedule: body.notify_schedule !== false,
          notify_team: !!body.notify_team,
          digest: ['instant', 'daily', 'off'].includes(body.digest) ? body.digest : 'instant',
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabase
          .from('notification_prefs')
          .select('id')
          .eq('user_id', auth.user.id)
          .limit(1)
          .maybeSingle();

        let data;
        if (existing?.id) {
          const r = await supabase.from('notification_prefs').update(patch).eq('id', existing.id).select().single();
          if (r.error) throw r.error;
          data = r.data;
        } else {
          const r = await supabase.from('notification_prefs').insert(patch).select().single();
          if (r.error) throw r.error;
          data = r.data;
        }
        return res.status(200).json(data);
      }

      if (body.action === 'read_all') {
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', auth.user.id)
          .eq('read', false);
        return res.status(200).json({ ok: true });
      }

      if (body.id) {
        const { data, error } = await supabase
          .from('notifications')
          .update({ read: body.read !== false })
          .eq('id', body.id)
          .eq('user_id', auth.user.id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      return fail(res, 400, 'Unknown action.');
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return fail(res, 400, 'Missing id.');
      await supabase.from('notifications').delete().eq('id', id).eq('user_id', auth.user.id);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('notifications error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
