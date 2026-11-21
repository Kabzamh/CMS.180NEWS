import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, CircleCheck, Eye, FileText, Newspaper, RefreshCw, Send, TrendingUp, Zap } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useMember } from '../contexts/AuthContext';
import { useLoad } from '../hooks/useLoad';
import { canEdit, type Article, type ArticleStatus, type DashboardData, type TrafficSnapshot, type TrendingStory } from '../lib/types';
import { fmtShort, fmtTime, timeAgo, timeUntil } from '../lib/format';
import { DUE_TONE, dueLabel } from '../lib/desk';
import { Button, Card, CardHead, ErrorState, PageHeader, Pill, STATUS_DOT, Skeleton, StatusBadge, buttonClass, cx, inputClass, useToast } from '../components/ui';

const REFRESH_MS = 30000;
const fmtNum = (n: number) => n.toLocaleString('en-ZA');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const STAGES: { key: ArticleStatus; label: string; hint: string }[] = [
  { key: 'draft', label: 'Drafts', hint: 'Being written' },
  { key: 'review', label: 'In review', hint: 'With the editors' },
  { key: 'scheduled', label: 'Scheduled', hint: 'Queued to go live' },
  { key: 'published', label: 'Published', hint: 'Live on the site' },
  { key: 'hidden', label: 'Hidden', hint: 'Off the site' },
];

const ACTIVITY_DOT: Record<string, string> = {
  published: 'bg-live-deep',
  scheduled: 'bg-navy',
  rescheduled: 'bg-navy',
  submitted: 'bg-warn',
  hidden: 'bg-brand',
  deleted: 'bg-brand',
};

const MORE_LINK = 'inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap text-navy hover:underline';

/* ------------------------------------------------------------ small pieces */

function PulseDot({ tone, pulse }: { tone: string; pulse: boolean }) {
  return (
    <span aria-hidden="true" className="relative flex h-2.5 w-2.5 shrink-0">
      {pulse && <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden', tone)} />}
      <span className={cx('relative inline-flex h-2.5 w-2.5 rounded-full', tone)} />
    </span>
  );
}

/** Shows how fresh the numbers are. Ticks on its own so the page does not re-render every few seconds. */
function LiveStatus({ fetchedAt, failed }: { fetchedAt: number | null; failed: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const seconds = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null;
  const age =
    seconds === null ? 'connecting' : seconds < 10 ? 'just now' : seconds < 60 ? `${Math.round(seconds / 10) * 10} seconds ago` : `${Math.floor(seconds / 60)} min ago`;

  return (
    <span className="inline-flex h-10 items-center gap-2.5 border border-line-strong bg-paper px-3 text-sm whitespace-nowrap">
      <PulseDot tone={failed ? 'bg-warn' : 'bg-live'} pulse={!failed} />
      <span className={cx('font-black tracking-[0.06em] uppercase', failed ? 'text-warn-deep' : 'text-live-deep')}>{failed ? 'Not refreshing' : 'Live'}</span>
      <span className="text-muted">{seconds === null ? age : `Updated ${age}`}</span>
    </span>
  );
}

function PanelRows({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3.5 p-5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cx('h-4', i % 3 === 0 ? 'w-4/5' : i % 3 === 1 ? 'w-3/5' : 'w-2/3')} />
      ))}
    </div>
  );
}

function PanelEmpty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="px-5 py-8 text-center">
      <div className="mx-auto flex h-7 w-7 items-center justify-center text-navy">{icon}</div>
      <p className="mt-2 font-extrabold text-ink">{title}</p>
      <p className="mx-auto mt-0.5 max-w-sm text-[15px] leading-snug text-muted">{children}</p>
    </div>
  );
}

