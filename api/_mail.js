import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import supabase from './db-client.js';
import { requireMember, clean, slugify, canEdit, listAuthUsers, memberFromUser, setMemberMeta } from './_lib.js';
import { EMAIL, MAIL_DEFAULTS, MAIL_DOMAIN, MailError, accountSummary, connectAccount, deleteAccount, fetchNew, linkedAddress, loadAccount, mailLibraries, midRef, saveAccount, sendEmail } from './_inbox.js';

/*
 * 180news Mail: messages between the people on the team, and automatic alerts about stories and comments.
 * Reached through /api/team?resource=mail.
 *
 *  - mail_messages  one row per message. Who it is from and to, the subject, the text and the attachment
 *                   list are stored in "content", encrypted here on the server (AES-256-GCM) with a key made
 *                   from the service role key. Reading the table directly shows no message content, and a
 *                   row that was not written by this server cannot be opened.
 *  - mail_boxes     one row per person per message: which folder it is in, and whether it is unread or starred.
 *                   A row here never gives access on its own: the person must be named inside the message.
 *  - Attachments    files in the private newsroom-mail bucket, reached only through links signed for an hour.
 *
 * Mail between team members stays inside the newsroom. A person who has linked their 180news.co.za mailbox
 * (see _inbox.js) also gets the mail arriving in that mailbox copied into their inbox here, and can write to
 * outside email addresses; those messages go out through the mailbox.
 */

export const MAIL_BUCKET = 'newsroom-mail';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_PEOPLE = 50;
const MAX_ADDRESSES = 20; // outside email addresses on one message
const MAX_EMAIL_BYTES = 20 * 1024 * 1024; // attachments on one outgoing email, in total
const MAX_INBOUND_FILES = 10;
const ALERT_KINDS = ['review', 'mine', 'live', 'comments'];
const ALERT_SENDER = '180news alerts';
const FOLDERS = ['inbox', 'alerts', 'starred', 'sent', 'drafts', 'archive', 'trash'];
const MISSING_FILE = 'One of the attachments could not be found. Remove it and attach it again.';

// content type -> file extension. The newsroom-mail bucket allows exactly these types.
export const FILE_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/* ------------------------------------------------------------------ sealing */

