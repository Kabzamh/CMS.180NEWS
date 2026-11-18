import supabase from './db-client.js';
import { cors, okOptions, fail, requireMember } from './_helpers.js';
export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    const myEmail = (auth.member.email || '').toLowerCase();
    const myId = auth.user.id;

    if (req.method === 'GET') {
      if (req.query.counts === '1') {
        const { data } = await supabase
          .from('staff_mail')
          .select('id, read')
          .or(`to_user_id.eq.${myId},to_email.eq.${myEmail}`)
          .eq('folder', 'inbox');
        const unread = (data || []).filter((m) => !m.read).length;
        return res.status(200).json({ unread, total: (data || []).length });
      }

      if (req.query.resource === 'directory') {
        const { data: authors } = await supabase.from('authors').select('*').eq('active', true).order('name');
        const { data: team } = await supabase
          .from('team_members')
          .select('id, name, email, role, active')
          .eq('active', true)
          .order('name');
        return res.status(200).json({ authors: authors || [], team: team || [] });
      }

      if (req.query.id) {
        const { data, error } = await supabase.from('staff_mail').select('*').eq('id', req.query.id).maybeSingle();
        if (error) throw error;
        if (!data) return fail(res, 404, 'Message not found.');
        const mine =
          data.to_user_id === myId ||
          data.from_user_id === myId ||
          (data.to_email || '').toLowerCase() === myEmail ||
          (data.from_email || '').toLowerCase() === myEmail;
        if (!mine) return fail(res, 403, 'Not your message.');
        if (!data.read && (data.to_user_id === myId || (data.to_email || '').toLowerCase() === myEmail)) {
          await supabase.from('staff_mail').update({ read: true }).eq('id', data.id);
          data.read = true;
        }
        return res.status(200).json(data);
      }

      const box = req.query.box === 'sent' ? 'sent' : 'inbox';
      let query = supabase.from('staff_mail').select('*').order('created_at', { ascending: false }).limit(100);
      if (box === 'sent') {
        query = query.or(`from_user_id.eq.${myId},from_email.eq.${myEmail}`);
      } else {
        query = query.or(`to_user_id.eq.${myId},to_email.eq.${myEmail}`).eq('folder', 'inbox');
      }
      const { data, error } = await query;
      if (error) throw error;
      // filter sent folder label
      const items =
        box === 'sent'
          ? (data || []).filter((m) => m.from_user_id === myId || (m.from_email || '').toLowerCase() === myEmail)
          : data || [];
      return res.status(200).json({ items, box });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const toEmail = String(b.to_email || '').trim().toLowerCase();
      const subject = String(b.subject || '').trim();
      const body = String(b.body || '').trim();
      const fields = {};
      if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(toEmail)) fields.to_email = 'Enter a valid recipient email.';
      if (subject.length < 2) fields.subject = 'Give the message a subject.';
      if (body.length < 1) fields.body = 'Write a message.';
      if (Object.keys(fields).length) return fail(res, 400, 'Check the form.', fields);

      // Resolve recipient profile
      let toUserId = null;
      let toName = b.to_name || '';
      const { data: member } = await supabase
        .from('team_members')
        .select('*')
        .eq('email', toEmail)
        .eq('active', true)
        .maybeSingle();
      if (member) {
        toUserId = member.user_id;
        toName = member.name;
      } else {
        const { data: author } = await supabase.from('authors').select('*').ilike('email', toEmail).maybeSingle();
        if (author) toName = author.name;
      }

      const now = new Date().toISOString();
      const row = {
        from_user_id: myId,
        from_name: auth.member.name,
        from_email: myEmail,
        to_user_id: toUserId,
        to_email: toEmail,
        to_name: toName,
        subject,
        body,
        folder: 'inbox',
        read: false,
        thread_id: b.thread_id || null,
        created_at: now,
      };

      const { data, error } = await supabase.from('staff_mail').insert(row).select().single();
      if (error) throw error;

      if (toUserId) {
        try {
          await supabase.from('notifications').insert({
            user_id: toUserId,
            email_to: toEmail,
            kind: 'mail',
            title: `Mail: ${subject}`,
            body: `From ${auth.member.name}: ${body.slice(0, 120)}`,
            link: '/mail',
            read: false,
            email_status: 'queued',
            created_at: now,
          });
        } catch (_) {}
      }

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, read } = req.body || {};
      if (!id) return fail(res, 400, 'Missing id.');
      const { data: msg } = await supabase.from('staff_mail').select('*').eq('id', id).maybeSingle();
      if (!msg) return fail(res, 404, 'Message not found.');
      const mine = msg.to_user_id === myId || (msg.to_email || '').toLowerCase() === myEmail;
      if (!mine) return fail(res, 403, 'Not your inbox message.');
      const { data, error } = await supabase
        .from('staff_mail')
        .update({ read: read !== false })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return fail(res, 400, 'Missing id.');
      const { data: msg } = await supabase.from('staff_mail').select('*').eq('id', id).maybeSingle();
      if (!msg) return fail(res, 404, 'Message not found.');
      const mine =
        msg.to_user_id === myId ||
        msg.from_user_id === myId ||
        (msg.to_email || '').toLowerCase() === myEmail ||
        (msg.from_email || '').toLowerCase() === myEmail;
      if (!mine) return fail(res, 403, 'Not your message.');
      await supabase.from('staff_mail').delete().eq('id', id);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('mail error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