function Kpi({
  to,
  href,
  label,
  value,
  loading,
  icon,
  rule,
  children,
}: {
  to?: string;
  href?: string;
  label: string;
  value: number | null;
  loading: boolean;
  icon: ReactNode;
  rule: string;
  children: ReactNode;
}) {
  const className = 'group relative block h-full border border-line bg-paper p-4 transition-colors hover:border-ink sm:p-5';
  const inner = (
    <>
      <span aria-hidden="true" className={cx('absolute -inset-x-px -top-px h-1', rule)} />
      <div className="flex items-start justify-between gap-2">
        <p className="min-h-8 text-[12px] leading-4 font-black tracking-[0.06em] text-body uppercase sm:min-h-0 sm:text-[13px]">{label}</p>
        <span aria-hidden="true" className="hidden text-muted sm:block">
          {icon}
        </span>
      </div>
      {loading || value === null ? (
        <Skeleton className="mt-3 h-10 w-16" />
      ) : (
        <p className="mt-1.5 text-[38px] leading-none font-black tracking-tight text-ink tabular-nums sm:text-[42px]">{fmtNum(value)}</p>
      )}
      <div className="mt-2 text-sm leading-snug text-muted">{children}</div>
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {inner}
    </Link>
  ) : (
    <a href={href} className={className}>
      {inner}
    </a>
  );
}

/** Reads so far today against the same stretch of yesterday. Wording and an arrow carry the meaning, not colour alone. */
function Delta({ now, before }: { now: number; before: number }) {
  if (now === 0 && before === 0) return <>No reads recorded yet</>;
  if (before === 0) return <>None by this time yesterday</>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <>Level with this time yesterday</>;
  const up = pct > 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <>
      <span className={cx('font-bold whitespace-nowrap', up ? 'text-live-deep' : 'text-brand')}>
        <Arrow className="mr-0.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />
        {Math.abs(pct)}% {up ? 'up' : 'down'}
      </span>{' '}
      on this time yesterday
    </>
  );
}

/* ----------------------------------------------------------------- panels */

