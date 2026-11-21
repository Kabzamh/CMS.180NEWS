import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, BellRing, Mail } from 'lucide-react';
import { useMail } from '../contexts/MailContext';
import { mailPath } from '../lib/mail';
import { timeAgo } from '../lib/format';
import { cx } from './ui';

/** The bell in the top bar: how much is unread, and the newest few to jump to. */
export function MailBell() {
  const mail = useMail();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = mail.total > 0 ? `Mail and alerts, ${mail.total} unread` : 'Mail and alerts, nothing unread';

  return (
    <div ref={wrap} className="relative ml-auto shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          if (!open) mail.refresh();
          setOpen((value) => !value);
        }}
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center text-body hover:bg-wash hover:text-ink"
      >
        {mail.total > 0 ? <BellRing className="h-5 w-5" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
        {mail.total > 0 && (
          <span aria-hidden="true" className="absolute top-0.5 right-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10.5px] leading-none font-extrabold text-white tabular-nums">
            {mail.total > 99 ? '99+' : mail.total}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[58px] z-40 border border-line-strong bg-paper shadow-xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-1.5 sm:w-[360px]">
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-sm font-black tracking-[0.06em] text-navy uppercase">Unread</h2>
            <p className="text-sm text-muted tabular-nums">
              {mail.counts.inbox} mail · {mail.counts.alerts} {mail.counts.alerts === 1 ? 'alert' : 'alerts'}
            </p>
          </div>
          {mail.recent.length === 0 ? (
            <p className="px-4 py-6 text-center text-[15px] text-muted">You are up to date. Nothing unread.</p>
          ) : (
            <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
              {mail.recent.map((item) => (
                <li key={item.id}>
                  <Link to={mailPath(item)} className="flex items-start gap-3 px-4 py-3 hover:bg-wash">
                    <span aria-hidden="true" className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center', item.kind === 'alert' ? 'bg-brand-tint text-brand' : 'bg-navy-tint text-navy')}>
                      {item.kind === 'alert' ? <BellRing className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[15px] leading-snug font-bold text-ink">{item.subject}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">
                        {item.kind === 'alert' ? 'Alert' : item.from} · {timeAgo(item.at)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/mail" className="block border-t border-line bg-wash px-4 py-2.5 text-center text-sm font-bold text-navy hover:underline">
            Open Mail
          </Link>
        </div>
      )}
    </div>
  );
}
