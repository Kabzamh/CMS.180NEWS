import { useEffect, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api';
import { useLoad } from '../hooks/useLoad';
import type { AnalyticsData } from '../lib/types';
import { Card, CardHead, ErrorState, PageHeader, Skeleton, cx } from '../components/ui';

const PERIODS = [7, 30, 90];
const fmtNum = (n: number) => n.toLocaleString('en-ZA');
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function Change({ now, before, days }: { now: number; before: number; days: number }) {
  if (now === 0 && before === 0) return <>None in the {days} days before either</>;
  if (before === 0) return <>None in the {days} days before</>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <>Level with the {days} days before</>;
  const up = pct > 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <>
      <span className={cx('font-bold whitespace-nowrap', up ? 'text-live-deep' : 'text-brand')}>
        <Arrow className="mr-0.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />
        {Math.abs(pct)}% {up ? 'up' : 'down'}
      </span>{' '}
      on the {days} days before
    </>
  );
}

function Kpi({ label, value, rule, children }: { label: string; value: number | null; rule: string; children: ReactNode }) {
  return (
    <div className="relative h-full border border-line bg-paper p-4 sm:p-5">
      <span aria-hidden="true" className={cx('absolute -inset-x-px -top-px h-1', rule)} />
      <p className="min-h-8 text-[12px] leading-4 font-black tracking-[0.06em] text-body uppercase sm:min-h-0 sm:text-[13px]">{label}</p>
      {value === null ? <Skeleton className="mt-3 h-10 w-16" /> : <p className="mt-1.5 text-[38px] leading-none font-black tracking-tight text-ink tabular-nums sm:text-[42px]">{fmtNum(value)}</p>}
      <div className="mt-2 text-sm leading-snug text-muted">{children}</div>
    </div>
  );
}

function DayBars({ data, height, tone, unit }: { data: { t: string; value: number }[]; height: string; tone: string; unit: [string, string] }) {
  const peak = Math.max(0, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const mid = data[Math.floor(data.length / 2)];
  return (
    <div>
      <div
        role="img"
        aria-label={`${fmtNum(total)} ${plural(total, unit[0], unit[1])} over ${data.length} days. The busiest day had ${fmtNum(peak)}.`}
        className={cx('flex items-end border-b border-line-strong', height, data.length > 31 ? 'gap-px' : 'gap-[3px]')}
      >
        {data.map((d) => (
          <div key={d.t} title={`${fmtDay(d.t)}: ${fmtNum(d.value)} ${plural(d.value, unit[0], unit[1])}`} className="group flex h-full min-w-0 flex-1 items-end">
            <div className={cx('w-full transition-colors group-hover:bg-brand', d.value ? tone : 'bg-line-strong')} style={{ height: d.value ? `${Math.max(4, (d.value / peak) * 100)}%` : 2 }} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex justify-between text-[12px] font-semibold text-muted tabular-nums">
        <span>{fmtDay(data[0].t)}</span>
        {data.length > 7 && <span>{fmtDay(mid.t)}</span>}
        <span>Today</span>
      </div>
    </div>
  );
}

function BarRow({ label, value, top, to, meta }: { label: string; value: number; top: number; to?: string; meta?: string }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-[15px]">
        {to ? (
          <Link to={to} className="min-w-0 truncate font-bold text-ink hover:text-brand">
            {label}
          </Link>
        ) : (
          <span className="min-w-0 truncate font-bold text-ink">{label}</span>
        )}
        <span className="shrink-0 text-sm text-muted">
          {meta && <span>{meta} · </span>}
          <span className="text-[15px] font-extrabold text-ink tabular-nums">{fmtNum(value)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 bg-wash">
        <div className="h-full bg-navy" style={{ width: value ? `${Math.max(3, (value / top) * 100)}%` : 0 }} />
      </div>
    </li>
  );
}

function Rows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3.5 p-5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cx('h-4', i % 2 ? 'w-3/5' : 'w-4/5')} />
      ))}
    </div>
  );
}

