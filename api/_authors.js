import supabase from './db-client.js';
import { requireMember, logActivity, clean, isHttpUrl } from './_lib.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const key = (value) => String(value || '').trim().toLowerCase();

async function readFields(body, existing) {
  const fields = {};
  const pick = (name, max) => (body[name] !== undefined ? clean(body[name], max) : existing?.[name] ?? '');
  const name = pick('name', 80).replace(/\s+/g, ' ');
  const title = pick('title', 80);
  const bio = body.bio !== undefined ? (typeof body.bio === 'string' ? body.bio.trim().slice(0, 600) : '') : existing?.bio ?? '';
  const email = pick('email', 160).toLowerCase();
  const photo = body.photo_url !== undefined ? clean(body.photo_url, 600) : existing?.photo_url ?? '';
  const active = typeof body.active === 'boolean' ? body.active : existing?.active ?? true;

  if (name.length < 2) fields.name = 'Enter the name as it should appear on stories.';
  if (email && !EMAIL.test(email)) fields.email = 'Enter a valid email address, for example thandi@180news.co.za.';
  if (photo && !isHttpUrl(photo)) fields.photo_url = 'The photo link is not valid. Upload the photo again.';
  if (!fields.name) {
    const { data, error } = await supabase.from('authors').select('id, name');
    if (error) throw error;
    if (data.some((a) => key(a.name) === key(name) && a.id !== existing?.id)) fields.name = 'There is already a profile with this name.';
  }
  if (Object.keys(fields).length) return { fields };
  return { row: { name, title, bio, email, photo_url: photo || null, active, updated_at: new Date().toISOString() } };
}

/** Author profiles: the people whose names appear on stories. Reached through /api/team?resource=authors. */
export async function authorsHandler(req, res) {
  if (req.method === 'GET') {
    const member = await requireMember(req, res);
    if (!member) return;
    const [authors, articles] = await Promise.all([
      supabase.from('authors').select('*').order('name', { ascending: true }),
      supabase.from('articles').select('author_name, status').limit(5000),
    ]);
    if (authors.error) throw authors.error;
    if (articles.error) throw articles.error;

    const tally = new Map();
    for (const a of articles.data) {
      const name = String(a.author_name || '').trim();
      if (!name) continue;
      const entry = tally.get(key(name)) || { name, stories: 0, published: 0 };
      entry.stories += 1;
      if (a.status === 'published') entry.published += 1;
      tally.set(key(name), entry);
    }
    const profiled = new Set(authors.data.map((a) => key(a.name)));
    return res.status(200).json({
      authors: authors.data.map((a) => ({ ...a, stories: tally.get(key(a.name))?.stories || 0, published: tally.get(key(a.name))?.published || 0 })),
      unlinked: [...tally.entries()]
        .filter(([k]) => !profiled.has(k))
        .map(([, v]) => ({ name: v.name, stories: v.stories }))
        .sort((a, b) => b.stories - a.stories || a.name.localeCompare(b.name)),
    });
  }

  const member = await requireMember(req, res, ['owner', 'editor']);
  if (!member) return;
  const body = req.body || {};

  if (req.method === 'POST') {
    const result = await readFields(body, null);
    if (result.fields) return res.status(400).json({ error: 'Check the highlighted fields.', fields: result.fields });
    const { data, error } = await supabase
      .from('authors')
      .insert({ ...result.row, created_at: result.row.updated_at })
      .select()
      .single();
    if (error) throw error;
    await logActivity(member, 'created', 'author', data.id, `${member.name} added an author profile for ${data.name}`);
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const id = Number(body.id);
    if (!id) return res.status(400).json({ error: 'Missing author.' });
    const { data: existing, error: findError } = await supabase.from('authors').select('*').eq('id', id).maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: 'That author profile no longer exists.' });
    const result = await readFields(body, existing);
    if (result.fields) return res.status(400).json({ error: 'Check the highlighted fields.', fields: result.fields });
    const { data, error } = await supabase.from('authors').update(result.row).eq('id', id).select().single();
    if (error) throw error;

    // A renamed author keeps their stories: the byline is updated on each one.
    let renamed = 0;
    if (data.name !== existing.name) {
      const { data: changed, error: renameError } = await supabase
        .from('articles')
        .update({ author_name: data.name })
        .eq('author_name', existing.name)
        .select('id');
      if (renameError) throw renameError;
      renamed = changed.length;
    }
    await logActivity(member, 'updated', 'author', id, `${member.name} updated the author profile for ${data.name}`);
    return res.status(200).json({ ...data, renamed });
  }

  if (req.method === 'DELETE') {
    const id = Number(body.id);
    if (!id) return res.status(400).json({ error: 'Missing author.' });
    const { data: existing, error: findError } = await supabase.from('authors').select('*').eq('id', id).maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(200).json({ ok: true });
    const { error } = await supabase.from('authors').delete().eq('id', id);
    if (error) throw error;
    await logActivity(member, 'deleted', 'author', id, `${member.name} removed the author profile for ${existing.name}`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
