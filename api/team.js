import supabase from './db-client.js';
import { authorsHandler } from './_authors.js';
import { requireMember, logActivity, clean, fail, ROLES, listAuthUsers, listMembers, memberFromUser, memberMeta, setMemberMeta } from './_lib.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const present = (m) => ({
  id: m.id,
  name: m.name,
  email: m.email,
  role: m.role,
  active: m.active,
  created_at: m.created_at,
  last_seen_at: m.last_seen_at,
});

const roleWords = (role) => (role === 'owner' ? 'an owner' : role === 'editor' ? 'an editor' : 'a writer');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.query.resource === 'authors') return await authorsHandler(req, res);

    if (req.method === 'GET') {
      if (req.query.me) {
        const member = await requireMember(req, res);
        if (!member) return;
        return res.status(200).json(present(member));
      }
      if (req.query.authors) {
        const member = await requireMember(req, res);
        if (!member) return;
        const members = await listMembers();
        return res.status(200).json(
          members
            .map((m) => ({ id: m.id, name: m.name, role: m.role }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      const member = await requireMember(req, res, ['owner']);
      if (!member) return;
      return res.status(200).json((await listMembers()).map(present));
    }

    if (req.method === 'POST') {
      const member = await requireMember(req, res, ['owner']);
      if (!member) return;
      const name = clean(req.body?.name, 80);
      const email = clean(req.body?.email, 160).toLowerCase();
      const role = req.body?.role;
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const fields = {};
      if (name.length < 2) fields.name = 'Enter their name.';
      if (!EMAIL.test(email)) fields.email = 'Enter a valid email address, for example thandi@180news.co.za.';
      if (!ROLES.includes(role)) fields.role = 'Choose a role.';
      if (password.length < 8) fields.password = 'Use at least 8 characters.';

      const users = await listAuthUsers();
      const existing = users.find((u) => (u.email || '').toLowerCase() === email);
      if (!fields.email && existing && memberFromUser(existing)) fields.email = 'Someone with this email is already on the team.';
      if (Object.keys(fields).length) return res.status(400).json({ error: 'Check the highlighted fields.', fields });

      const memberId = users.reduce((max, u) => Math.max(max, memberFromUser(u)?.id || 0), 0) + 1;
      const meta = { role, active: true, member_id: memberId, name, added_at: new Date().toISOString() };

      let saved;
      if (existing) {
        const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          app_metadata: memberMeta(existing, meta),
        });
        if (error) throw error;
        saved = data.user;
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: memberMeta(null, meta),
        });
        if (error) throw error;
        saved = data.user;
      }
      const created = memberFromUser(saved);
      await logActivity(member, 'created', 'team', created.id, `${member.name} added ${name} to the team as ${roleWords(role)}`);
      return res.status(201).json(present(created));
    }

    if (req.method === 'PUT') {
      const body = req.body || {};

      if (body.action === 'my_profile') {
        const member = await requireMember(req, res);
        if (!member) return;
        const name = clean(body.name, 80);
        if (name.length < 2) return res.status(400).json({ error: 'Enter your name.', fields: { name: 'Enter your name.' } });
        const updated = await setMemberMeta(member.user, { name });
        return res.status(200).json(present(memberFromUser(updated)));
      }

      if (body.action === 'my_password') {
        const member = await requireMember(req, res);
        if (!member) return;
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length < 8) {
          return res.status(400).json({ error: 'Use at least 8 characters.', fields: { password: 'Use at least 8 characters.' } });
        }
        const { error } = await supabase.auth.admin.updateUserById(member.uid, { password });
        if (error) throw error;
        // The starter sign-in details stop being advertised once that account has its own password.
        const { data: demo } = await supabase.from('settings').select('value').eq('key', 'demo_login').maybeSingle();
        if (demo?.value?.email && String(demo.value.email).toLowerCase() === member.email) {
          await supabase.from('settings').delete().eq('key', 'demo_login');
        }
        return res.status(200).json({ ok: true });
      }

      const member = await requireMember(req, res, ['owner']);
      if (!member) return;
      const id = Number(body.id);
      if (!id) return res.status(400).json({ error: 'Missing team member.' });
      const users = await listAuthUsers();
      const targetUser = users.find((u) => memberFromUser(u)?.id === id);
      if (!targetUser) return res.status(404).json({ error: 'That team member no longer exists.' });
      const target = memberFromUser(targetUser);
      const otherOwners = users.map(memberFromUser).filter((m) => m && m.id !== id && m.role === 'owner' && m.active).length;

      const patch = {};
      if (body.name !== undefined) {
        const name = clean(body.name, 80);
        if (name.length < 2) return res.status(400).json({ error: 'Enter their name.', fields: { name: 'Enter their name.' } });
        patch.name = name;
      }
      if (body.role !== undefined) {
        if (!ROLES.includes(body.role)) return res.status(400).json({ error: 'Choose a role.' });
        patch.role = body.role;
      }
      if (typeof body.active === 'boolean') patch.active = body.active;

      const losesOwner = target.role === 'owner' && target.active && ((patch.role && patch.role !== 'owner') || patch.active === false);
      if (losesOwner && otherOwners === 0) {
        return res.status(400).json({ error: 'The newsroom needs at least one owner. Make someone else an owner first.' });
      }
      if (target.id === member.id && patch.active === false) {
        return res.status(400).json({ error: 'You cannot switch off your own access.' });
      }

      if (body.password !== undefined) {
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length < 8) {
          return res.status(400).json({ error: 'Use at least 8 characters.', fields: { password: 'Use at least 8 characters.' } });
        }
        const { error } = await supabase.auth.admin.updateUserById(targetUser.id, { password });
        if (error) throw error;
        await logActivity(member, 'updated', 'team', id, `${member.name} reset the password for ${target.name}`);
      }

      if (!Object.keys(patch).length) return res.status(200).json(present(target));

      const updated = memberFromUser(await setMemberMeta(targetUser, patch));
      if (patch.role && patch.role !== target.role) {
        await logActivity(member, 'updated', 'team', id, `${member.name} made ${updated.name} ${roleWords(patch.role)}`);
      }
      if (patch.active !== undefined && patch.active !== target.active) {
        await logActivity(member, 'updated', 'team', id, `${member.name} ${patch.active ? 'restored' : 'switched off'} access for ${updated.name}`);
      }
      return res.status(200).json(present(updated));
    }

    if (req.method === 'DELETE') {
      const member = await requireMember(req, res, ['owner']);
      if (!member) return;
      const id = Number(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Missing team member.' });
      if (id === member.id) return res.status(400).json({ error: 'You cannot remove yourself from the team.' });
      const users = await listAuthUsers();
      const targetUser = users.find((u) => memberFromUser(u)?.id === id);
      if (!targetUser) return res.status(200).json({ ok: true });
      const target = memberFromUser(targetUser);
      const otherOwners = users.map(memberFromUser).filter((m) => m && m.id !== id && m.role === 'owner' && m.active).length;
      if (target.role === 'owner' && target.active && otherOwners === 0) {
        return res.status(400).json({ error: 'The newsroom needs at least one owner.' });
      }
      const { error } = await supabase.auth.admin.deleteUser(targetUser.id);
      if (error) throw error;
      await logActivity(member, 'deleted', 'team', id, `${member.name} removed ${target.name} from the team`);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    fail(res, err);
  }
}
