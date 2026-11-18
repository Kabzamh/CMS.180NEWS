import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, PenLine, CheckCircle2, Eye, Clock, Youtube, Megaphone, BarChart3,
  Mail, LayoutTemplate, Users, Image as ImageIcon, RefreshCw,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Card, CardHead, Spinner, ErrorBox, Badge, Button, fmtDate, fmtNum, Toast } from '../components/ui';
import type { Article } from '../lib/types';

interface DashData {
  counts: Record<string, number>;
  publishedToday: number;
  publishedWeek: number;
  lead: Article | null;
  headlines: Article[];
  crawl: { enabled: boolean; speed: string; message: string };
  upcoming: Article[];
  traffic: { today: number; yesterdaySameTime: number };
  recent: Article[];
}

function greetingFor(d: Date) {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDeskClock(d: Date) {
  const date = d.toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${date} · ${time}`;
}

export default function Dashboard() {
  const { member } = useAuth();
  const editor = member?.role === 'owner' || member?.role === 'editor';
  const { data, loading, error, reload } = useApi<DashData>(
    () => api(`/api/dashboard?tz=${new Date().getTimezoneOffset()}`),
    []
  );
  const [toast, setToast] = useState<string | null>(null);
  const [crawlMsg, setCrawlMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    document.title = 'Dashboard · 180news Newsroom CMS';
  }, []);

  // Live clock (minute tick) — matches cms.180news.co.za eyebrow
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-refresh desk data every 30 seconds
  useEffect(() => {
    const id = window.setInterval(() => {
      reload(true).then(() => setFetchedAt(new Date()));
    }, 30_000);
    return () => window.clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (data) setFetchedAt((prev) => prev ?? new Date());
  }, [data]);

  useEffect(() => {
    if (data?.crawl) setCrawlMsg(data.crawl.message || '');
  }, [data]);

  const manualRefresh = async () => {
    setRefreshing(true);
    try {
      await reload(true);
      setFetchedAt(new Date());
      setNow(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  const saveCrawl = async (send: boolean) => {
    setSaving(true);
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: {
          key: 'crawl',
          value: {
            enabled: send ? true : data?.crawl?.enabled ?? true,
            speed: data?.crawl?.speed || 'normal',
            message: crawlMsg,
          },
        },
      });
      setToast(send ? 'Sent. Your line runs first in the headline crawl.' : 'Breaking line cleared.');
      await reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  if (loading && !data) return <Spinner label="Loading dashboard" />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!data) return null;

  const c = data.counts;
  const delta = data.traffic.today - data.traffic.yesterdaySameTime;
  const firstName = (member?.name || 'Admin').split(' ')[0] || 'Admin';
  const greeting = greetingFor(now);

  return (
    <>
      <PageHeader
        eyebrow={formatDeskClock(now)}
        title={`${greeting}, ${firstName}`}
        description="The newsroom at a glance. It refreshes on its own every 30 seconds."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {fetchedAt && (
              <span className="hidden text-sm text-muted sm:inline" title={fetchedAt.toISOString()}>
                Updated {fetchedAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
            )}
            <Button
              variant="outline"
              className="h-10"
              loading={refreshing}
              onClick={manualRefresh}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </Button>
            <Link to="/site" target="_blank">
              <Button variant="outline" className="h-10">View news app</Button>
            </Link>
            <Link to="/articles/new">
              <Button className="h-10" icon={<PenLine className="h-4 w-4" />}>New story</Button>
            </Link>
          </div>
        }
      />

      <Card className="mb-6 border-t-4 border-t-navy">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-sm font-black tracking-[0.06em] text-navy uppercase">Quick actions</h2>
          <p className="text-sm text-muted">Everything you need, arranged by task</p>
        </div>
        <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            { to: '/articles/new', icon: PenLine, title: 'Publish a story', text: 'Draft, YouTube, video & audio' },
            { to: '/homepage', icon: LayoutTemplate, title: 'Homepage layout', text: 'Order category blocks' },
            { to: '/ads', icon: Megaphone, title: 'Ads & sizes', text: 'Banners, IAB sizes, slots' },
            { to: '/analytics', icon: BarChart3, title: 'Analytics', text: 'Reads and top stories' },
            { to: '/media', icon: ImageIcon, title: 'Media library', text: 'Images, clips, audio' },
            { to: '/mail', icon: Mail, title: 'Staff mail', text: 'Send & receive per profile' },
            { to: '/site/staff', icon: Users, title: 'Staff directory', text: 'Emails & contacts' },
            { to: '/breaking', icon: Youtube, title: 'Front page', text: 'Main headline & crawl' },
          ].map(({ to, icon: Icon, title, text }) => (
            <li key={to} className="bg-paper">
              <Link to={to} className="flex gap-3 p-4 transition-colors hover:bg-navy-tint">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-navy-tint text-navy">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-extrabold text-ink">{title}</span>
                  <span className="block text-sm text-muted">{text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <ul className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          { label: 'Total articles', value: c.total, to: '/articles', sub: `${fmtNum(c.published)} live on the site`, icon: FileText, rule: 'bg-ink' },
          { label: 'Drafts', value: c.draft, to: '/articles?status=draft', sub: `${fmtNum(c.review)} more in review`, icon: PenLine, rule: 'bg-off' },
          { label: 'Published today', value: data.publishedToday, to: '/articles?status=published', sub: `${fmtNum(data.publishedWeek)} in the last 7 days`, icon: CheckCircle2, rule: 'bg-emerald-600' },
          { label: 'Reads today', value: data.traffic.today, href: '#traffic', sub: delta === 0 ? 'Same as yesterday' : delta > 0 ? `↑ ${fmtNum(delta)} vs yesterday` : `↓ ${fmtNum(Math.abs(delta))} vs yesterday`, icon: Eye, rule: 'bg-navy' },
        ].map((s) => {
          const Icon = s.icon;
          const inner = (
            <div className="relative overflow-hidden border border-line bg-paper p-4 shadow-sm">
              <div className={`absolute top-0 left-0 h-1 w-full ${s.rule}`} />
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-muted">{s.label}</p>
                <Icon className="h-[18px] w-[18px] text-off" />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink tabular-nums">{fmtNum(s.value ?? 0)}</p>
              <p className="mt-1 text-[13px] text-muted">{s.sub}</p>
            </div>
          );
          return (
            <li key={s.label}>
              {'to' in s && s.to ? <Link to={s.to}>{inner}</Link> : <a href="#traffic">{inner}</a>}
            </li>
          );
        })}
      </ul>

      <div className="mb-6 grid items-start gap-6 lg:grid-cols-2">
        <Card className="border-t-4 border-t-brand">
          <CardHead title="Breaking news" note="Crawl line and front-page placements" />
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink">Breaking line</span>
              <input
                value={crawlMsg}
                onChange={(e) => setCrawlMsg(e.target.value)}
                maxLength={140}
                disabled={!editor}
                placeholder="For example: Results expected at 18:00"
                className="h-11 w-full border border-line-strong px-3.5 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 disabled:bg-wash"
              />
              <span className="mt-1 block text-[13px] text-muted">Runs first in the crawl, ahead of the headlines.</span>
            </label>
            {editor && (
              <div className="flex flex-wrap gap-2">
                <Button loading={saving} onClick={() => saveCrawl(true)}>
                  Send to crawl
                </Button>
                <Button variant="outline" loading={saving} onClick={() => { setCrawlMsg(''); saveCrawl(false); }}>
                  Clear
                </Button>
              </div>
            )}
            {data.lead && (
              <div className="border border-line bg-wash p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="brand">Main headline</Badge>
                </div>
                <Link to={`/articles/${data.lead.id}`} className="text-[15.5px] font-bold text-ink hover:text-brand">
                  {data.lead.headline}
                </Link>
                <p className="mt-1 text-sm text-muted">By {data.lead.author_name}</p>
              </div>
            )}
            {data.headlines.length > 0 && (
              <ul className="divide-y divide-line border border-line">
                {data.headlines.map((h) => (
                  <li key={h.id} className="px-4 py-3">
                    <Link to={`/articles/${h.id}`} className="font-bold text-ink hover:text-brand">
                      {h.headline}
                    </Link>
                    <p className="text-sm text-muted">By {h.author_name} · joins the headline news</p>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/breaking" className="inline-block text-sm font-bold text-navy hover:underline">
              Manage front-page placements →
            </Link>
          </div>
        </Card>

        <div id="traffic">
        <Card>
          <CardHead title="Traffic snapshot" note="Reads counted when a story is opened" />
          <div className="p-5">
            <p className="text-4xl font-extrabold text-navy tabular-nums">{fmtNum(data.traffic.today)}</p>
            <p className="mt-1 text-sm text-muted">reads today · {fmtNum(data.traffic.yesterdaySameTime)} by this time yesterday</p>
            <Link to="/analytics" className="mt-4 inline-block text-sm font-bold text-navy hover:underline">
              Open analytics →
            </Link>
          </div>
          <CardHead title="Coming up" note="Scheduled stories" />
          {data.upcoming.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Nothing is scheduled.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.upcoming.map((u) => (
                <li key={u.id} className="flex items-start gap-4 px-5 py-3.5">
                  <div className="w-[100px] shrink-0 border-l-[3px] border-navy pl-3">
                    <p className="text-[15px] leading-tight font-extrabold text-navy">{fmtDate(u.publish_at)}</p>
                  </div>
                  <div className="min-w-0">
                    <Link to={`/articles/${u.id}`} className="block text-[15.5px] leading-snug font-bold text-ink hover:text-brand">
                      {u.headline}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted">By {u.author_name}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </div>
      </div>

      <Card>
        <CardHead title="Content pipeline" note="Every story by where it stands" />
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
          {(['draft', 'review', 'scheduled', 'published', 'hidden'] as const).map((k) => (
            <Link key={k} to={`/articles?status=${k}`} className="bg-paper p-4 hover:bg-wash">
              <p className="text-sm font-bold capitalize text-muted">{k}</p>
              <p className="mt-1 text-2xl font-extrabold text-ink tabular-nums">{fmtNum(c[k] || 0)}</p>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHead title="Recently updated" />
        <ul className="divide-y divide-line">
          {data.recent.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Badge tone={a.status}>{a.status}</Badge>
              <Link to={`/articles/${a.id}`} className="flex-1 font-bold text-ink hover:text-brand">
                {a.headline}
              </Link>
              <span className="flex items-center gap-1 text-sm text-muted">
                <Clock className="h-3.5 w-3.5" /> {fmtDate(a.updated_at)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {toast && <Toast message={toast} />}
    </>
  );
}
