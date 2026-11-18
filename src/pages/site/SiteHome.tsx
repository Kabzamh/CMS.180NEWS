import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { Spinner, ErrorBox, fmtDate } from '../../components/ui';
import { MediaPlayer } from '../../components/MediaPlayer';
import { AdBanner, pickAds } from '../../components/AdBanner';
import type { AdSlot, Article } from '../../lib/types';

interface HomePayload {
  lead: Article | null;
  headlines: Article[];
  sections: Array<{ id: number; slug: string; label: string; stories: Article[] }>;
  latest: Article[];
  crawl: { enabled: boolean; speed: string; message: string };
  notice: { enabled: boolean; text: string };
  elections_update: { enabled: boolean; title: string; text: string };
  ads: AdSlot[];
  ads_enabled: boolean;
}

function StoryCard({ a, large }: { a: Article; large?: boolean }) {
  return (
    <Link to={`/site/story/${a.id}`} className="group block">
      {a.image_url && (
        <img
          src={a.image_url}
          alt=""
          className={`w-full object-cover ${large ? 'aspect-[16/9] max-h-[420px]' : 'aspect-[16/10]'}`}
        />
      )}
      <div className={large ? 'mt-4' : 'mt-2'}>
        {a.section && (
          <span className="text-[11px] font-black tracking-[0.08em] text-brand uppercase">{a.section.replace(/-/g, ' ')}</span>
        )}
        <h3 className={`font-extrabold tracking-tight text-ink group-hover:text-brand ${large ? 'mt-1 text-2xl md:text-4xl leading-tight' : 'mt-0.5 text-[17px] leading-snug'}`}>
          {a.headline}
        </h3>
        {large && a.summary && <p className="mt-2 max-w-[60ch] text-[17px] leading-relaxed text-body">{a.summary}</p>}
        <p className="mt-1.5 text-sm text-muted">
          {a.author_name}
          {a.publish_at ? ` · ${fmtDate(a.publish_at)}` : ''}
        </p>
      </div>
    </Link>
  );
}

export default function SiteHome() {
  const { data, loading, error, reload } = useApi<HomePayload>(() => api('/api/public'), []);

  useEffect(() => {
    document.title = '180news — Live South African news headlines';
  }, []);

  if (loading && !data) return <div className="py-20"><Spinner label="Loading headlines" /></div>;
  if (error && !data) return <div className="px-4 py-12"><ErrorBox message={error} onRetry={() => reload()} /></div>;
  if (!data) return null;

  const ads = pickAds(data.ads, data.ads_enabled !== false);

  return (
    <div>
      {data.notice?.enabled && data.notice.text && (
        <div className="bg-brand px-4 py-2.5 text-center text-sm font-bold text-white">{data.notice.text}</div>
      )}
      {data.crawl?.enabled && (data.crawl.message || data.headlines.length > 0) && (
        <div className="overflow-hidden border-b border-line bg-navy-deep text-white">
          <div className="animate-[marquee_28s_linear_infinite] whitespace-nowrap py-2 text-sm font-semibold">
            <span className="mx-8 text-brand-bright">BREAKING</span>
            {data.crawl.message && <span className="mx-6">{data.crawl.message}</span>}
            {data.headlines.map((h) => (
              <span key={h.id} className="mx-6">
                {h.headline}
              </span>
            ))}
          </div>
        </div>
      )}

      <AdBanner ads={ads} slot="top" />
      <div className="md:hidden">
        <AdBanner ads={ads} slot="mobile" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {data.elections_update?.enabled && (
          <aside className="mb-6 border-l-4 border-brand bg-brand-tint px-4 py-3">
            <p className="text-xs font-black tracking-wide text-brand uppercase">{data.elections_update.title || 'Elections'}</p>
            <p className="mt-1 text-[15px] text-ink">{data.elections_update.text}</p>
          </aside>
        )}

        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {data.lead ? <StoryCard a={data.lead} large /> : <p className="text-muted">No lead story yet — publish one from the CMS.</p>}
            {data.lead?.media?.[0] && (
              <div className="mt-4">
                <MediaPlayer item={data.lead.media[0]} />
              </div>
            )}
          </div>
          <div>
            <h2 className="mb-3 border-b-2 border-navy pb-2 text-xs font-black tracking-[0.1em] text-navy uppercase">Headline news</h2>
            <ul className="divide-y divide-line">
              {data.headlines.map((h) => (
                <li key={h.id} className="py-3">
                  <StoryCard a={h} />
                </li>
              ))}
            </ul>
            <div className="mt-6 hidden lg:block">
              <AdBanner ads={ads} slot="sidebar" className="border" label />
            </div>
          </div>
        </div>

        <div className="my-8">
          <AdBanner ads={ads} slot="mid" />
        </div>

        {(data.sections || []).filter((s) => s.stories?.length).map((s) => (
          <section key={s.id} className="mt-10">
            <div className="mb-4 flex items-end justify-between border-b-2 border-ink pb-2">
              <h2 className="text-xl font-black tracking-tight text-ink">{s.label}</h2>
              <Link to={`/site/section/${s.slug}`} className="text-sm font-bold text-navy hover:underline">
                More →
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {s.stories.slice(0, 6).map((a) => (
                <StoryCard key={a.id} a={a} />
              ))}
            </div>
          </section>
        ))}

        <section className="mt-10">
          <h2 className="mb-4 border-b-2 border-ink pb-2 text-xl font-black text-ink">Latest</h2>
          <ul className="divide-y divide-line">
            {(data.latest || []).map((a) => (
              <li key={a.id} className="flex gap-4 py-4">
                {a.image_url && <img src={a.image_url} alt="" className="h-20 w-28 shrink-0 object-cover" />}
                <div className="min-w-0">
                  <Link to={`/site/story/${a.id}`} className="font-extrabold text-ink hover:text-brand">
                    {a.headline}
                  </Link>
                  <p className="mt-1 text-sm text-muted">{a.author_name} · {fmtDate(a.publish_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <AdBanner ads={ads} slot="bottom" />
    </div>
  );
}
