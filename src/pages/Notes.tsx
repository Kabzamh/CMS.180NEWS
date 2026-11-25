import { useEffect, useState } from 'react';
import { Pin, PinOff, Plus, Trash2, StickyNote } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { useDebounced } from '../hooks/useLoad';
import { PageHeader, Card, Button, Input, TextArea, Spinner, ErrorBox, Toast, Empty, fmtDate } from '../components/ui';
import type { NoteRow } from '../lib/types';

export default function NotesPage() {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const list = useApi<{ notes: NoteRow[] }>(() => api(`/api/notes${debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ''}`), [debouncedQ]);
  const [openId, setOpenId] = useState<number | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [delId, setDelId] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Notes · 180news Newsroom CMS';
  }, []);

  const notes = list.data?.notes || [];

  const openNote = (n?: NoteRow) => {
    if (n) {
      setOpenId(n.id);
      setTitle(n.title);
      setBody(n.body);
    } else {
      setOpenId('new');
      setTitle('');
      setBody('');
    }
  };

  const close = () => setOpenId(null);

  const save = async () => {
    setSaving(true);
    try {
      if (openId === 'new') {
        await api('/api/notes', { method: 'POST', body: { title: title.trim() || 'Untitled note', body } });
        setToast('Note created.');
      } else if (openId) {
        await api('/api/notes', { method: 'PUT', body: { id: openId, title: title.trim() || 'Untitled note', body } });
        setToast('Note saved.');
      }
      close();
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const togglePin = async (n: NoteRow) => {
    try {
      await api('/api/notes', { method: 'PUT', body: { id: n.id, pinned: !n.pinned } });
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
      setTimeout(() => setToast(null), 2500);
    }
  };

  const remove = async () => {
    if (!delId) return;
    try {
      await api('/api/notes', { method: 'DELETE', body: { id: delId } });
      setToast('Note deleted.');
      if (openId === delId) close();
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setDelId(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Notes"
        description="Private scratchpad for story ideas, contacts and reminders — shared across the newsroom."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => openNote()}>
            New note
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <Input placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          {list.loading && !list.data ? (
            <Spinner label="Loading notes" />
          ) : list.error ? (
            <ErrorBox message={list.error} onRetry={() => list.reload()} />
          ) : notes.length === 0 ? (
            <Card>
              <Empty icon={<StickyNote className="h-8 w-8" />} title="No notes yet">
                Jot down a lead, a contact number or a reminder — it stays here for the whole desk.
              </Empty>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {notes.map((n) => (
                <Card
                  key={n.id}
                  className={`cursor-pointer p-4 transition-colors hover:border-navy ${openId === n.id ? 'border-navy' : ''}`}
                >
                  <div onClick={() => openNote(n)}>
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 truncate font-extrabold text-ink">{n.title}</h3>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); togglePin(n); }}
                        className="shrink-0 cursor-pointer text-off hover:text-navy"
                        aria-label={n.pinned ? 'Unpin' : 'Pin'}
                      >
                        {n.pinned ? <Pin className="h-4 w-4 fill-brand text-brand" /> : <PinOff className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="line-clamp-3 text-sm text-body whitespace-pre-wrap">{n.body || 'No content yet.'}</p>
                    <p className="mt-2 text-xs text-muted">{n.author_name} · {fmtDate(n.updated_at)}</p>
                  </div>
                  <button
                    type="button"
                    className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-brand hover:underline"
                    onClick={(e) => { e.stopPropagation(); setDelId(n.id); }}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>

        {openId !== null && (
          <Card className="h-fit p-5 lg:sticky lg:top-6">
            <h2 className="mb-3 text-lg font-extrabold">{openId === 'new' ? 'New note' : 'Edit note'}</h2>
            <div className="space-y-3">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <TextArea label="Note" rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="resize-y" />
            </div>
            <div className="mt-4 flex gap-2">
              <Button loading={saving} onClick={save}>Save</Button>
              <Button variant="outline" onClick={close}>Cancel</Button>
            </div>
          </Card>
        )}
      </div>

      {delId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="w-full max-w-md border border-line bg-paper p-6">
            <h3 className="text-lg font-extrabold">Delete this note?</h3>
            <p className="mt-2 text-sm text-muted">This cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDelId(null)}>Cancel</Button>
              <Button variant="danger" onClick={remove}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
