import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  ChartColumn,
  CircleUser,
  ExternalLink,
  FolderTree,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldAlert,
  SlidersHorizontal,
  Tags,
  UserPen,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useAuth, useMember } from '../contexts/AuthContext';
import { ROLE_LABEL, SITE_URL, initials } from '../lib/format';
import { api } from '../lib/api';
import { canEdit, type Role } from '../lib/types';
import { GlobalSearch } from './GlobalSearch';
import { Logo } from './Logo';
import { Button, ErrorState, Spinner, buttonClass, cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  roles?: Role[];
  /** Shows how many reader comments are waiting. */
  badge?: boolean;
}

const EDITORS: Role[] = ['owner', 'editor'];
const SIDEBAR_KEY = '180news-cms:sidebar-collapsed';

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Newsroom',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/articles', label: 'Articles', icon: Newspaper },
      { to: '/scheduled', label: 'Scheduled posts', icon: CalendarClock, roles: EDITORS },
      { to: '/breaking', label: 'Breaking news', icon: Zap, roles: EDITORS },
      { to: '/comments', label: 'Comments', icon: MessageSquare, roles: EDITORS, badge: true },
      { to: '/media', label: 'Media library', icon: Images },
    ],
  },
  {
    group: 'Organise',
    items: [
      { to: '/categories', label: 'Categories', icon: FolderTree, roles: EDITORS },
      { to: '/tags', label: 'Tags', icon: Tags, roles: EDITORS },
      { to: '/authors', label: 'Authors', icon: UserPen, roles: EDITORS },
    ],
  },
  {
    group: 'Site',
    items: [
      { to: '/homepage', label: 'Homepage sections', icon: LayoutTemplate, roles: EDITORS },
      { to: '/ads', label: 'Ads control', icon: Megaphone, roles: EDITORS },
      { to: '/analytics', label: 'Analytics', icon: ChartColumn, roles: EDITORS },
      { to: '/settings', label: 'Settings', icon: SlidersHorizontal, roles: EDITORS },
    ],
  },
  {
    group: 'People',
    items: [
      { to: '/users', label: 'Users and roles', icon: Users, roles: ['owner'] },
      { to: '/account', label: 'Your account', icon: CircleUser },
    ],
  },
];

const RAIL_BUTTON =
  'flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-body hover:bg-wash hover:text-ink disabled:opacity-50';

