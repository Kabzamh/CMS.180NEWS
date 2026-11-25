import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail as MailIcon, Send, Inbox, PenLine, Star, Reply, Trash2, FileText, Archive,
  Search, RefreshCw, CheckSquare, Square, X, ArchiveRestore, Undo2, ChevronLeft, Menu,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, ApiError, errMsg } from '../lib/api';
import { useDebounced } from '../hooks/useLoad';
import {
  Card, Button, Select, Spinner, ErrorBox, Toast, Empty, fmtDate, cn,
} from '../components/ui';

interface MailMsg {
  id: number;
  from_name: string;
  from_email: string;
  to_name: string;
  to_email: string;
  subject: string;
  body: string;
  read: boolean;
  starred: boolean;
  draft: boolean;
  created_at: string;
  updated_at: string;
}

interface Directory {
  authors: Array<{ id: number; name: string; email: string; title: string }>;
  team: Array<{ id: number; name: string; email: string; role: string }>;
}

type Box = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'trash';

const FOLDERS: Array<{ id: Box; label: string; icon: typeof Inbox }> = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'trash', label: 'Trash', icon: Trash2 },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

const AVATAR_COLORS = ['#1a73e8', '#188038', '#e37400', '#c5221f', '#9334e6', '#12847a'];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
      style={{ backgroundColor: avatarColor(name || '?') }}
    >
      {initials(name || '?')}
    </span>
  );
}

