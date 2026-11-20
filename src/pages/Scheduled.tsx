import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Spinner, ErrorBox, Toast, Empty, fmtDate } from '../components/ui';
import type { Article } from '../lib/types';

export default function ScheduledPage() {
  const list = useApi<{ items: Article[] }>(() => api('/api/articles?status=scheduled'), []);
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Scheduled · 180news Newsroom CMS';
  }, []);

  const act = async (a: Article, body: Record<string, unknown>, msg: string) => {
    setBusy(a.id);
    try {
      await api('/api/articles', { method: 'PUT', body: { id: a.id, ...body } });
      setToast(msg);
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const items = [...(list.data?.items || [])].sort(
    (a, b) => new Date(a.publish_at || 0).getTime() - new Date(b.publish_at || 0).getTime()
  );

  return (
    <>
      <PageHeader eyebrow="Desk" title="Scheduled" description="Stories waiting to go live." />
      <Card>
        {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> : !items.length ? (
          <Empty title="Nothing is scheduled" />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="w-[140px] shrink-0 border-l-[3px] border-navy pl-3">
                  <p className="text-sm font-extrabold text-navy">{fmtDate(a.publish_at)}</p>
                </div>
                <Link to={`/articles/${a.id}`} className="min-w-0 flex-1 font-bold text-ink hover:text-brand">{a.headline}</Link>
                <div className="flex gap-2">
                  <Button size="sm" variant="navy" loading={busy === a.id} onClick={() => act(a, { status: 'published', publish_at: new Date().toISOString() }, 'Published now.')}>
                    Publish now
                  </Button>
                  <Button size="sm" variant="outline" loading={busy === a.id} onClick={() => act(a, { status: 'draft', publish_at: null }, 'Unscheduled. It is back in draft.')}>
                    Unschedule
                  </Button>
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