function SidebarContent({ collapsed = false, pending = 0, onNavigate }: { collapsed?: boolean; pending?: number; onNavigate?: () => void }) {
  const member = useMember();
  const { signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    try {
      await signOut();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cx('flex h-14 shrink-0 items-center border-b border-line lg:h-16', collapsed ? 'justify-center' : 'px-4')}>
        <Link to="/" onClick={onNavigate} className="inline-block" aria-label="180news Newsroom CMS, dashboard">
          <Logo markOnly={collapsed} />
        </Link>
      </div>

      <nav aria-label="Main" className={cx('min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        {NAV.map(({ group, items }, groupIndex) => {
          const visible = items.filter((item) => !item.roles || item.roles.includes(member.role));
          if (!visible.length) return null;
          return (
            <div key={group} className="mt-4 first:mt-0">
              {collapsed ? (
                groupIndex > 0 && <div aria-hidden="true" className="mx-2 mb-3 h-px bg-line" />
              ) : (
                <p className="px-3 pb-1.5 text-[11px] font-black tracking-[0.14em] whitespace-nowrap text-muted uppercase">{group}</p>
              )}
              <ul className="space-y-0.5">
                {visible.map(({ to, label, icon: Icon, end, badge }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      onClick={onNavigate}
                      title={collapsed ? label : undefined}
                      aria-label={collapsed ? (badge && pending > 0 ? `${label}, ${pending} waiting` : label) : undefined}
                      className={({ isActive }) =>
                        cx(
                          'relative flex h-9 items-center border-l-[3px] text-[15px] whitespace-nowrap transition-colors',
                          collapsed ? 'justify-center pr-[3px]' : 'gap-3 px-3',
                          isActive ? 'border-brand bg-navy-tint font-extrabold text-navy' : 'border-transparent font-semibold text-body hover:bg-wash hover:text-ink',
                        )
                      }
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                      {badge &&
                        pending > 0 &&
                        (collapsed ? (
                          <span aria-hidden="true" className="absolute top-1.5 right-2.5 h-2 w-2 rounded-full bg-brand" />
                        ) : (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-extrabold text-white tabular-nums">
                            {pending > 99 ? '99+' : pending}
                            <span className="sr-only"> waiting</span>
                          </span>
                        ))}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {collapsed ? (
        <div className="flex flex-col items-center gap-1 border-t border-line py-3">
          <a href={SITE_URL} target="_blank" rel="noreferrer" aria-label="View the 180news site" title="View the 180news site" className={RAIL_BUTTON}>
            <ExternalLink className="h-[18px] w-[18px]" aria-hidden="true" />
          </a>
          <Link
            to="/account"
            aria-label={`Your account: ${member.name}, ${ROLE_LABEL[member.role]}`}
            title={`${member.name} · ${ROLE_LABEL[member.role]}`}
            className="flex h-10 w-10 items-center justify-center bg-navy text-sm font-black text-white hover:bg-navy-deep"
          >
            {initials(member.name)}
          </Link>
          <button type="button" aria-label="Sign out" title="Sign out" disabled={leaving} onClick={leave} className={RAIL_BUTTON}>
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="border-t border-line px-4 py-4">
          <a
            href={SITE_URL}
            target="_blank"
            rel="noreferrer"
            className="mb-3 flex items-center gap-2 text-sm font-semibold whitespace-nowrap text-body hover:text-brand"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            View the 180news site
          </a>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center bg-navy text-sm font-black text-white">
              {initials(member.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-ink">{member.name}</p>
              <p className="truncate text-[13px] text-muted">{ROLE_LABEL[member.role]}</p>
            </div>
            <button type="button" aria-label="Sign out" title="Sign out" disabled={leaving} onClick={leave} className={RAIL_BUTTON}>
              <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const BAR_BUTTON = 'h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-body hover:bg-wash hover:text-ink';

function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const member = useMember();
  const editor = canEdit(member);
  const [pending, setPending] = useState(0);

  // How many reader comments are waiting, for the badge in the menu.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const load = () =>
      api<{ pending: number }>('/api/comments?counts=1')
        .then((r) => {
          if (!cancelled) setPending(r.pending);
        })
        .catch(() => {});
    load();
    window.addEventListener('comments-changed', load);
    return () => {
      cancelled = true;
      window.removeEventListener('comments-changed', load);
    };
  }, [editor, location.pathname]);

  const toggleSidebar = () =>
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* the choice just is not remembered */
      }
      return next;
    });

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <div
      className={cx(
        'min-h-dvh bg-wash lg:grid lg:transition-[grid-template-columns] lg:duration-200',
        collapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[264px_minmax(0,1fr)]',
      )}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:bg-paper focus:px-4 focus:py-2 focus:font-bold focus:text-ink">
        Skip to content
      </a>

      <aside id="sidebar" className="sticky top-0 hidden h-dvh overflow-hidden border-r border-line bg-paper lg:block">
        <SidebarContent collapsed={collapsed} pending={pending} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-paper px-3 sm:gap-3 sm:px-6 lg:h-16 lg:px-10">
          <button type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className={cx(BAR_BUTTON, 'flex lg:hidden')}>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
          <Link to="/" className="shrink-0 lg:hidden" aria-label="180news Newsroom CMS, dashboard">
            <Logo markOnly />
          </Link>
          <button
            type="button"
            aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            aria-expanded={!collapsed}
            aria-controls="sidebar"
            onClick={toggleSidebar}
            className={cx(BAR_BUTTON, '-ml-2 hidden lg:flex')}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
          </button>

          <GlobalSearch />

          <Link to="/articles/new" aria-label="New article" className={buttonClass('primary', 'md', 'ml-auto h-10 px-3 sm:px-4')}>
            <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="hidden sm:inline">New article</span>
          </Link>
        </header>

        <main id="main" className="min-w-0">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-ink/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute inset-y-0 left-0 w-[min(300px,86vw)] bg-paper shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
            >
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="absolute top-2 right-2 z-10 flex h-10 w-10 cursor-pointer items-center justify-center text-body hover:bg-wash hover:text-ink"
              >
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
              <SidebarContent pending={pending} onNavigate={() => setMenuOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-wash px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export function NoAccessScreen() {
  const { email, signOut } = useAuth();
  return (
    <FullScreen>
      <div className="border border-line border-t-4 border-t-brand bg-paper p-6 text-center">
        <ShieldAlert className="mx-auto h-9 w-9 text-brand" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink">This account is not on the team</h1>
        <p className="mt-2 text-[15.5px] leading-relaxed text-body">
          You are signed in as <span className="font-bold break-all text-ink">{email}</span>, but that address has not been added to the 180news newsroom. Ask the
          owner to add you under Users and roles, then sign in again.
        </p>
        <Button className="mt-5" variant="navy" onClick={() => signOut()} icon={<LogOut className="h-4 w-4" aria-hidden="true" />}>
          Sign out
        </Button>
      </div>
    </FullScreen>
  );
}

/** Gate for everything behind the sign-in. */
export function ProtectedShell() {
  const { status, error, retry } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <FullScreen>
        <Spinner label="Opening the newsroom" />
      </FullScreen>
    );
  }
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (status === 'noAccess') return <NoAccessScreen />;
  if (status === 'error') {
    return (
      <FullScreen>
        <ErrorState message={error ?? 'The newsroom could not be opened.'} onRetry={retry} />
      </FullScreen>
    );
  }
  return <Shell />;
}

/** Shows the page only to the listed roles. */
export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const member = useMember();
  if (roles.includes(member.role)) return <>{children}</>;
  return (
    <div className="border border-line border-t-4 border-t-brand bg-paper p-8 text-center">
      <ShieldAlert className="mx-auto h-9 w-9 text-brand" aria-hidden="true" />
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink">No access to this page</h1>
      <p className="mx-auto mt-2 max-w-md text-[15.5px] leading-relaxed text-body">
        Your role is {ROLE_LABEL[member.role]}. This page is for {roles.map((r) => ROLE_LABEL[r].toLowerCase() + 's').join(' and ')}.
      </p>
      <Link to="/" className={buttonClass('navy', 'md', 'mt-5')}>
        Back to the dashboard
      </Link>
    </div>
  );
}