export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const days = PERIODS.includes(Number(params.get('days'))) ? Number(params.get('days')) : 7;
  const { data, loading, error, reload } = useLoad(() => api<AnalyticsData>(`/api/dashboard?report=analytics&days=${days}&tz=${new Date().getTimezoneOffset()}`), [days]);

  useEffect(() => {
    document.title = 'Analytics · 180news Newsroom CMS';
  }, []);

  const fresh = data && data.days === days ? data : null;
  const totals = fresh?.totals ?? null;
  const topRead = fresh ? Math.max(1, ...fresh.topStories.map((s) => s.reads)) : 1;
  const topCategory = fresh ? Math.max(1, ...fresh.byCategory.map((c) => c.reads)) : 1;
  const categories = fresh?.byCategory.filter((c) => c.reads > 0) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Site"
        title="Analytics"
        description="How stories are being read and how much the desk is publishing."
        actions={
          <div role="group" aria-label="Period" className="flex border border-line-strong bg-paper">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={days === p}
                onClick={() => setParams(p === 7 ? {} : { days: String(p) }, { replace: true })}
                className={cx('h-10 cursor-pointer px-4 text-[15px] font-bold whitespace-nowrap transition-colors', days === p ? 'bg-ink text-white' : 'text-body hover:bg-wash')}
              >
                {p} days
              </button>
            ))}
          </div>
        }
      />

      {error && !fresh ? (
        <ErrorState message={error} onRetry={() => reload()} />
      ) : (
        <div className={cx('space-y-6 transition-opacity', loading && fresh && 'opacity-60')}>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <li>
              <Kpi label="Story reads" value={totals?.reads ?? null} rule="bg-navy">
                {totals ? <Change now={totals.reads} before={totals.prevReads} days={days} /> : '\u00a0'}
              </Kpi>
            </li>
            <li>
              <Kpi label="Stories published" value={totals?.published ?? null} rule="bg-live-deep">
                {totals ? <Change now={totals.published} before={totals.prevPublished} days={days} /> : '\u00a0'}
              </Kpi>
            </li>
            <li>
              <Kpi label="Stories read" value={totals?.storiesRead ?? null} rule="bg-ink">
                {totals ? 'Different stories opened at least once' : '\u00a0'}
              </Kpi>
            </li>
            <li>
              <Kpi label="Comments received" value={totals ? (totals.comments ?? 0) : null} rule="bg-warn">
                {totals ? (
                  totals.comments === null ? (
                    'Comment counts unavailable'
                  ) : (
                    <Link to="/comments" className="font-bold text-navy hover:underline">
                      {fmtNum(totals.pendingComments ?? 0)} waiting for moderation
                    </Link>
                  )
                ) : (
                  '\u00a0'
                )}
              </Kpi>
            </li>
          </ul>

          {fresh && fresh.totals.reads === 0 && (
            <p className="border-l-4 border-navy bg-navy-tint px-4 py-3 text-[15px] leading-snug text-body">
              <span className="font-bold text-ink">No reads were reported in this period.</span> A read is counted each time the 180news site tells the newsroom a story was opened. The link for that is under{' '}
              <Link to="/settings" className="font-bold text-navy underline">
                Settings, Content feed
              </Link>
              .
            </p>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card>
              <CardHead title="Reads per day" note={`Last ${days} days, today included`} />
              {fresh ? (
                <div className="p-5">
                  <DayBars data={fresh.daily.map((d) => ({ t: d.t, value: d.reads }))} height="h-44" tone="bg-navy" unit={['read', 'reads']} />
                </div>
              ) : (
                <Rows rows={5} />
              )}
            </Card>
            <Card>
              <CardHead title="Stories published per day" note={`Last ${days} days`} />
              {fresh ? (
                <div className="p-5">
                  <DayBars data={fresh.daily.map((d) => ({ t: d.t, value: d.published }))} height="h-44" tone="bg-live-deep" unit={['story', 'stories']} />
                </div>
              ) : (
                <Rows rows={5} />
              )}
            </Card>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card>
              <CardHead title="Most read stories" note={`Top 10 by reads in the last ${days} days`} />
              {!fresh ? (
                <Rows />
              ) : fresh.topStories.length === 0 ? (
                <p className="px-5 py-6 text-[15px] text-muted">No story has been read in this period yet.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {fresh.topStories.map((story, index) => (
                    <li key={story.id} className="flex gap-4 px-5 py-3.5">
                      <span aria-hidden="true" className="w-7 shrink-0 text-[24px] leading-none font-black text-brand tabular-nums">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/articles/${story.id}`} className="block text-[15.5px] leading-snug font-bold text-ink hover:text-brand">
                          {story.headline}
                        </Link>
                        <p className="mt-0.5 text-sm text-muted">
                          <span className="font-extrabold text-ink tabular-nums">{fmtNum(story.reads)}</span> {plural(story.reads, 'read', 'reads')} · {story.author}
                        </p>
                        <div className="mt-2 h-1.5 bg-wash">
                          <div className="h-full bg-navy" style={{ width: `${Math.max(3, (story.reads / topRead) * 100)}%` }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHead title="Reads by category" />
                {!fresh ? (
                  <Rows />
                ) : categories.length === 0 ? (
                  <p className="px-5 py-6 text-[15px] text-muted">No reads to split by category yet.</p>
                ) : (
                  <ul className="space-y-3 p-5">
                    {categories.map((c) => (
                      <BarRow key={c.slug} label={c.label} value={c.reads} top={topCategory} to={`/articles?section=${c.slug}`} />
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHead title="Authors" note="Stories published and reads in this period" />
                {!fresh ? (
                  <Rows />
                ) : fresh.byAuthor.length === 0 ? (
                  <p className="px-5 py-6 text-[15px] text-muted">Nothing was published or read in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[15px]">
                      <thead>
                        <tr className="border-b border-line text-[12px] font-black tracking-[0.06em] text-muted uppercase">
                          <th scope="col" className="px-5 py-2.5 font-black">
                            Byline
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right font-black">
                            Published
                          </th>
                          <th scope="col" className="py-2.5 pr-5 pl-3 text-right font-black">
                            Reads
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {fresh.byAuthor.map((a) => (
                          <tr key={a.name}>
                            <th scope="row" className="max-w-[220px] px-5 py-2.5 font-bold break-words text-ink">
                              {a.name}
                            </th>
                            <td className="px-3 py-2.5 text-right text-body tabular-nums">{fmtNum(a.published)}</td>
                            <td className="py-2.5 pr-5 pl-3 text-right font-extrabold text-ink tabular-nums">{fmtNum(a.reads)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {fresh?.sampled && <p className="text-[13px] text-muted">The charts and rankings use the most recent 20 000 reads in this period. The totals at the top are exact.</p>}
        </div>
      )}
    </>
  );
}
