import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  AtSign,
  BellRing,
  Download,
  FileText,
  Forward,
  Inbox,
  MailOpen,
  Paperclip,
  PenLine,
  Reply,
  ReplyAll,
  RotateCcw,
  Search,
  Send,
  Settings,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useMember } from '../contexts/AuthContext';
import { useMail } from '../contexts/MailContext';
import { useDebounced, useLoad } from '../hooks/useLoad';
import {
  ATTACHMENT_ACCEPT,
  MAIL,
  MAIL_FOLDERS,
  MAX_ATTACHMENTS,
  chime,
  deviceAlerts,
  saveDeviceAlerts,
  EMAIL_RE,
  correspondent,
  uploadAttachment,
  type AlertPrefs,
  type Correspondent,
  type EmailAccount,
  type MailBoot,
  type MailFile,
  type MailFolder,
  type MailItem,
  type MailMessage,
  type Person,
} from '../lib/mail';
import { ROLE_LABEL, fmtBytes, fmtDateTime, initials, timeAgo } from '../lib/format';
import { canEdit } from '../lib/types';
import { Button, Card, ConfirmDialog, Dialog, ErrorState, SelectInput, TextInput, IconButton, PageHeader, Pill, SkeletonRows, Spinner, Toggle, buttonClass, cx, inputClass, useToast } from '../components/ui';

const FOLDERS: { key: MailFolder; label: string; icon: LucideIcon; empty: string }[] = [
  { key: 'inbox', label: 'Inbox', icon: Inbox, empty: 'Messages from the team arrive here.' },
  { key: 'alerts', label: 'Alerts', icon: BellRing, empty: 'Alerts about your stories and about comments arrive here.' },
  { key: 'starred', label: 'Starred', icon: Star, empty: 'Star a message to keep it close at hand.' },
  { key: 'sent', label: 'Sent', icon: Send, empty: 'Messages you send are kept here.' },
  { key: 'drafts', label: 'Drafts', icon: FileText, empty: 'Messages you have started and not sent are kept here.' },
  { key: 'archive', label: 'Archive', icon: Archive, empty: 'Archive a message to clear it from the inbox without deleting it.' },
  { key: 'trash', label: 'Trash', icon: Trash2, empty: 'Deleted messages stay here until you delete them for good.' },
];

const FOLDER_LABEL: Record<string, string> = { inbox: 'Inbox', sent: 'Sent', drafts: 'Drafts', archive: 'Archive', trash: 'Trash' };

interface Draft {
  title: string;
  draftId?: number;
  replyTo?: number;
  forwardOf?: number;
  to: number[];
  cc: number[];
  /** Outside email addresses. */
  toAddr: string[];
  ccAddr: string[];
  subject: string;
  body: string;
  files: MailFile[];
}

const BLANK: Draft = { title: 'New message', to: [], cc: [], toAddr: [], ccAddr: [], subject: '', body: '', files: [] };
const subjectOf = (subject: string) => subject || '(no subject)';
const namesOf = (people: Person[], me: number) => people.map((p) => (p.id === me ? 'you' : p.name)).join(', ');

type Addressed = Pick<MailItem, 'to' | 'cc' | 'ext'>;
/** Everyone a message is to (or copied to): team members by name, outside people by email address. */
function recipients(message: Addressed, field: 'to' | 'cc', me: number): string {
  const outside: Correspondent[] = message.ext?.[field] ?? [];
  // An email that arrived from outside is shown as it was addressed.
  if (message.ext?.from) return outside.map(correspondent).join(', ') || (field === 'to' ? 'you' : '');
  return [namesOf(message[field], me), ...outside.map(correspondent)].filter(Boolean).join(', ');
}

function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<>"]+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noreferrer noopener" className="font-semibold break-all text-navy underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/* --------------------------------------------------------------- recipients */