let sealKey = null;
const key = () => (sealKey ||= Buffer.from(hkdfSync('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '', 'newsroom-mail', 'message-content-v1', 32)));
// Ties the sealed content to the row it was written for, so it cannot be copied onto another sender's row.
const bound = (row) => Buffer.from(`${row.sender_id}|${row.kind}`);

function seal(content, row) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(bound(row));
  const body = Buffer.concat([cipher.update(JSON.stringify(content), 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

function unseal(row) {
  try {
    if (typeof row.content !== 'string' || !row.content.startsWith('v1.')) return null;
    const raw = Buffer.from(row.content.slice(3), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAAD(bound(row));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

/** The content of a message, but only for someone it is from or to. */
function readFor(member, row) {
  const content = row ? unseal(row) : null;
  if (!content) return null;
  const named = [content.from, ...(content.to || []).map((p) => p.id), ...(content.cc || []).map((p) => p.id)];
  return named.includes(member.id) ? content : null;
}

/* ------------------------------------------------------------------- people */

async function team() {
  return (await listAuthUsers())
    .map((user) => {
      const member = memberFromUser(user);
      return member ? { ...member, user, alerts: user.app_metadata?.newsroom?.alerts || {}, mailbox: linkedAddress(user) } : null;
    })
    .filter(Boolean);
}

const prefsOf = (user) => {
  const saved = user?.app_metadata?.newsroom?.alerts || {};
  return Object.fromEntries(ALERT_KINDS.map((kind) => [kind, saved[kind] !== false]));
};

/* ------------------------------------------------------------------ reading */

async function contentsFor(member, messageIds) {
  const out = new Map();
  const ids = [...new Set(messageIds)];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('mail_messages').select('*').in('id', ids.slice(i, i + 200));
    if (error) throw error;
    for (const row of data) {
      const content = readFor(member, row);
      if (content) out.set(row.id, content);
    }
  }
  return out;
}

const listItem = (box, c) => ({
  id: box.id,
  message_id: box.message_id,
  thread_id: box.thread_id,
  folder: box.folder,
  kind: box.kind === 'alert' ? 'alert' : 'mail',
  unread: box.unread === true,
  starred: box.starred === true,
  at: box.created_at,
  from: { id: c.from, name: c.fromName },
  to: c.to || [],
  cc: c.cc || [],
  subject: c.subject || '',
  snippet: String(c.body || '').replace(/\s+/g, ' ').trim().slice(0, 140),
  attachments: (c.files || []).length,
  link: c.link || null,
  // Email addresses on a message that came from, or went to, outside the team.
  ext: c.ext ? { from: c.ext.from || null, to: c.ext.to || [], cc: c.ext.cc || [], via: c.ext.via || null, skipped: c.ext.skipped || [], tooLarge: c.ext.tooLarge === true } : null,
});

async function unreadSummary(member) {
  const { data, error } = await supabase
    .from('mail_boxes')
    .select('id, message_id, kind, created_at')
    .eq('member_id', member.id)
    .eq('folder', 'inbox')
    .eq('unread', true)
    .order('id', { ascending: false })
    .limit(500);
  if (error) throw error;
  const newest = data.slice(0, 5);
  const contents = await contentsFor(member, newest.map((box) => box.message_id));
  return {
    // The linked 180news.co.za mailbox, so the browser knows to check it for new mail.
    email: linkedAddress(member.user),
    counts: { inbox: data.filter((box) => box.kind !== 'alert').length, alerts: data.filter((box) => box.kind === 'alert').length },
    recent: newest
      .filter((box) => contents.has(box.message_id))
      .map((box) => {
        const c = contents.get(box.message_id);
        return { id: box.id, kind: box.kind === 'alert' ? 'alert' : 'mail', from: c.fromName, subject: c.subject || '(no subject)', at: box.created_at, link: c.link || null };
      }),
  };
}

async function listFolder(member, folder, q) {
  let query = supabase.from('mail_boxes').select('*').eq('member_id', member.id);
  if (q) query = query.neq('folder', 'trash');
  else if (folder === 'inbox') query = query.eq('folder', 'inbox').neq('kind', 'alert');
  else if (folder === 'alerts') query = query.eq('folder', 'inbox').eq('kind', 'alert');
  else if (folder === 'starred') query = query.eq('starred', true).neq('folder', 'trash');
  else query = query.eq('folder', folder);
  const { data: boxes, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(q ? 500 : 200);
  if (error) throw error;

  const contents = await contentsFor(member, boxes.map((box) => box.message_id));
  const items = [];
  for (const box of boxes) {
    const c = contents.get(box.message_id);
    if (!c) continue;
    if (q) {
      const outside = c.ext ? [c.ext.from, ...(c.ext.to || []), ...(c.ext.cc || [])].filter(Boolean).flatMap((a) => [a.name, a.address]) : [];
      const text = [c.subject, c.body, c.fromName, ...(c.to || []).map((p) => p.name), ...(c.cc || []).map((p) => p.name), ...(c.files || []).map((f) => f.name), ...outside].join('\n').toLowerCase();
      if (!text.includes(q)) continue;
    }
    items.push(listItem(box, c));
    if (q && items.length >= 100) break;
  }
  return items;
}

async function ownBox(member, id) {
  const boxId = Number(id);
  if (!Number.isInteger(boxId) || boxId <= 0) return null;
  const { data, error } = await supabase.from('mail_boxes').select('*').eq('id', boxId).eq('member_id', member.id).maybeSingle();
  if (error) throw error;
  return data;
}

/** A message in one of this person's folders: its folder row, its stored row and its content. */
async function ownMessage(member, boxId) {
  const box = await ownBox(member, boxId);
  if (!box) return null;
  const { data: row, error } = await supabase.from('mail_messages').select('*').eq('id', box.message_id).maybeSingle();
  if (error) throw error;
  const content = readFor(member, row);
  return content ? { box, row, content } : null;
}

async function openMessage(member, boxId) {
  const opened = await ownMessage(member, boxId);
  if (!opened) return null;
  const { box } = opened;
  if (box.unread) {
    const { error } = await supabase.from('mail_boxes').update({ unread: false }).eq('id', box.id);
    if (error) throw error;
    box.unread = false;
  }

  // The rest of the conversation, oldest first. A draft is shown on its own.
  let boxes = [box];
  if (box.folder !== 'drafts' && box.thread_id) {
    const { data, error } = await supabase
      .from('mail_boxes')
      .select('*')
      .eq('member_id', member.id)
      .eq('thread_id', box.thread_id)
      .not('folder', 'in', '(trash,drafts)')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(60);
    if (error) throw error;
    const byMessage = new Map();
    for (const other of data) if (!byMessage.has(other.message_id)) byMessage.set(other.message_id, other);
    byMessage.set(box.message_id, box);
    boxes = [...byMessage.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);
  }

  const contents = await contentsFor(member, boxes.map((b) => b.message_id));
  contents.set(box.message_id, opened.content);
  const files = boxes.flatMap((b) => contents.get(b.message_id)?.files || []);
  const links = new Map();
  if (files.length) {
    const { data, error } = await supabase.storage.from(MAIL_BUCKET).createSignedUrls(files.map((f) => f.path), 3600);
    if (error) throw error;
    for (const entry of data || []) if (entry.signedUrl) links.set(entry.path, entry.signedUrl);
  }

  const thread = boxes
    .filter((b) => contents.has(b.message_id))
    .map((b) => {
      const c = contents.get(b.message_id);
      return {
        ...listItem(b, c),
        body: c.body || '',
        files: (c.files || []).map((f) => ({ ...f, url: links.has(f.path) ? `${links.get(f.path)}&download=${encodeURIComponent(f.name)}` : null })),
        current: b.id === box.id,
      };
    });
  return { box: listItem(box, opened.content), thread };
}

/* ------------------------------------------------------------------ writing */

const newPath = (member, name, ext) => {
  const base = slugify(String(name).replace(/\.[a-z0-9]+$/i, '')).slice(0, 60) || 'file';
  return `m${member.id}/${Date.now()}-${randomBytes(3).toString('hex')}-${base}.${ext}`;
};

/**
 * Checks the attachments named on a message. Each must already be on this draft, be a file this person
 * uploaded, or be on the message being forwarded (those are copied, so every message owns its files).
 */
async function resolveFiles(member, input, kept, source) {
  const list = (Array.isArray(input) ? input : []).filter((f) => f && typeof f.path === 'string');
  if (list.length > MAX_FILES) return { error: `A message can carry ${MAX_FILES} attachments at most.` };
  const own = new RegExp(`^m${member.id}/\\d{13}-[a-f0-9]{6}-[a-z0-9-]{1,60}\\.[a-z0-9]{2,5}$`);
  const files = [];
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    const already = kept.find((f) => f.path === item.path);
    if (already) {
      files.push(already);
      continue;
    }
    const carried = source.find((f) => f.path === item.path);
    if (carried) {
      const to = newPath(member, carried.name, carried.path.split('.').pop());
      const { error } = await supabase.storage.from(MAIL_BUCKET).copy(carried.path, to);
      if (error) return { error: `${carried.name} could not be carried over. Remove it and try again.` };
      files.push({ path: to, name: carried.name, size: carried.size, type: carried.type });
      continue;
    }
    if (!own.test(item.path)) return { error: MISSING_FILE };
    const cut = item.path.lastIndexOf('/');
    const { data, error } = await supabase.storage.from(MAIL_BUCKET).list(item.path.slice(0, cut), { search: item.path.slice(cut + 1), limit: 10 });
    if (error) throw error;
    const object = (data || []).find((o) => o.name === item.path.slice(cut + 1));
    if (!object) return { error: MISSING_FILE };
    files.push({ path: item.path, name: clean(item.name, 120) || 'attachment', size: Number(object.metadata?.size) || 0, type: object.metadata?.mimetype || '' });
  }
  return { files };
}

/** Saves a draft, or sends a message. Returns { status, data } or { status, error, fields }. */
async function writeMessage(member, body, mode) {
  const people = new Map((await team()).filter((p) => p.active).map((p) => [p.id, p]));
  const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const to = ids(body.to).slice(0, MAX_PEOPLE);
  const cc = ids(body.cc).filter((id) => !to.includes(id)).slice(0, MAX_PEOPLE);
  // Outside email addresses. A message with any of these is also sent as a real email.
  const addresses = (list) => [...new Set((Array.isArray(list) ? list : []).map((a) => clean(a, 200).toLowerCase()).filter(Boolean))];
  const toAddr = addresses(body.toAddr).slice(0, MAX_ADDRESSES);
  const ccAddr = addresses(body.ccAddr).filter((a) => !toAddr.includes(a)).slice(0, MAX_ADDRESSES);
  const outside = toAddr.length + ccAddr.length > 0;
  const subject = clean(body.subject, 200);
  const text = typeof body.body === 'string' ? body.body.replace(/\r\n?/g, '\n').replace(/\s+$/, '').slice(0, 20000) : '';
  const fields = {};
  if ([...to, ...cc].some((id) => !people.has(id))) fields.to = 'One of the people chosen is no longer on the team. Remove them and try again.';
  else if ([...toAddr, ...ccAddr].some((a) => !EMAIL.test(a))) fields.to = 'One of the email addresses is not complete. It should look like name@example.com.';
  let account = null;
  if (outside && mode === 'send' && !fields.to) {
    account = await loadAccount(member);
    if (!account) fields.to = `Connect your ${MAIL_DOMAIN} mailbox before writing to an outside email address. It is under Email account, on the Mail page.`;
  }

  let draft = null;
  if (body.draft_id) {
    draft = await ownMessage(member, body.draft_id);
    if (!draft || draft.box.folder !== 'drafts') return { status: 404, error: 'That draft no longer exists. It may have been sent or deleted from another device.' };
  }
  let threadId = draft?.row.thread_id ?? null;
  // What an email reply answers, so mail apps keep the conversation together. A draft carries it until it is sent.
  let answers = draft?.content.ext?.reply || null;
  if (!draft && body.reply_to) {
    const original = await ownMessage(member, body.reply_to);
    threadId = original?.box.thread_id ?? null;
    const mid = original?.content.ext?.mid;
    if (mid) answers = { mid, refs: [...(original.content.ext.refs || []), mid].slice(-20) };
  }
  const source = body.forward_of ? (await ownMessage(member, body.forward_of))?.content.files || [] : [];
  const kept = draft?.content.files || [];
  const resolved = await resolveFiles(member, body.files, kept, source);
  if (resolved.error) fields.files = resolved.error;

  if (mode === 'send') {
    if (!to.length && !outside && !fields.to) fields.to = 'Choose at least one person to send this to.';
    if (!subject && !text && !(resolved.files || []).length) fields.body = 'Write a message, or attach a file.';
  }
  if (!fields.files && account && resolved.files.reduce((sum, f) => sum + (f.size || 0), 0) > MAX_EMAIL_BYTES) {
    fields.files = 'An email to an outside address can carry 20 MB of attachments in total. Remove a file, or send it another way.';
  }
  if (Object.keys(fields).length) return { status: 400, error: 'Check the highlighted fields.', fields };

  const person = (id) => ({ id, name: people.get(id).name });
  const address = (a) => ({ name: '', address: a });
  let ext = outside || answers ? { to: toAddr.map(address), cc: ccAddr.map(address), reply: answers } : undefined;

  if (account) {
    // The email goes out first. If the mail server does not take it, nothing is recorded as sent.
    const attachments = [];
    for (const file of resolved.files) {
      const { data, error } = await supabase.storage.from(MAIL_BUCKET).download(file.path);
      if (error) return { status: 400, error: 'Check the highlighted fields.', fields: { files: `${file.name} could not be read. Remove it and attach it again.` } };
      attachments.push({ filename: file.name, content: Buffer.from(await data.arrayBuffer()), contentType: file.type || undefined });
    }
    // Team members who have linked a mailbox are named on the email, so a "reply to all" from outside reaches
    // them. They are not sent a second copy: they already get this message here.
    const named = (list) => list.map((id) => people.get(id)).filter((p) => p.mailbox).map((p) => ({ name: p.name, address: p.mailbox }));
    try {
      const sent = await sendEmail(account, {
        fromName: member.name,
        to: [...toAddr, ...named(to)],
        cc: [...ccAddr, ...named(cc)],
        deliver: [...toAddr, ...ccAddr],
        subject,
        text,
        attachments,
        inReplyTo: answers?.mid,
        references: answers?.refs,
      });
      ext = { ...ext, mid: sent.messageId, refs: answers?.refs || [], via: account.email };
    } catch (err) {
      if (err instanceof MailError) return { status: 502, error: `The email was not sent. ${err.message}`, fields: err.field === 'to' ? { to: err.message } : undefined };
      throw err;
    }
  }

  const base = { sender_id: member.id, kind: 'mail' };
  const content = seal({ from: member.id, fromName: member.name, to: to.map(person), cc: cc.map(person), subject, body: text, files: resolved.files, link: null, ...(ext ? { ext } : {}) }, base);
  const now = new Date().toISOString();

  let message;
  if (draft) {
    const { data, error } = await supabase.from('mail_messages').update({ content, created_at: now }).eq('id', draft.row.id).select().single();
    if (error) throw error;
    message = data;
  } else {
    const { data, error } = await supabase.from('mail_messages').insert({ ...base, thread_id: threadId, content, created_at: now }).select().single();
    if (error) throw error;
    message = data;
  }
  if (!message.thread_id) {
    const { error } = await supabase.from('mail_messages').update({ thread_id: message.id }).eq('id', message.id);
    if (error) throw error;
    message.thread_id = message.id;
  }
  // Files taken off the draft are no longer needed.
  const dropped = kept.filter((f) => !resolved.files.some((r) => r.path === f.path)).map((f) => f.path);
  if (dropped.length) await supabase.storage.from(MAIL_BUCKET).remove(dropped);

  const row = { message_id: message.id, thread_id: message.thread_id, kind: 'mail', starred: false, ref: null, created_at: now };
  const mine = mode === 'send' ? { folder: 'sent', home: 'sent', unread: false, ref: ext?.mid ? midRef(ext.mid) : null } : { folder: 'drafts', home: 'drafts', unread: false };
  let boxId = draft?.box.id;
  if (draft) {
    const { error } = await supabase.from('mail_boxes').update({ ...mine, thread_id: message.thread_id, created_at: now }).eq('id', draft.box.id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('mail_boxes').insert({ ...row, ...mine, member_id: member.id }).select('id').single();
    if (error) throw error;
    boxId = data.id;
  }
  if (mode === 'draft') return { status: 200, data: { ok: true, draft_id: boxId, files: resolved.files } };

  const recipients = [...to, ...cc];
  if (recipients.length) {
    const { error } = await supabase.from('mail_boxes').insert(recipients.map((id) => ({ ...row, member_id: id, folder: 'inbox', home: 'inbox', unread: true })));
    if (error) throw error;
  }
  return { status: 201, data: { ok: true, sent: recipients.length + toAddr.length + ccAddr.length, emailed: account ? toAddr.length + ccAddr.length : 0 } };
}

/* ------------------------------------------------- a linked 180news.co.za mailbox */

const mailboxProblem = (err) => ({ status: 400, error: err.message, fields: err.field ? { [err.field]: err.message } : undefined });

async function mailboxSummary(member) {
  try {
    return accountSummary(await loadAccount(member));
  } catch (err) {
    return { ...accountSummary(null), connected: true, email: linkedAddress(member.user), error: err.message };
  }
}

/** Copies one message from the mailbox into this person's inbox here. Returns false if it is already here. */
async function storeInbound(member, account, m) {
  const ref = midRef(m.messageId || `${account.email}|${m.uid}|${m.arrived}`);
  const refs = [...new Set(m.refs.map(midRef))];
  const { data: known, error: knownError } = await supabase.from('mail_boxes').select('thread_id, home, ref').eq('member_id', member.id).in('ref', [ref, ...refs]).order('id', { ascending: true });
  if (knownError) throw knownError;
  if (known.some((box) => box.ref === ref && box.home === 'inbox')) return false;
  // A reply joins the conversation it answers. So does a copy of something sent from here.
  const threadId = (known.find((box) => box.ref === ref) || known.find((box) => refs.includes(box.ref)))?.thread_id ?? null;

  const files = [];
  const skipped = [];
  for (const attachment of m.attachments) {
    const extension = FILE_TYPES[attachment.type];
    if (!extension || attachment.size > MAX_FILE_BYTES || files.length >= MAX_INBOUND_FILES) {
      skipped.push(attachment.name);
      continue;
    }
    const path = newPath(member, attachment.name, extension);
    const { error } = await supabase.storage.from(MAIL_BUCKET).upload(path, attachment.content, { contentType: attachment.type, upsert: false });
    if (error) skipped.push(attachment.name);
    else files.push({ path, name: attachment.name, size: attachment.size, type: attachment.type });
  }

  const base = { sender_id: 0, kind: 'mail' };
  const arrived = new Date(Math.min(Date.parse(m.arrived) || Date.now(), Date.now())).toISOString();
  const content = seal(
    {
      from: 0,
      fromName: m.from?.name || m.from?.address || 'Unknown sender',
      to: [{ id: member.id, name: member.name }],
      cc: [],
      subject: m.subject,
      body: m.text.slice(0, 50000),
      files,
      link: null,
      ext: { from: m.from, to: m.to, cc: m.cc, mid: m.messageId || null, refs: m.refs, via: account.email, skipped: skipped.slice(0, 20), tooLarge: m.tooLarge },
    },
    base,
  );
  const { data: message, error } = await supabase.from('mail_messages').insert({ ...base, thread_id: threadId, content, created_at: arrived }).select('id').single();
  if (error) throw error;
  if (!threadId) await supabase.from('mail_messages').update({ thread_id: message.id }).eq('id', message.id);
  const { error: boxError } = await supabase
    .from('mail_boxes')
    .insert({ message_id: message.id, thread_id: threadId ?? message.id, member_id: member.id, folder: 'inbox', home: 'inbox', kind: 'mail', unread: !m.seen, starred: false, ref, created_at: arrived });
  if (boxError) throw boxError;
  return ref;
}

/** Two checks that ran at the same moment can both copy a message. The first copy is kept. */
async function dropDoubles(member, refs) {
  if (!refs.length) return 0;
  const { data, error } = await supabase.from('mail_boxes').select('id, message_id, ref').eq('member_id', member.id).eq('home', 'inbox').in('ref', refs).order('id', { ascending: true });
  if (error) throw error;
  const seen = new Set();
  const extra = data.filter((box) => (seen.has(box.ref) ? true : (seen.add(box.ref), false)));
  if (!extra.length) return 0;
  const { data: rows, error: rowsError } = await supabase.from('mail_messages').select('*').in('id', extra.map((box) => box.message_id));
  if (rowsError) throw rowsError;
  const paths = rows.flatMap((row) => (unseal(row)?.files || []).map((f) => f.path));
  if (paths.length) await supabase.storage.from(MAIL_BUCKET).remove(paths);
  const { error: gone } = await supabase.from('mail_messages').delete().in('id', extra.map((box) => box.message_id));
  if (gone) throw gone;
  return extra.length;
}

/** Brings new mail from the linked mailbox into this person's inbox. */
async function syncMailbox(member, force) {
  const account = await loadAccount(member);
  if (!account) return { status: 400, error: `No ${MAIL_DOMAIN} mailbox is connected.` };
  const now = Date.now();
  const recent = account.checkedAt && now - Date.parse(account.checkedAt) < 45000;
  const busy = account.busyUntil && Date.parse(account.busyUntil) > now;
  if (busy || (recent && !force)) return { status: 200, data: { ok: true, skipped: true, imported: 0, more: false, account: accountSummary(account) } };

  account.busyUntil = new Date(now + 25000).toISOString();
  await saveAccount(member, account);
  let imported = 0;
  let more = false;
  try {
    const fetched = await fetchNew(account, 5000);
    const refs = [];
    for (const message of fetched.messages) {
      const ref = await storeInbound(member, account, message);
      if (ref) refs.push(ref);
    }
    imported = refs.length - (await dropDoubles(member, refs));
    more = fetched.more;
    account.state = fetched.state;
    account.lastError = null;
    account.imported = (account.imported || 0) + imported;
  } catch (err) {
    if (!(err instanceof MailError)) console.error('mailbox check failed:', err);
    account.lastError = err instanceof MailError ? err.message : 'The mailbox could not be checked. It will be tried again.';
  }
  account.checkedAt = new Date().toISOString();
  account.busyUntil = null;
  await saveAccount(member, account);
  return { status: 200, data: { ok: !account.lastError, error: account.lastError, imported, more, account: accountSummary(account) } };
}

async function setFlags(member, body) {
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
  if (!ids.length) return { status: 400, error: 'Nothing was selected.' };
  const { data: boxes, error } = await supabase.from('mail_boxes').select('id, folder, home').eq('member_id', member.id).in('id', ids);
  if (error) throw error;

  const update = async (rows, patch) => {
    if (!rows.length) return;
    const { error: updateError } = await supabase.from('mail_boxes').update(patch).eq('member_id', member.id).in('id', rows.map((b) => b.id));
    if (updateError) throw updateError;
  };
  const flags = {};
  if (typeof body.unread === 'boolean') flags.unread = body.unread;
  if (typeof body.starred === 'boolean') flags.starred = body.starred;
  if (Object.keys(flags).length) await update(boxes, flags);

  if (body.move === 'archive') await update(boxes.filter((b) => b.folder === 'inbox'), { folder: 'archive' });
  else if (body.move === 'inbox') await update(boxes.filter((b) => b.folder === 'archive'), { folder: 'inbox' });
  else if (body.move === 'trash') await update(boxes.filter((b) => b.folder !== 'trash'), { folder: 'trash', unread: false });
  else if (body.move === 'restore') {
    const trashed = boxes.filter((b) => b.folder === 'trash');
    for (const home of ['inbox', 'sent', 'drafts']) await update(trashed.filter((b) => (b.home || 'inbox') === home), { folder: home });
  } else if (body.move) return { status: 400, error: 'Unknown folder.' };
  return { status: 200, data: { ok: true, changed: boxes.length } };
}

/** Deletes for good: drafts, and anything already in the trash. A message goes when nobody has it any more. */
async function removeBoxes(member, body) {
  let query = supabase.from('mail_boxes').select('id, message_id').eq('member_id', member.id);
  if (body.empty === 'trash') query = query.eq('folder', 'trash');
  else {
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
    if (!ids.length) return { status: 400, error: 'Nothing was selected.' };
    query = query.in('id', ids).in('folder', ['trash', 'drafts']);
  }
  const { data: boxes, error } = await query.limit(1000);
  if (error) throw error;
  if (!boxes.length) return { status: 200, data: { ok: true, deleted: 0 } };

  const { error: deleteError } = await supabase.from('mail_boxes').delete().eq('member_id', member.id).in('id', boxes.map((b) => b.id));
  if (deleteError) throw deleteError;

  const messageIds = [...new Set(boxes.map((b) => b.message_id))];
  const { data: still, error: stillError } = await supabase.from('mail_boxes').select('message_id').in('message_id', messageIds);
  if (stillError) throw stillError;
  const kept = new Set(still.map((b) => b.message_id));
  const orphans = messageIds.filter((id) => !kept.has(id));
  if (orphans.length) {
    const { data: rows, error: rowsError } = await supabase.from('mail_messages').select('*').in('id', orphans);
    if (rowsError) throw rowsError;
    const paths = rows.flatMap((row) => (unseal(row)?.files || []).map((f) => f.path));
    if (paths.length) await supabase.storage.from(MAIL_BUCKET).remove(paths);
    const { error: gone } = await supabase.from('mail_messages').delete().in('id', orphans);
    if (gone) throw gone;
  }
  return { status: 200, data: { ok: true, deleted: boxes.length } };
}

/* ------------------------------------------------------------------- alerts */

/**
 * Puts an automatic alert in people's Alerts folder. With "once", someone who still has an unread
 * alert with the same ref is not sent another.
 */
async function sendAlert(people, { subject, body, link, ref, once }) {
  let to = [...new Map(people.map((p) => [p.id, { id: p.id, name: p.name }])).values()];
  if (once && ref && to.length) {
    const { data, error } = await supabase.from('mail_boxes').select('member_id').in('member_id', to.map((p) => p.id)).eq('ref', ref).eq('folder', 'inbox').eq('unread', true);
    if (error) throw error;
    const waiting = new Set(data.map((b) => b.member_id));
    to = to.filter((p) => !waiting.has(p.id));
  }
  if (!to.length) return 0;
  const base = { sender_id: 0, kind: 'alert' };
  const now = new Date().toISOString();
  const content = seal({ from: 0, fromName: ALERT_SENDER, to, cc: [], subject, body, files: [], link: link || null }, base);
  const { data: message, error } = await supabase.from('mail_messages').insert({ ...base, content, created_at: now }).select('id').single();
  if (error) throw error;
  await supabase.from('mail_messages').update({ thread_id: message.id }).eq('id', message.id);
  const { error: boxError } = await supabase
    .from('mail_boxes')
    .insert(to.map((p) => ({ message_id: message.id, thread_id: message.id, member_id: p.id, folder: 'inbox', home: 'inbox', kind: 'alert', unread: true, starred: false, ref: ref || null, created_at: now })));
  if (boxError) throw boxError;
  return to.length;
}

const sast = (iso, withDay) =>
  new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', ...(withDay ? { weekday: 'long', day: 'numeric', month: 'long' } : {}), hour: '2-digit', minute: '2-digit', hour12: false });

/** An alert from another part of the CMS, to the people on the team that "pick" chooses. Never throws. */
export async function alertPeople(pick, alert) {
  try {
    return await sendAlert((await team()).filter((p) => p.active && pick(p)), alert);
  } catch (err) {
    console.error('alert failed:', err);
    return 0;
  }
}

/** Alerts that follow a story being saved. Never throws: an alert must not stop a story from saving. */
export async function notifyStory(actor, before, after) {
  try {
    if (!after || before?.status === after.status) return;
    const people = (await team()).filter((p) => p.active);
    const link = `/articles/${after.id}`;
    const ref = `story:${after.id}`;
    if (after.status === 'review') {
      const editors = people.filter((p) => canEdit(p) && p.id !== actor.id && p.alerts.review !== false);
      await sendAlert(editors, { subject: `For review: ${after.headline}`, body: `${actor.name} submitted this story for review. Open it to read it, then publish it, schedule it or move it back to draft.`, link, ref });
      return;
    }
    const author = people.find((p) => p.id === after.author_id);
    if (!author || author.id === actor.id || author.alerts.mine === false) return;
    const messages = {
      published: [`Published: ${after.headline}`, `${actor.name} published your story. It is live on the site feed.`],
      scheduled: [`Scheduled: ${after.headline}`, `${actor.name} scheduled your story to go live on ${after.publish_at ? sast(after.publish_at, true) : 'a later date'}, South African time.`],
      hidden: [`Hidden: ${after.headline}`, `${actor.name} hid your story from the site. The copy is kept in the newsroom.`],
      draft: [`Back in draft: ${after.headline}`, `${actor.name} moved your story back to draft.`],
    }[after.status];
    if (messages && before) await sendAlert([author], { subject: messages[0], body: messages[1], link, ref });
  } catch (err) {
    console.error('story alert failed:', err);
  }
}

/** Scheduled stories that have just gone live on their own: tell each author. */
export async function notifyLive(stories) {
  try {
    if (!stories?.length) return;
    const people = (await team()).filter((p) => p.active && p.alerts.live !== false);
    for (const story of stories) {
      const author = people.find((p) => p.id === story.author_id);
      if (author) await sendAlert([author], { subject: `Now live: ${story.headline}`, body: `Your scheduled story went live at ${sast(story.publish_at || Date.now())}, South African time.`, link: `/articles/${story.id}`, ref: `story:${story.id}` });
    }
  } catch (err) {
    console.error('live alert failed:', err);
  }
}

/** A reader comment is waiting: tell the editors, once per story until they have looked. */
export async function notifyComment(story) {
  try {
    const editors = (await team()).filter((p) => p.active && canEdit(p) && p.alerts.comments !== false);
    await sendAlert(editors, { subject: `Comment waiting: ${story.headline}`, body: 'A reader left a comment on this story. It is waiting in Comments for an editor to approve or reject.', link: '/comments', ref: `comment:${story.id}`, once: true });
  } catch (err) {
    console.error('comment alert failed:', err);
  }
}

/* ------------------------------------------------------------------ handler */

export async function mailHandler(req, res) {
  // Whether this server can talk to mail servers at all. Needs no sign-in and says nothing about anyone.
  if (req.method === 'GET' && req.query.ready) return res.status(200).json(await mailLibraries());

  const member = await requireMember(req, res);
  if (!member) return;
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const send = (result) => (result.error ? res.status(result.status).json({ error: result.error, fields: result.fields }) : res.status(result.status).json(result.data));

  if (req.method === 'GET') {
    if (req.query.counts) return res.status(200).json(await unreadSummary(member));
    if (req.query.boot) {
      const people = (await team())
        .filter((p) => p.active)
        .map((p) => ({ id: p.id, name: p.name, role: p.role }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return res.status(200).json({ me: member.id, people, prefs: prefsOf(member.user), email: await mailboxSummary(member), emailDefaults: MAIL_DEFAULTS });
    }
    if (req.query.id) {
      const opened = await openMessage(member, req.query.id);
      return opened ? res.status(200).json(opened) : res.status(404).json({ error: 'That message can no longer be opened. It may have been deleted.' });
    }
    const folder = FOLDERS.includes(req.query.folder) ? req.query.folder : 'inbox';
    return res.status(200).json({ folder, items: await listFolder(member, folder, clean(req.query.q, 80).toLowerCase()) });
  }

  if (req.method === 'POST') {
    if (body.action === 'attach') {
      const ext = FILE_TYPES[body.contentType];
      if (!ext) return res.status(400).json({ error: 'Mail cannot attach that kind of file. Use a PDF, Word, Excel or PowerPoint file, a picture, an audio or video clip, a text file or a zip.' });
      const size = Number(body.size);
      if (!(size > 0)) return res.status(400).json({ error: 'That file is empty.' });
      if (size > MAX_FILE_BYTES) return res.status(400).json({ error: 'That file is over 20 MB, the most Mail can attach.' });
      const path = newPath(member, clean(body.fileName, 120), ext);
      const { data, error } = await supabase.storage.from(MAIL_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return res.status(200).json({ path, signedUrl: data.signedUrl });
    }
    if (body.action === 'send' || body.action === 'draft') return send(await writeMessage(member, body, body.action));
    if (body.action === 'sync') return send(await syncMailbox(member, body.force === true));
    if (body.action === 'connect') {
      try {
        const { account, waiting } = await connectAccount(member, body);
        await saveAccount(member, account);
        await setMemberMeta(member.user, { mailbox: account.email });
        return res.status(200).json({ account: accountSummary(account), waiting });
      } catch (err) {
        if (err instanceof MailError) return send(mailboxProblem(err));
        throw err;
      }
    }
    if (body.action === 'disconnect') {
      // The saved password goes. Mail already copied into the CMS stays, and the mailbox itself is untouched.
      await deleteAccount(member);
      await setMemberMeta(member.user, { mailbox: null });
      return res.status(200).json({ account: accountSummary(null) });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  }

  if (req.method === 'PUT') {
    if (body.action === 'prefs') {
      const alerts = Object.fromEntries(ALERT_KINDS.map((kind) => [kind, body.prefs?.[kind] !== false]));
      await setMemberMeta(member.user, { alerts });
      return res.status(200).json({ prefs: alerts });
    }
    return send(await setFlags(member, body));
  }

  if (req.method === 'DELETE') return send(await removeBoxes(member, body));
  return res.status(405).json({ error: 'Method not allowed' });
}
