import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Badge, Spinner, ErrorBox, Toast, Empty, fmtDate, Toggle } from '../components/ui';
import type { CommentRow } from '../lib/types';

export default function CommentsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'pending';
  const list = useApi<{ items: CommentRow[] }>(
    () => api(`/api/comments?status=${encodeURIComponent(status)}`),
    [status]
  );
  const settings = useApi<any>(() => api('/api/settings'), []);
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Comments · 180news Newsroom CMS';
  }, []);

  const setStatus = async (c: CommentRow, st: string) => {
    setBusy(c.id);
    try {
      await api('/api/comments', { method: 'PUT', body: { id: c.id, status: st } });
      const msgs: Record<string, string> = {
        approved: 'Approved. It can be shown under the story.',
        rejected: 'Rejected. Readers will not see it.',
        spam: 'Marked as spam.',
        pending: 'Moved back to pending.',
      };
      setToast(msgs[st] || 'Updated.');
      window.dispatchEvent(new Event('comments-changed'));
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const remove = async (c: CommentRow) => {
    setBusy(c.id);
    try {
      await api('/api/comments', { method: 'DELETE', body: { id: c.id } });
      setToast('Comment deleted.');
      window.dispatchEvent(new Event('comments-changed'));
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const saveCommentsSetting = async (patch: Record<string, boolean>) => {
    const cur = settings.data?.comments || { enabled: true, hold: true };
    try {
      const next = await api('/api/settings', {
        method: 'PUT',
        body: { key: 'comments', value: { ...cur, ...patch } },
      });
      settings.setData(next);
      setToast('Settings saved.');
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const items = list.data?.items ?? [];
  const cs = settings.data?.comments || { enabled: true, hold: true };

  return (
    <>
      <PageHeader eyebrow="Desk" title="Comments" description="Moderate what readers write under published stories." />
      {settings.data && (
        <Card className="mb-4 space-y-3 p-5">
          <Toggle
            label="Allow comments"
            description="Readers can write under published stories."
            checked={!!cs.enabled}
            onChange={(v) => saveCommentsSetting({ enabled: v })}
          />
          <Toggle
            label="Hold every comment for approval"
            description={cs.hold ? 'Nothing appears until an editor approves it.' : 'Comments appear straight away.'}
            checked={!!cs.hold}
            disabled={!cs.enabled}
            onChange={(v) => saveCommentsSetting({ hold: v })}
          />
        </Card>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {['pending', 'approved', 'rejected', 'spam', 'all'].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'navy' : 'outline'}
            className="capitalize"
            onClick={() => setParams(s === 'pending' ? {} : { status: s }, { replace: true })}
          >
            {s}
          </Button>
        ))}
      </div>
      <Card>
        {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> : !items.length ? (
          <Empty title="Nothing here" />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={c.status}>{c.status}</Badge>
                  <span className="font-bold text-ink">{c.name}</span>
                  <span className="text-sm text-muted">{fmtDate(c.created_at)}</span>
                </div>
                {c.headline && <p className="text-sm text-muted">On: {c.headline}</p>}
                <p className="mt-2 text-[15px] leading-relaxed text-body">{c.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.status !== 'approved' && (
                    <Button size="sm" variant="navy" loading={busy === c.id} onClick={() => setStatus(c, 'approved')}>Approve</Button>
                  )}
                  {c.status !== 'rejected' && (
                    <Button size="sm" variant="outline" loading={busy === c.id} onClick={() => setStatus(c, 'rejected')}>Reject</Button>
                  )}
                  {c.status !== 'spam' && (
                    <Button size="sm" variant="outline" loading={busy === c.id} onClick={() => setStatus(c, 'spam')}>Spam</Button>
                  )}
                  <Button size="sm" variant="danger" loading={busy === c.id} onClick={() => remove(c)}>Delete</Button>
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
