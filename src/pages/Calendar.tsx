import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { PageHeader, Card, Button, Badge, Spinner, ErrorBox } from '../components/ui';
import type { Article } from '../lib/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const scheduled = useApi<{ items: Article[] }>(() => api('/api/articles?status=scheduled'), []);
  const published = useApi<{ items: Article[] }>(() => api('/api/articles?status=published'), []);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Calendar · 180news Newsroom CMS';
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, Array<Article & { eventKind: 'scheduled' | 'published' | 'deadline' }>>();
    const push = (a: Article, kind: 'scheduled' | 'published' | 'deadline', dateIso: string | null | undefined) => {
      if (!dateIso) return;
      const key = dateIso.slice(0, 10);
      const list = map.get(key) || [];
      list.push({ ...a, eventKind: kind });
      map.set(key, list);
    };
    for (const a of scheduled.data?.items || []) push(a, 'scheduled', a.publish_at);
    for (const a of published.data?.items || []) push(a, 'published', a.publish_at);
    for (const a of [...(scheduled.data?.items || []), ...(published.data?.items || [])]) {
      if (a.due_at) push(a, 'deadline', a.due_at);
    }
    return map;
  }, [scheduled.data, published.data]);

  const first = new Date(month.y, month.m, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.y, month.m, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = first.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const todayKey = dayKey(new Date());

  const loading = scheduled.loading || published.loading;
  const error = scheduled.error || published.error;

  const KIND_DOT: Record<string, string> = {
    scheduled: 'bg-navy',
    published: 'bg-emerald-600',
    deadline: 'bg-brand',
  };
  const KIND_LABEL: Record<string, string> = {
    scheduled: 'Scheduled',
    published: 'Published',
    deadline: 'Deadline',
  };

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Calendar"
        description="Scheduled stories, publish dates and assignment deadlines in one monthly view."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setMonth((m) => (m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 }))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[150px] text-center font-extrabold text-ink">{monthLabel}</span>
            <Button size="sm" variant="outline" onClick={() => setMonth((m) => (m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 }))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        {Object.entries(KIND_LABEL).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5 font-bold text-muted">
            <span className={`h-2.5 w-2.5 rounded-full ${KIND_DOT[k]}`} /> {label}
          </span>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading calendar" />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-wash text-center text-xs font-black tracking-wide text-muted uppercase">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                const key = d ? dayKey(d) : `empty-${i}`;
                const events = d ? byDay.get(dayKey(d)) || [] : [];
                const isToday = d && dayKey(d) === todayKey;
                return (
                  <button
                    type="button"
                    key={key}
                    disabled={!d}
                    onClick={() => d && setSelectedDay(dayKey(d))}
                    className={`min-h-[84px] cursor-pointer border-b border-r border-line p-1.5 text-left align-top last:border-r-0 disabled:cursor-default ${
                      d && selectedDay === dayKey(d) ? 'bg-navy-tint/50' : d ? 'hover:bg-wash' : 'bg-wash/40'
                    }`}
                  >
                    {d && (
                      <>
                        <span className={`inline-flex h-6 w-6 items-center justify-center text-sm font-bold ${isToday ? 'rounded-full bg-brand text-white' : 'text-ink'}`}>
                          {d.getDate()}
                        </span>
                        <div className="mt-1 space-y-0.5">
                          {events.slice(0, 3).map((e, idx) => (
                            <div key={idx} className="flex items-center gap-1 truncate text-[11px] font-bold text-ink">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[e.eventKind]}`} />
                              <span className="truncate">{e.headline}</span>
                            </div>
                          ))}
                          {events.length > 3 && <p className="text-[11px] font-bold text-muted">+{events.length - 3} more</p>}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="h-fit p-5 lg:sticky lg:top-6">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
              <CalendarDays className="h-5 w-5 text-navy" />
              {selectedDay ? new Date(selectedDay).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Pick a day'}
            </h2>
            {!selectedDay ? (
              <p className="text-sm text-muted">Select a day on the calendar to see what's happening.</p>
            ) : (byDay.get(selectedDay) || []).length === 0 ? (
              <p className="text-sm text-muted">Nothing scheduled, published or due on this day.</p>
            ) : (
              <ul className="space-y-3">
                {(byDay.get(selectedDay) || []).map((e, idx) => (
                  <li key={idx} className="border border-line p-3">
                    <Badge tone={e.eventKind === 'published' ? 'published' : e.eventKind === 'deadline' ? 'hidden' : 'scheduled'}>
                      {KIND_LABEL[e.eventKind]}
                    </Badge>
                    <Link to={`/articles/${e.id}`} className="mt-1.5 block font-bold text-ink hover:text-brand">
                      {e.headline}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">{e.author_name}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
