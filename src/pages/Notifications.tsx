import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CheckCheck } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Badge, Spinner, ErrorBox, Toast, Empty, fmtDate } from '../components/ui';

interface Note {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  email_to: string;
  email_status: string;
  created_at: string;
}

export default function NotificationsPage() {
  const list = useApi<Note[]>(() => api('/api/notifications'), []);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Notifications · 180news Newsroom CMS';
  }, []);

  const markAll = async () => {
    setBusy(true);
    try {
      await api('/api/notifications', { method: 'PUT', body: { action: 'read_all' } });
      setToast('All marked as read.');
      window.dispatchEvent(new Event('notifications-changed'));
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const markOne = async (n: Note) => {
    try {
      await api('/api/notifications', { method: 'PUT', body: { id: n.id, read: true } });
      window.dispatchEvent(new Event('notifications-changed'));
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
      setTimeout(() => setToast(null), 3000);
    }
  };

  const items = list.data || [];

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Notifications"
        description="Email-style alerts for publish, review, schedule and comments. Queued to your notification email."
        actions={
          <Button variant="outline" loading={busy} icon={<CheckCheck className="h-4 w-4" />} onClick={markAll}>
            Mark all read
          </Button>
        }
      />
      <Card>
        {list.loading ? (
          <Spinner label="Loading notifications" />
        ) : list.error ? (
          <ErrorBox message={list.error} onRetry={() => list.reload()} />
        ) : items.length === 0 ? (
          <Empty icon={<Mail className="h-8 w-8" />} title="No notifications yet">
            Alerts appear when stories are published, sent for review, scheduled, or when readers comment.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={`px-5 py-4 ${n.read ? 'bg-paper' : 'bg-navy-tint/40'}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={n.read ? 'wash' : 'navy'}>{n.kind}</Badge>
                      <Badge tone={n.email_status === 'queued' ? 'review' : 'published'}>
                        email {n.email_status || 'queued'}
                      </Badge>
                      <span className="text-sm text-muted">{fmtDate(n.created_at)}</span>
                    </div>
                    <p className="font-extrabold text-ink">{n.title}</p>
                    {n.body && <p className="mt-1 text-[15px] text-body">{n.body}</p>}
                    {n.email_to && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                        <Mail className="h-3.5 w-3.5" /> To {n.email_to}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {n.link && (
                      <Link to={n.link}>
                        <Button size="sm" variant="outline" onClick={() => markOne(n)}>
                          Open
                        </Button>
                      </Link>
                    )}
                    {!n.read && (
                      <Button size="sm" variant="navy" onClick={() => markOne(n)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {toast && <Toast message={toast} />}
    </>
  );
}
