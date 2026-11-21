import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Pencil, Send, Undo2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useLoad } from '../hooks/useLoad';
import type { Article, Section, Settings } from '../lib/types';
import { fmtDateTime, fmtDay, fmtTime, fromLocalInput, timeUntil, toLocalInput } from '../lib/format';
import { Button, Card, Dialog, EmptyState, ErrorState, PageHeader, SkeletonRows, TextInput, Toggle, buttonClass, useToast } from '../components/ui';

export default function Scheduled() {
  const toast = useToast();
  const list = useLoad(() => api<{ items: Article[] }>('/api/articles?status=scheduled'), []);
  const sections = useLoad(() => api<Section[]>('/api/sections'), []);
  const settings = useLoad(() => api<Settings>('/api/settings'), []);

  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Article | null>(null);
  const [when, setWhen] = useState('');
  const [whenError, setWhenError] = useState<string | undefined>();
  const [savingPanel, setSavingPanel] = useState(false);

  useEffect(() => {
    document.title = 'Scheduled posts · 180news Newsroom CMS';
  }, []);

  const labels = new Map((sections.data ?? []).map((s) => [s.slug, s.label]));
  const items = [...(list.data?.items ?? [])].sort((a, b) => new Date(a.publish_at ?? 0).getTime() - new Date(b.publish_at ?? 0).getTime());

  const groups: { day: string; items: Article[] }[] = [];
  for (const item of items) {
    const day = fmtDay(item.publish_at!);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  const change = async (article: Article, body: Record<string, unknown>, key: string, done: string) => {
    setBusy(`${key}-${article.id}`);
    try {
      await api('/api/articles', { method: 'PUT', body: { id: article.id, ...body } });
      toast(done);
      await list.reload(true);
      return true;
    } catch (err) {
      const detail = err instanceof ApiError && err.fields ? Object.values(err.fields)[0] : null;
      toast(detail ?? errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveTime = async () => {
    if (!editing) return;
    if (!when) return setWhenError('Choose a date and time.');
    if (new Date(when).getTime() <= Date.now() + 60000) return setWhenError('Choose a time in the future, or use Publish now.');
    setWhenError(undefined);
    const iso = fromLocalInput(when);
    if (await change(editing, { status: 'scheduled', publish_at: iso }, 'time', `Rescheduled for ${fmtDateTime(iso)}.`)) setEditing(null);
  };

  const togglePanel = async (enabled: boolean) => {
    setSavingPanel(true);
    try {
      const next = await api<Settings>('/api/settings', { method: 'PUT', body: { key: 'scheduled_panel', value: { enabled } } });
      settings.setData(next);
      toast(enabled ? 'Scheduled stories are listed on the front page.' : 'Scheduled stories are no longer listed on the front page.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSavingPanel(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Newsroom"
        title="Scheduled posts"
        description="Stories lined up to go live on their own. Publish one early, move it, or take it back to draft."
      />

      {settings.data && (
        <Card className="mb-6 p-5">
          <Toggle
            checked={settings.data.scheduled_panel.enabled}
            disabled={savingPanel}
            onChange={togglePanel}
            label="List scheduled articles on the front page"
            description="Shows readers a short Coming up list with the headline and time of each scheduled story."
          />
        </Card>
      )}

      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={() => list.reload()} />
      ) : list.loading && !list.data ? (
        <SkeletonRows rows={4} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-8 w-8" aria-hidden="true" />}
          title="Nothing is scheduled"
          action={
            <Link to="/articles" className={buttonClass('navy')}>
              Choose a story to schedule
            </Link>
          }
        >
          Open any story, pick At a set date and time under When to publish, and it will be listed here.
        </EmptyState>
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.day}>
              <h2 className="mb-2.5 text-sm font-black tracking-[0.06em] text-navy uppercase">{group.day}</h2>
              <ul className="divide-y divide-line border border-line bg-paper">
                {group.items.map((a) => (
                  <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-5">
                    <div className="shrink-0 sm:w-[104px]">
                      <p className="text-[26px] leading-none font-black tracking-tight text-ink tabular-nums">{fmtTime(a.publish_at!)}</p>
                      <p className="mt-1 text-sm font-semibold text-navy">{timeUntil(a.publish_at!)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/articles/${a.id}`} className="block text-[17px] leading-snug font-extrabold text-ink hover:text-brand">
                        {a.headline}
                      </Link>
                      <p className="mt-1 text-sm text-muted">
                        <span className="font-bold text-body">{(a.section && labels.get(a.section)) || 'No category'}</span> · {a.author_name}
                        {a.placement === 'main' ? ' · will lead the front page' : a.placement === 'headline' ? ' · will join the headline news' : ''}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="navy"
                          size="sm"
                          loading={busy === `now-${a.id}`}
                          disabled={busy !== null}
                          onClick={() => change(a, { status: 'published' }, 'now', 'Published. It is live on the site feed.')}
                          icon={<Send className="h-4 w-4" aria-hidden="true" />}
                        >
                          Publish now
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => {
                            setEditing(a);
                            setWhen(toLocalInput(a.publish_at));
                            setWhenError(undefined);
                          }}
                          icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
                        >
                          Reschedule
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          loading={busy === `draft-${a.id}`}
                          disabled={busy !== null}
                          onClick={() => change(a, { status: 'draft' }, 'draft', 'Unscheduled. It is back in drafts.')}
                          icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
                        >
                          Unschedule
                        </Button>
                        <Link to={`/articles/${a.id}`} className={buttonClass('ghost', 'sm')}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => busy === null && setEditing(null)}
        title="Reschedule this story"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button onClick={saveTime} loading={busy !== null}>
              Save new time
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[15.5px] leading-snug font-bold text-ink">{editing?.headline}</p>
        <TextInput
          label="Date and time"
          type="datetime-local"
          min={toLocalInput(new Date().toISOString())}
          value={when}
          onChange={(e) => {
            setWhen(e.target.value);
            setWhenError(undefined);
          }}
          error={whenError}
          hint="In your own time zone."
        />
      </Dialog>
    </>
  );
}
