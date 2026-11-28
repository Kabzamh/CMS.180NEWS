import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Badge, Card, CardHead, ErrorBox, PageHeader, Spinner, fmtDate, fmtNum } from '../components/ui';
import type { Article } from '../lib/types';

type ArticleResponse = { items: Article[]; counts: Record<string, number> };

/** Connected dashboard: show only data backed by the current newsroom APIs. */
export default function NewsroomDashboard() {
  const { member } = useAuth();
  const articles = useApi<ArticleResponse>(() => api('/api/articles'), []);
  useEffect(() => { document.title = 'Dashboard · 180news Newsroom CMS'; }, []);

  if (articles.loading && !articles.data) return <Spinner label="Loading dashboard" />;
  if (articles.error && !articles.data) return <ErrorBox message={articles.error} onRetry={() => articles.reload()} />;
  if (!articles.data) return null;

  const { counts, items } = articles.data;
  const recent = [...items].sort((a, b) => {
    const aTime = Date.parse(a.updated_at || a.created_at || '') || 0;
    const bTime = Date.parse(b.updated_at || b.created_at || '') || 0;
    return bTime - aTime;
  }).slice(0, 10);
  const cards = [
    { key: 'total', label: 'Total articles', to: '/articles' },
    { key: 'draft', label: 'Drafts', to: '/articles?status=draft' },
    { key: 'review', label: 'In review', to: '/articles?status=review' },
    { key: 'published', label: 'Published', to: '/articles?status=published' },
    { key: 'scheduled', label: 'Scheduled', to: '/articles?status=scheduled' },
    { key: 'hidden', label: 'Hidden', to: '/articles?status=hidden' },
  ];
  return (
    <>
      <PageHeader eyebrow="Newsroom" title={`Welcome, ${(member?.name || 'Admin').split(' ')[0]}`} description="Your connected newsroom at a glance." />
      {articles.error && <p role="alert" className="mb-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm">Refresh failed; the figures below may be out of date.</p>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map(card => <Link key={card.key} to={card.to} className="rounded-xl border border-line bg-paper p-4 hover:shadow-md">
          <span className="block text-sm font-bold text-muted">{card.label}</span>
          <span className="mt-2 block text-3xl font-extrabold text-ink">{fmtNum(counts[card.key] ?? 0)}</span>
        </Link>)}
      </div>
      <Card>
        <CardHead title="Recently updated" note="Stories accessible to your account" />
        {recent.length === 0 ? <p className="p-5 text-sm text-muted">No stories yet.</p> : <ul className="divide-y divide-line">
          {recent.map(article => <li key={article.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Badge tone={article.status}>{article.status}</Badge>
            <Link to={`/articles/${article.id}`} className="flex-1 font-bold text-ink hover:text-brand">{article.headline}</Link>
            <span className="text-sm text-muted">{fmtDate(article.updated_at || article.created_at)}</span>
          </li>)}
        </ul>}
      </Card>
      <p className="mt-4 text-sm text-muted">Traffic analytics and the breaking-news crawl are not yet connected. Scheduled publication remains disabled until it has been configured and tested.</p>
      <button className="mt-4 rounded border border-line-strong px-3 py-2 text-sm font-bold" onClick={() => articles.reload()}>Refresh</button>
    </>
  );
}
