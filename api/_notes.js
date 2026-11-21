import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import supabase from './db-client.js';
import { requireMember, clean } from './_lib.js';

/*
 * Notepad: each person's own notes. Reached through /api/team?resource=notes.
 *
 * A note belongs to one sign-in account and only that person can read it. Its title, its text and the
 * date and time of every save are kept in "content", encrypted here on the server (AES-256-GCM) with a key
 * made from the service role key and tied to the owner. Reading the table directly shows no note text, and
 * a row copied onto another person, or written by anything but this server, cannot be opened.
 *
 * The date and time of a save is the server's clock at the moment the save arrived. A browser cannot set it.
 */

const TABLE = 'notes';
const MAX_NOTES = 500;
const MAX_TITLE = 120;
const MAX_BODY = 20000;
const HISTORY = 30; // how many of the most recent save times are kept on a note

let sealKey = null;
const key = () => (sealKey ||= Buffer.from(hkdfSync('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '', 'newsroom-notes', 'note-content-v1', 32)));

function seal(content, owner) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`note|${owner}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(content), 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

function unseal(row) {
  try {
    if (typeof row.content !== 'string' || !row.content.startsWith('v1.')) return null;
    const raw = Buffer.from(row.content.slice(3), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(`note|${row.owner}`));
    decipher.setAuthTag(raw.subarray(12, 28));
    const content = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    return Array.isArray(content.saves) && content.saves.length ? content : null;
  } catch {
    return null;
  }
}

/** A note as the browser gets it. The list carries a short extract; an opened note carries its text and save times. */
const view = (row, c, full) => ({
  id: row.id,
  title: c.title || '',
  pinned: row.pinned === true,
  created: c.created,
  saved: c.saves[c.saves.length - 1],
  saves: c.count || c.saves.length,
  ...(full ? { body: c.body || '', history: [...c.saves].reverse() } : { snippet: String(c.body || '').replace(/\s+/g, ' ').trim().slice(0, 160) }),
});

async function ownRow(member, id) {
  const noteId = Number(id);
  if (!Number.isInteger(noteId) || noteId <= 0) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', noteId).eq('owner', member.uid).maybeSingle();
  if (error) throw error;
  const content = data ? unseal(data) : null;
  return content ? { row: data, content } : null;
}

/** Reads the title and text sent with a save. Returns { title, body } or { fields }. */
function readText(input) {
  const title = clean(input.title, MAX_TITLE).replace(/\s+/g, ' ');
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n?/g, '\n') : '';
  if (body.length > MAX_BODY) return { fields: { body: `A note can hold ${MAX_BODY.toLocaleString('en-ZA')} characters. This one has ${body.length.toLocaleString('en-ZA')}. Shorten it, or split it into two notes.` } };
  if (!title && !body.trim()) return { fields: { body: 'Write something before saving.' } };
  return { title, body };
}

/** A person's notes go when their account is removed: nobody else could ever open them. Never throws. */
export async function removeNotesOf(uid) {
  try {
    const { error } = await supabase.from(TABLE).delete().eq('owner', uid);
    if (error) throw error;
  } catch (err) {
    console.error('removing notes failed:', err);
  }
}

export async function notesHandler(req, res) {
  const member = await requireMember(req, res);
  if (!member) return;
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const gone = () => res.status(404).json({ error: 'That note can no longer be opened. It may have been deleted on another device.' });

  if (req.method === 'GET') {
    if (req.query.id) {
      const found = await ownRow(member, req.query.id);
      return found ? res.status(200).json(view(found.row, found.content, true)) : gone();
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('owner', member.uid)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MAX_NOTES);
    if (error) throw error;
    const q = clean(req.query.q, 80).toLowerCase();
    const notes = [];
    let total = 0;
    for (const row of data) {
      const content = unseal(row);
      if (!content) continue;
      total += 1;
      if (q && !`${content.title}\n${content.body}`.toLowerCase().includes(q)) continue;
      notes.push(view(row, content, false));
    }
    return res.status(200).json({ notes, total, limit: MAX_NOTES });
  }

  if (req.method === 'POST') {
    const text = readText(body);
    if (text.fields) return res.status(400).json({ error: text.fields.body, fields: text.fields });
    const { count, error: countError } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('owner', member.uid);
    if (countError) throw countError;
    if ((count || 0) >= MAX_NOTES) return res.status(400).json({ error: `The notepad holds ${MAX_NOTES} notes. Delete one you no longer need, then save this one.` });
    const now = new Date().toISOString();
    const content = { title: text.title, body: text.body, created: now, saves: [now], count: 1 };
    const { data, error } = await supabase.from(TABLE).insert({ owner: member.uid, content: seal(content, member.uid), pinned: false, created_at: now, updated_at: now }).select().single();
    if (error) throw error;
    return res.status(201).json(view(data, content, true));
  }

  if (req.method === 'PUT') {
    const found = await ownRow(member, body.id);
    if (!found) return gone();
    const { row, content } = found;

    // Pinning is not a save: it leaves the text and its save times alone.
    if (body.title === undefined && body.body === undefined) {
      if (typeof body.pinned !== 'boolean') return res.status(400).json({ error: 'Nothing to change.' });
      const { data, error } = await supabase.from(TABLE).update({ pinned: body.pinned }).eq('id', row.id).eq('owner', member.uid).select().single();
      if (error) throw error;
      return res.status(200).json(view(data, content, true));
    }

    const text = readText(body);
    if (text.fields) return res.status(400).json({ error: text.fields.body, fields: text.fields });
    const lastSaved = content.saves[content.saves.length - 1];
    // The note was saved somewhere else since this copy was opened: do not write over that without asking.
    if (typeof body.saved === 'string' && body.saved !== lastSaved && body.force !== true) {
      return res.status(409).json({ error: 'This note was saved somewhere else after you opened it here.', code: 'changed', fields: { saved: lastSaved } });
    }
    if (text.title === (content.title || '') && text.body === (content.body || '')) return res.status(200).json(view(row, content, true)); // nothing new to save

    const now = new Date().toISOString();
    const next = { title: text.title, body: text.body, created: content.created, saves: [...content.saves, now].slice(-HISTORY), count: (content.count || content.saves.length) + 1 };
    const { data, error } = await supabase.from(TABLE).update({ content: seal(next, member.uid), updated_at: now }).eq('id', row.id).eq('owner', member.uid).select().single();
    if (error) throw error;
    return res.status(200).json(view(data, next, true));
  }

  if (req.method === 'DELETE') {
    const noteId = Number(body.id);
    if (!Number.isInteger(noteId) || noteId <= 0) return res.status(400).json({ error: 'Missing note.' });
    const { error } = await supabase.from(TABLE).delete().eq('id', noteId).eq('owner', member.uid);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
