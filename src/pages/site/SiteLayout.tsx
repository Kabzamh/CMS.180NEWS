import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import Logo from '../../components/Logo';
import { trackPageVisit } from '../../components/AdBanner';

export default function SiteLayout() {
  const location = useLocation();
  const sections = useApi<Array<{ slug: string; label: string }>>(() => api('/api/public?resource=sections'), []);
  const settings = useApi<any>(() => api('/api/public?resource=settings'), []);
  const contact = settings.data?.contact || {};

  useEffect(() => {
    trackPageVisit(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-screen bg-paper text-body">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/site" aria-label="180news — home" className="shrink-0">
            <Logo markOnly className="!h-11 md:!h-[52px]" />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden text-sm font-bold text-navy hover:underline sm:inline">
              Newsroom
            </Link>
            <Link
              to="/articles/new"
              className="inline-flex h-10 items-center bg-brand px-3 text-sm font-bold text-white hover:bg-brand-strong"
            >
              Publish
            </Link>
          </div>
        </div>
        <nav className="border-t border-line bg-navy-deep" aria-label="Sections">
          <div className="mx-auto flex max-w-6xl gap-0 overflow-x-auto px-2 sm:px-4">
            <NavLink
              to="/site"
              end
              className={({ isActive }) =>
                `shrink-0 px-3 py-2.5 text-[13px] font-bold whitespace-nowrap ${isActive ? 'bg-brand text-white' : 'text-white/85 hover:bg-white/10'}`
              }
            >
              Top stories
            </NavLink>
            <NavLink
              to="/site/staff"
              className={({ isActive }) =>
                `shrink-0 px-3 py-2.5 text-[13px] font-bold whitespace-nowrap ${isActive ? 'bg-brand text-white' : 'text-white/85 hover:bg-white/10'}`
              }
            >
              Staff
            </NavLink>
            {(sections.data || []).map((s) => (
              <NavLink
                key={s.slug}
                to={`/site/section/${s.slug}`}
                className={({ isActive }) =>
                  `shrink-0 px-3 py-2.5 text-[13px] font-bold whitespace-nowrap capitalize ${isActive ? 'bg-brand text-white' : 'text-white/85 hover:bg-white/10'}`
                }
              >
                {s.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="mt-12 border-t border-line bg-navy-deep text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <div>
            <p className="text-xs font-black tracking-[0.12em] text-brand-bright uppercase">180news</p>
            <p className="mt-3 text-[15px] leading-relaxed text-white/80">
              Live headlines from South African and international newsrooms — plus stories your desk publishes.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide">Contact</h2>
            <address className="mt-3 not-italic text-[15px] text-white/80">
              {contact.email && <p><a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a></p>}
              {contact.phone && <p className="mt-1">{contact.phone}</p>}
              {contact.ads_phone && <p className="mt-1 text-white/60">Ads: {contact.ads_phone}</p>}
            </address>
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide">Desk</h2>
            <ul className="mt-3 space-y-1 text-[15px]">
              <li><Link to="/site/staff" className="text-white/80 hover:underline">Staff directory</Link></li>
              <li><Link to="/" className="text-white/80 hover:underline">CMS dashboard</Link></li>
              <li><Link to="/articles" className="text-white/80 hover:underline">Articles</Link></li>
              <li><Link to="/mail" className="text-white/80 hover:underline">Staff mail</Link></li>
              <li><Link to="/ads" className="text-white/80 hover:underline">Ads control</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-4 text-center text-sm text-white/55">
          © {new Date().getFullYear()} 180news. Headlines and images belong to their respective publishers.
        </div>
      </footer>
    </div>
  );
}
