import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useMember } from '../contexts/AuthContext';
import { useLoad } from '../hooks/useLoad';
import { DESK } from '../lib/desk';
import { canEdit } from '../lib/types';
import { Button, Card, ErrorState, PageHeader, buttonClass, cx } from '../components/ui';

interface Item {
  id: number;
  headline: string;
  kind: 'scheduled' | 'published' | 'deadline';
  at: string;
  who: string;
  mine?: boolean;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KIND = {
  scheduled: { label: 'Scheduled', verb: 'Goes live', chip: 'bg-navy text-white', dot: 'bg-navy' },
  published: { label: 'Published', verb: 'Published', chip: 'bg-live-tint text-live-deep', dot: 'bg-live-deep' },
  deadline: { label: 'Deadline', verb: 'Due', chip: 'bg-warn-tint text-warn-deep', dot: 'bg-warn' },
} as const;
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
const longDay = (d: Date) => d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });

/** The weeks, Monday to Sunday, that cover a month. */
function weeksOf(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const cells = Math.ceil((last.getDate() + ((first.getDay() + 6) % 7)) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function Entry({ item, late }: { item: Item; late: boolean }) {
  const kind = KIND[item.kind];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="w-12 shrink-0 text-[15px] font-extrabold text-ink tabular-nums">{clock(item.at)}</span>
      <span className="min-w-0">
        <Link to={`/articles/${item.id}`} className="block text-[15px] leading-snug font-bold break-words text-ink hover:text-brand">
          {item.headline}
        </Link>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
          <span className={cx('inline-flex h-5 items-center px-1.5 text-[11px] font-extrabold tracking-[0.04em] uppercase', late ? 'bg-brand-tint text-brand' : kind.chip)}>{late ? 'Overdue' : kind.label}</span>
          {item.who && <span className="min-w-0 truncate">{item.who}</span>}
        </span>
      </span>
    </li>
  );
}

export default function Calendar() {
  const member = useMember();
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [picked, setPicked] = useState(keyOf(today));
  const days = weeksOf(month.y, month.m);
  const from = days[0];
  const to = new Date(days[days.length - 1].getFullYear(), days[days.length - 1].getMonth(), days[days.length - 1].getDate() + 1);
  const data = useLoad(() => api<{ items: Item[] }>(`${DESK}&view=calendar&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`), [month.y, month.m]);

  useEffect(() => {
    document.title = 'Calendar · 180news Newsroom CMS';
  }, []);

  const byDay = new Map<string, Item[]>();
  for (const item of data.data?.items ?? []) {
    const key = keyOf(new Date(item.at));
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }
  const isLate = (item: Item) => item.kind === 'deadline' && new Date(item.at).getTime() < Date.now();
  const move = (by: number) => {
    const next = new Date(month.y, month.m + by, 1);
    setMonth({ y: next.getFullYear(), m: next.getMonth() });
    setPicked(keyOf(next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth() ? today : next));
  };
  const title = new Date(month.y, month.m, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const pickedDate = days.find((d) => keyOf(d) === picked) ?? null;
  const pickedItems = byDay.get(picked) ?? [];
  const busyDays = days.filter((d) => d.getMonth() === month.m && byDay.has(keyOf(d)));

  return (
    <>
      <PageHeader
        eyebrow="Newsroom"
        title="Calendar"
        description="What is scheduled to go live, what was published and what is due, day by day."
        actions={
          canEdit(member) ? (
            <Link to="/scheduled" className={buttonClass('outline', 'md', 'h-10')}>
              Manage scheduled posts
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" aria-label="The month before" onClick={() => move(-1)} icon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />} />
          <Button variant="outline" size="sm" aria-label="The month after" onClick={() => move(1)} icon={<ChevronRight className="h-4 w-4" aria-hidden="true" />} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMonth({ y: today.getFullYear(), m: today.getMonth() });
              setPicked(keyOf(today));
            }}
          >
            Today
          </Button>
        </div>
        <h2 aria-live="polite" className="text-[22px] leading-none font-extrabold tracking-tight text-ink">
          {title}
        </h2>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-body sm:ml-auto" aria-label="What the colours mean">
          {(['scheduled', 'published', 'deadline'] as const).map((kind) => (
            <li key={kind} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cx('h-2.5 w-2.5', KIND[kind].dot)} />
              {KIND[kind].label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 bg-brand" />
            Overdue
          </li>
        </ul>
      </div>

      {data.error && !data.data ? (
        <ErrorState message={data.error} onRetry={() => data.reload()} />
      ) : (
        <div className={cx('grid items-start gap-5 transition-opacity lg:grid-cols-[minmax(0,1fr)_320px]', data.loading && 'opacity-60')}>
          {/* The month as a grid, on screens wide enough for one. */}
          <Card className="hidden md:block">
            <div className="grid grid-cols-7 border-b border-line bg-wash text-center text-[12px] font-black tracking-[0.06em] text-muted uppercase">
              {DAYS.map((day) => (
                <div key={day} className="py-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                const key = keyOf(day);
                const items = byDay.get(key) ?? [];
                const inMonth = day.getMonth() === month.m;
                const isToday = key === keyOf(today);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={picked === key}
                    aria-label={`${longDay(day)}, ${items.length ? `${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : 'nothing'}`}
                    onClick={() => setPicked(key)}
                    className={cx(
                      'relative min-h-[104px] min-w-0 cursor-pointer border-line p-1.5 text-left align-top hover:bg-wash focus-visible:z-10',
                      index % 7 !== 6 && 'border-r',
                      index < days.length - 7 && 'border-b',
                      !inMonth && 'bg-wash/60',
                      picked === key && 'bg-navy-tint hover:bg-navy-tint',
                    )}
                  >
                    <span className={cx('inline-flex h-6 min-w-6 items-center justify-center px-1 text-[13px] font-extrabold tabular-nums', isToday ? 'bg-brand text-white' : inMonth ? 'text-ink' : 'text-muted')}>{day.getDate()}</span>
                    <span className="mt-1 block space-y-1">
                      {items.slice(0, 3).map((item) => (
                        <span key={`${item.kind}-${item.id}`} className={cx('block truncate px-1.5 py-0.5 text-[12px] leading-tight font-bold', isLate(item) ? 'bg-brand-tint text-brand' : KIND[item.kind].chip)}>
                          <span className="tabular-nums">{clock(item.at)}</span> {item.headline}
                        </span>
                      ))}
                      {items.length > 3 && <span className="block px-1.5 text-[12px] font-bold text-muted">and {items.length - 3} more</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* The chosen day. Beside the grid on a wide screen. */}
          <Card className="hidden md:block">
            <div className="border-b border-line px-5 py-3.5">
              <h3 className="text-sm font-black tracking-[0.06em] text-navy uppercase">{pickedDate ? longDay(pickedDate) : 'Choose a day'}</h3>
            </div>
            {pickedItems.length === 0 ? (
              <p className="px-5 py-6 text-[15px] text-muted">Nothing is scheduled, published or due on this day.</p>
            ) : (
              <ul className="divide-y divide-line px-5">
                {pickedItems.map((item) => (
                  <Entry key={`${item.kind}-${item.id}`} item={item} late={isLate(item)} />
                ))}
              </ul>
            )}
          </Card>

          {/* On a phone: the days of the month that have something, as a list. */}
          <div className="space-y-4 md:hidden">
            {busyDays.length === 0 ? (
              <Card className="px-5 py-8 text-center text-[15px] text-muted">Nothing is scheduled, published or due in {title}.</Card>
            ) : (
              busyDays.map((day) => (
                <Card key={keyOf(day)}>
                  <h3 className={cx('border-b border-line px-4 py-2.5 text-sm font-black tracking-[0.06em] uppercase', keyOf(day) === keyOf(today) ? 'text-brand' : 'text-navy')}>
                    {longDay(day)}
                    {keyOf(day) === keyOf(today) ? ' · today' : ''}
                  </h3>
                  <ul className="divide-y divide-line px-4">
                    {(byDay.get(keyOf(day)) ?? []).map((item) => (
                      <Entry key={`${item.kind}-${item.id}`} item={item} late={isLate(item)} />
                    ))}
                  </ul>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
      <p className="mt-4 text-sm text-muted">Times are shown in this device’s time zone. To schedule a story, open it and choose a date and time under Publishing.</p>
    </>
  );
}