export default function MailPage() {
  const [box, setBox] = useState<Box>('inbox');
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const list = useApi<{ items: MailMsg[] }>(
    () => api(`/api/mail?box=${box}${debouncedQ ? `&q=${encodeURIComponent(debouncedQ)}` : ''}`),
    [box, debouncedQ]
  );
  const directory = useApi<Directory>(() => api('/api/mail?resource=directory'), []);
  const [compose, setCompose] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [draftId, setDraftId] = useState<number | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const saveDraftTimer = useRef<number | null>(null);

  useEffect(() => {
    document.title = 'Mail · 180news Newsroom CMS';
  }, []);

  useEffect(() => {
    setChecked(new Set());
    setSelectedId(null);
  }, [box]);

  const recipients = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of directory.data?.team || []) {
      if (t.email) map.set(t.email.toLowerCase(), `${t.name} (${t.role})`);
    }
    for (const a of directory.data?.authors || []) {
      if (a.email && !map.has(a.email.toLowerCase())) map.set(a.email.toLowerCase(), `${a.name}${a.title ? ` · ${a.title}` : ''}`);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [directory.data]);

  const items = list.data?.items || [];
  const selected = items.find((m) => m.id === selectedId) || null;
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = () => list.reload(true);

  const openCompose = (prefill?: { to?: string; subject?: string; body?: string; draftId?: number }) => {
    setToEmail(prefill?.to || '');
    setSubject(prefill?.subject || '');
    setBody(prefill?.body || '');
    setDraftId(prefill?.draftId ?? null);
    setFields({});
    setCompose(true);
    setSelectedId(null);
  };

  const closeCompose = () => {
    setCompose(false);
    setDraftId(null);
  };

  // Autosave to Drafts while composing — the same quiet background save
  // Gmail does the moment you start typing a message.
  useEffect(() => {
    if (!compose) return;
    if (!toEmail.trim() && !subject.trim() && !body.trim()) return;
    if (saveDraftTimer.current) window.clearTimeout(saveDraftTimer.current);
    saveDraftTimer.current = window.setTimeout(async () => {
      try {
        if (draftId) {
          await api('/api/mail', { method: 'PUT', body: { id: draftId, to_email: toEmail, subject, body } });
        } else {
          const row = await api<MailMsg>('/api/mail', { method: 'POST', body: { draft: true, to_email: toEmail, subject, body } });
          setDraftId(row.id);
        }
        if (box === 'drafts') list.reload(true);
      } catch {
        /* silent autosave */
      }
    }, 900);
    return () => {
      if (saveDraftTimer.current) window.clearTimeout(saveDraftTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toEmail, subject, body, compose]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      await api('/api/mail', { method: 'POST', body: { to_email: toEmail, subject, body, draft_id: draftId } });
      flash('Message sent.');
      closeCompose();
      setToEmail('');
      setSubject('');
      setBody('');
      setBox('sent');
      window.dispatchEvent(new Event('mail-changed'));
      await list.reload(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      flash(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const discardDraft = async () => {
    if (draftId) {
      try {
        await api('/api/mail', { method: 'DELETE', body: { id: draftId } });
      } catch {
        /* ignore */
      }
    }
    closeCompose();
    await list.reload(true);
  };

  const openMsg = async (m: MailMsg) => {
    if (m.draft) {
      openCompose({ to: m.to_email, subject: m.subject, body: m.body, draftId: m.id });
      return;
    }
    setSelectedId(m.id);
    setCompose(false);
    if (!m.read && box === 'inbox') {
      try {
        await api('/api/mail', { method: 'PUT', body: { id: m.id, read: true } });
        window.dispatchEvent(new Event('mail-changed'));
        await list.reload(true);
      } catch {
        /* ignore */
      }
    }
  };

  const toggleStar = async (m: MailMsg, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api('/api/mail', { method: 'PUT', body: { id: m.id, starred: !m.starred } });
      await list.reload(true);
    } catch (err) {
      flash(errMsg(err));
    }
  };

  const toggleCheck = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked = items.length > 0 && items.every((m) => checked.has(m.id));
  const toggleCheckAll = () => {
    setChecked(allChecked ? new Set() : new Set(items.map((m) => m.id)));
  };

  const bulkIds = () => (checked.size ? [...checked] : selectedId ? [selectedId] : []);

  const bulkArchive = async () => {
    const ids = bulkIds();
    if (!ids.length) return;
    try {
      await api('/api/mail', { method: 'PUT', body: { ids, archived: true } });
      flash(ids.length > 1 ? `${ids.length} conversations archived.` : 'Archived.');
      setChecked(new Set());
      setSelectedId(null);
      window.dispatchEvent(new Event('mail-changed'));
      await list.reload(true);
    } catch (err) {
      flash(errMsg(err));
    }
  };

  const bulkTrash = async () => {
    const ids = bulkIds();
    if (!ids.length) return;
    try {
      await api('/api/mail', { method: 'PUT', body: { ids, deleted: true } });
      flash(ids.length > 1 ? `${ids.length} conversations moved to Trash.` : 'Moved to Trash.');
      setChecked(new Set());
      setSelectedId(null);
      window.dispatchEvent(new Event('mail-changed'));
      await list.reload(true);
    } catch (err) {
      flash(errMsg(err));
    }
  };

  const bulkRestore = async () => {
    const ids = bulkIds();
    if (!ids.length) return;
    try {
      await api('/api/mail', { method: 'PUT', body: { ids, deleted: false, archived: false } });
      flash(ids.length > 1 ? `${ids.length} conversations restored.` : 'Restored to Inbox.');
      setChecked(new Set());
      setSelectedId(null);
      window.dispatchEvent(new Event('mail-changed'));
      await list.reload(true);
    } catch (err) {
      flash(errMsg(err));
    }
  };

  const bulkDeleteForever = async () => {
    const ids = bulkIds();
    if (!ids.length) return;
    try {
      await api('/api/mail', { method: 'DELETE', body: { ids } });
      flash(ids.length > 1 ? `${ids.length} conversations deleted forever.` : 'Deleted forever.');
      setChecked(new Set());
      setSelectedId(null);
      await list.reload(true);
    } catch (err) {
      flash(errMsg(err));
    }
  };

  const bulkMarkRead = async (read: boolean) => {
    const ids = bulkIds();
    if (!ids.length) return;
    try {
      await api('/api/mail', { method: 'PUT', body: { ids, read } });
      window.dispatchEvent(new Event('mail-changed'));
      await list.reload(true);
    } catch (err) {
      flash(errMsg(err));
    }
  };

  const reply = () => {
    if (!selected) return;
    openCompose({
      to: box === 'sent' ? selected.to_email : selected.from_email,
      subject: selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`,
      body: `\n\n—\nOn ${fmtDate(selected.created_at)}, ${selected.from_name} wrote:\n${selected.body}`,
    });
  };

  const unreadInboxCount = useMemo(
    () => (box === 'inbox' ? items.filter((m) => !m.read).length : 0),
    [items, box]
  );

  const inTrashOrArchive = box === 'trash' || box === 'archive';
  const hasSelection = checked.size > 0 || selectedId !== null;

  return (
    <>
      {/* Gmail-style top bar: hamburger menu toggle + search + refresh */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => setFoldersOpen((v) => !v)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-off hover:bg-wash hover:text-ink"
            aria-label={foldersOpen ? 'Hide folder menu' : 'Show folder menu'}
            aria-expanded={foldersOpen}
            title={foldersOpen ? 'Hide folder menu' : 'Show folder menu'}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-off" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search mail"
              className="h-11 w-full rounded-full border border-transparent bg-wash pr-4 pl-10 text-[15px] text-ink outline-none focus:border-navy focus:bg-paper focus:ring-2 focus:ring-navy/15"
            />
          </div>
        </div>
        <Button variant="outline" className="h-10 shrink-0" icon={<RefreshCw className="h-4 w-4" />} onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="flex items-start gap-4">
        {/* Folder rail — matches Gmail's own menu: Inbox, Starred, Sent, Drafts, Archive, Trash.
            Collapses to width 0 when the hamburger is toggled, and slides back when requested. */}
        <div
          className={cn(
            'shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-in-out',
            foldersOpen ? 'w-[200px] opacity-100' : 'w-0 opacity-0'
          )}
        >
          <div className="w-[200px]">
            <button
              type="button"
              onClick={() => openCompose()}
              className="mb-3 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-bold text-white shadow-md transition-shadow hover:shadow-lg"
            >
              <PenLine className="h-4 w-4" /> Compose
            </button>
            <Card className="h-fit overflow-hidden rounded-xl p-1.5">
              <ul className="space-y-0.5">
                {FOLDERS.map((f) => {
                  const Icon = f.icon;
                  const isActive = box === f.id;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setBox(f.id)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-3 rounded-r-full px-3 py-2 text-left text-[14px] font-medium whitespace-nowrap',
                          isActive ? 'bg-brand-tint font-bold text-brand' : 'text-body hover:bg-wash'
                        )}
                      >
                        <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'fill-current')} strokeWidth={isActive ? 0 : 2} />
                        <span className="flex-1">{f.label}</span>
                        {f.id === 'inbox' && unreadInboxCount > 0 && (
                          <span className="text-[12px] font-bold text-ink">{unreadInboxCount}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>

        {!foldersOpen && (
          <button
            type="button"
            onClick={() => openCompose()}
            className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-white shadow-md transition-shadow hover:shadow-lg"
            aria-label="Compose"
            title="Compose"
          >
            <PenLine className="h-4 w-4" />
          </button>
        )}

        {/* Message list + reading pane — side by side like Gmail, and they
            grow to fill the space the folder menu frees up when it's hidden. */}
        <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card className="min-h-[460px] overflow-hidden rounded-xl">
          {/* Gmail list toolbar: select-all + bulk actions once something is checked */}
          <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
            <button
              type="button"
              onClick={toggleCheckAll}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-ink"
              aria-label={allChecked ? 'Deselect all' : 'Select all'}
            >
              {allChecked ? <CheckSquare className="h-[18px] w-[18px] text-navy" /> : <Square className="h-[18px] w-[18px]" />}
            </button>
            {checked.size > 0 ? (
              <>
                {inTrashOrArchive ? (
                  <button type="button" onClick={bulkRestore} className="flex h-9 w-9 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-ink" aria-label="Move to inbox">
                    <ArchiveRestore className="h-[18px] w-[18px]" />
                  </button>
                ) : (
                  <button type="button" onClick={bulkArchive} className="flex h-9 w-9 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-ink" aria-label="Archive">
                    <Archive className="h-[18px] w-[18px]" />
                  </button>
                )}
                {box === 'trash' ? (
                  <button type="button" onClick={bulkDeleteForever} className="flex h-9 w-9 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-brand" aria-label="Delete forever">
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                ) : (
                  <button type="button" onClick={bulkTrash} className="flex h-9 w-9 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-brand" aria-label="Move to trash">
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                )}
                <span className="mx-1 h-5 w-px bg-line" />
                <button type="button" onClick={() => bulkMarkRead(true)} className="flex h-9 shrink-0 cursor-pointer items-center px-2 text-xs font-bold text-muted hover:bg-wash hover:text-ink">
                  Mark read
                </button>
                <button type="button" onClick={() => bulkMarkRead(false)} className="flex h-9 shrink-0 cursor-pointer items-center px-2 text-xs font-bold text-muted hover:bg-wash hover:text-ink">
                  Mark unread
                </button>
                <span className="ml-auto pr-2 text-xs font-bold text-muted">{checked.size} selected</span>
              </>
            ) : (
              <span className="px-2 text-xs font-bold tracking-wide text-off uppercase">
                {FOLDERS.find((f) => f.id === box)?.label}
              </span>
            )}
          </div>

          {list.loading ? (
            <Spinner label="Loading mail" />
          ) : list.error ? (
            <ErrorBox message={list.error} onRetry={() => list.reload()} />
          ) : items.length === 0 ? (
            <Empty
              icon={<MailIcon className="h-8 w-8" />}
              title={
                box === 'inbox' ? 'Inbox is empty'
                : box === 'starred' ? 'Nothing starred yet'
                : box === 'sent' ? 'No sent mail yet'
                : box === 'drafts' ? 'No drafts'
                : box === 'archive' ? 'No archived mail'
                : 'Trash is empty'
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {items.map((m) => {
                const unread = !m.read && box === 'inbox';
                const peerName = box === 'sent' || box === 'drafts' ? m.to_name || m.to_email || '(no recipient)' : m.from_name || m.from_email;
                const isChecked = checked.has(m.id);
                return (
                  <li key={m.id}>
                    <div
                      onClick={() => openMsg(m)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-1 px-2 py-2.5 hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0,0_1px_2px_0_rgba(60,64,67,.3)]',
                        selectedId === m.id && 'bg-navy-tint/40',
                        unread && !isChecked && 'bg-navy-tint/15'
                      )}
                    >
                      <button
                        type="button"
                        onClick={(e) => toggleCheck(m.id, e)}
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-off hover:text-ink"
                        aria-label="Select"
                      >
                        {isChecked ? <CheckSquare className="h-4 w-4 text-navy" /> : <Square className="h-4 w-4" />}
                      </button>
                      {!m.draft && (
                        <button
                          type="button"
                          aria-label={m.starred ? 'Unstar' : 'Star'}
                          onClick={(e) => toggleStar(m, e)}
                          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-off hover:text-amber-500"
                        >
                          <Star className={cn('h-4 w-4', m.starred && 'fill-amber-400 text-amber-500')} />
                        </button>
                      )}
                      <Avatar name={peerName} />
                      <div className="ml-2 min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cn('truncate text-[14px]', unread ? 'font-bold text-ink' : 'text-body')}>{peerName}</span>
                          <span className="shrink-0 text-xs text-off">{fmtDate(m.updated_at || m.created_at)}</span>
                        </div>
                        <p className={cn('truncate text-[14px]', unread ? 'font-bold text-ink' : 'text-body')}>
                          {m.draft && <span className="text-brand">Draft · </span>}
                          {m.subject || '(no subject)'}
                          <span className="font-normal text-muted"> — {m.body.replace(/\s+/g, ' ')}</span>
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Reading pane / compose */}
        <div className="space-y-4">
          {compose && (
            <Card className="overflow-hidden rounded-xl p-0">
              <div className="flex items-center justify-between bg-navy-deep px-4 py-2.5 text-white">
                <h2 className="text-sm font-bold">New Message</h2>
                <button type="button" onClick={discardDraft} className="cursor-pointer text-white/80 hover:text-white" aria-label="Discard draft">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={send} className="space-y-0" noValidate>
                <div className="border-b border-line px-4">
                  <Select
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    error={fields.to_email}
                    className="h-11 border-0 px-0 focus:ring-0"
                  >
                    <option value="">Recipients</option>
                    {recipients.map(([email, label]) => (
                      <option key={email} value={email}>
                        {label} — {email}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="border-b border-line px-4">
                  <input
                    type="email"
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    placeholder="To"
                    className="h-11 w-full border-0 bg-transparent px-0 text-[14.5px] text-ink outline-none placeholder:text-off"
                  />
                </div>
                <div className="border-b border-line px-4">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                    className="h-11 w-full border-0 bg-transparent px-0 text-[14.5px] font-bold text-ink outline-none placeholder:text-off placeholder:font-normal"
                  />
                  {fields.subject && <p className="pb-1.5 text-xs font-bold text-brand">{fields.subject}</p>}
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Compose email"
                  rows={10}
                  className="w-full resize-none border-0 bg-transparent px-4 py-3 text-[14.5px] leading-relaxed text-ink outline-none placeholder:text-off"
                />
                {fields.body && <p className="px-4 pb-2 text-xs font-bold text-brand">{fields.body}</p>}
                <div className="flex items-center gap-2 border-t border-line bg-wash px-4 py-3">
                  <Button type="submit" loading={busy} icon={<Send className="h-4 w-4" />}>
                    Send
                  </Button>
                  <button
                    type="button"
                    onClick={discardDraft}
                    className="ml-auto flex h-9 w-9 cursor-pointer items-center justify-center text-off hover:bg-line hover:text-brand"
                    aria-label="Discard draft"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </Card>
          )}

          {selected && !compose && (
            <Card className="rounded-xl p-5">
              <div className="mb-3 flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => setSelectedId(null)} className="mr-1 flex h-8 w-8 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-ink lg:hidden" aria-label="Back">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {inTrashOrArchive ? (
                  <button type="button" onClick={bulkRestore} className="flex h-8 w-8 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-ink" aria-label="Move to inbox">
                    <ArchiveRestore className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" onClick={bulkArchive} className="flex h-8 w-8 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-ink" aria-label="Archive">
                    <Archive className="h-4 w-4" />
                  </button>
                )}
                {box === 'trash' ? (
                  <button type="button" onClick={bulkDeleteForever} className="flex h-8 w-8 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-brand" aria-label="Delete forever">
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" onClick={bulkTrash} className="flex h-8 w-8 cursor-pointer items-center justify-center text-off hover:bg-wash hover:text-brand" aria-label="Move to trash">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => toggleStar(selected, e)}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center text-off hover:text-amber-500"
                  aria-label="Toggle star"
                >
                  <Star className={cn('h-4 w-4', selected.starred && 'fill-amber-400 text-amber-500')} />
                </button>
                {hasSelection && <span className="ml-auto text-xs text-off">{fmtDate(selected.updated_at || selected.created_at)}</span>}
              </div>
              <div className="flex items-start gap-3">
                <Avatar name={box === 'sent' ? selected.to_name || selected.to_email : selected.from_name || selected.from_email} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-normal text-ink">{selected.subject || '(no subject)'}</h2>
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-bold text-ink">{selected.from_name}</span>{' '}
                    <a className="text-navy hover:underline" href={`mailto:${selected.from_email}`}>
                      &lt;{selected.from_email}&gt;
                    </a>
                  </p>
                  <p className="text-sm text-muted">
                    to{' '}
                    <a className="text-navy hover:underline" href={`mailto:${selected.to_email}`}>
                      {selected.to_name || selected.to_email}
                    </a>
                  </p>
                </div>
              </div>
              <div className="mt-5 whitespace-pre-wrap text-[14.5px] leading-relaxed text-body">{selected.body}</div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button variant="outline" icon={<Reply className="h-4 w-4" />} onClick={reply}>Reply</Button>
                <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={() => setSelectedId(null)}>Close</Button>
              </div>
            </Card>
          )}

          {!compose && !selected && (
            <Card className="rounded-xl p-5">
              <h2 className="text-lg font-extrabold">Quick send</h2>
              <p className="mt-1 text-sm text-muted">Pick a colleague to message, or select a conversation on the left to read it here.</p>
              <ul className="mt-4 divide-y divide-line border border-line">
                {recipients.slice(0, 12).map(([email, label]) => (
                  <li key={email} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink">{label}</p>
                      <a href={`mailto:${email}`} className="text-sm font-bold text-navy hover:underline">{email}</a>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openCompose({ to: email })}>
                      Mail
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        </div>
      </div>
      {toast && <Toast message={toast} />}
    </>
  );
}
