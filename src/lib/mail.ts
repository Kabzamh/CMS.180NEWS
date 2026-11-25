import { api } from './api';
import { fmtBytes } from './format';
import type { Role } from './types';

/** Everything Mail asks the server goes to this one address. */
export const MAIL = '/api/team?resource=mail';

export type MailFolder = 'inbox' | 'alerts' | 'starred' | 'sent' | 'drafts' | 'archive' | 'trash';
export const MAIL_FOLDERS: MailFolder[] = ['inbox', 'alerts', 'starred', 'sent', 'drafts', 'archive', 'trash'];

export interface Person {
  id: number;
  name: string;
}

export interface MailFile {
  path: string;
  name: string;
  size: number;
  type: string;
  /** A link that works for an hour. Only on messages that have been opened. */
  url?: string | null;
}

/** A person outside the team: an email address, with the name it came with if any. */
export interface Correspondent {
  name: string;
  address: string;
}

/** The email side of a message that came from, or went to, an outside address. */
export interface MailExt {
  /** Who sent it, for an email that arrived in a linked mailbox. Null for one written here. */
  from: Correspondent | null;
  to: Correspondent[];
  cc: Correspondent[];
  /** The 180news.co.za mailbox it arrived in or went out through. */
  via: string | null;
  /** Attachments that could not be brought in. */
  skipped: string[];
  tooLarge: boolean;
}

/** A person's link to their 180news.co.za mailbox. The password is never sent to the browser. */
export interface EmailAccount {
  connected: boolean;
  email: string | null;
  username: string | null;
  imapHost: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  connectedAt: string | null;
  checkedAt: string | null;
  error: string | null;
  imported: number;
}

export interface SyncResult {
  ok: boolean;
  error?: string | null;
  skipped?: boolean;
  imported: number;
  more: boolean;
  account: EmailAccount;
}

export const EMAIL_RE = /^[^\s@<>(),;:"]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
export const correspondent = (a: Correspondent) => (a.name ? `${a.name} <${a.address}>` : a.address);

export interface MailItem {
  /** This person's copy of the message. */
  id: number;
  message_id: number;
  thread_id: number;
  folder: 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash';
  kind: 'mail' | 'alert';
  unread: boolean;
  starred: boolean;
  at: string;
  from: Person;
  to: Person[];
  cc: Person[];
  subject: string;
  snippet: string;
  attachments: number;
  /** For an alert: the page in the CMS it is about. */
  link: string | null;
  ext: MailExt | null;
}

export interface MailMessage extends MailItem {
  body: string;
  files: MailFile[];
  current: boolean;
}

export interface AlertPrefs {
  review: boolean;
  mine: boolean;
  live: boolean;
  comments: boolean;
}

export interface MailBoot {
  me: number;
  people: (Person & { role: Role })[];
  prefs: AlertPrefs;
  email: EmailAccount;
  emailDefaults: { domain: string; imapHost: string; smtpHost: string; smtpPort: number };
}

export interface MailSummary {
  /** The linked 180news.co.za mailbox, if there is one. */
  email: string | null;
  counts: { inbox: number; alerts: number };
  /** The five newest unread messages and alerts. */
  recent: { id: number; kind: 'mail' | 'alert'; from: string; subject: string; at: string; link: string | null }[];
}

/* ------------------------------------------------------------- attachments */

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export const ATTACHMENT_ACCEPT = Object.keys(BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(',');

function put(url: string, file: File, contentType: string, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`${file.name} was not accepted (error ${xhr.status}). Try again.`)));
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.send(file);
  });
}

/** Uploads a file to attach to a message. It goes straight from the browser to private storage. */
export async function uploadAttachment(file: File, onProgress?: (percent: number) => void): Promise<MailFile> {
  const type = BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!type) throw new Error(`${file.name} is not a kind of file Mail can attach. Use a PDF, Word, Excel or PowerPoint file, a picture, an audio or video clip, a text file or a zip.`);
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is ${fmtBytes(file.size)}. An attachment can be up to 20 MB.`);
  onProgress?.(0);
  const signed = await api<{ path: string; signedUrl: string }>(MAIL, { method: 'POST', body: { action: 'attach', fileName: file.name, contentType: type, size: file.size } });
  await put(signed.signedUrl, file, type, onProgress);
  return { path: signed.path, name: file.name, size: file.size, type };
}

/* ------------------------------------------------- alerts on this device */

export interface DeviceAlerts {
  /** Show a notification from the browser when new mail arrives. */
  desktop: boolean;
  /** Play a short sound. */
  sound: boolean;
}

const DEVICE_KEY = '180news-cms:mail-device';

export function deviceAlerts(): DeviceAlerts {
  try {
    const saved = JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}');
    return { desktop: saved.desktop === true, sound: saved.sound === true };
  } catch {
    return { desktop: false, sound: false };
  }
}

export function saveDeviceAlerts(next: DeviceAlerts) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
  } catch {
    /* the choice just is not remembered */
  }
}

/** Two short notes. */
export function chime() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    [880, 1175].forEach((frequency, index) => {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.16;
      tone.frequency.value = frequency;
      tone.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      tone.start(start);
      tone.stop(start + 0.32);
    });
    window.setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    /* no sound on this device */
  }
}

/** Where a message opens in the CMS. */
export const mailPath = (item: { id: number; kind: 'mail' | 'alert' }) => `/mail/${item.kind === 'alert' ? 'alerts' : 'inbox'}?m=${item.id}`;
