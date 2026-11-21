import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import supabase from './db-client.js';
import { clean } from './_lib.js';

/*
 * Mailboxes on the 180news.co.za domain, linked to Mail in the CMS.
 *
 * Each person can link one mailbox. The CMS then
 *   - reads new mail from that mailbox's inbox (IMAP, port 993) and copies it into their CMS inbox;
 *   - sends through the mailbox (SMTP, port 465 or 587) when a message is addressed to an email address.
 * The mailbox is only ever read: nothing in it is marked, moved or deleted by the CMS.
 *
 * What is kept for a linked mailbox is one small file in the private newsroom-mail storage bucket, which only
 * this server can reach. The mailbox password inside it is encrypted (AES-256-GCM) with a key made from the
 * service role key, and is never sent back to a browser.
 */

export const MAIL_DOMAIN = '180news.co.za';
// Where the domain's mail is hosted, as published in its DNS: one server for reading and for sending.
export const MAIL_DEFAULTS = { domain: MAIL_DOMAIN, imapHost: `mail.${MAIL_DOMAIN}`, smtpHost: `mail.${MAIL_DOMAIN}`, smtpPort: 465 };
export const EMAIL = /^[^\s@<>(),;:"]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

const BUCKET = 'newsroom-mail';
const IMAP_PORT = 993;
const SMTP_PORTS = [465, 587];
const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // a message larger than this is listed without its text and files
const FIRST_SYNC = 30; // how many of the most recent messages are brought in when a mailbox is first linked
const PER_RUN = 15;
const GROUP_BYTES = 12 * 1024 * 1024; // messages are read from the server in groups of about this size
const RUN_BYTES = 40 * 1024 * 1024; // and a single check stops reading once it holds this much

/* ---------------------------------------------------------------- the saved link */

let sealKey = null;
const key = () => (sealKey ||= Buffer.from(hkdfSync('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '', 'newsroom-mail', 'mailbox-password-v1', 32)));

function sealPassword(password, memberId) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`mailbox|${memberId}`));
  const body = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

function openPassword(secret, memberId) {
  try {
    const raw = Buffer.from(String(secret).slice(3), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(`mailbox|${memberId}`));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const accountPath = (memberId) => `accounts/m${memberId}.txt`;
export const linkedAddress = (user) => user?.app_metadata?.newsroom?.mailbox || null;

/** The saved link for this person, or null when no mailbox is linked. */
export async function loadAccount(member) {
  if (!linkedAddress(member.user)) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(accountPath(member.id));
  if (error) throw new Error('The saved details of your mailbox could not be read. Try again in a moment.');
  const account = JSON.parse(await data.text());
  return account && account.member === member.id ? account : null;
}

export async function saveAccount(member, account) {
  const { error } = await supabase.storage.from(BUCKET).upload(accountPath(member.id), JSON.stringify(account), { contentType: 'text/plain', upsert: true });
  if (error) throw error;
}

export async function deleteAccount(member) {
  const { error } = await supabase.storage.from(BUCKET).remove([accountPath(member.id)]);
  if (error) throw error;
}

/** What a browser may know about the link. Never the password. */
export const accountSummary = (account) =>
  account
    ? {
        connected: true,
        email: account.email,
        username: account.username,
        imapHost: account.imap.host,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        connectedAt: account.connectedAt || null,
        checkedAt: account.checkedAt || null,
        error: account.lastError || null,
        imported: account.imported || 0,
      }
    : { connected: false, email: null, username: null, imapHost: null, smtpHost: null, smtpPort: null, connectedAt: null, checkedAt: null, error: null, imported: 0 };

/* ---------------------------------------------------------------- reaching a mail server */

const isPrivate = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivate(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
};

/**
 * Checks a server name and looks it up once. The connection is then made to that exact address, with the
 * name still used to check the server's security certificate. Names that lead to this server's own network
 * are refused, so the CMS cannot be pointed at something that is not a public mail server.
 */
async function vet(host) {
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) throw new MailError(`“${host}” is not a mail server name. It looks like mail.${MAIL_DOMAIN}.`, 'host');
  let found;
  try {
    found = await dns.lookup(host, { all: true });
  } catch {
    throw new MailError(`No mail server was found at “${host}”. Check the server name.`, 'host');
  }
  const open = found.filter((entry) => !isPrivate(entry.address));
  if (!open.length) throw new MailError(`“${host}” does not lead to a public mail server.`, 'host');
  return (open.find((entry) => entry.family === 4) || open[0]).address;
}

export class MailError extends Error {
  constructor(message, field) {
    super(message);
    this.field = field || null;
  }
}

/** Turns whatever a mail library threw into a sentence a person can act on. */
function explain(err, host, sending) {
  if (err instanceof MailError) return err;
  const code = String(err?.code || '');
  const text = String(err?.responseText || err?.response || err?.message || '').replace(/\s+/g, ' ').trim();
  if (err?.authenticationFailed || code === 'EAUTH' || /AUTHENTICATIONFAILED|authentication failed|invalid credentials|535/i.test(text)) {
    return new MailError('The mail server did not accept that username and password. Check them against the ones you use for webmail.', 'password');
  }
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/i.test(code) || /certificate/i.test(text)) {
    return new MailError(`The security certificate of “${host}” could not be checked, so no password was sent. Use the server name your mail host gives for secure (SSL/TLS) settings.`, 'host');
  }
  if (/TIMEDOUT|ETIMEOUT|Timeout/i.test(code) || /timed? ?out|timeout/i.test(text)) return new MailError(`The mail server at “${host}” did not answer in time. Try again in a moment.`, 'host');
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ESOCKET|ECONNECTION|NoConnection|EDNS|ENOTFOUND/i.test(code)) return new MailError(`The mail server at “${host}” could not be reached.`, 'host');
  return new MailError(`The mail server ${sending ? 'did not take the message' : 'reported a problem'}: ${text.slice(0, 160) || 'no reason given'}`, null);
}

function withTimeout(promise, ms, host, onTimeout) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new MailError(`The mail server at “${host}” did not answer in time. Try again in a moment.`, 'host'));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function openImap(account, password) {
  const { ImapFlow } = await import('imapflow');
  const address = await vet(account.imap.host);
  const client = new ImapFlow({
    host: address,
    port: IMAP_PORT,
    secure: true,
    servername: account.imap.host,
    tls: { servername: account.imap.host },
    auth: { user: account.username, pass: password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 7000,
    greetingTimeout: 7000,
    socketTimeout: 20000,
    clientInfo: { name: '180news Newsroom CMS' },
  });
  client.on('error', () => {});
  await client.connect();
  return client;
}

async function smtpTransport(account, password) {
  const nodemailer = (await import('nodemailer')).default;
  const address = await vet(account.smtp.host);
  const secure = account.smtp.port === 465;
  return nodemailer.createTransport({
    host: address,
    port: account.smtp.port,
    secure,
    requireTLS: !secure, // on port 587 the password is only sent once the connection is encrypted
    name: account.email.split('@')[1],
    tls: { servername: account.smtp.host },
    auth: { user: account.username, pass: password },
    connectionTimeout: 7000,
    greetingTimeout: 7000,
    socketTimeout: 20000,
  });
}

/* ---------------------------------------------------------------- linking a mailbox */

/**
 * Checks the details by signing in to read and to send, and returns the link to save.
 * Throws a MailError that says which field to look at.
 */
export async function connectAccount(member, input) {
  const email = clean(input.email, 160).toLowerCase();
  if (!EMAIL.test(email)) throw new MailError(`Enter the full email address, for example yourname@${MAIL_DOMAIN}.`, 'email');
  if (!email.endsWith(`@${MAIL_DOMAIN}`)) throw new MailError(`Use an address that ends in @${MAIL_DOMAIN}.`, 'email');
  const password = typeof input.password === 'string' ? input.password : '';
  if (!password) throw new MailError('Enter the password for this mailbox.', 'password');
  if (password.length > 200) throw new MailError('That password is too long to be right.', 'password');
  const smtpPort = Number(input.smtpPort) || MAIL_DEFAULTS.smtpPort;
  if (!SMTP_PORTS.includes(smtpPort)) throw new MailError('Choose port 465 or 587 for outgoing mail.', 'host');

  const account = {
    v: 1,
    member: member.id,
    email,
    username: clean(input.username, 160) || email,
    imap: { host: (clean(input.imapHost, 253) || MAIL_DEFAULTS.imapHost).toLowerCase(), port: IMAP_PORT },
    smtp: { host: (clean(input.smtpHost, 253) || MAIL_DEFAULTS.smtpHost).toLowerCase(), port: smtpPort },
    secret: sealPassword(password, member.id),
    state: null,
    connectedAt: new Date().toISOString(),
    checkedAt: null,
    busyUntil: null,
    lastError: null,
    imported: 0,
  };

  let client;
  let waiting = 0;
  try {
    client = await withTimeout(openImap(account, password), 9000, account.imap.host);
    const box = await client.mailboxOpen('INBOX', { readOnly: true });
    waiting = box.exists || 0;
  } catch (err) {
    throw explain(err, account.imap.host, false);
  } finally {
    await client?.logout().catch(() => client.close());
  }
  let transport;
  try {
    transport = await smtpTransport(account, password);
    await withTimeout(transport.verify(), 9000, account.smtp.host, () => transport.close());
  } catch (err) {
    const problem = explain(err, account.smtp.host, true);
    // Reading worked with this password, so a refusal here is about the outgoing server.
    throw problem.field === 'password' ? new MailError(`Reading mail works, but the outgoing server “${account.smtp.host}” did not accept the same username and password. Check the outgoing server name and port.`, 'host') : problem;
  } finally {
    transport?.close();
  }
  return { account, waiting };
}

/* ---------------------------------------------------------------- reading new mail */

const people = (field) =>
  (Array.isArray(field) ? field : field ? [field] : [])
    .flatMap((part) => part.value || [])
    .flatMap((entry) => (entry.group ? entry.group : [entry]))
    .filter((entry) => entry.address && EMAIL.test(entry.address))
    .map((entry) => ({ name: clean(entry.name, 120), address: entry.address.toLowerCase() }))
    .slice(0, 50);

const cleanId = (id) => (typeof id === 'string' && id.length <= 500 ? id.trim() : '');

/** The words of an email. One written only in HTML (most newsletters and statements) is turned into plain text. */
async function readable(parsed) {
  const text = String(parsed.text || '').trim();
  if (text || !parsed.html) return text;
  const html = String(parsed.html).slice(0, 600000);
  try {
    const { convert } = await import('html-to-text');
    return convert(html, {
      wordwrap: false,
      limits: { maxInputLength: 600000, maxDepth: 80 },
      selectors: [
        { selector: 'img', format: 'skip' },
        { selector: 'h1', options: { uppercase: false } },
        { selector: 'h2', options: { uppercase: false } },
        { selector: 'h3', options: { uppercase: false } },
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      ],
    }).trim();
  } catch {
    return html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/** A short, fixed-length stand-in for a Message-ID, used to spot a message that is already in the CMS. */
export const midRef = (messageId) => `mid:${createHash('sha256').update(String(messageId)).digest('hex').slice(0, 32)}`;

/**
 * Reads mail that has arrived in the inbox since the last check: at most PER_RUN messages a call, oldest
 * first, stopping early when the time allowed is used up. The first check takes the FIRST_SYNC most recent
 * messages and leaves anything older in the mailbox. Returns the messages and where to carry on from.
 */
export async function fetchNew(account, budgetMs) {
  const password = openPassword(account.secret, account.member);
  if (password === null) throw new MailError('The saved password for this mailbox can no longer be read. Disconnect the mailbox and connect it again.', 'password');
  const deadline = Date.now() + budgetMs;
  const { simpleParser } = await import('mailparser');
  let client;
  try {
    client = await withTimeout(openImap(account, password), 9000, account.imap.host);
    const box = await client.mailboxOpen('INBOX', { readOnly: true });
    const validity = String(box.uidValidity);
    const newest = Math.max(0, Number(box.uidNext || 1) - 1);
    let last = account.state && account.state.uidValidity === validity ? Number(account.state.lastUid) : null;
    let uids;
    if (last === null || !Number.isFinite(last)) {
      const all = ((await client.search({ all: true }, { uid: true })) || []).sort((a, b) => a - b);
      uids = all.slice(-FIRST_SYNC);
      last = uids.length ? uids[0] - 1 : newest;
    } else {
      // "n:*" always includes the newest message, even when it is older than n, so the answer is filtered.
      uids = ((await client.search({ uid: `${last + 1}:*` }, { uid: true })) || []).filter((uid) => uid > last).sort((a, b) => a - b);
    }
    const batch = uids.slice(0, PER_RUN);
    const listed = batch.length ? await client.fetchAll(batch.join(','), { uid: true, flags: true, size: true, internalDate: true, envelope: true }, { uid: true }) : [];
    listed.sort((a, b) => a.uid - b.uid);
    const about = (item) => {
      const arrived = item.internalDate instanceof Date && !Number.isNaN(item.internalDate.getTime()) ? item.internalDate : new Date();
      return { uid: item.uid, seen: item.flags?.has('\\Seen') === true, arrived: arrived.toISOString() };
    };

    const messages = [];
    let handled = 0;
    let held = 0;
    const small = (item) => (item.size || 0) <= MAX_SOURCE_BYTES;
    while (handled < listed.length) {
      if (handled > 0 && (Date.now() > deadline || held > RUN_BYTES)) break;
      const first = listed[handled];
      if (!small(first)) {
        // Too large to bring in: listed with who it is from and its subject, without its text and files.
        const env = first.envelope || {};
        const list = (entries) => (entries || []).filter((e) => e.address && EMAIL.test(e.address)).map((e) => ({ name: clean(e.name, 120), address: e.address.toLowerCase() }));
        messages.push({ ...about(first), tooLarge: true, from: list(env.from)[0] || null, to: list(env.to), cc: list(env.cc), subject: clean(env.subject, 200), text: '', messageId: cleanId(env.messageId), refs: [cleanId(env.inReplyTo)].filter(Boolean), attachments: [] });
        last = first.uid;
        handled += 1;
        continue;
      }
      // The next few messages are read from the server in one request.
      const group = [];
      let bytes = 0;
      for (let i = handled; i < listed.length && small(listed[i]) && (group.length === 0 || bytes + (listed[i].size || 0) <= GROUP_BYTES); i += 1) {
        group.push(listed[i]);
        bytes += listed[i].size || 0;
      }
      held += bytes;
      const sources = new Map((await client.fetchAll(group.map((item) => item.uid).join(','), { uid: true, source: true }, { uid: true })).map((full) => [full.uid, full.source]));
      for (const item of group) {
        handled += 1;
        last = item.uid;
        const source = sources.get(item.uid);
        if (!source) continue; // deleted from the mailbox a moment ago
        const parsed = await simpleParser(source, { skipTextToHtml: true, skipImageLinks: true });
        const refs = [parsed.inReplyTo, ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [])].map(cleanId).filter(Boolean);
        messages.push({
          ...about(item),
          tooLarge: false,
          from: people(parsed.from)[0] || null,
          to: people(parsed.to),
          cc: people(parsed.cc),
          subject: clean(parsed.subject, 200),
          text: (await readable(parsed)).replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n'),
          messageId: cleanId(parsed.messageId),
          refs: [...new Set(refs)].slice(-20),
          // Pictures that are part of the message's layout (logos in a signature) are not attachments.
          attachments: (parsed.attachments || [])
            .filter((a) => !a.related && a.content?.length)
            .map((a) => ({ name: clean(a.filename, 120) || 'attachment', type: String(a.contentType || '').toLowerCase(), size: a.content.length, content: a.content })),
        });
      }
    }
    const more = handled < listed.length || uids.length > batch.length;
    return { messages, more, state: { uidValidity: validity, lastUid: more ? last : Math.max(last, newest) } };
  } catch (err) {
    throw explain(err, account.imap.host, false);
  } finally {
    await client?.logout().catch(() => client.close());
  }
}

/* ---------------------------------------------------------------- sending */

/**
 * Sends one email through the linked mailbox. "to" and "cc" are what the message shows; "deliver" is who the
 * mail server is asked to deliver to. Returns the Message-ID it was sent with.
 */
export async function sendEmail(account, { fromName, to, cc, deliver, subject, text, attachments, inReplyTo, references }) {
  const password = openPassword(account.secret, account.member);
  if (password === null) throw new MailError('The saved password for this mailbox can no longer be read. Disconnect the mailbox and connect it again.', 'password');
  const messageId = `<${randomUUID()}@${account.email.split('@')[1]}>`;
  let transport;
  try {
    transport = await smtpTransport(account, password);
    const sending = transport.sendMail({
      from: { name: fromName, address: account.email },
      to,
      cc: cc.length ? cc : undefined,
      envelope: { from: account.email, to: deliver },
      subject: subject || '(no subject)',
      text,
      messageId,
      inReplyTo: inReplyTo || undefined,
      references: references?.length ? references : undefined,
      attachments,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const info = await withTimeout(sending, 24000, account.smtp.host, () => transport.close());
    const refused = (info.rejected || []).map(String);
    if (refused.length) throw new MailError(`The mail server refused ${refused.length === 1 ? 'this address' : 'these addresses'}: ${refused.join(', ')}. Nothing was sent to ${refused.length === 1 ? 'it' : 'them'}.`, 'to');
    return { messageId };
  } catch (err) {
    throw explain(err, account.smtp.host, true);
  } finally {
    transport?.close();
  }
}

/** Whether this server can talk to mail servers at all (the mail libraries are installed and load). */
export async function mailLibraries() {
  const yes = () => true;
  const no = () => false;
  const loaded = await Promise.all([import('imapflow').then(yes, no), import('nodemailer').then(yes, no), import('mailparser').then(yes, no), import('html-to-text').then(yes, no)]);
  return { ready: loaded.every(Boolean), domain: MAIL_DOMAIN };
}