function PeoplePicker({
  id,
  label,
  value,
  onChange,
  people,
  error,
  disabled,
  addresses,
  onAddresses,
  outside,
}: {
  id: string;
  label: string;
  value: number[];
  onChange: (next: number[]) => void;
  people: MailBoot['people'];
  error?: string;
  disabled?: boolean;
  /** Outside email addresses on this line. */
  addresses: string[];
  onAddresses: (next: string[]) => void;
  /** Whether email addresses can be typed: only once a 180news.co.za mailbox is connected. */
  outside: boolean;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const chosen = value.map((pid) => people.find((p) => p.id === pid)).filter((p): p is MailBoot['people'][number] => Boolean(p));
  const term = text.trim().toLowerCase();
  const matches = people.filter((p) => !value.includes(p.id) && (!term || p.name.toLowerCase().includes(term))).slice(0, 8);
  const shown = error ?? problem ?? undefined;

  const add = (pid: number) => {
    onChange([...value, pid]);
    setText('');
    setOpen(false);
    setProblem(null);
  };

  /** Adds what was typed as an email address. Returns false, with the reason shown, if it cannot be added. */
  const addAddress = (typed: string) => {
    const address = typed.trim().replace(/[,;]+$/, '').toLowerCase();
    if (!address) return true;
    if (!outside) {
      setProblem('To write to an email address, connect your 180news.co.za mailbox first. It is under Email account, at the top of Mail.');
      return false;
    }
    if (!EMAIL_RE.test(address)) {
      setProblem('That email address is not complete. It should look like name@example.com.');
      return false;
    }
    if (!addresses.includes(address)) onAddresses([...addresses, address]);
    setText('');
    setOpen(false);
    setProblem(null);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && term) {
      e.preventDefault();
      if (term.includes('@')) addAddress(text);
      else if (matches[0]) add(matches[0].id);
      else setProblem(outside ? 'Nobody on the team has that name. For someone outside, type their full email address.' : 'Nobody on the team has that name.');
    } else if (e.key === 'ArrowDown') {
      setOpen(true);
    } else if (e.key === 'Backspace' && !text && addresses.length) {
      onAddresses(addresses.slice(0, -1));
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-ink">
        {label}
      </label>
      <div className={cx('flex flex-wrap items-center gap-1.5 border bg-paper px-2 py-1.5 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/20', shown ? 'border-brand' : 'border-line-strong')}>
        {chosen.map((p) => (
          <span key={p.id} className="inline-flex max-w-full items-center gap-1 bg-navy-tint py-1 pr-1 pl-2.5 text-sm font-bold text-navy">
            <span className="truncate">{p.name}</span>
            <button type="button" disabled={disabled} aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((v) => v !== p.id))} className="cursor-pointer p-0.5 hover:bg-navy hover:text-white">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        {addresses.map((address) => (
          <span key={address} className="inline-flex max-w-full items-center gap-1 bg-wash py-1 pr-1 pl-2 text-sm font-bold text-ink ring-1 ring-line-strong ring-inset">
            <AtSign className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate">{address}</span>
            <button type="button" disabled={disabled} aria-label={`Remove ${address}`} onClick={() => onAddresses(addresses.filter((v) => v !== address))} className="cursor-pointer p-0.5 hover:bg-ink hover:text-white">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-invalid={shown ? true : undefined}
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder={chosen.length + addresses.length ? '' : outside ? 'Type a name or an email address' : 'Type a name'}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setProblem(null);
          }}
          onClick={() => setOpen(true)}
          onBlur={() => {
            // An address that was typed but not confirmed is kept, not lost, when moving on.
            if (text.includes('@')) addAddress(text);
            window.setTimeout(() => setOpen(false), 160);
          }}
          onKeyDown={onKeyDown}
          className="h-8 min-w-[150px] flex-1 bg-transparent px-1 text-base text-ink placeholder:text-muted focus:outline-none sm:text-[15px]"
        />
      </div>
      {open && matches.length > 0 && !text.includes('@') && (
        <ul id={`${id}-list`} role="listbox" aria-label={`People to add to ${label}`} className="border border-t-0 border-line-strong bg-paper">
          {matches.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(p.id)} className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-navy-tint">
                <span className="min-w-0 truncate text-[15px] font-bold text-ink">{p.name}</span>
                <span className="shrink-0 text-[13px] text-muted">{ROLE_LABEL[p.role]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown && (
        <p role="alert" className="mt-1.5 text-[13.5px] font-bold text-brand">
          {shown}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ compose */

function Compose({ draft, people, me, account, onClose }: { draft: Draft; people: MailBoot['people']; me: number; account: EmailAccount; onClose: (changed: boolean) => void }) {
  const toast = useToast();
  const mail = useMail();
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [toAddr, setToAddr] = useState(draft.toAddr);
  const [ccAddr, setCcAddr] = useState(draft.ccAddr);
  const [showCc, setShowCc] = useState(draft.cc.length + draft.ccAddr.length > 0);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [files, setFiles] = useState(draft.files);
  const [draftId, setDraftId] = useState(draft.draftId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'send' | 'draft' | 'discard' | null>(null);
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // A reply starts with the cursor above the quoted message.
    if (draft.replyTo && bodyRef.current) {
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(0, 0);
      bodyRef.current.scrollTop = 0;
    }
  }, [draft.replyTo]);

  const touch = (clear?: string) => {
    setDirty(true);
    if (clear && errors[clear]) setErrors(({ [clear]: _gone, ...rest }) => rest);
  };
  const locked = busy !== null || upload !== null;
  const others = people.filter((p) => p.id !== me);
  const outsideCount = toAddr.length + ccAddr.length;
  const hasContent = to.length + cc.length + outsideCount + files.length > 0 || Boolean(subject.trim() || body.trim());

  const submit = async (action: 'send' | 'draft', quiet = false) => {
    if (action === 'send') {
      const found: Record<string, string> = {};
      if (!to.length && !toAddr.length) found.to = 'Choose at least one person to send this to.';
      if (!subject.trim() && !body.trim() && !files.length) found.body = 'Write a message, or attach a file.';
      setErrors(found);
      if (Object.keys(found).length) return false;
    }
    setBusy(action);
    try {
      const saved = await api<{ ok: boolean; draft_id?: number; files?: MailFile[]; sent?: number; emailed?: number }>(MAIL, {
        method: 'POST',
        body: { action, to, cc, toAddr, ccAddr, subject, body, files: files.map(({ path, name }) => ({ path, name })), draft_id: draftId, reply_to: draft.replyTo, forward_of: draft.forwardOf },
      });
      if (action === 'send') {
        const total = saved.sent ?? to.length + cc.length;
        const emailed = saved.emailed ?? 0;
        toast(emailed ? `Sent to ${total} ${total === 1 ? 'person' : 'people'}, ${emailed === total ? '' : `${emailed} of them `}by email from ${account.email}.` : `Sent to ${total} ${total === 1 ? 'person' : 'people'}.`);
        mail.refresh();
        onClose(true);
        return true;
      }
      if (saved.draft_id) setDraftId(saved.draft_id);
      if (saved.files) setFiles(saved.files);
      setDirty(false);
      if (!quiet) toast('Saved to Drafts.');
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      // The server ran out of time while talking to the mail server: it is not known whether the email went.
      toast(err instanceof ApiError && err.status === 504 ? 'The mail server took too long to answer. Look in Sent before sending again, in case it went.' : errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Closing keeps what was written: it goes to Drafts.
  const close = async () => {
    if (locked) return;
    if (dirty && hasContent) {
      if (!(await submit('draft', true))) return;
      toast('Saved to Drafts.');
      return onClose(true);
    }
    onClose(Boolean(draftId) && draftId !== draft.draftId);
  };

  const discard = async () => {
    setBusy('discard');
    try {
      if (draftId) await api(MAIL, { method: 'DELETE', body: { ids: [draftId] } });
      toast('Draft discarded.');
      onClose(Boolean(draftId));
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(null);
    }
  };

  const attach = async (list: File[]) => {
    if (!list.length) return;
    const problems: string[] = [];
    let count = files.length;
    for (const file of list) {
      if (count >= MAX_ATTACHMENTS) {
        problems.push(`A message can carry ${MAX_ATTACHMENTS} attachments at most. ${file.name} was not added.`);
        continue;
      }
      setUpload({ name: file.name, percent: 0 });
      try {
        const added = await uploadAttachment(file, (percent) => setUpload({ name: file.name, percent }));
        setFiles((current) => [...current, added]);
        count += 1;
        setDirty(true);
      } catch (err) {
        problems.push(errorMessage(err));
      }
    }
    setUpload(null);
    if (fileRef.current) fileRef.current.value = '';
    setErrors((current) => {
      const { files: _gone, ...rest } = current;
      return problems.length ? { ...rest, files: problems.join(' ') } : rest;
    });
  };

  return (
    <Dialog
      open
      wide
      title={draft.title}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" loading={busy === 'discard'} disabled={locked} onClick={discard} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
            Discard
          </Button>
          <Button variant="outline" loading={busy === 'draft'} disabled={locked || !hasContent} onClick={() => submit('draft')}>
            Save draft
          </Button>
          <Button loading={busy === 'send'} disabled={locked} onClick={() => submit('send')} icon={<Send className="h-4 w-4" aria-hidden="true" />}>
            Send
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <PeoplePicker
            id="mail-to"
            label="To"
            value={to}
            people={people}
            error={errors.to}
            disabled={locked}
            outside={account.connected}
            addresses={toAddr}
            onAddresses={(next) => (setToAddr(next), setCcAddr((list) => list.filter((v) => !next.includes(v))), touch('to'))}
            onChange={(next) => (setTo(next), setCc((list) => list.filter((v) => !next.includes(v))), touch('to'))}
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <button type="button" disabled={locked} onClick={() => (setTo(others.map((p) => p.id)), setCc([]), touch('to'))} className="cursor-pointer font-bold text-navy hover:underline">
              Everyone on the team
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => (setTo(others.filter((p) => canEdit(p)).map((p) => p.id)), touch('to'))}
              className="cursor-pointer font-bold text-navy hover:underline"
            >
              Editors and owners
            </button>
            {!showCc && (
              <button type="button" disabled={locked} onClick={() => setShowCc(true)} className="cursor-pointer font-bold text-navy hover:underline">
                Add Cc
              </button>
            )}
          </div>
        </div>
        {showCc && (
          <PeoplePicker
            id="mail-cc"
            label="Cc"
            value={cc}
            people={people.filter((p) => !to.includes(p.id))}
            disabled={locked}
            outside={account.connected}
            addresses={ccAddr}
            onAddresses={(next) => (setCcAddr(next.filter((v) => !toAddr.includes(v))), touch())}
            onChange={(next) => (setCc(next), touch())}
          />
        )}

        <div>
          <label htmlFor="mail-subject" className="mb-1.5 block text-sm font-bold text-ink">
            Subject
          </label>
          <input id="mail-subject" maxLength={200} autoComplete="off" disabled={locked} value={subject} onChange={(e) => (setSubject(e.target.value), touch('body'))} className={inputClass} />
        </div>

        <div>
          <label htmlFor="mail-body" className="mb-1.5 block text-sm font-bold text-ink">
            Message
          </label>
          <textarea
            id="mail-body"
            ref={bodyRef}
            rows={10}
            maxLength={20000}
            disabled={locked}
            value={body}
            aria-invalid={errors.body ? true : undefined}
            onChange={(e) => (setBody(e.target.value), touch('body'))}
            className={cx(inputClass, 'h-auto min-h-[200px] resize-y py-2.5 leading-relaxed', errors.body && 'border-brand')}
          />
          {errors.body && (
            <p role="alert" className="mt-1.5 text-[13.5px] font-bold text-brand">
              {errors.body}
            </p>
          )}
        </div>

        <div>
          <input ref={fileRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" data-mail-attach onChange={(e) => attach(Array.from(e.target.files ?? []))} />
          {files.length > 0 && (
            <ul className="mb-2.5 space-y-1.5">
              {files.map((file) => (
                <li key={file.path} className="flex items-center gap-2.5 border border-line bg-wash px-3 py-2">
                  <Paperclip className="h-4 w-4 shrink-0 text-navy" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{file.name}</span>
                  <span className="shrink-0 text-[13px] text-muted tabular-nums">{fmtBytes(file.size)}</span>
                  <button type="button" disabled={locked} aria-label={`Remove ${file.name}`} onClick={() => (setFiles(files.filter((f) => f.path !== file.path)), touch('files'))} className="cursor-pointer p-1 text-body hover:text-brand">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {upload ? (
            <div role="status">
              <div className="flex items-center justify-between gap-3 text-[15px]">
                <p className="min-w-0 truncate font-bold text-ink">Uploading {upload.name}</p>
                <span className="shrink-0 font-extrabold text-navy tabular-nums">{upload.percent}%</span>
              </div>
              <div role="progressbar" aria-label={`Uploading ${upload.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload.percent} className="mt-2 h-2 bg-line">
                <div className="h-full bg-navy transition-[width] duration-200" style={{ width: `${upload.percent}%` }} />
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" disabled={locked || files.length >= MAX_ATTACHMENTS} onClick={() => fileRef.current?.click()} icon={<Paperclip className="h-4 w-4" aria-hidden="true" />}>
              Attach files
            </Button>
          )}
          {errors.files ? (
            <p role="alert" className="mt-1.5 text-[13.5px] font-bold text-brand">
              {errors.files}
            </p>
          ) : (
            <p className="mt-1.5 text-[13.5px] leading-snug text-muted">Up to {MAX_ATTACHMENTS} files of 20 MB each: PDF, Word, Excel, PowerPoint, pictures, audio, video, text or zip.</p>
          )}
        </div>

        <p className="border-l-4 border-navy bg-navy-tint px-3.5 py-2.5 text-sm leading-snug text-body">
          {outsideCount > 0 ? (
            <>
              This goes out as an email from <span className="font-bold break-all text-ink">{account.email ?? 'your 180news.co.za mailbox'}</span>
              {to.length + cc.length > 0 ? '. People on the team get it here in the CMS.' : '.'}
            </>
          ) : account.connected ? (
            <>
              Messages to people on the team stay inside the newsroom. Add an email address to send an email from <span className="font-bold break-all text-ink">{account.email}</span>.
            </>
          ) : (
            'Mail stays inside the newsroom. To write to outside email addresses, connect your 180news.co.za mailbox under Email account, at the top of Mail.'
          )}
        </p>
      </div>
    </Dialog>
  );
}

/* ----------------------------------------------------------- alert settings */

function AlertSettings({ boot, editor, onSaved, onClose }: { boot: MailBoot; editor: boolean; onSaved: (prefs: AlertPrefs) => void; onClose: () => void }) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(boot.prefs);
  const [device, setDevice] = useState(deviceAlerts);
  const [saving, setSaving] = useState(false);
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const blocked = supported && Notification.permission === 'denied';

  const save = async (patch: Partial<AlertPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      const saved = await api<{ prefs: AlertPrefs }>(MAIL, { method: 'PUT', body: { action: 'prefs', prefs: next } });
      setPrefs(saved.prefs);
      onSaved(saved.prefs);
    } catch (err) {
      setPrefs(prefs);
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const setDesktop = async (on: boolean) => {
    if (on && supported && Notification.permission !== 'granted') {
      const answer = await Notification.requestPermission();
      if (answer !== 'granted') return toast('The browser did not allow notifications for this site. Allow them in the browser’s site settings, then switch this on again.', 'error');
    }
    const next = { ...device, desktop: on };
    setDevice(next);
    saveDeviceAlerts(next);
  };

  return (
    <Dialog
      open
      title="Alert settings"
      onClose={onClose}
      footer={
        <Button variant="navy" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-black tracking-[0.06em] text-navy uppercase">Send me an alert when</h3>
          <div className="mt-3 space-y-4">
            {editor && <Toggle label="A story is submitted for review" description="A writer has finished a story and it is waiting for an editor." checked={prefs.review} disabled={saving} onChange={(review) => save({ review })} />}
            {editor && <Toggle label="A reader comment is waiting" description="One alert per story until you have looked." checked={prefs.comments} disabled={saving} onChange={(comments) => save({ comments })} />}
            <Toggle label="Someone else changes one of my stories" description="An editor publishes it, schedules it, hides it or moves it back to draft." checked={prefs.mine} disabled={saving} onChange={(mine) => save({ mine })} />
            <Toggle label="One of my scheduled stories goes live" checked={prefs.live} disabled={saving} onChange={(live) => save({ live })} />
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="text-sm font-black tracking-[0.06em] text-navy uppercase">On this device</h3>
          <div className="mt-3 space-y-4">
            <Toggle
              label="Show a notification from the browser"
              description={
                !supported
                  ? 'This browser does not support notifications.'
                  : blocked
                    ? 'Notifications are blocked for this site in the browser’s settings.'
                    : 'For new mail and alerts, while the CMS is open in a tab, even when you are in another one.'
              }
              checked={device.desktop && supported && !blocked}
              disabled={!supported || blocked}
              onChange={setDesktop}
            />
            <Toggle
              label="Play a sound"
              checked={device.sound}
              onChange={(sound) => {
                const next = { ...device, sound };
                setDevice(next);
                saveDeviceAlerts(next);
                if (sound) chime();
              }}
            />
          </div>
        </section>

        <p className="border-l-4 border-navy bg-navy-tint px-3.5 py-2.5 text-sm leading-snug text-body">
          Alerts arrive here in the CMS: in the Alerts folder, on the bell at the top of every page and in the tab title. They are not sent to your email address.
        </p>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ email account */

const WHAT_IT_DOES = [
  'Mail arriving in the mailbox’s inbox is copied into your inbox here, with its attachments, and checked every two minutes while the CMS is open. To start, the 30 most recent messages are brought in.',
  'From Mail you can write to any email address. It goes out from your 180news.co.za address, and replies come back here.',
  'Nothing in the mailbox is changed. Reading or deleting a message here does not mark or delete it there, and email sent from here is kept in Sent here, not in the mailbox’s own Sent folder.',
];

/** Links a person's 180news.co.za mailbox to Mail, and shows how the link is doing. */
function EmailAccountDialog({ boot, onChanged, onClose }: { boot: MailBoot; onChanged: (account: EmailAccount) => void; onClose: () => void }) {
  const toast = useToast();
  const mail = useMail();
  const account = boot.email;
  const defaults = boot.emailDefaults;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [imapHost, setImapHost] = useState(defaults.imapHost);
  const [smtpHost, setSmtpHost] = useState(defaults.smtpHost);
  const [smtpPort, setSmtpPort] = useState(defaults.smtpPort);
  const [showServers, setShowServers] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'connect' | 'check' | 'disconnect' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const connect = async () => {
    const found: Record<string, string> = {};
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) found.email = `Enter the full email address, for example yourname@${defaults.domain}.`;
    else if (!address.endsWith(`@${defaults.domain}`)) found.email = `Use an address that ends in @${defaults.domain}.`;
    if (!password) found.password = 'Enter the password for this mailbox.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy('connect');
    try {
      const linked = await api<{ account: EmailAccount; waiting: number }>(MAIL, { method: 'POST', body: { action: 'connect', email: address, password, username: username.trim(), imapHost: imapHost.trim(), smtpHost: smtpHost.trim(), smtpPort } });
      setPassword('');
      onChanged(linked.account);
      toast(`Connected to ${linked.account.email}. Bringing in your recent mail.`);
      const result = await mail.checkMailbox(true);
      await mail.refresh();
      if (result) {
        onChanged(result.account);
        if (result.error) toast(result.error, 'error');
        else toast(result.imported ? `${result.imported} ${result.imported === 1 ? 'message' : 'messages'} brought in from ${linked.account.email}.` : 'The mailbox’s inbox is empty, so there was nothing to bring in.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        if (err.fields.host) setShowServers(true);
      } else {
        toast(err instanceof ApiError && err.status === 504 ? 'The mail server took too long to answer. Try again in a moment.' : errorMessage(err), 'error');
      }
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy('check');
    try {
      const result = await mail.checkMailbox(true);
      if (!result) return toast('The mailbox is being checked already. Try again in a moment.', 'error');
      onChanged(result.account);
      if (result.error) toast(result.error, 'error');
      else toast(result.imported ? `${result.imported} new ${result.imported === 1 ? 'message' : 'messages'} brought in.` : 'No new mail.');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    try {
      const gone = await api<{ account: EmailAccount }>(MAIL, { method: 'POST', body: { action: 'disconnect' } });
      onChanged(gone.account);
      setConfirming(false);
      await mail.refresh();
      toast('Mailbox disconnected. Its saved password has been removed.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const explainer = (
    <ul className="space-y-2 border-l-4 border-navy bg-navy-tint px-3.5 py-3 text-sm leading-snug text-body">
      {WHAT_IT_DOES.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );

  return (
    <Dialog
      open
      title={`Your ${defaults.domain} mailbox`}
      onClose={() => busy === null && onClose()}
      footer={
        account.connected ? (
          <Button variant="navy" disabled={busy !== null} onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="outline" disabled={busy !== null} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="mailbox-form" loading={busy === 'connect'} icon={<AtSign className="h-4 w-4" aria-hidden="true" />}>
              {busy === 'connect' ? 'Checking the mailbox' : 'Connect mailbox'}
            </Button>
          </>
        )
      }
    >
      {account.connected ? (
        <div className="space-y-5">
          <div className={cx('border-l-4 px-4 py-3', account.error ? 'border-warn bg-warn-tint' : 'border-live-deep bg-live-tint')}>
            <p className="text-[13px] font-black tracking-[0.06em] text-ink uppercase">{account.error ? 'Connected, but the last check failed' : 'Connected'}</p>
            <p className="mt-0.5 text-[17px] font-extrabold break-all text-ink">{account.email}</p>
            {account.error && (
              <p role="alert" className="mt-1.5 text-[15px] leading-snug text-ink">
                {account.error}
                {/disconnect/i.test(account.error) ? '' : ' If the mailbox password has changed, disconnect and connect again with the new one.'}
              </p>
            )}
          </div>
          <dl className="space-y-2 text-[15px]">
            <div className="flex flex-wrap justify-between gap-x-4">
              <dt className="text-muted">Last checked</dt>
              <dd className="font-bold text-ink">{account.checkedAt ? timeAgo(account.checkedAt) : 'not yet'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4">
              <dt className="text-muted">Brought in so far</dt>
              <dd className="font-bold text-ink tabular-nums">
                {account.imported} {account.imported === 1 ? 'message' : 'messages'}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4">
              <dt className="text-muted">Mail server</dt>
              <dd className="min-w-0 text-right font-bold break-words text-ink">
                {account.imapHost === account.smtpHost ? (
                  account.imapHost
                ) : (
                  <>
                    <span className="block">{account.imapHost} (in)</span>
                    <span className="block">{account.smtpHost} (out)</span>
                  </>
                )}
              </dd>
            </div>
          </dl>
          {confirming ? (
            <div className="border border-brand/40 bg-brand-tint p-4">
              <p className="text-[15px] leading-snug text-ink">
                <span className="font-extrabold">Disconnect {account.email}?</span> Mail already brought in stays here. Nothing changes in the mailbox itself. You will not be able to write to outside email addresses until a mailbox is
                connected again.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" loading={busy === 'disconnect'} disabled={busy !== null} onClick={disconnect}>
                  Disconnect
                </Button>
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setConfirming(false)}>
                  Keep it connected
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="navy" loading={busy === 'check'} disabled={busy !== null} onClick={check} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
                Check for new mail now
              </Button>
              <Button variant="danger" disabled={busy !== null} onClick={() => setConfirming(true)}>
                Disconnect
              </Button>
            </div>
          )}
          {explainer}
        </div>
      ) : (
        <form
          id="mailbox-form"
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            connect();
          }}
        >
          <p className="text-[15px] leading-snug text-body">Connect your own {defaults.domain} mailbox, and its mail arrives here in Mail alongside messages from the team.</p>
          <TextInput
            label="Email address"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder={`yourname@${defaults.domain}`}
            disabled={busy !== null}
            value={email}
            onChange={(e) => (setEmail(e.target.value), setErrors({}))}
            error={errors.email}
          />
          <TextInput
            label="Mailbox password"
            type="password"
            autoComplete="new-password"
            disabled={busy !== null}
            value={password}
            onChange={(e) => (setPassword(e.target.value), setErrors({}))}
            error={errors.password}
            hint="The password of this mailbox, the one you use for webmail. Not your CMS password. It is stored encrypted and is used only to read and send your mail."
          />
          <div className="border border-line">
            <button type="button" aria-expanded={showServers} onClick={() => setShowServers((v) => !v)} className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm font-bold text-ink hover:bg-wash">
              Server settings
              <span className="font-semibold text-muted">{showServers ? 'Hide' : `${imapHost}, filled in for you`}</span>
            </button>
            {showServers && (
              <div className="space-y-4 border-t border-line p-3.5">
                <TextInput label="Username" optional autoComplete="off" disabled={busy !== null} value={username} onChange={(e) => setUsername(e.target.value)} hint="Leave empty to use the email address, which is right for most mailboxes." />
                <TextInput label="Incoming mail server (IMAP, port 993)" autoComplete="off" disabled={busy !== null} value={imapHost} onChange={(e) => (setImapHost(e.target.value), setErrors({}))} />
                <TextInput label="Outgoing mail server (SMTP)" autoComplete="off" disabled={busy !== null} value={smtpHost} onChange={(e) => (setSmtpHost(e.target.value), setErrors({}))} />
                <SelectInput label="Outgoing port" disabled={busy !== null} value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))}>
                  <option value={465}>465 (SSL/TLS)</option>
                  <option value={587}>587 (STARTTLS)</option>
                </SelectInput>
                <p className="text-[13.5px] leading-snug text-muted">Connections are always encrypted, and the server’s security certificate is checked before the password is sent.</p>
              </div>
            )}
            {errors.host && (
              <p role="alert" className="border-t border-line px-3.5 py-2.5 text-[13.5px] font-bold text-brand">
                {errors.host}
              </p>
            )}
          </div>
          {explainer}
        </form>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ reading */

function Message({ message, me }: { message: MailMessage; me: number }) {
  const alert = message.kind === 'alert';
  return (
    <article className={cx('border-b border-line px-4 py-4 last:border-b-0 sm:px-5', message.current && 'bg-paper')}>
      <header className="flex items-start gap-3">
        <span aria-hidden="true" className={cx('flex h-10 w-10 shrink-0 items-center justify-center text-sm font-black', alert ? 'bg-brand-tint text-brand' : 'bg-navy text-white')}>
          {alert ? <BellRing className="h-5 w-5" /> : initials(message.from.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 text-[16px] font-extrabold break-words text-ink">{message.ext?.from ? correspondent(message.ext.from) : message.from.id === me ? 'You' : message.from.name}</span>
            <time dateTime={message.at} className="text-[13px] text-muted">
              {fmtDateTime(message.at)}
            </time>
          </p>
          <p className="text-[13.5px] leading-snug break-words text-muted">
            To {recipients(message, 'to', me) || 'nobody yet'}
            {recipients(message, 'cc', me) && <> · Cc {recipients(message, 'cc', me)}</>}
          </p>
          {message.ext?.via && (
            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
              <AtSign className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-all">{message.ext.from ? `Email to ${message.ext.via}` : `Sent as an email from ${message.ext.via}`}</span>
            </p>
          )}
        </div>
      </header>
      {message.body && <div className="mt-3.5 text-[15.5px] leading-relaxed break-words whitespace-pre-wrap text-body">{linkify(message.body)}</div>}
      {message.ext?.tooLarge && <p className="mt-3.5 border-l-4 border-warn bg-warn-tint px-3.5 py-2.5 text-sm leading-snug text-ink">This email is larger than 25 MB, so its text and attachments were not brought in. Open it in your mailbox.</p>}
      {message.ext && message.ext.skipped.length > 0 && (
        <p className="mt-3.5 border-l-4 border-warn bg-warn-tint px-3.5 py-2.5 text-sm leading-snug break-words text-ink">
          Not brought in: <span className="font-bold">{message.ext.skipped.join(', ')}</span>. Mail here keeps documents, pictures, audio, video, text and zip files of up to 20 MB. Open the email in your mailbox for{' '}
          {message.ext.skipped.length === 1 ? 'this file' : 'these files'}.
        </p>
      )}
      {message.link && (
        <Link to={message.link} className={buttonClass('navy', 'sm', 'mt-4')}>
          {message.link === '/comments' ? 'Open Comments' : 'Open the story'}
        </Link>
      )}
      {message.files.length > 0 && (
        <ul className="mt-4 space-y-1.5" aria-label="Attachments">
          {message.files.map((file) => (
            <li key={file.path}>
              {file.url ? (
                <a href={file.url} target="_blank" rel="noreferrer" className="group flex items-center gap-2.5 border border-line bg-wash px-3 py-2 hover:border-navy">
                  <Paperclip className="h-4 w-4 shrink-0 text-navy" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink group-hover:text-navy">{file.name}</span>
                  <span className="shrink-0 text-[13px] text-muted tabular-nums">{fmtBytes(file.size)}</span>
                  <Download className="h-4 w-4 shrink-0 text-body" aria-hidden="true" />
                  <span className="sr-only">Download</span>
                </a>
              ) : (
                <p className="flex items-center gap-2.5 border border-line bg-wash px-3 py-2 text-[15px] text-muted">
                  <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-[13px]">no longer available</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/* --------------------------------------------------------------------- page */

export default function Mail() {
  const member = useMember();
  const toast = useToast();
  const mail = useMail();
  const params = useParams();
  const folder: MailFolder = MAIL_FOLDERS.includes(params.folder as MailFolder) ? (params.folder as MailFolder) : 'inbox';
  const [query, setQuery] = useSearchParams();
  const openId = Number(query.get('m')) || null;

  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const list = useLoad(() => api<{ items: MailItem[] }>(`${MAIL}&folder=${folder}${q ? `&q=${encodeURIComponent(q)}` : ''}`), [folder, q]);
  const boot = useLoad(() => api<MailBoot>(`${MAIL}&boot=1`), []);

  const [opened, setOpened] = useState<{ box: MailItem; thread: MailMessage[] } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [compose, setCompose] = useState<Draft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ ids: number[] | 'trash'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Mail · 180news Newsroom CMS';
  }, []);

  // New mail arrives while the folder is open: show it without a reload.
  const unread = mail.counts.inbox + mail.counts.alerts;
  const firstCount = useRef(true);
  useEffect(() => {
    if (firstCount.current) {
      firstCount.current = false;
      return;
    }
    list.reload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, mail.imports]);

  useEffect(() => {
    setSelected([]);
  }, [folder, q]);

  useEffect(() => {
    if (!openId) {
      setOpened(null);
      setOpenError(null);
      return;
    }
    let cancelled = false;
    setOpening(true);
    setOpenError(null);
    api<{ box: MailItem; thread: MailMessage[] }>(`${MAIL}&id=${openId}`)
      .then((data) => {
        if (cancelled) return;
        setOpened(data);
        list.setData((current) => (current ? { ...current, items: current.items.map((item) => (item.id === data.box.id ? { ...item, unread: false } : item)) } : current));
        mail.refresh();
      })
      .catch((err) => {
        if (cancelled) return;
        setOpened(null);
        setOpenError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setOpening(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const people = boot.data?.people ?? [];
  const me = boot.data?.me ?? member.id;
  const items = list.data?.items ?? [];
  const closeMessage = () => setQuery({}, { replace: true });

  const act = async (ids: number[], patch: Record<string, unknown>, done?: string) => {
    setBusy(true);
    try {
      await api(MAIL, { method: 'PUT', body: { ids, ...patch } });
      if (done) toast(done);
      setSelected([]);
      if (patch.move && openId && ids.includes(openId)) closeMessage();
      await Promise.all([list.reload(true), mail.refresh()]);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeForGood = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api(MAIL, { method: 'DELETE', body: confirm.ids === 'trash' ? { empty: 'trash' } : { ids: confirm.ids } });
      toast(confirm.ids === 'trash' ? 'Trash emptied.' : 'Deleted for good.');
      if (openId && (confirm.ids === 'trash' || confirm.ids.includes(openId))) closeMessage();
      setConfirm(null);
      setSelected([]);
      await list.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleStar = (item: MailItem) => {
    list.setData((current) => (current ? { ...current, items: current.items.map((i) => (i.id === item.id ? { ...i, starred: !i.starred } : i)) } : current));
    setOpened((current) => (current && current.box.id === item.id ? { ...current, box: { ...current.box, starred: !item.starred } } : current));
    api(MAIL, { method: 'PUT', body: { ids: [item.id], starred: !item.starred } })
      .then(() => (folder === 'starred' ? list.reload(true) : undefined))
      .catch((err) => {
        toast(errorMessage(err), 'error');
        list.reload(true);
      });
  };

  const openItem = async (item: MailItem) => {
    if (item.folder !== 'drafts') return setQuery({ m: String(item.id) });
    setBusy(true);
    try {
      const data = await api<{ thread: MailMessage[] }>(`${MAIL}&id=${item.id}`);
      const draft = data.thread[0];
      const known = new Set(people.map((p) => p.id));
      setCompose({
        title: 'Draft',
        draftId: item.id,
        to: draft.to.map((p) => p.id).filter((id) => known.has(id)),
        cc: draft.cc.map((p) => p.id).filter((id) => known.has(id)),
        toAddr: (draft.ext?.to ?? []).map((a) => a.address),
        ccAddr: (draft.ext?.cc ?? []).map((a) => a.address),
        subject: draft.subject,
        body: draft.body,
        files: draft.files.map(({ path, name, size, type }) => ({ path, name, size, type })),
      });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const reply = (message: MailMessage, all: boolean) => {
    const known = new Set(people.map((p) => p.id));
    const own = boot.data?.email.email ?? '';
    const outsideTo = (message.ext?.to ?? []).map((a) => a.address);
    const outsideCc = (message.ext?.cc ?? []).map((a) => a.address);
    let to: number[] = [];
    let cc: number[] = [];
    let toAddr: string[] = [];
    let ccAddr: string[] = [];
    if (message.ext?.from) {
      // An email from outside: the answer goes to its sender, and with "all" to everyone else it was addressed to.
      toAddr = [message.ext.from.address];
      if (all) ccAddr = [...outsideTo, ...outsideCc].filter((a) => a !== own && a !== toAddr[0]);
    } else {
      to = (message.from.id === me ? message.to.map((p) => p.id) : [message.from.id]).filter((id) => known.has(id));
      cc = all ? [...message.to, ...message.cc].map((p) => p.id).filter((id) => id !== me && !to.includes(id) && known.has(id)) : [];
      if (message.from.id === me) toAddr = outsideTo;
      else if (all) ccAddr = [...outsideTo, ...outsideCc];
      if (all && message.from.id === me) ccAddr = outsideCc;
    }
    const quoted = message.body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    setCompose({
      title: all ? 'Reply to all' : 'Reply',
      replyTo: message.id,
      to,
      cc: [...new Set(cc)],
      toAddr: [...new Set(toAddr)],
      ccAddr: [...new Set(ccAddr)].filter((a) => !toAddr.includes(a)),
      subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`.trim(),
      body: `\n\nOn ${fmtDateTime(message.at)}, ${message.ext?.from ? correspondent(message.ext.from) : message.from.name} wrote:\n${quoted}`,
      files: [],
    });
  };

  /** Whether "Reply all" would reach anyone that "Reply" does not. */
  const replyAllHelps = (message: MailMessage) => {
    const outsideOthers = [...(message.ext?.to ?? []), ...(message.ext?.cc ?? [])];
    if (message.ext?.from) return outsideOthers.some((a) => a.address !== boot.data?.email.email && a.address !== message.ext?.from?.address);
    return message.to.length + message.cc.length + outsideOthers.length > 1;
  };

  const forward = (message: MailMessage) =>
    setCompose({
      title: 'Forward',
      forwardOf: message.id,
      to: [],
      cc: [],
      toAddr: [],
      ccAddr: [],
      subject: /^fwd?:/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`.trim(),
      body: `\n\n---------- Forwarded message ----------\nFrom: ${message.ext?.from ? correspondent(message.ext.from) : message.from.name}\nDate: ${fmtDateTime(message.at)}\nSubject: ${subjectOf(message.subject)}\nTo: ${message.ext?.from ? message.ext.to.map(correspondent).join(', ') : [...message.to.map((p) => p.name), ...(message.ext?.to ?? []).map(correspondent)].join(', ')}\n\n${message.body}`,
      files: message.files.map(({ path, name, size, type }) => ({ path, name, size, type })),
    });

  const current = opened?.thread.find((m) => m.current) ?? null;
  const box = opened?.box ?? null;
  const allSelected = items.length > 0 && selected.length === items.length;
  const inTrash = folder === 'trash' && !q;
  const meta = FOLDERS.find((f) => f.key === folder)!;
  const toolbar = 'flex flex-wrap items-center gap-1.5 border-b border-line bg-wash px-3 py-2';

  return (
    <>
      <PageHeader
        eyebrow="Newsroom"
        title="Mail"
        description="Messages between the people on the 180news team, and alerts about your stories."
        actions={
          <>
            <Button
              variant="outline"
              className="h-10"
              disabled={!boot.data}
              onClick={() => setAccountOpen(true)}
              icon={<AtSign className={cx('h-4 w-4', boot.data?.email.connected && (boot.data.email.error ? 'text-warn-deep' : 'text-live-deep'))} aria-hidden="true" />}
            >
              Email account
              {boot.data?.email.connected && <span className="sr-only">{boot.data.email.error ? ', connected, last check failed' : ', connected'}</span>}
            </Button>
            <Button variant="outline" className="h-10" disabled={!boot.data} onClick={() => setSettingsOpen(true)} icon={<Settings className="h-4 w-4" aria-hidden="true" />}>
              Alert settings
            </Button>
            <Button className="h-10" disabled={!boot.data} onClick={() => setCompose(BLANK)} icon={<PenLine className="h-4 w-4" aria-hidden="true" />}>
              New message
            </Button>
          </>
        }
      />

      {boot.error && !boot.data ? (
        <ErrorState message={boot.error} onRetry={() => boot.reload()} />
      ) : (
        <>
        {boot.data?.email.connected && boot.data.email.error && (
          <p role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-l-4 border-line border-l-warn bg-paper px-4 py-3 text-[15px] leading-snug text-body">
            <span className="min-w-0">
              <span className="font-extrabold text-ink">New mail from {boot.data.email.email} is not arriving.</span> {boot.data.email.error}
            </span>
            <Button variant="outline" size="sm" onClick={() => setAccountOpen(true)}>
              Email account
            </Button>
          </p>
        )}
        <Card className="lg:grid lg:grid-cols-[190px_minmax(0,350px)_minmax(0,1fr)] lg:divide-x lg:divide-line">
          <nav aria-label="Mail folders" className="border-b border-line lg:border-b-0">
            <ul className="flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-0.5">
              {FOLDERS.map(({ key, label, icon: Icon }) => {
                const count = key === 'inbox' ? mail.counts.inbox : key === 'alerts' ? mail.counts.alerts : 0;
                const active = folder === key;
                return (
                  <li key={key} className="shrink-0">
                    <Link
                      to={`/mail/${key}`}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex h-10 items-center gap-2.5 border-b-[3px] px-3 text-[15px] whitespace-nowrap lg:border-b-0 lg:border-l-[3px]',
                        active ? 'border-brand bg-navy-tint font-extrabold text-navy' : 'border-transparent font-semibold text-body hover:bg-wash hover:text-ink',
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      <span className="lg:min-w-0 lg:flex-1">{label}</span>
                      {count > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-extrabold text-white tabular-nums">
                          {count > 99 ? '99+' : count}
                          <span className="sr-only"> unread</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section aria-label={q ? 'Search results' : meta.label} className={cx('min-w-0', openId !== null && 'hidden lg:block')}>
            <div className="relative border-b border-line p-2.5">
              <Search className="pointer-events-none absolute top-1/2 left-5 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
              <input type="search" aria-label="Search all mail" placeholder="Search all mail" value={search} onChange={(e) => setSearch(e.target.value)} className={cx(inputClass, 'h-10 pl-9')} />
            </div>

            {items.length > 0 && (
              <div className={toolbar}>
                <label className="flex h-9 cursor-pointer items-center gap-2 px-1.5 text-sm font-bold text-ink">
                  <input type="checkbox" className="h-4 w-4 accent-navy" checked={allSelected} onChange={() => setSelected(allSelected ? [] : items.map((i) => i.id))} />
                  {selected.length ? `${selected.length} selected` : 'Select all'}
                </label>
                {selected.length > 0 && (
                  <>
                    <IconButton label="Mark as read" disabled={busy} onClick={() => act(selected, { unread: false })}>
                      <MailOpen className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                    {(folder === 'inbox' || folder === 'alerts') && !q && (
                      <IconButton label="Archive" disabled={busy} onClick={() => act(selected, { move: 'archive' }, 'Archived.')}>
                        <Archive className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    )}
                    {inTrash ? (
                      <>
                        <IconButton label="Restore" disabled={busy} onClick={() => act(selected, { move: 'restore' }, 'Restored.')}>
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        <IconButton label="Delete for good" tone="danger" disabled={busy} onClick={() => setConfirm({ ids: selected, text: `${selected.length} ${selected.length === 1 ? 'message' : 'messages'}` })}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      </>
                    ) : folder === 'drafts' && !q ? (
                      <IconButton label="Delete drafts" tone="danger" disabled={busy} onClick={() => setConfirm({ ids: selected, text: `${selected.length} ${selected.length === 1 ? 'draft' : 'drafts'}` })}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    ) : (
                      <IconButton label="Move to Trash" tone="danger" disabled={busy} onClick={() => act(selected, { move: 'trash' }, 'Moved to Trash.')}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    )}
                  </>
                )}
                {inTrash && selected.length === 0 && (
                  <Button variant="danger" size="sm" className="ml-auto" disabled={busy} onClick={() => setConfirm({ ids: 'trash', text: 'everything in Trash' })}>
                    Empty Trash
                  </Button>
                )}
              </div>
            )}

            <div className="lg:h-[calc(100dvh-330px)] lg:min-h-[420px] lg:overflow-y-auto">
              {list.error && !list.data ? (
                <div className="p-3">
                  <ErrorState message={list.error} onRetry={() => list.reload()} />
                </div>
              ) : list.loading && !list.data ? (
                <SkeletonRows rows={5} />
              ) : items.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <meta.icon className="mx-auto h-8 w-8 text-navy" aria-hidden="true" />
                  <p className="mt-2 text-lg font-extrabold text-ink">{q ? 'No mail matches' : `Nothing in ${meta.label}`}</p>
                  <p className="mx-auto mt-1 max-w-xs text-[15px] leading-snug text-muted">{q ? 'Try a different word, or a name.' : meta.empty}</p>
                </div>
              ) : (
                <ul className={cx('divide-y divide-line transition-opacity', list.loading && 'opacity-60')}>
                  {items.map((item) => {
                    const outgoing = item.folder === 'sent' || item.folder === 'drafts';
                    const who = item.kind === 'alert' ? 'Alert' : outgoing ? `To ${recipients(item, 'to', me) || 'nobody yet'}` : item.from.name;
                    return (
                      <li key={item.id} className={cx('flex items-start gap-2 border-l-[3px] py-2.5 pr-2 pl-2.5', openId === item.id ? 'border-brand bg-navy-tint' : 'border-transparent hover:bg-wash')}>
                        <input
                          type="checkbox"
                          aria-label={`Select “${subjectOf(item.subject)}”`}
                          className="mt-1.5 h-4 w-4 shrink-0 accent-navy"
                          checked={selected.includes(item.id)}
                          onChange={() => setSelected((current) => (current.includes(item.id) ? current.filter((v) => v !== item.id) : [...current, item.id]))}
                        />
                        <button type="button" disabled={busy} onClick={() => openItem(item)} className="min-w-0 flex-1 cursor-pointer text-left">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cx('flex min-w-0 items-center gap-1.5 text-[15px]', item.unread ? 'font-extrabold text-ink' : 'font-semibold text-body')}>
                              {item.unread && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                              {item.unread && <span className="sr-only">Unread. </span>}
                              <span className="truncate">{who}</span>
                            </span>
                            <span className="shrink-0 text-[12.5px] text-muted">{timeAgo(item.at)}</span>
                          </span>
                          <span className={cx('flex items-center gap-1.5 text-[14.5px]', item.unread ? 'font-bold text-ink' : 'text-body')}>
                            <span className="truncate">{subjectOf(item.subject)}</span>
                            {item.ext?.via && <AtSign className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Email" />}
                            {item.attachments > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Has attachments" />}
                          </span>
                          <span className="block truncate text-[13.5px] text-muted">{item.snippet || ' '}</span>
                          {q && <Pill className="mt-1 bg-wash text-body ring-1 ring-line-strong ring-inset">{item.kind === 'alert' && item.folder === 'inbox' ? 'Alerts' : FOLDER_LABEL[item.folder]}</Pill>}
                        </button>
                        {item.folder !== 'drafts' && (
                          <button
                            type="button"
                            aria-label={item.starred ? `Remove the star from “${subjectOf(item.subject)}”` : `Star “${subjectOf(item.subject)}”`}
                            aria-pressed={item.starred}
                            onClick={() => toggleStar(item)}
                            className={cx('flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center hover:bg-paper', item.starred ? 'text-warn-deep' : 'text-line-strong hover:text-body')}
                          >
                            <Star className="h-[18px] w-[18px]" fill={item.starred ? 'currentColor' : 'none'} aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section aria-label="Message" className={cx('min-w-0', openId === null && 'hidden lg:block')}>
            {!openId ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
                <MailOpen className="h-9 w-9 text-line-strong" aria-hidden="true" />
                <p className="mt-2.5 text-[15px] text-muted">Choose a message to read it here.</p>
              </div>
            ) : opening && !opened ? (
              <Spinner label="Opening the message" />
            ) : openError || !opened || !box ? (
              <div className="p-4">
                <ErrorState message={openError ?? 'That message could not be opened.'} />
                <Button variant="outline" size="sm" className="mt-3" onClick={closeMessage} icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
                  Back to {meta.label}
                </Button>
              </div>
            ) : (
              <>
                <div className={toolbar}>
                  <Button variant="ghost" size="sm" className="lg:hidden" onClick={closeMessage} icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
                    Back
                  </Button>
                  {current && box.kind === 'mail' && box.folder !== 'trash' && (
                    <>
                      <Button variant="navy" size="sm" disabled={busy} onClick={() => reply(current, false)} icon={<Reply className="h-4 w-4" aria-hidden="true" />}>
                        Reply
                      </Button>
                      {replyAllHelps(current) && (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => reply(current, true)} icon={<ReplyAll className="h-4 w-4" aria-hidden="true" />}>
                          Reply all
                        </Button>
                      )}
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => forward(current)} icon={<Forward className="h-4 w-4" aria-hidden="true" />}>
                        Forward
                      </Button>
                    </>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    {box.folder === 'inbox' && (
                      <IconButton label="Archive" disabled={busy} onClick={() => act([box.id], { move: 'archive' }, 'Archived.')}>
                        <Archive className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    )}
                    {box.folder === 'archive' && (
                      <IconButton label="Move back to the inbox" disabled={busy} onClick={() => act([box.id], { move: 'inbox' }, 'Moved back to the inbox.')}>
                        <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    )}
                    {box.folder !== 'trash' && box.folder !== 'sent' && (
                      <IconButton label="Mark as unread" disabled={busy} onClick={() => act([box.id], { unread: true }).then(closeMessage)}>
                        <MailOpen className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    )}
                    <IconButton label={box.starred ? 'Remove the star' : 'Star'} aria-pressed={box.starred} onClick={() => toggleStar(box)} className={box.starred ? 'text-warn-deep' : undefined}>
                      <Star className="h-4 w-4" fill={box.starred ? 'currentColor' : 'none'} aria-hidden="true" />
                    </IconButton>
                    {box.folder === 'trash' ? (
                      <>
                        <IconButton label="Restore" disabled={busy} onClick={() => act([box.id], { move: 'restore' }, 'Restored.')}>
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        <IconButton label="Delete for good" tone="danger" disabled={busy} onClick={() => setConfirm({ ids: [box.id], text: 'this message' })}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton label="Move to Trash" tone="danger" disabled={busy} onClick={() => act([box.id], { move: 'trash' }, 'Moved to Trash.')}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    )}
                  </span>
                </div>
                <div className="lg:h-[calc(100dvh-330px)] lg:min-h-[420px] lg:overflow-y-auto">
                  <h2 className="border-b border-line px-4 py-3.5 text-[21px] leading-tight font-extrabold tracking-tight break-words text-ink sm:px-5">
                    {subjectOf(box.subject)}
                    {opened.thread.length > 1 && <span className="ml-2 align-middle text-sm font-bold text-muted">{opened.thread.length} messages</span>}
                  </h2>
                  {opened.thread.map((message) => (
                    <Message key={message.id} message={message} me={me} />
                  ))}
                </div>
              </>
            )}
          </section>
        </Card>
        </>
      )}

      {compose && boot.data && (
        <Compose
          key={`${compose.title}-${compose.draftId ?? ''}-${compose.replyTo ?? ''}-${compose.forwardOf ?? ''}`}
          draft={compose}
          people={people}
          me={me}
          account={boot.data.email}
          onClose={(changed) => {
            setCompose(null);
            if (changed) list.reload(true);
          }}
        />
      )}

      {settingsOpen && boot.data && <AlertSettings boot={boot.data} editor={canEdit(member)} onSaved={(prefs) => boot.setData((current) => (current ? { ...current, prefs } : current))} onClose={() => setSettingsOpen(false)} />}

      {accountOpen && boot.data && <EmailAccountDialog boot={boot.data} onChanged={(email) => boot.setData((current) => (current ? { ...current, email } : current))} onClose={() => setAccountOpen(false)} />}

      <ConfirmDialog open={Boolean(confirm)} title="Delete for good?" confirmLabel="Delete for good" busy={busy} onConfirm={removeForGood} onClose={() => !busy && setConfirm(null)}>
        <p>
          You are about to delete <span className="font-bold text-ink">{confirm?.text}</span>. This cannot be undone. Other people keep their own copies.
        </p>
      </ConfirmDialog>
    </>
  );
}
