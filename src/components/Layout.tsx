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
  Contact,
  RefreshCw,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, cn } from './ui';
import { api } from '../lib/api';
import Logo from './Logo';

const nav = [
  {
    group: 'Start here',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/articles/new', label: 'Write a story', icon: PenLine },
      { to: '/articles', label: 'All articles', icon: FileText },
    ],
  },
  {
    group: 'Publish',
    items: [
      { to: '/scheduled', label: 'Scheduled', icon: CalendarClock },
      { to: '/breaking', label: 'Breaking & front page', icon: Zap },
      { to: '/media', label: 'Media · YouTube & clips', icon: ImageIcon },
    ],
  },
  {
    group: 'Moderate',
    items: [
      { to: '/comments', label: 'Comments', icon: MessageSquare },
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/mail', label: 'Staff mail', icon: Mail },
    ],
  },
  {
    group: 'Library',
    items: [
      { to: '/categories', label: 'Categories', icon: FolderOpen, roles: ['owner', 'editor'] as const },
      { to: '/tags', label: 'Tags', icon: Tags, roles: ['owner', 'editor'] as const },
      { to: '/authors', label: 'Author profiles', icon: Users, roles: ['owner', 'editor'] as const },
    ],
  },
  {
    group: 'News app control',
    items: [
      { to: '/homepage', label: 'Homepage layout', icon: Home, roles: ['owner', 'editor'] as const },
      { to: '/ads', label: 'Ads & banner sizes', icon: Megaphone, roles: ['owner', 'editor'] as const },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/settings', label: 'Site settings', icon: Settings, roles: ['owner', 'editor'] as const },
      { to: '/site/staff', label: 'Staff directory', icon: Contact },
    ],
  },
  {
    group: 'People',
    items: [
      { to: '/users', label: 'Users and roles', icon: UserCog, roles: ['owner'] as const },
      { to: '/account', label: 'Your account & email', icon: User },
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
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);
  const [mailUnread, setMailUnread] = useState(0);
  const [previewOn, setPreviewOn] = useState(true);
  const [previewKey, setPreviewKey] = useState(0);

  const refreshPreview = useCallback(() => setPreviewKey((k) => k + 1), []);

  // Refresh live pane when desk routes that affect the public site change
  useEffect(() => {
    const paths = ['/articles', '/breaking', '/homepage', '/ads', '/settings', '/categories', '/authors', '/media'];
    if (paths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) {
      const t = window.setTimeout(refreshPreview, 600);
      return () => window.clearTimeout(t);
    }
  }, [location.pathname, location.search, refreshPreview]);

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
    <aside className="flex h-full w-[280px] flex-col border-r border-line bg-paper">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-4">
        <Link to="/" className="inline-block" onClick={() => setOpen(false)} aria-label="180news Newsroom CMS, dashboard">
          <Logo />
        </Link>
      </div>

      <div className="border-b border-line bg-navy-tint/50 px-4 py-3">
        <p className="truncate text-[15px] font-extrabold text-ink">{member?.name}</p>
        <p className="truncate text-sm capitalize text-muted">{role} · {member?.email}</p>
        <Link
          to="/articles/new"
          onClick={() => setOpen(false)}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 bg-brand text-sm font-bold text-white hover:bg-brand-strong"
        >
          <PenLine className="h-4 w-4" /> New story
        </Link>
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
                            'flex items-center gap-2.5 px-2.5 py-2 text-[14.5px] font-semibold transition-colors',
                            isActive
                              ? 'border-l-[3px] border-brand bg-navy-tint text-navy pl-[7px]'
                              : 'border-l-[3px] border-transparent text-body hover:bg-wash hover:text-ink'
                          )
                        }
                      >
                        <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 leading-snug">{it.label}</span>
                        {badgeFor(it.to)}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-line p-2.5">
        <Link
          to="/site"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 px-2.5 py-2 text-[14.5px] font-semibold text-navy hover:bg-navy-tint"
        >
          <ExternalLink className="h-[17px] w-[17px]" /> Open news app
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-[14.5px] font-semibold text-body hover:bg-wash hover:text-ink"
        >
          <LogOut className="h-[17px] w-[17px]" /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-wash">
      {/* CMS column — half screen when preview is on */}
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-col border-r border-line bg-wash',
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
            <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-paper/95 px-3 backdrop-blur lg:hidden">
              <button type="button" className="cursor-pointer p-2 text-ink" onClick={() => setOpen(true)} aria-label="Open menu">
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <Logo markOnly />
              <div className="ml-auto flex items-center gap-1.5">
                {alertTotal > 0 && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">{alertTotal}</span>
                )}
                <Link to="/articles/new" className="inline-flex h-9 items-center bg-brand px-3 text-sm font-bold text-white">
                  Write
                </Link>
              </div>
            </header>

            {/* Desktop top bar */}
            <header className="sticky top-0 z-20 hidden h-12 shrink-0 border-b border-line bg-paper/95 backdrop-blur lg:block">
              <div className="flex h-12 items-center gap-2 px-4">
                <p className="mr-auto truncate text-sm text-muted">
                  <span className="font-bold text-ink">CMS</span>
                  <span className="mx-2 text-line-strong">·</span>
                  Edit while the live app updates beside you
                </p>
                <button
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
                </button>
                <Button size="sm" variant="outline" className="h-8" onClick={refreshPreview} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                  Refresh live
                </Button>
                <Link to="/articles/new">
                  <Button size="sm" className="h-8" icon={<PenLine className="h-3.5 w-3.5" />}>
                    New story
                  </Button>
                </Link>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-6">
              <div className="mx-auto w-full max-w-4xl">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>

      {/* Live news app — other half, desktop viewport (not mobile) */}
      {previewOn && (
        <section className="hidden min-h-0 w-1/2 flex-col border-l border-line bg-paper lg:flex">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-navy-deep px-4 text-white">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm font-bold">
              Live news app
              <span className="ml-2 font-medium text-white/65">Desktop preview · updates as you edit</span>
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
