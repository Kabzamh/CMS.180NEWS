import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { Spinner, ErrorBox, fmtDate } from '../../components/ui';
import type { Article } from '../../lib/types';

export default function SiteSection() {
  const { slug } = useParams();
  const { data, loading, error, reload } = useApi<Article[]>(() => api('/api/public?resource=articles'), [slug]);

  const items = (data || []).filter((a) => a.section === slug);

  useEffect(() => {
    document.title = `${(slug || '').replace(/-/g, ' ')} | 180news`;
  }, [slug]);

  if (loading && !data) return <div className="py-20"><Spinner /></div>;
  if (error && !data) return <div className="px-4 py-12"><ErrorBox message={error} onRetry={() => reload()} /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to="/site" className="text-sm font-bold text-navy hover:underline">← Front page</Link>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-ink capitalize">{(slug || '').replace(/-/g, ' ')}</h1>
      <ul className="mt-6 divide-y divide-line">
        {items.map((a) => (
          <li key={a.id} className="flex gap-4 py-4">
            {a.image_url && <img src={a.image_url} alt="" className="h-24 w-36 shrink-0 object-cover" />}
            <div>
              <Link to={`/site/story/${a.id}`} className="text-lg font-extrabold text-ink hover:text-brand">{a.headline}</Link>
              {a.summary && <p className="mt-1 text-[15px] text-body line-clamp-2">{a.summary}</p>}
              <p className="mt-1 text-sm text-muted">{a.author_name} · {fmtDate(a.publish_at)}</p>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="py-10 text-muted">No published stories in this section yet.</li>}
      </ul>
    </div>
  );
}
