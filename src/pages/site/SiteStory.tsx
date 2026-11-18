import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { Spinner, ErrorBox, fmtDate } from '../../components/ui';
import { MediaPlayer } from '../../components/MediaPlayer';
import { AdBanner, pickAds } from '../../components/AdBanner';
import type { AdSlot, Article } from '../../lib/types';

export default function SiteStory() {
  const { id } = useParams();
  const { data, loading, error, reload } = useApi<Article>(
    () => api(`/api/public?resource=article&id=${id}`),
    [id]
  );
  const home = useApi<{ ads: AdSlot[]; ads_enabled: boolean }>(() => api('/api/public'), []);

  useEffect(() => {
    if (id) {
      api(`/api/public?resource=view&id=${id}`).catch(() => {});
    }
  }, [id]);

  useEffect(() => {
    if (data?.headline) document.title = `${data.headline} | 180news`;
  }, [data]);

  if (loading && !data) return <div className="py-20"><Spinner label="Loading story" /></div>;
  if (error && !data) return <div className="px-4 py-12"><ErrorBox message={error} onRetry={() => reload()} /></div>;
  if (!data) return null;

  const paras = (data.body || '').split(/\n+/).filter(Boolean);
  const ads = pickAds(home.data?.ads, home.data?.ads_enabled !== false);
  const splitAt = Math.min(2, Math.max(1, Math.floor(paras.length / 2)));

  return (
    <>
      <AdBanner ads={ads} slot="top" />
      <div className="md:hidden">
        <AdBanner ads={ads} slot="mobile" />
      </div>

      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link to="/site" className="text-sm font-bold text-navy hover:underline">← Front page</Link>
        {data.section && (
          <p className="mt-4 text-[11px] font-black tracking-[0.1em] text-brand uppercase">{data.section.replace(/-/g, ' ')}</p>
        )}
        <h1 className="mt-2 text-3xl font-black tracking-tight text-ink md:text-5xl md:leading-[1.08]">{data.headline}</h1>
        {data.summary && <p className="mt-4 text-xl leading-relaxed text-body">{data.summary}</p>}
        <p className="mt-4 text-sm text-muted">
          By <span className="font-bold text-ink">{data.author_name}</span>
          {data.publish_at ? ` · ${fmtDate(data.publish_at)}` : ''}
        </p>

        {data.image_url && (
          <figure className="mt-6">
            <img src={data.image_url} alt={data.image_caption || ''} className="w-full object-cover" />
            {(data.image_caption || data.image_credit) && (
              <figcaption className="mt-2 text-sm text-muted">
                {data.image_caption}
                {data.image_credit ? ` · ${data.image_credit}` : ''}
              </figcaption>
            )}
          </figure>
        )}

        {(data.media || []).map((m, i) => (
          <div key={i} className="mt-6">
            <MediaPlayer item={m} />
          </div>
        ))}

        <div className="mt-8 space-y-5 text-[18px] leading-[1.7] text-body">
          {paras.slice(0, splitAt).map((p, i) => (
            <p key={`a-${i}`}>{p}</p>
          ))}
        </div>

        <div className="my-8">
          <AdBanner ads={ads} slot="inarticle" />
        </div>

        <div className="space-y-5 text-[18px] leading-[1.7] text-body">
          {paras.slice(splitAt).map((p, i) => (
            <p key={`b-${i}`}>{p}</p>
          ))}
        </div>

        {data.tags?.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
            {data.tags.map((t) => (
              <span key={t} className="bg-wash px-2.5 py-1 text-xs font-bold text-ink">
                {t}
              </span>
            ))}
          </div>
        )}
      </article>

      <AdBanner ads={ads} slot="bottom" />
    </>
  );
}
