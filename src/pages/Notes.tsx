import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck, Clock, NotebookPen, Pin, PinOff, Plus, Save, Search, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useDebounced, useLoad } from '../hooks/useLoad';
import { fmtDateTime, wordCount } from '../lib/format';
import { Button, Card, ConfirmDialog, ErrorState, IconButton, PageHeader, SkeletonRows, Spinner, cx, inputClass, useToast } from '../components/ui';

const NOTES = '/api/team?resource=notes';
const MAX_TITLE = 120;
const MAX_BODY = 20000;

interface NoteItem {
  id: number;
  title: string;
  snippet: string;
  pinned: boolean;
  /** When the note was first saved, and when it was last saved. Set by the server. */
  created: string;
  saved: string;
  saves: number;
}

interface Note extends Omit<NoteItem, 'snippet'> {
  body: string;
  /** The date and time of the most recent saves, newest first. */
  history: string[];
}

interface NoteList {
  notes: NoteItem[];
  total: number;
  limit: number;
}

/** A date and time in full, in this device's time zone: "Sat, 21 November 2026 at 14:32". */
const stamp = (iso: string, seconds = false) =>
  new Date(iso).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false });

const nameOf = (note: { title: string; snippet?: string; body?: string }) => note.title || (note.snippet ?? note.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Untitled note';

/*
 * Text that was being written when the notepad was left. Leaving saves it; if that save does not go
 * through, the text is kept here and put back the next time the notepad is opened, so it is not lost.
 */
let stash: { id: number | null; title: string; body: string; pending: Promise<boolean> } | null = null;

export default function Notes() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const n = params.get('n');
  const openId = n && n !== 'new' && Number(n) > 0 ? Number(n) : null;
  const composing = n === 'new';
  const editing = composing || openId !== null;

  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const list = useLoad(() => api<NoteList>(`${NOTES}${q ? `&q=${encodeURIComponent(q)}` : ''}`), [q]);

  const [note, setNote] = useState<Note | null>(null); // the note as it was last saved
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null); // when the other copy was saved
  const [toDelete, setToDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const dirty = note ? title.trim().replace(/\s+/g, ' ') !== note.title || body !== note.body : Boolean(title.trim() || body.trim());

  useEffect(() => {
    document.title = 'Notepad · 180news Newsroom CMS';
  }, []);

  const restore = useRef<{ id: number | null; title: string; body: string } | null>(null);

  // Opening a note, or starting a new one.
  useEffect(() => {
    setProblem(null);
    setConflict(null);
    setLoadError(null);
    const back = restore.current;
    if (composing) {
      setNote(null);
      setTitle(back && back.id === null ? back.title : '');
      setBody(back && back.id === null ? back.body : '');
      if (back && back.id === null) restore.current = null;
      window.setTimeout(() => titleRef.current?.focus(), 60);
      return;
    }
    if (openId === null) {
      setNote(null);
      setTitle('');
      setBody('');
      return;
    }
    if (note?.id === openId) return; // just saved for the first time: already on screen
    let cancelled = false;
    setLoading(true);
    api<Note>(`${NOTES}&id=${openId}`)
      .then((opened) => {
        if (cancelled) return;
        setNote(opened);
        const mine = restore.current && restore.current.id === opened.id ? restore.current : null;
        setTitle(mine ? mine.title : opened.title);
        setBody(mine ? mine.body : opened.body);
        if (mine) restore.current = null;
      })
      .catch((err) => {
        if (cancelled) return;
        setNote(null);
        setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  /** Saves the note. The server records the date and time. Returns false if it was not saved. */
  const save = async (options: { force?: boolean; stay?: boolean } = {}): Promise<boolean> => {
    if (saving) return false;
    if (!title.trim() && !body.trim()) {
      setProblem('Write something before saving.');
      return false;
    }
    if (body.length > MAX_BODY) {
      setProblem(`A note can hold ${MAX_BODY.toLocaleString('en-ZA')} characters. This one has ${body.length.toLocaleString('en-ZA')}. Shorten it, or split it into two notes.`);
      return false;
    }
    setSaving(true);
    setProblem(null);
    try {
      const saved = note
        ? await api<Note>(NOTES, { method: 'PUT', body: { id: note.id, title, body, saved: note.saved, force: options.force === true } })
        : await api<Note>(NOTES, { method: 'POST', body: { title, body } });
      setNote(saved);
      setTitle(saved.title);
      setBody(saved.body);
      setConflict(null);
      if (!note && !options.stay) setParams({ n: String(saved.id) }, { replace: true });
      toast(`Saved ${stamp(saved.saved)}.`);
      list.reload(true);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.fields?.saved) setConflict(err.fields.saved);
      else if (err instanceof ApiError && err.status === 404) setProblem('This note was deleted on another device. Save it as a new note to keep what is written here.');
      else setProblem(err instanceof ApiError && err.fields?.body ? err.fields.body : `Not saved. ${errorMessage(err)}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Moves to another note (or to none). What is being written is saved first; if that fails, nothing moves. */
  const go = async (next: string | null) => {
    if (next === n) return;
    if (dirty && !(await save({ stay: true }))) return;
    setParams(next ? { n: next } : {}, { replace: false });
  };

  // Kept up to date for the two handlers below, which must not be re-registered on every keystroke.
  const latest = useRef({ note, title, body, dirty, save, n });
  latest.current = { note, title, body, dirty, save, n };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (latest.current.dirty) latest.current.save();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Leaving the notepad for another page: what was being written is saved on the way out.
      const now = latest.current;
      if (!now.dirty || (!now.title.trim() && !now.body.trim()) || now.body.length > MAX_BODY) return;
      const pending = (
        now.note
          ? api<Note>(NOTES, { method: 'PUT', body: { id: now.note.id, title: now.title, body: now.body, saved: now.note.saved } })
          : api<Note>(NOTES, { method: 'POST', body: { title: now.title, body: now.body } })
      ).then(
        () => true,
        () => {
          toast('The note you were writing could not be saved. Open the Notepad to get it back.', 'error');
          return false;
        },
      );
      stash = { id: now.note?.id ?? null, title: now.title, body: now.body, pending };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back to the notepad: text that could not be saved on the way out is put back.
  useEffect(() => {
    const kept = stash;
    if (!kept) return;
    let cancelled = false;
    kept.pending.then((saved) => {
      if (stash === kept) stash = null;
      if (cancelled) return;
      if (saved) return void list.reload(true);
      const target = kept.id ? String(kept.id) : 'new';
      if (latest.current.n === target && (kept.id === null || latest.current.note?.id === kept.id)) {
        // Already on that note: the text goes straight back into it.
        setTitle(kept.title);
        setBody(kept.body);
      } else {
        restore.current = kept;
        setParams({ n: target }, { replace: true });
      }
      toast('A note you were writing was not saved when you left the notepad. It is back here: save it now.', 'error');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing the tab or reloading with unsaved text: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const togglePin = async () => {
    if (!note) return;
    try {
      const next = await api<Note>(NOTES, { method: 'PUT', body: { id: note.id, pinned: !note.pinned } });
      setNote((current) => (current && current.id === next.id ? { ...current, pinned: next.pinned } : current));
      toast(next.pinned ? 'Pinned to the top of the list.' : 'Unpinned.');
      list.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const remove = async () => {
    if (!note) return;
    setDeleting(true);
    try {
      await api(NOTES, { method: 'DELETE', body: { id: note.id } });
      toast('Note deleted.');
      setToDelete(false);
      setNote(null);
      setTitle('');
      setBody('');
      setParams({}, { replace: true });
      list.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /** The newer copy is loaded in place of what is on screen. */
  const loadOther = async () => {
    if (!note) return;
    setLoading(true);
    try {
      const opened = await api<Note>(`${NOTES}&id=${note.id}`);
      setNote(opened);
      setTitle(opened.title);
      setBody(opened.body);
      setConflict(null);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const items = list.data?.notes ?? [];
  const total = list.data?.total ?? 0;
  const words = wordCount(body);
  const near = body.length > MAX_BODY * 0.9;

  return (
    <div data-notepad>
      <PageHeader
        eyebrow="Newsroom"
        title="Notepad"
        description="Your own notes. Each one records the date and time it was saved. Only you can see them."
        actions={
          <Button className="h-10" onClick={() => go('new')} icon={<Plus className="h-[18px] w-[18px]" aria-hidden="true" />}>
            New note
          </Button>
        }
      />

      <Card className="lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:divide-x lg:divide-line">
        <section aria-label="Your notes" className={cx('min-w-0', editing && 'hidden lg:block')}>
          <div className="relative border-b border-line p-2.5">
            <Search className="pointer-events-none absolute top-1/2 left-5 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
            <input type="search" aria-label="Search your notes" placeholder="Search your notes" value={search} onChange={(e) => setSearch(e.target.value)} className={cx(inputClass, 'h-10 pl-9')} />
          </div>
          <div className="lg:h-[calc(100dvh-290px)] lg:min-h-[440px] lg:overflow-y-auto">
            {list.error && !list.data ? (
              <div className="p-3">
                <ErrorState message={list.error} onRetry={() => list.reload()} />
              </div>
            ) : list.loading && !list.data ? (
              <SkeletonRows rows={4} />
            ) : items.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <NotebookPen className="mx-auto h-8 w-8 text-navy" aria-hidden="true" />
                <p className="mt-2 text-lg font-extrabold text-ink">{q ? 'No notes match' : 'No notes yet'}</p>
                <p className="mx-auto mt-1 max-w-xs text-[15px] leading-snug text-muted">{q ? 'Try a different word.' : 'Jot down a lead, a phone number or a quote. Each note keeps the date and time it was saved.'}</p>
                {!q && (
                  <Button variant="navy" className="mt-4" onClick={() => go('new')} icon={<Plus className="h-[18px] w-[18px]" aria-hidden="true" />}>
                    Write the first note
                  </Button>
                )}
              </div>
            ) : (
              <ul className={cx('divide-y divide-line transition-opacity', list.loading && 'opacity-60')}>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={openId === item.id ? 'true' : undefined}
                      onClick={() => go(String(item.id))}
                      className={cx('block w-full cursor-pointer border-l-[3px] px-3.5 py-3 text-left', openId === item.id ? 'border-brand bg-navy-tint' : 'border-transparent hover:bg-wash')}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-[15.5px] font-extrabold text-ink">{nameOf(item)}</span>
                        {item.pinned && <Pin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-label="Pinned" />}
                      </span>
                      {item.title && item.snippet && <span className="mt-0.5 block truncate text-[14px] text-body">{item.snippet}</span>}
                      <span className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <time dateTime={item.saved}>Saved {fmtDateTime(item.saved)}</time>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {total > 0 && (
            <p className="border-t border-line bg-wash px-3.5 py-2 text-[13px] text-muted">
              {q ? `${items.length} of ${total}` : total} {total === 1 ? 'note' : 'notes'}
              {list.data && total >= list.data.limit ? `. The notepad is full at ${list.data.limit}.` : ''}
            </p>
          )}
        </section>

        <section aria-label="Note" className={cx('min-w-0', !editing && 'hidden lg:block')}>
          {!editing ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
              <NotebookPen className="h-9 w-9 text-line-strong" aria-hidden="true" />
              <p className="mt-2.5 text-[15px] text-muted">Choose a note to read it here, or start a new one.</p>
            </div>
          ) : loadError ? (
            <div className="p-4">
              <ErrorState message={loadError} />
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setParams({}, { replace: true })} icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
                Back to your notes
              </Button>
            </div>
          ) : loading || (openId !== null && note?.id !== openId) ? (
            // Shown from the first moment a note is asked for, so an empty editor never flashes up in its place.
            <Spinner label="Opening the note" />
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (dirty || !note) save();
              }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-wash px-3 py-2">
                <Button variant="ghost" size="sm" className="lg:hidden" disabled={saving} onClick={() => go(null)} icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}>
                  Notes
                </Button>
                <Button type="submit" size="sm" loading={saving} disabled={!dirty} icon={<Save className="h-4 w-4" aria-hidden="true" />}>
                  {saving ? 'Saving' : 'Save'}
                </Button>
                <p role="status" className="min-w-0 flex-1 basis-40 text-sm leading-snug">
                  {dirty ? (
                    <span className="font-bold text-warn-deep">{note ? 'Changes not saved yet' : 'Not saved yet'}</span>
                  ) : note ? (
                    <span className="inline-flex items-start gap-1.5 text-body">
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-live-deep" aria-hidden="true" />
                      <span>
                        Saved <time dateTime={note.saved}>{stamp(note.saved)}</time>
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted">A new note. Nothing is saved until you press Save.</span>
                  )}
                </p>
                {note && (
                  <span className="ml-auto flex items-center gap-1.5">
                    <IconButton label={note.pinned ? 'Unpin this note' : 'Pin this note to the top'} aria-pressed={note.pinned} onClick={togglePin} className={note.pinned ? 'text-brand' : undefined}>
                      {note.pinned ? <PinOff className="h-4 w-4" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
                    </IconButton>
                    <IconButton label="Delete this note" tone="danger" disabled={saving} onClick={() => setToDelete(true)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                  </span>
                )}
              </div>

              {conflict && (
                <div role="alert" className="border-b border-line border-l-4 border-l-warn bg-warn-tint px-4 py-3 text-[15px] leading-snug text-ink">
                  <p>
                    <span className="font-extrabold">This note was saved somewhere else on {stamp(conflict)},</span> after you opened it here. Saving now would replace that version with what is on this screen.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button size="sm" variant="navy" loading={saving} onClick={() => save({ force: true })}>
                      Save this version
                    </Button>
                    <Button size="sm" variant="outline" disabled={saving} onClick={loadOther}>
                      Show the other version
                    </Button>
                  </div>
                </div>
              )}
              {problem && (
                <p role="alert" className="border-b border-line border-l-4 border-l-brand bg-brand-tint px-4 py-2.5 text-[15px] leading-snug font-bold text-brand">
                  {problem}
                  {problem.startsWith('This note was deleted') && (
                    <button
                      type="button"
                      className="ml-2 cursor-pointer text-navy underline"
                      onClick={() => {
                        setNote(null);
                        setProblem(null);
                        setParams({ n: 'new' }, { replace: true });
                        restore.current = { id: null, title, body };
                      }}
                    >
                      Keep it as a new note
                    </button>
                  )}
                </p>
              )}

              <div className="p-4 sm:p-5">
                <label htmlFor="note-title" className="sr-only">
                  Title
                </label>
                <input
                  id="note-title"
                  ref={titleRef}
                  maxLength={MAX_TITLE}
                  autoComplete="off"
                  placeholder="Title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setProblem(null);
                  }}
                  className="w-full min-w-0 border-0 border-b border-line bg-transparent px-0 pb-2 text-[22px] leading-tight font-extrabold tracking-tight text-ink placeholder:text-line-strong focus:border-navy focus:outline-none"
                />
                <label htmlFor="note-body" className="sr-only">
                  Note
                </label>
                <textarea
                  id="note-body"
                  ref={bodyRef}
                  placeholder="Write your note here"
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setProblem(null);
                  }}
                  className="mt-3 block min-h-[300px] w-full resize-y border-0 bg-transparent p-0 text-[16.5px] leading-[1.65] text-body placeholder:text-muted focus:outline-none lg:h-[calc(100dvh-520px)] lg:min-h-[260px]"
                />
              </div>

              <div className="border-t border-line bg-wash px-4 py-3 text-sm leading-snug text-muted sm:px-5">
                {note ? (
                  <>
                    <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      <div>
                        <dt className="inline font-bold text-ink">First saved: </dt>
                        <dd className="inline">
                          <time dateTime={note.created}>{stamp(note.created)}</time>
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-ink">Last saved: </dt>
                        <dd className="inline">
                          <time dateTime={note.saved}>{stamp(note.saved)}</time>
                        </dd>
                      </div>
                    </dl>
                    {note.saves > 1 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer font-bold text-navy">Saved {note.saves} times. Show the date and time of each save</summary>
                        <ol className="mt-1.5 space-y-0.5 tabular-nums">
                          {note.history.map((time) => (
                            <li key={time}>
                              <time dateTime={time}>{stamp(time, true)}</time>
                            </li>
                          ))}
                        </ol>
                        {note.saves > note.history.length && <p className="mt-1">The {note.history.length} most recent saves are listed.</p>}
                      </details>
                    )}
                  </>
                ) : (
                  <p>The date and time are recorded when you save.</p>
                )}
                <p className="mt-1.5">
                  {words} {words === 1 ? 'word' : 'words'}
                  {near && (
                    <span className={cx('font-bold', body.length > MAX_BODY ? 'text-brand' : 'text-warn-deep')}>
                      {' '}
                      · {body.length.toLocaleString('en-ZA')} of {MAX_BODY.toLocaleString('en-ZA')} characters
                    </span>
                  )}{' '}
                  · Times are shown in this device’s time zone.<span className="hidden lg:inline"> Ctrl+S saves.</span>
                </p>
              </div>
            </form>
          )}
        </section>
      </Card>

      <ConfirmDialog open={toDelete} title="Delete this note?" confirmLabel="Delete note" busy={deleting} onConfirm={remove} onClose={() => !deleting && setToDelete(false)}>
        <p>
          <span className="font-bold text-ink">{note ? nameOf(note) : ''}</span> will be deleted for good, with its save times. This cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}
