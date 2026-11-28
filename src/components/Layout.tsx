import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  CalendarClock,
  Zap,
  Tags,
  FolderOpen,
  Users,
  Image as ImageIcon,
  MessageSquare,
  Home,
  Megaphone,
  BarChart3,
  Settings,
  UserCog,
  User,
  ExternalLink,
  LogOut,
  Menu,
  X,
  Bell,
  Mail,
  PenLine,
  RefreshCw,
  PanelRightOpen,
  PanelRightClose,
  StickyNote,
  UserCheck,
  CalendarDays,
  AlarmClock,
  Mic,
  Workflow,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, cn } from './ui';
import { api } from '../lib/api';
import Logo from './Logo';

const nav = [
  {
    group: 'Newsroom',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/articles', label: 'Articles', icon: FileText },
      { to: '/scheduled', label: 'Scheduled posts', icon: CalendarClock },
      { to: '/breaking', label: 'Breaking news', icon: Zap },
      { to: '/comments', label: 'Comments', icon: MessageSquare },
      { to: '/media', label: 'Media library', icon: ImageIcon },
      { to: '/interviews', label: 'Interview Recorder', icon: Mic },
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/mail', label: 'Mail', icon: Mail },
      { to: '/notes', label: 'Notes', icon: StickyNote },
      { to: '/reminders', label: 'Reminders', icon: AlarmClock },
      { to: '/assignments', label: 'Assignments', icon: UserCheck },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/automations', label: 'Automations', icon: Workflow, roles: ['owner', 'editor'] as const },
    ],
  },
  {
    group: 'Organise',
    items: [
      { to: '/categories', label: 'Categories', icon: FolderOpen, roles: ['owner', 'editor'] as const },
      { to: '/tags', label: 'Tags', icon: Tags, roles: ['owner', 'editor'] as const },
      { to: '/authors', label: 'Authors', icon: Users, roles: ['owner', 'editor'] as const },
    ],
  },
  {
    group: 'Site',
    items: [
      { to: '/homepage', label: 'Homepage sections', icon: Home, roles: ['owner', 'editor'] as const },
      { to: '/ads', label: 'Ads control', icon: Megaphone, roles: ['owner', 'editor'] as const },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings, roles: ['owner', 'editor'] as const },
    ],
  },
  {
    group: 'People',
    items: [
      { to: '/users', label: 'Users and roles', icon: UserCog, roles: ['owner'] as const },
      { to: '/account', label: 'Your account', icon: User },
    ],
  },
];

