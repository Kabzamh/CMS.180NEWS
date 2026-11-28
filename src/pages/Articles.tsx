import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PenLine, Trash2, Search } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, Card, Button, Badge, Spinner, ErrorBox, Empty, fmtDate, Toast, Select } from '../components/ui';
import type { Article, Section, Author } from '../lib/types';

export default function Articles() {
  const { member } = useAuth();
  const connected = import.meta.env.VITE_NEWSROOM_SYNC_PREVIEW === 'true';
  const canPublish = !connected || member?.role === 'owner' || member?.role === 'editor';
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const section = params.get('section') || '';
  const author = params.get('author') || '';
  const q = params.get('q') || '';
  const [qInput, setQInput] = useState(q);
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone?: 'ok' | 'error' } | null>(null);
  const [delId, setDelId] = useState<number | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (section) p.set('section', section);
    if (author) p.set('author', author);
    if (q) p.set('q', q);
    return p.toString();
  }, [status, section, author, q]);

  const list = useApi<{ items: Article[]; counts: Record<string, number> }>(
    () => api(`/api/articles?${qs}`),
    [qs]
  );
  const sections = useApi<Section[]>(() => api('/api/sections'), []);
  useApi<{ authors: Author[] }>(() => api('/api/team?authors=1'), []);

  useEffect(() => {
    document.title = 'Articles · 180news Newsroom CMS';
  }, []);

  useEffect(() => setQInput(q), [q]);

  const setFilter = (key: string, val: string) => {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const setStatus = async (a: Article, st: string) => {
    setBusy(a.id);
    try {
      await api('/api/articles', { method: 'PUT', body: { id: a.id, revision: a.revision, status: st, ...(st === 'published' && a.status !== 'published' ? { publish_at: new Date().toISOString() } : {}) } });
      setToast({ msg: st === 'published' ? 'Published. It is live on the site feed.' : 'Hidden from the site.' });
      await list.reload(true);
    } catch (e) {
      setToast({ msg: errMsg(e), tone: 'error' });
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const remove = async () => {
    if (!delId) return;
    setBusy(delId);
    try {
      await api('/api/articles', { method: 'DELETE', body: { id: delId } });
      setToast({ msg: 'Story deleted.' });
      setDelId(null);
      await list.reload(true);
    } catch (e) {
      setToast({ msg: errMsg(e), tone: 'error' });
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const items = list.data?.items ?? [];
  const secMap = new Map((sections.data ?? []).map((s) => [s.slug, s]));

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Articles"
        description={connected ? 'Write, review and publish stories. Automatic scheduling and deletion are not yet available.' : 'Write, review, schedule and publish stories for the 180news front page.'}
        actions={
          <Link to="/articles/new">
            <Button icon={<PenLine className="h-4 w-4" />}>New story</Button>
          </Link>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-off" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setFilter('q', qInput.trim())}
              placeholder="Search headlines…"
              className="h-11 w-full border border-line-strong bg-paper pr-3 pl-10 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
            />
          </div>
          <Select label="Status" value={status} onChange={(e) => setFilter('status', e.target.value)} className="sm:w-40">
            <option value="">All</option>
            {['draft', 'review', 'scheduled', 'published', 'hidden'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select label="Category" value={section} onChange={(e) => setFilter('section', e.target.value)} className="sm:w-44">
            <option value="">All</option>
            {(sections.data ?? []).map((s) => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
          </Select>
          <Button variant="outline" onClick={() => setFilter('q', qInput.trim())}>Search</Button>
        </div>
      </Card>

      <Card>
        {list.loading && !list.data ? (
          <Spinner label="Loading stories" />
        ) : list.error ? (
          <ErrorBox message={list.error} onRetry={() => list.reload()} />
        ) : items.length === 0 ? (
          <Empty icon={<PenLine className="h-8 w-8" />} title="No stories match these filters.">
            Clear the status, category or author, or write a new story.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                {a.image_url && (
                  <img src={a.image_url} alt="" className="h-20 w-28 shrink-0 object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={a.status}>{a.status}</Badge>
                    {a.placement === 'main' && <Badge tone="brand">Main</Badge>}
                    {a.placement === 'headline' && <Badge tone="navy">Headline</Badge>}
                    {a.section && (
                      <span className="text-xs font-bold uppercase tracking-wide text-muted">
                        {secMap.get(a.section)?.label || a.section}
                      </span>
                    )}
                  </div>
                  <Link to={`/articles/${a.id}`} className="text-[16px] leading-snug font-bold text-ink hover:text-brand">
                    {a.headline}
                  </Link>
                  <p className="mt-1 text-sm text-muted">
                    By {a.author_name} · updated {fmtDate(a.updated_at)}
                    {a.status === 'published' && a.publish_at ? ` · published ${fmtDate(a.publish_at)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link to={`/articles/${a.id}`}>
                    <Button size="sm" variant="outline">Edit</Button>
                  </Link>
                  {canPublish && a.status !== 'published' && (member?.role !== 'writer' || a.status === 'draft') && (
                    <Button size="sm" variant="navy" loading={busy === a.id} onClick={() => setStatus(a, 'published')}>
                      Publish
                    </Button>
                  )}
                  {canPublish && a.status === 'published' && (
                    <Button size="sm" variant="outline" loading={busy === a.id} onClick={() => setStatus(a, 'hidden')}>
                      Hide
                    </Button>
                  )}
                  {!connected && <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDelId(a.id)}>
                    Delete
                  </Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="w-full max-w-md border border-line bg-paper p-6 shadow-xl">
            <h3 className="text-lg font-extrabold text-ink">Delete this story?</h3>
            <p className="mt-2 text-sm text-muted">This cannot be undone. Comments on the story are removed too.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDelId(null)}>Cancel</Button>
              <Button variant="danger" loading={busy === delId} onClick={remove}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </>
  );
}
