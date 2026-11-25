import { useEffect, useState } from 'react';
import { AlarmClock, Check, Plus, Trash2, CalendarClock } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Input, TextArea, Spinner, ErrorBox, Toast, Empty, fmtDate, cn } from '../components/ui';
import type { ReminderRow } from '../lib/types';

export default function RemindersPage() {
  const list = useApi<{ reminders: ReminderRow[] }>(() => api('/api/reminders'), []);
  const [openId, setOpenId] = useState<number | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [delId, setDelId] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Reminders · 180news Newsroom CMS';
  }, []);

  const reminders = list.data?.reminders || [];
  const open = reminders.filter((r) => !r.done);
  const done = reminders.filter((r) => r.done);

  const isOverdue = (r: ReminderRow) => !r.done && r.due_at && new Date(r.due_at).getTime() < Date.now();

  const openReminder = (r?: ReminderRow) => {
    setFields({});
    if (r) {
      setOpenId(r.id);
      setTitle(r.title);
      setNote(r.note);
      setDueAt(r.due_at ? r.due_at.slice(0, 16) : '');
    } else {
      setOpenId('new');
      setTitle('');
      setNote('');
      setDueAt('');
    }
  };

  const close = () => setOpenId(null);

  const save = async () => {
    if (title.trim().length < 2) {
      setFields({ title: 'Give the reminder a short title.' });
      return;
    }
    setSaving(true);
    try {
      const due_at = dueAt ? new Date(dueAt).toISOString() : null;
      if (openId === 'new') {
        await api('/api/reminders', { method: 'POST', body: { title, note, due_at } });
        setToast('Reminder set.');
      } else if (openId) {
        await api('/api/reminders', { method: 'PUT', body: { id: openId, title, note, due_at } });
        setToast('Reminder saved.');
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

  const toggleDone = async (r: ReminderRow) => {
    try {
      await api('/api/reminders', { method: 'PUT', body: { id: r.id, done: !r.done } });
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
      setTimeout(() => setToast(null), 2500);
    }
  };

  const remove = async () => {
    if (!delId) return;
    try {
      await api('/api/reminders', { method: 'DELETE', body: { id: delId } });
      setToast('Reminder deleted.');
      if (openId === delId) close();
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setDelId(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const ReminderItem = ({ r }: { r: ReminderRow }) => (
    <li className={cn('flex items-start gap-3 px-5 py-3.5', r.done && 'opacity-60')}>
      <button
        type="button"
        onClick={() => toggleDone(r)}
        aria-label={r.done ? 'Mark as not done' : 'Mark as done'}
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2',
          r.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-line-strong text-transparent hover:border-navy'
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => openReminder(r)}>
        <p className={cn('font-bold text-ink', r.done && 'line-through')}>{r.title}</p>
        {r.note && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{r.note}</p>}
        <p className={cn('mt-1 flex items-center gap-1.5 text-xs font-bold', isOverdue(r) ? 'text-brand' : 'text-muted')}>
          {r.due_at ? (
            <>
              <CalendarClock className="h-3.5 w-3.5" /> {fmtDate(r.due_at)} {isOverdue(r) && '· overdue'}
            </>
          ) : (
            `Added ${fmtDate(r.created_at)}`
          )}
        </p>
      </button>
      <button
        type="button"
        onClick={() => setDelId(r.id)}
        className="shrink-0 cursor-pointer p-1 text-off hover:text-brand"
        aria-label="Delete reminder"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Reminders"
        description="Deadlines, follow-ups and things not to forget — with an optional due date and time."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => openReminder()}>
            New reminder
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            {list.loading && !list.data ? (
              <Spinner label="Loading reminders" />
            ) : list.error ? (
              <ErrorBox message={list.error} onRetry={() => list.reload()} />
            ) : open.length === 0 ? (
              <Empty icon={<AlarmClock className="h-8 w-8" />} title="Nothing outstanding">
                Set a reminder for a deadline, a call-back or a follow-up and it will show up here.
              </Empty>
            ) : (
              <ul className="divide-y divide-line">
                {open.map((r) => (
                  <ReminderItem key={r.id} r={r} />
                ))}
              </ul>
            )}
          </Card>

          {done.length > 0 && (
            <Card>
              <div className="border-b border-line px-5 py-3">
                <h2 className="text-sm font-black tracking-[0.06em] text-muted uppercase">Done</h2>
              </div>
              <ul className="divide-y divide-line">
                {done.map((r) => (
                  <ReminderItem key={r.id} r={r} />
                ))}
              </ul>
            </Card>
          )}
        </div>

        {openId !== null && (
          <Card className="h-fit p-5 lg:sticky lg:top-6">
            <h2 className="mb-3 text-lg font-extrabold">{openId === 'new' ? 'New reminder' : 'Edit reminder'}</h2>
            <div className="space-y-3">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={fields.title} />
              <Input
                type="datetime-local"
                label="Due"
                optional
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                hint="Leave blank for a reminder with no deadline."
              />
              <TextArea label="Note" rows={5} value={note} onChange={(e) => setNote(e.target.value)} className="resize-y" />
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
            <h3 className="text-lg font-extrabold">Delete this reminder?</h3>
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