/** Desktop live preview of /site — forced wide viewport so it never looks mobile */
function LiveNewsPreview({ reloadKey }: { reloadKey: number }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const deskWidth = 1440;

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || deskWidth / 2;
      setScale(Math.min(1, w / deskWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={shellRef} className="relative h-full min-h-0 w-full overflow-hidden bg-wash">
      <iframe
        key={reloadKey}
        title="Live 180news app"
        src="/site"
        className="absolute top-0 left-0 border-0 bg-paper"
        style={{
          width: deskWidth,
          height: scale > 0 ? `${100 / scale}%` : '200%',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
}

export default function Layout() {
  const { member, signOut } = useAuth();
  const connected = import.meta.env.VITE_NEWSROOM_SYNC_PREVIEW === 'true';
  const availableRoutes = new Set(['/', '/articles', '/homepage', '/ads']);
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);
  const [mailUnread, setMailUnread] = useState(0);
  const [previewOn, setPreviewOn] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [justSynced, setJustSynced] = useState(false);

  const refreshPreview = useCallback(() => setPreviewKey((k) => k + 1), []);

  // Refresh live pane when desk routes that affect the public site change
  useEffect(() => {
    const paths = ['/articles', '/breaking', '/homepage', '/ads', '/settings', '/categories', '/authors', '/media'];
    if (paths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) {
      const t = window.setTimeout(refreshPreview, 600);
      return () => window.clearTimeout(t);
    }
  }, [location.pathname, location.search, refreshPreview]);

  // Sync with the news app the instant any save touches content it reads —
  // articles, sections, tags, ads, media, comments, authors or settings —
  // regardless of which desk page you're on, not just on navigation.
  useEffect(() => {
    let debounce: number | null = null;
    let flashTimer: number | null = null;
    const onSiteChanged = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        refreshPreview();
        setLastSyncedAt(new Date());
        setJustSynced(true);
        if (flashTimer) window.clearTimeout(flashTimer);
        flashTimer = window.setTimeout(() => setJustSynced(false), 2200);
      }, 350);
    };
    window.addEventListener('site-changed', onSiteChanged);
    return () => {
      window.removeEventListener('site-changed', onSiteChanged);
      if (debounce) window.clearTimeout(debounce);
      if (flashTimer) window.clearTimeout(flashTimer);
    };
  }, [refreshPreview]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api<{ pending: number }>('/api/comments?counts=1')
        .then((d) => alive && setPending(d.pending || 0))
        .catch(() => {});
      api<{ unread: number }>('/api/notifications?counts=1')
        .then((d) => alive && setUnread(d.unread || 0))
        .catch(() => {});
      api<{ unread: number }>('/api/mail?counts=1')
        .then((d) => alive && setMailUnread(d.unread || 0))
        .catch(() => {});
    };
    load();
    const t = window.setInterval(load, 60000);
    window.addEventListener('comments-changed', load);
    window.addEventListener('notifications-changed', load);
    window.addEventListener('mail-changed', load);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener('comments-changed', load);
      window.removeEventListener('notifications-changed', load);
      window.removeEventListener('mail-changed', load);
    };
  }, []);

  const role = member?.role || 'writer';
  const alertTotal = pending + unread + mailUnread;

  const badgeFor = (to: string) => {
    if (to === '/comments' && pending > 0)
      return <span className="rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">{pending}</span>;
    if (to === '/notifications' && unread > 0)
      return <span className="rounded-full bg-navy px-1.5 py-0.5 text-[11px] font-bold text-white">{unread}</span>;
    if (to === '/mail' && mailUnread > 0)
      return <span className="rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">{mailUnread}</span>;
    return null;
  };

  const Sidebar = (
    <aside className="glass flex h-full w-[280px] flex-col rounded-none border-r border-line/60">
      <div className="flex h-16 shrink-0 items-center border-b border-line/60 px-4">
        <Link to="/" className="inline-block" onClick={() => setOpen(false)} aria-label="180news Newsroom CMS, dashboard">
          <Logo />
        </Link>
      </div>

      <div className="mx-2.5 mt-2.5 flex items-center gap-2.5 rounded-xl border border-white/40 bg-navy-tint/50 px-3 py-2.5 backdrop-blur-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-[13px] font-extrabold text-white">
          {(member?.name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-extrabold text-ink">{member?.name}</p>
          <p className="truncate text-xs capitalize text-muted">{role} · {member?.email}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Main">
        {nav.map((g) => {
          const items = g.items.filter(
            (it) => !('roles' in it) || !it.roles || (it.roles as readonly string[]).includes(role)
          );
          if (!items.length) return null;
          return (
            <div key={g.group} className="mb-4">
              <p className="mb-1 px-2.5 text-[10px] font-black tracking-[0.12em] text-off uppercase">{g.group}</p>
              <ul className="space-y-0.5">
                {items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.to}>
                      <NavLink
                        to={it.to}
                        end={'end' in it ? !!it.end : false}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14.5px] font-semibold transition-colors',
                            isActive
                              ? 'bg-brand text-white shadow-sm'
                              : 'text-body hover:bg-wash hover:text-ink'
                          )
                        }
                      >
                        <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 leading-snug">{it.label}</span>
                        {connected && !availableRoutes.has(it.to) ? <span className="text-xs opacity-70">Unavailable</span> : badgeFor(it.to)}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-line/60 p-2.5">
        {connected ? (
          <a href="https://www.180news.co.za/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[14.5px] font-semibold text-navy hover:bg-navy-tint">
            <ExternalLink className="h-[17px] w-[17px]" /> Open live news site
          </a>
        ) : (
          <Link to="/site" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[14.5px] font-semibold text-navy hover:bg-navy-tint">
            <ExternalLink className="h-[17px] w-[17px]" /> Open news app
          </Link>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14.5px] font-semibold text-body hover:bg-wash hover:text-ink"
        >
          <LogOut className="h-[17px] w-[17px]" /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden">
      {/* CMS column — half screen when preview is on */}
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-col border-r border-line/60',
          previewOn ? 'w-full lg:w-1/2' : 'w-full'
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="hidden shrink-0 lg:flex lg:w-[260px] xl:w-[240px]">{Sidebar}</div>
          {open && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <button type="button" className="absolute inset-0 bg-navy-deep/70" aria-label="Close menu" onClick={() => setOpen(false)} />
              <div className="relative z-10 h-full w-[280px] max-w-[88vw] shadow-xl">{Sidebar}</div>
            </div>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Mobile header */}
            <header className="glass sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 rounded-none border-x-0 border-t-0 px-3 lg:hidden">
              <button type="button" className="cursor-pointer p-2 text-ink" onClick={() => setOpen(true)} aria-label="Open menu">
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <Logo markOnly />
              <div className="ml-auto flex items-center gap-1.5">
                {alertTotal > 0 && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">{alertTotal}</span>
                )}
                <Link to="/articles/new" className="inline-flex h-9 items-center rounded-lg bg-brand px-3 text-sm font-bold text-white shadow-sm">
                  Write
                </Link>
              </div>
            </header>

            {/* Desktop top bar */}
            <header className="glass sticky top-0 z-20 hidden h-14 shrink-0 rounded-none border-x-0 border-t-0 lg:block">
              <div className="flex h-14 items-center gap-2 px-5">
                <p className="mr-auto truncate text-sm text-muted">
                  <span className="font-bold text-ink">180news CMS</span>
                  <span className="mx-2 text-line-strong">·</span>
                  {connected ? 'Connected newsroom' : 'Edit while the live app updates beside you'}
                </p>
                {!connected && <button
                  type="button"
                  className="hidden cursor-pointer items-center gap-1.5 text-sm font-bold text-navy hover:underline lg:inline-flex"
                  onClick={() => setPreviewOn((v) => !v)}
                >
                  {previewOn ? (
                    <>
                      <PanelRightClose className="h-4 w-4" /> Hide live
                    </>
                  ) : (
                    <>
                      <PanelRightOpen className="h-4 w-4" /> Show live
                    </>
                  )}
                </button>}
                {!connected && <Button size="sm" variant="outline" className="h-8" onClick={refreshPreview} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                  Refresh live
                </Button>}
                <Link to="/articles/new">
                  <Button size="sm" className="h-8" icon={<PenLine className="h-3.5 w-3.5" />}>
                    New story
                  </Button>
                </Link>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-6">
              <div className={cn('mx-auto w-full', location.pathname === '/mail' ? 'max-w-[1600px]' : 'max-w-4xl')}>
                {import.meta.env.VITE_NEWSROOM_SYNC_PREVIEW === 'true' && (
                  <p role="status" className="mb-5 rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm font-bold text-amber-950">
                    {import.meta.env.VITE_NEWSROOM_ALLOW_WRITES === 'true'
                      ? 'Supabase connected: story, homepage and advert changes affect the connected database. Scheduled publication is disabled; other CMS features may be unavailable.'
                      : 'Supabase test preview — read-only. Publishing and other changes are disabled; the live CMS and news app are unchanged.'}
                  </p>
                )}
                {connected && !(
                  location.pathname === '/' || location.pathname === '/articles' || location.pathname.startsWith('/articles/') || location.pathname === '/homepage' || location.pathname === '/ads'
                ) ? (
                  <div className="rounded-xl border border-line bg-paper p-6">
                    <h1 className="text-xl font-extrabold text-ink">This feature is not connected yet</h1>
                    <p className="mt-2 text-sm text-muted">This page is unavailable in the connected newsroom. Stories, homepage sections and existing advert controls remain available according to your role.</p>
                  </div>
                ) : <Outlet />}
              </div>
            </main>
          </div>
        </div>
      </div>

      {/* Live news app — other half, desktop viewport (not mobile) */}
      {previewOn && (
        <section className="hidden min-h-0 w-1/2 flex-col border-l border-line/60 bg-paper lg:flex">
          <div className="glass-dark flex h-12 shrink-0 items-center gap-3 rounded-none border-x-0 border-t-0 px-4 text-white">
            <span className={cn('h-2 w-2 shrink-0 rounded-full bg-emerald-400', justSynced && 'animate-ping')} aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm font-bold">
              Live news app
              <span className="ml-2 font-medium text-white/65">
                {justSynced
                  ? 'Synced just now'
                  : lastSyncedAt
                    ? `Synced ${lastSyncedAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                    : 'Desktop preview · updates as you edit'}
              </span>
            </p>
            <button
              type="button"
              onClick={refreshPreview}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold text-white/90 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reload
            </button>
            <Link to="/site" target="_blank" className="text-sm font-bold text-brand-bright hover:underline">
              Open ↗
            </Link>
          </div>
          <div className="min-h-0 flex-1">
            <LiveNewsPreview reloadKey={previewKey} />
          </div>
        </section>
      )}
    </div>
  );
}
