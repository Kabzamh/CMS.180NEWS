import supabase from './db-client.js';
import { cors, okOptions, fail, requireMember, requireUser } from './_helpers.js';
import { queueNotification } from './notifications.js';

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    // GET me / authors can run with auth checks below
    if (req.method === 'GET' && (req.query.me === '1' || req.query.resource === 'me')) {
      const auth = await requireMember(req);
      if (auth.error) return fail(res, auth.status, auth.error);
      return res.status(200).json(auth.member);
    }

    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    // Authors resource
    if (req.query.resource === 'authors' || req.query.authors === '1') {
      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('authors')
          .select('*')
          .order('name', { ascending: true });
        if (error) throw error;
        const { data: arts } = await supabase.from('articles').select('author_name, author_id');
        const byId = {};
        const byName = {};
        for (const a of arts || []) {
          if (a.author_id) byId[a.author_id] = (byId[a.author_id] || 0) + 1;
          if (a.author_name) byName[a.author_name.toLowerCase()] = (byName[a.author_name.toLowerCase()] || 0) + 1;
        }
        const authors = (data || []).map((au) => ({
          ...au,
          stories: byId[au.id] || byName[(au.name || '').toLowerCase()] || 0,
        }));
        return res.status(200).json({ authors });
      }

      if (req.method === 'POST') {
        if (!['owner', 'editor'].includes(auth.member.role)) {
          return fail(res, 403, 'Only editors can add authors.');
        }
        const b = req.body || {};
        const name = String(b.name || '').trim();
        if (name.length < 2) return fail(res, 400, 'Check the form.', { name: 'Enter a name.' });
        const { data, error } = await supabase
          .from('authors')
          .insert({
            name,
            title: b.title || '',
            bio: b.bio || '',
            email: b.email || '',
            photo_url: b.photo_url || null,
            active: b.active !== false,
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json({ ...data, stories: 0, renamed: 0 });
      }

      if (req.method === 'PUT') {
        if (!['owner', 'editor'].includes(auth.member.role)) {
          return fail(res, 403, 'Only editors can edit authors.');
        }
        const b = req.body || {};
        if (!b.id) return fail(res, 400, 'Missing author id.');
        const { data: prev } = await supabase.from('authors').select('*').eq('id', b.id).maybeSingle();
        if (!prev) return fail(res, 404, 'Author not found.');
        const patch = {};
        for (const k of ['name', 'title', 'bio', 'email', 'photo_url', 'active']) {
          if (b[k] !== undefined) patch[k] = b[k];
        }
        const { data, error } = await supabase.from('authors').update(patch).eq('id', b.id).select().single();
        if (error) throw error;
        let renamed = 0;
        if (patch.name && patch.name !== prev.name) {
          const { data: arts } = await supabase.from('articles').select('id').eq('author_name', prev.name);
          for (const a of arts || []) {
            await supabase.from('articles').update({ author_name: patch.name }).eq('id', a.id);
            renamed += 1;
          }
        }
        return res.status(200).json({ ...data, renamed });
      }

      if (req.method === 'DELETE') {
        if (!['owner', 'editor'].includes(auth.member.role)) {
          return fail(res, 403, 'Only editors can remove authors.');
        }
        const { id } = req.body || {};
        if (!id) return fail(res, 400, 'Missing author id.');
        const { error } = await supabase.from('authors').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    // Team members
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, user_id, name, email, role, active, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      if (auth.member.role !== 'owner') return fail(res, 403, 'Only the owner can add users.');
      const b = req.body || {};
      const name = String(b.name || '').trim();
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      const role = ['owner', 'editor', 'writer'].includes(b.role) ? b.role : 'writer';
      const fields = {};
      if (name.length < 2) fields.name = 'Enter their name.';
      if (!/[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(email)) fields.email = 'Enter their email address.';
      if (password.length < 8) fields.password = 'Use at least 8 characters.';
      if (Object.keys(fields).length) return fail(res, 400, 'Check the form.', fields);

      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });
      if (createErr) {
        return fail(res, 400, createErr.message || 'Could not create user.');
      }

      const { data, error } = await supabase
        .from('team_members')
        .insert({
          user_id: created.user.id,
          name,
          email,
          role,
          active: true,
        })
        .select()
        .single();
      if (error) throw error;

      try {
        await queueNotification({
          kind: 'team',
          title: `Team: ${name} joined`,
          body: `${name} (${email}) added as ${role}.`,
          link: '/users',
          onlyIf: (prefs) => prefs.notify_team && prefs.digest !== 'off',
        });
      } catch (_) {}
      return res.status(201).json({ ...data, password });
    }

    if (req.method === 'PUT') {
      const b = req.body || {};

      if (b.action === 'my_profile') {
        const name = String(b.name || '').trim();
        if (name.length < 2) return fail(res, 400, 'Check the form.', { name: 'Enter your name.' });
        const { data, error } = await supabase
          .from('team_members')
          .update({ name })
          .eq('user_id', auth.user.id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      if (b.action === 'my_password') {
        const password = String(b.password || '');
        if (password.length < 8) {
          return fail(res, 400, 'Check the form.', { password: 'Use at least 8 characters.' });
        }
        const { error } = await supabase.auth.admin.updateUserById(auth.user.id, { password });
        if (error) return fail(res, 400, error.message);
        return res.status(200).json({ ok: true });
      }

      if (auth.member.role !== 'owner') return fail(res, 403, 'Only the owner can update users.');
      if (!b.id) return fail(res, 400, 'Missing user id.');

      const { data: target } = await supabase.from('team_members').select('*').eq('id', b.id).maybeSingle();
      if (!target) return fail(res, 404, 'User not found.');

      if (b.password) {
        if (String(b.password).length < 8) {
          return fail(res, 400, 'Check the form.', { password: 'Use at least 8 characters.' });
        }
        const { error } = await supabase.auth.admin.updateUserById(target.user_id, { password: b.password });
        if (error) return fail(res, 400, error.message);
        return res.status(200).json({ ok: true });
      }

      const patch = {};
      if (b.name !== undefined) patch.name = b.name;
      if (b.role !== undefined && ['owner', 'editor', 'writer'].includes(b.role)) patch.role = b.role;
      if (b.active !== undefined) patch.active = !!b.active;

      const { data, error } = await supabase
        .from('team_members')
        .update(patch)
        .eq('id', b.id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (auth.member.role !== 'owner') return fail(res, 403, 'Only the owner can remove users.');
      const { id } = req.body || {};
      if (!id) return fail(res, 400, 'Missing user id.');
      const { data: target } = await supabase.from('team_members').select('*').eq('id', id).maybeSingle();
      if (!target) return fail(res, 404, 'User not found.');
      if (target.user_id === auth.user.id) return fail(res, 400, 'You cannot remove yourself.');
      await supabase.from('team_members').delete().eq('id', id);
      try {
        await supabase.auth.admin.deleteUser(target.user_id);
      } catch (_) {}
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('team error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