function Pipeline({ counts }: { counts: DashboardData['counts'] }) {
  const summary = STAGES.map((s) => `${s.label} ${counts[s.key]}`).join(', ');
  return (
    <Card>
      <CardHead
        title="Content pipeline"
        note="Every story by where it stands"
        action={
          <Link to="/articles" className={MORE_LINK}>
            All articles <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />
      <div className="px-5 pt-5 pb-1 lg:pb-0">
        <div role="img" aria-label={`Stories by status: ${summary}.`} className="flex h-3 gap-0.5 bg-wash">
          {STAGES.filter((s) => counts[s.key] > 0).map((s) => (
            <span key={s.key} className={STATUS_DOT[s.key]} style={{ flexGrow: counts[s.key], flexBasis: 0, minWidth: 6 }} />
          ))}
        </div>
      </div>
      <ul className="grid divide-y divide-line lg:grid-cols-5 lg:divide-x lg:divide-y-0">
        {STAGES.map((s) => (
          <li key={s.key} className="min-w-0">
            <Link to={`/articles?status=${s.key}`} className="group flex items-center justify-between gap-3 px-5 py-3 hover:bg-wash lg:block lg:px-4 lg:py-4 xl:px-5">
              <span className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className={cx('h-2.5 w-2.5 shrink-0', STATUS_DOT[s.key])} />
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold text-ink group-hover:text-brand">{s.label}</span>
                  <span className="block text-[13px] text-muted lg:hidden">{s.hint}</span>
                </span>
              </span>
              <span className="text-[26px] leading-none font-black text-ink tabular-nums lg:mt-2.5 lg:block lg:text-[30px]">{fmtNum(counts[s.key])}</span>
              <span className="hidden text-[13px] text-muted lg:mt-1 lg:block">{s.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BreakingPanel({ data, editor, onChanged }: { data: DashboardData; editor: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const { lead, headlines, crawl } = data;
  const [draft, setDraft] = useState(crawl.message);
  const [dirty, setDirty] = useState(false);
  const [lineError, setLineError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'send' | 'clear' | null>(null);
  const onAir = Boolean(crawl.message) && crawl.enabled;

  useEffect(() => {
    if (!dirty) setDraft(crawl.message);
  }, [crawl.message, dirty]);

  const save = async (message: string, kind: 'send' | 'clear') => {
    setSaving(kind);
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: { key: 'crawl', value: { enabled: kind === 'send' ? true : crawl.enabled, speed: crawl.speed, message } },
      });
      setDirty(false);
      setLineError(null);
      toast(kind === 'send' ? 'Sent. Your line runs first in the headline crawl.' : 'Breaking line cleared.');
      await onChanged();
    } catch (err) {
      const detail = err instanceof ApiError && err.fields ? Object.values(err.fields)[0] : null;
      setLineError(detail ?? errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message) return setLineError('Write the line first.');
    save(message, 'send');
  };

  return (
    <Card className="border-t-4 border-t-brand">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <PulseDot tone="bg-brand" pulse={onAir} />
          <h2 className="text-sm font-black tracking-[0.06em] text-brand uppercase">Breaking news</h2>
        </div>
        <p className="text-sm text-muted">What leads the site right now</p>
      </div>

      <div className="p-5">
        {lead ? (
          <Link to={`/articles/${lead.id}`} className="group flex gap-4">
            {lead.image_url && <img src={lead.image_url} alt="" className="h-[84px] w-28 shrink-0 bg-wash object-cover sm:h-[104px] sm:w-40" />}
            <span className="min-w-0">
              <Pill className="bg-brand text-white">Main headline</Pill>
              <span className="mt-1.5 block text-[19px] leading-tight font-extrabold tracking-tight text-ink group-hover:text-brand sm:text-[21px]">{lead.headline}</span>
              <span className="mt-1 block text-sm text-muted">
                By {lead.author_name} · published {timeAgo(lead.publish_at)}
              </span>
            </span>
          </Link>
        ) : (
          <p className="text-[15px] leading-snug text-muted">
            No story is set as the main headline. Open a published story and choose Main headline under Category and front page.
          </p>
        )}

        {headlines.length > 0 && (
          <div className="mt-4 border-t border-line pt-3.5">
            <p className="text-[12px] font-black tracking-[0.08em] text-muted uppercase">Headline news</p>
            <ul className="mt-2 space-y-2">
              {headlines.map((story) => (
                <li key={story.id} className="flex items-start gap-2.5">
                  <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 bg-ink" />
                  <span className="min-w-0">
                    <Link to={`/articles/${story.id}`} className="text-[15px] leading-snug font-bold text-ink hover:text-brand">
                      {story.headline}
                    </Link>
                    <span className="text-[13px] whitespace-nowrap text-muted"> · {timeAgo(story.publish_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-line bg-wash p-5">
        {editor ? (
          <form onSubmit={send} noValidate>
            <label htmlFor="breaking-line" className="mb-1.5 block text-sm font-bold text-ink">
              Breaking line for the headline crawl
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="breaking-line"
                maxLength={140}
                autoComplete="off"
                placeholder="For example: Results expected at 18:00"
                value={draft}
                disabled={saving !== null}
                aria-invalid={lineError ? true : undefined}
                aria-describedby="breaking-line-help"
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDirty(true);
                  setLineError(null);
                }}
                className={cx(inputClass, lineError && 'border-brand')}
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 sm:flex-none" loading={saving === 'send'} disabled={saving !== null} icon={<Zap className="h-4 w-4" aria-hidden="true" />}>
                  Send to crawl
                </Button>
                {crawl.message && (
                  <Button
                    variant="outline"
                    loading={saving === 'clear'}
                    disabled={saving !== null}
                    onClick={() => {
                      setDraft('');
                      save('', 'clear');
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <p id="breaking-line-help" role={lineError ? 'alert' : undefined} className={cx('mt-2 text-[13.5px] leading-snug', lineError ? 'font-bold text-brand' : 'text-muted')}>
              {lineError ? (
                lineError
              ) : onAir ? (
                <>
                  <span className="font-bold text-live-deep">On the crawl now:</span> “{crawl.message}”
                </>
              ) : crawl.message ? (
                <>
                  <span className="font-bold text-warn-deep">Saved, but the crawl is switched off.</span> Send it again to switch the crawl on.
                </>
              ) : (
                'Runs first in the moving line of headlines across the top of the site. Sending it switches the crawl on.'
              )}
            </p>
          </form>
        ) : (
          <p className="text-[15px] leading-snug text-body">
            <span className="font-bold text-ink">Breaking line: </span>
            {onAir ? `“${crawl.message}”` : 'none running. Editors can put a line at the front of the headline crawl.'}
          </p>
        )}
      </div>
    </Card>
  );
}

function TrafficPanel({ traffic, editor }: { traffic: TrafficSnapshot | null; editor: boolean }) {
  const hourly = traffic?.hourly ?? [];
  const peak = Math.max(0, ...hourly.map((h) => h.count));
  const dayTotal = hourly.reduce((sum, h) => sum + h.count, 0);
  const nothingYet = traffic !== null && traffic.week === 0;

  return (
    <Card className="scroll-mt-20">
      <div id="traffic" className="scroll-mt-20">
        <CardHead title="Traffic snapshot" note="Story reads reported by the 180news site" />
      </div>
      {traffic === null ? (
        <p role="alert" className="px-5 py-6 text-[15px] font-semibold text-brand">
          The read counts could not be loaded. The rest of the dashboard is up to date.
        </p>
      ) : (
        <div className="p-5">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-[42px] leading-none font-black tracking-tight text-ink tabular-nums">{fmtNum(traffic.today)}</p>
              <p className="mt-1 text-sm font-bold text-ink">{plural(traffic.today, 'read today', 'reads today')}</p>
              <p className="mt-1 text-sm leading-snug text-muted">
                <Delta now={traffic.today} before={traffic.yesterdaySameTime} />
              </p>
            </div>
            <dl className="shrink-0 space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">Yesterday by now</dt>
                <dd className="font-extrabold text-ink tabular-nums">{fmtNum(traffic.yesterdaySameTime)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">Last 7 days</dt>
                <dd className="font-extrabold text-ink tabular-nums">{fmtNum(traffic.week)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">Busiest hour</dt>
                <dd className="font-extrabold text-ink tabular-nums">{fmtNum(peak)}</dd>
              </div>
            </dl>
          </div>

          <p className="mt-5 text-[12px] font-black tracking-[0.08em] text-muted uppercase">Reads per hour, last 24 hours</p>
          <div
            role="img"
            aria-label={`Reads per hour over the last 24 hours: ${fmtNum(dayTotal)} in total, ${fmtNum(peak)} in the busiest hour.`}
            className="mt-2 flex h-28 items-end gap-[3px] border-b border-line-strong"
          >
            {hourly.map((h) => (
              <div key={h.t} title={`${fmtTime(h.t)}: ${fmtNum(h.count)} ${plural(h.count, 'read', 'reads')}`} className="group flex h-full min-w-0 flex-1 items-end">
                <div
                  className={cx('w-full transition-colors', h.count ? 'bg-navy group-hover:bg-brand' : 'bg-line-strong')}
                  style={{ height: h.count ? `${Math.max(5, (h.count / peak) * 100)}%` : 2 }}
                />
              </div>
            ))}
          </div>
          {hourly.length === 24 && (
            <div aria-hidden="true" className="mt-1.5 flex justify-between text-[12px] font-semibold text-muted tabular-nums">
              <span>{fmtTime(hourly[0].t)}</span>
              <span>{fmtTime(hourly[12].t)}</span>
              <span>Now</span>
            </div>
          )}

          {nothingYet && (
            <p className="mt-4 border-l-4 border-navy bg-navy-tint px-3.5 py-2.5 text-sm leading-snug text-body">
              <span className="font-bold text-ink">No reads have been reported yet.</span> A read is counted each time the 180news site tells the newsroom a story was opened.
              {editor && (
                <>
                  {' '}
                  That starts once the site is connected, under{' '}
                  <Link to="/settings" className="font-bold text-navy underline">
                    Settings
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          {traffic.sampled && <p className="mt-3 text-[13px] text-muted">The chart and the trending list use the most recent 5 000 reads.</p>}
        </div>
      )}
    </Card>
  );
}

function TrendingPanel({ trending, labels }: { trending: TrendingStory[]; labels: Map<string, string> }) {
  const top = Math.max(1, ...trending.map((t) => t.reads));
  return (
    <Card>
      <CardHead title="Trending stories" note="Most read in the last 24 hours" />
      {trending.length === 0 ? (
        <PanelEmpty icon={<TrendingUp className="h-7 w-7" aria-hidden="true" />} title="Nothing is trending yet">
          Stories are ranked here by reads once the site starts reporting them.
        </PanelEmpty>
      ) : (
        <ol className="divide-y divide-line">
          {trending.map((story, index) => (
            <li key={story.id} className="flex gap-4 px-5 py-3.5">
              <span aria-hidden="true" className="w-6 shrink-0 text-[26px] leading-none font-black text-brand tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link to={`/articles/${story.id}`} className="block text-[15.5px] leading-snug font-bold text-ink hover:text-brand">
                  {story.headline}
                </Link>
                <p className="mt-0.5 text-sm text-muted">
                  <span className="font-extrabold text-ink tabular-nums">{fmtNum(story.reads)}</span> {plural(story.reads, 'read', 'reads')}
                  {story.section && labels.get(story.section) ? ` · ${labels.get(story.section)}` : ''}
                </p>
                <div className="mt-2 h-1.5 bg-wash">
                  <div className="h-full bg-navy" style={{ width: `${Math.max(4, (story.reads / top) * 100)}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------- page */

export default function Dashboard() {
  const member = useMember();
  const editor = canEdit(member);
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api<DashboardData>(`/api/dashboard?tz=${new Date().getTimezoneOffset()}`), []);

  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    document.title = 'Dashboard · 180news Newsroom CMS';
  }, []);

  useEffect(() => {
    if (data) setFetchedAt(Date.now());
  }, [data]);

  // Keeps the desk current: refreshes every 30 seconds while the tab is in view, and again when it comes back into view.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') reload(true);
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const refreshNow = async () => {
    setRefreshing(true);
    await reload(true);
    setRefreshing(false);
  };

  const publish = async (article: Article) => {
    setBusyId(article.id);
    try {
      await api('/api/articles', { method: 'PUT', body: { id: article.id, status: 'published' } });
      toast('Published. It is live on the site feed.');
      await reload(true);
    } catch (err) {
      const detail = err instanceof ApiError && err.fields ? Object.values(err.fields)[0] : null;
      toast(detail ? `Could not publish yet. ${detail}` : errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const clock = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
  const firstName = member.name.split(' ')[0];

  const first = loading && !data;
  const labels = new Map((data?.bySection ?? []).map((s) => [s.slug, s.label]));
  const maxSection = data ? Math.max(1, ...data.bySection.map((s) => s.count)) : 1;

  return (
    <>
      <PageHeader
        eyebrow={`${today} · ${clock}`}
        title={`${greeting}, ${firstName}`}
        description="The newsroom at a glance. It refreshes on its own every 30 seconds."
        actions={
          <>
            <LiveStatus fetchedAt={fetchedAt} failed={Boolean(error)} />
            <Button variant="outline" className="h-10" loading={refreshing} onClick={refreshNow} icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
              Refresh
            </Button>
          </>
        }
      />

      {error && !data ? (
        <ErrorState message={error} onRetry={() => reload()} />
      ) : (
        <div className="space-y-6">
          {data && editor && !data.siteLink?.sites?.length && (
            <div className="flex flex-col gap-3 border border-l-4 border-line border-l-brand bg-paper px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[15px] leading-snug text-body">
                <span className="font-extrabold text-ink">The 180news site is not connected yet.</span> Stories published here will not appear on it until one line is added to the site.
              </p>
              <Link to="/settings" className={buttonClass('navy', 'sm')}>
                Connect the site
              </Link>
            </div>
          )}

          {error && data && (
            <p role="alert" className="border-l-4 border-warn bg-warn-tint px-4 py-2.5 text-[15px] font-semibold text-ink">
              The last refresh did not go through, so these figures may be a little old. {error}
            </p>
          )}

          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <li>
              <Kpi to="/articles" label="Total articles" value={data?.counts.total ?? null} loading={first} rule="bg-ink" icon={<Newspaper className="h-[18px] w-[18px]" />}>
                {data ? `${fmtNum(data.counts.published)} live on the site` : '\u00a0'}
              </Kpi>
            </li>
            <li>
              <Kpi to="/articles?status=draft" label="Drafts" value={data?.counts.draft ?? null} loading={first} rule={STATUS_DOT.draft} icon={<FileText className="h-[18px] w-[18px]" />}>
                {data ? `${fmtNum(data.counts.review)} more in review` : '\u00a0'}
              </Kpi>
            </li>
            <li>
              <Kpi
                to="/articles?status=published"
                label="Published today"
                value={data?.publishedToday ?? null}
                loading={first}
                rule={STATUS_DOT.published}
                icon={<Send className="h-[18px] w-[18px]" />}
              >
                {data ? `${fmtNum(data.publishedWeek)} in the last 7 days` : '\u00a0'}
              </Kpi>
            </li>
            <li>
              <Kpi href="#traffic" label="Reads today" value={data ? (data.traffic?.today ?? 0) : null} loading={first} rule="bg-navy" icon={<Eye className="h-[18px] w-[18px]" />}>
                {data ? data.traffic ? <Delta now={data.traffic.today} before={data.traffic.yesterdaySameTime} /> : 'Read counts unavailable' : '\u00a0'}
              </Kpi>
            </li>
          </ul>

          {first || !data ? (
            <Card>
              <CardHead title="Content pipeline" note="Every story by where it stands" />
              <PanelRows rows={3} />
            </Card>
          ) : (
            <Pipeline counts={data.counts} />
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            {first || !data ? (
              <>
                <Card className="border-t-4 border-t-brand">
                  <CardHead title="Breaking news" />
                  <PanelRows rows={5} />
                </Card>
                <Card>
                  <CardHead title="Traffic snapshot" />
                  <PanelRows rows={5} />
                </Card>
              </>
            ) : (
              <>
                <BreakingPanel data={data} editor={editor} onChanged={() => reload(true)} />
                <TrafficPanel traffic={data.traffic} editor={editor} />
              </>
            )}
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHead
                title="Awaiting review"
                note="Reporters have requested approval"
                action={
                  <Link to="/articles?status=review" className={MORE_LINK}>
                    See all <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                }
              />
              {first || !data ? (
                <PanelRows />
              ) : data.review.length === 0 ? (
                <PanelEmpty icon={<CircleCheck className="h-7 w-7" aria-hidden="true" />} title="The review queue is clear">
                  Stories that writers submit are listed here for an editor to read.
                </PanelEmpty>
              ) : (
                <ul className="divide-y divide-line">
                  {data.review.map((a) => (
                    <li key={a.id} className="flex flex-col gap-2.5 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0 border-l-[3px] border-warn pl-3">
                        <Link to={`/articles/${a.id}`} className="block text-[15.5px] leading-snug font-bold text-ink hover:text-brand">
                          {a.headline}
                        </Link>
                        <p className="mt-0.5 text-sm text-muted">
                          By {a.author_name}
                          {a.section && labels.get(a.section) ? ` · ${labels.get(a.section)}` : ''} · edited {timeAgo(a.updated_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2 pl-[15px] sm:pl-0">
                        <Link to={`/articles/${a.id}`} className={buttonClass('outline', 'sm')}>
                          Read
                        </Link>
                        {editor && (
                          <Button variant="navy" size="sm" loading={busyId === a.id} disabled={busyId !== null} onClick={() => publish(a)}>
                            Publish
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHead
                title="Scheduled stories"
                note="Next to go live on their own"
                action={
                  editor ? (
                    <Link to="/scheduled" className={MORE_LINK}>
                      All scheduled <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : undefined
                }
              />
              {first || !data ? (
                <PanelRows />
              ) : data.upcoming.length === 0 ? (
                <PanelEmpty icon={<CalendarClock className="h-7 w-7" aria-hidden="true" />} title="Nothing is scheduled">
                  {editor ? 'Open a story and choose a date and time under When to publish.' : 'Editors schedule stories once they have been reviewed.'}
                </PanelEmpty>
              ) : (
                <ul className="divide-y divide-line">
                  {data.upcoming.map((a) => (
                    <li key={a.id} className="flex items-start gap-4 px-5 py-3.5">
                      <div className="w-[100px] shrink-0 border-l-[3px] border-navy pl-3">
                        <p className="text-[15px] leading-tight font-extrabold text-navy">{timeUntil(a.publish_at!)}</p>
                        <p className="mt-0.5 text-[13px] text-muted">{fmtShort(a.publish_at)}</p>
                      </div>
                      <div className="min-w-0">
                        <Link to={`/articles/${a.id}`} className="block text-[15.5px] leading-snug font-bold text-ink hover:text-brand">
                          {a.headline}
                        </Link>
                        <p className="mt-0.5 text-sm text-muted">
                          By {a.author_name}
                          {a.placement === 'main' ? ' · will lead the front page' : a.placement === 'headline' ? ' · joins the headline news' : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardHead
              title="Deadlines"
              note={editor ? 'Stories that are due and not published yet, soonest first' : 'Your stories that are due, soonest first'}
              action={
                <Link to="/assignments" className={MORE_LINK}>
                  Assignments <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
            {first || !data ? (
              <PanelRows />
            ) : (data.deadlines ?? []).length === 0 ? (
              <PanelEmpty icon={<CalendarClock className="h-7 w-7" aria-hidden="true" />} title="No deadlines coming up">
                {editor ? 'Give a story a reporter and a deadline under Assignments, and it is listed here.' : 'Stories assigned to you with a deadline are listed here.'}
              </PanelEmpty>
            ) : (
              <ul className="divide-y divide-line">
                {(data.deadlines ?? []).map((d) => {
                  const due = dueLabel(d.deadline!);
                  return (
                    <li key={d.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <Link to={`/articles/${d.id}`} className="block text-[15.5px] leading-snug font-bold break-words text-ink hover:text-brand">
                          {d.headline}
                        </Link>
                        <p className="mt-0.5 text-sm text-muted">{d.assigned_name || d.author_name || 'Not assigned'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className={cx('text-sm font-bold whitespace-nowrap', DUE_TONE[due.tone])}>{due.text}</span>
                        <StatusBadge status={d.status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {!editor && data && (
            <Card>
              <CardHead
                title="Your work in progress"
                note="Your drafts and stories with the editors"
                action={
                  <Link to={`/articles?author=${member.id}`} className={MORE_LINK}>
                    See all <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                }
              />
              {data.mine.length === 0 ? (
                <PanelEmpty icon={<FileText className="h-7 w-7" aria-hidden="true" />} title="You have nothing in progress">
                  Start a new article and it will be listed here.
                </PanelEmpty>
              ) : (
                <ul className="divide-y divide-line">
                  {data.mine.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                      <div className="min-w-0">
                        <Link to={`/articles/${a.id}`} className="block text-[15.5px] leading-snug font-bold text-ink hover:text-brand">
                          {a.headline}
                        </Link>
                        <p className="mt-0.5 text-sm text-muted">Edited {timeAgo(a.updated_at)}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              {first || !data ? (
                <Card>
                  <CardHead title="Trending stories" />
                  <PanelRows rows={4} />
                </Card>
              ) : (
                <TrendingPanel trending={data.trending} labels={labels} />
              )}

              <Card>
                <CardHead title="Published by category" />
                {first || !data ? (
                  <PanelRows rows={5} />
                ) : (
                  <ul className="space-y-3 p-5">
                    {data.bySection.map((s) => (
                      <li key={s.slug}>
                        <div className="flex items-baseline justify-between gap-3 text-[15px]">
                          <Link to={`/articles?section=${s.slug}`} className="min-w-0 truncate font-bold text-ink hover:text-brand">
                            {s.label}
                            {!s.enabled && <span className="font-semibold text-muted"> (switched off)</span>}
                          </Link>
                          <span className="font-extrabold text-ink tabular-nums">{s.count}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 bg-wash">
                          <div className={cx('h-full', s.enabled ? 'bg-brand' : 'bg-off')} style={{ width: s.count ? `${Math.max(3, (s.count / maxSection) * 100)}%` : 0 }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card>
              <CardHead title="Recent editorial activity" note="What the team has been doing" />
              {first || !data ? (
                <PanelRows rows={6} />
              ) : data.activity.length === 0 ? (
                <p className="px-5 py-6 text-[15px] text-muted">Nothing yet. Saves, publishes and changes to the site will be listed here.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {data.activity.map((item) => (
                    <li key={item.id} className="flex gap-3 px-5 py-3">
                      <span aria-hidden="true" className={cx('mt-[7px] h-2.5 w-2.5 shrink-0', ACTIVITY_DOT[item.action] ?? 'bg-off')} />
                      <div className="min-w-0">
                        {item.entity_type === 'article' && item.entity_id && item.action !== 'deleted' ? (
                          <Link to={`/articles/${item.entity_id}`} className="block text-[15px] leading-snug text-body hover:text-brand">
                            {item.summary}
                          </Link>
                        ) : (
                          <p className="text-[15px] leading-snug text-body">{item.summary}</p>
                        )}
                        <p className="mt-0.5 text-[13px] text-muted">{timeAgo(item.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
