import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, CardHead, Button, Badge, Spinner, ErrorBox, Toast } from '../components/ui';
import type { Article } from '../lib/types';

export default function BreakingPage() {
  const list = useApi<{ items: Article[] }>(() => api('/api/articles?status=published'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Breaking news · 180news Newsroom CMS';
  }, []);

  const setPlacement = async (a: Article, placement: string, msg: string) => {
    setBusy(`${placement}-${a.id}`);
    try {
      await api('/api/articles', { method: 'PUT', body: { id: a.id, placement } });
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
    (a, b) => new Date(b.publish_at || 0).getTime() - new Date(a.publish_at || 0).getTime()
  );
  const main = items.find((a) => a.placement === 'main');
  const headlines = items.filter((a) => a.placement === 'headline');
  const rest = items.filter((a) => a.placement === 'none' || !a.placement);

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Breaking news"
        description="Choose the main headline and the stories that join the headline strip."
      />
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={() => list.reload()} />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHead title="Main headline" note="Leads the front page" />
            {main ? (
              <div className="flex flex-wrap items-start gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <Badge tone="brand">Main</Badge>
                  <Link to={`/articles/${main.id}`} className="mt-1 block text-lg font-extrabold text-ink hover:text-brand">{main.headline}</Link>
                  <p className="text-sm text-muted">By {main.author_name}</p>
                </div>
                <Button size="sm" variant="outline" loading={busy === `none-${main.id}`} onClick={() => setPlacement(main, 'none', 'Cleared from main headline.')}>
                  Clear
                </Button>
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-muted">No main headline set. Pick one from the list below.</p>
            )}
          </Card>

          <Card>
            <CardHead title="Headline news" note={`${headlines.length} stories`} />
            {headlines.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No headline strip stories yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {headlines.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Link to={`/articles/${a.id}`} className="flex-1 font-bold text-ink hover:text-brand">{a.headline}</Link>
                    <Button size="sm" variant="outline" loading={busy === `main-${a.id}`} onClick={() => setPlacement(a, 'main', 'Set as main headline.')}>Make main</Button>
                    <Button size="sm" variant="ghost" loading={busy === `none-${a.id}`} onClick={() => setPlacement(a, 'none', 'Removed from headline news.')}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Published stories" note="Assign to the front page" />
            <ul className="divide-y divide-line">
              {rest.slice(0, 40).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Link to={`/articles/${a.id}`} className="min-w-0 flex-1 font-bold text-ink hover:text-brand">{a.headline}</Link>
                  <Button size="sm" variant="navy" loading={busy === `main-${a.id}`} onClick={() => setPlacement(a, 'main', 'Set as main headline.')}>Main</Button>
                  <Button size="sm" variant="outline" loading={busy === `headline-${a.id}`} onClick={() => setPlacement(a, 'headline', 'Added to headline news.')}>Headline</Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}
