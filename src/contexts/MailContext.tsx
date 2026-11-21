import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { MAIL, chime, deviceAlerts, mailPath, type MailSummary, type SyncResult } from '../lib/mail';
import { useToast } from '../components/ui';
import { useMember } from './AuthContext';

interface MailState extends MailSummary {
  /** Unread mail plus unread alerts. */
  total: number;
  refresh: () => Promise<void>;
  /** Goes up each time mail is brought in from the linked mailbox. */
  imports: number;
  /** Checks the linked 180news.co.za mailbox for new mail. Without "now" it does so at most every two minutes. */
  checkMailbox: (now?: boolean) => Promise<SyncResult | null>;
}

const EMPTY: MailSummary = { email: null, counts: { inbox: 0, alerts: 0 }, recent: [] };
const MailContext = createContext<MailState>({ ...EMPTY, total: 0, refresh: async () => {}, imports: 0, checkMailbox: async () => null });
const CHECK_MAILBOX_MS = 120000;
const POLL_MS = 30000;

/**
 * Keeps the unread counts fresh for the bell, the menu and the Mail page, and announces new mail:
 * a note on screen, and on this device a browser notification and a sound if they are switched on.
 */
export function MailProvider({ children }: { children: ReactNode }) {
  const member = useMember();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [summary, setSummary] = useState<MailSummary>(EMPTY);
  const seenKey = `180news-cms:mail-seen:${member.id}`;
  const tick = useRef(0);

  const announce = useCallback(
    (next: MailSummary) => {
      const newest = Math.max(0, ...next.recent.map((r) => r.id));
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(seenKey);
      } catch {
        return;
      }
      const seen = Number(stored);
      const remember = (id: number) => {
        try {
          localStorage.setItem(seenKey, String(id));
        } catch {
          /* it will be announced again next time */
        }
      };
      // The first visit on this device: nothing is "new" yet.
      if (stored === null || !Number.isFinite(seen)) return remember(newest);
      const fresh = next.recent.filter((r) => r.id > seen);
      if (!fresh.length) return;
      remember(newest);

      const one = fresh.length === 1 ? fresh[0] : null;
      const title = one ? (one.kind === 'alert' ? one.subject : `New message from ${one.from}`) : `${fresh.length} new in Mail`;
      const text = one ? (one.kind === 'alert' ? 'A new alert in Mail.' : one.subject) : fresh.map((r) => r.subject).join(' · ');
      toast(one ? (one.kind === 'alert' ? `Alert: ${one.subject}` : `New message from ${one.from}: ${one.subject}`) : `${fresh.length} new messages and alerts in Mail.`);

      const device = deviceAlerts();
      if (device.sound) chime();
      if (device.desktop && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const note = new Notification(title, { body: text, icon: '/favicon.svg', tag: 'newsroom-mail' });
          note.onclick = () => {
            window.focus();
            navigate(one ? mailPath(one) : '/mail');
            note.close();
          };
        } catch {
          /* this browser only allows notifications from a service worker */
        }
      }
    },
    [navigate, seenKey, toast],
  );

  const load = useCallback(async () => {
    try {
      const next = await api<MailSummary>(`${MAIL}&counts=1`);
      setSummary(next);
      announce(next);
      return next;
    } catch {
      return null; // the next check will try again
    }
  }, [announce]);

  const [imports, setImports] = useState(0);
  const checking = useRef(false);
  const checkKey = `180news-cms:mail-check:${member.id}`;

  const checkMailbox = useCallback(
    async (now = false): Promise<SyncResult | null> => {
      if (checking.current) return null;
      try {
        // One check every two minutes, shared by every tab this person has open.
        if (!now && Date.now() - Number(localStorage.getItem(checkKey) || 0) < CHECK_MAILBOX_MS) return null;
        localStorage.setItem(checkKey, String(Date.now()));
      } catch {
        if (!now) return null;
      }
      checking.current = true;
      let result: SyncResult | null = null;
      let brought = 0;
      try {
        // A busy mailbox is brought in a few messages at a time.
        for (let round = 0; round < 8; round += 1) {
          result = await api<SyncResult>(MAIL, { method: 'POST', body: { action: 'sync', force: now || round > 0 } });
          brought += result.imported;
          if (!result.more) break;
        }
      } catch {
        /* the next check will try again */
      } finally {
        checking.current = false;
      }
      if (brought > 0) {
        setImports((n) => n + 1);
        await load();
      }
      return result ? { ...result, imported: brought } : null;
    },
    [checkKey, load],
  );

  const refresh = useCallback(async () => {
    const next = await load();
    if (next?.email && document.visibilityState === 'visible') void checkMailbox();
  }, [load, checkMailbox]);

  useEffect(() => {
    refresh();
    // Every 30 seconds while the page is in view, every minute when it is in the background.
    const timer = window.setInterval(() => {
      tick.current += 1;
      if (document.visibilityState === 'visible' || tick.current % 2 === 0) refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const total = summary.counts.inbox + summary.counts.alerts;

  // The number of unread messages leads the tab title, so it shows when the CMS is in the background.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const base = document.title.replace(/^\(\d+\+?\) /, '');
      document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${base}` : base;
    }, 80);
    return () => window.clearTimeout(timer);
  }, [total, location.pathname]);

  return <MailContext.Provider value={{ ...summary, total, refresh, imports, checkMailbox }}>{children}</MailContext.Provider>;
}

export const useMail = () => useContext(MailContext);
