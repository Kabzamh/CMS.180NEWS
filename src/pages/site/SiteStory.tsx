import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Facebook, MessageCircle, Link2, Check } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { Spinner, ErrorBox, fmtDate } from '../../components/ui';
import { MediaPlayer } from '../../components/MediaPlayer';
import { AdBanner, pickAds } from '../../components/AdBanner';
import type { AdSlot, Article } from '../../lib/types';

/** Reader-facing share row — opens Facebook's and WhatsApp's own share
 * dialogs with the story's headline and canonical link, plus a one-click
 * copy of the link. Mirrors the staff-side sharer in the article editor,
 * but for anyone reading a published story on the public site. */
function ShareRow({ article, storyUrl }: { article: Article; storyUrl: string }) {
  const [copied, setCopied] = useState(false);

  const shareToFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(storyUrl)}&quote=${encodeURIComponent(article.headline)}`;
    window.open(url, 'facebook-share', 'noopener,noreferrer,width=600,height=640');
  };

  const shareToWhatsApp = () => {
    const text = `${article.headline}\n\n${storyUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(storyUrl);
    } catch {
      /* clipboard unavailable — the link is still visible in the address bar */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-line py-3">
      <span className="text-sm font-bold text-muted">Share this story:</span>
      <button
        type="button"
        onClick={shareToFacebook}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-white"
        style={{ backgroundColor: '#1877F2' }}
        aria-label="Share on Facebook"
      >
        <Facebook className="h-4 w-4" /> Facebook
      </button>
      <button
        type="button"
        onClick={shareToWhatsApp}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-white"
        style={{ backgroundColor: '#25D366' }}
        aria-label="Share on WhatsApp"
      >
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </button>
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-bold text-ink hover:bg-wash"
        aria-label="Copy link"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}

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

  const isHtmlBody = /<[a-z][\s\S]*>/i.test(data.body || '');
  const paras = isHtmlBody ? [] : (data.body || '').split(/\n+/).filter(Boolean);
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

        <ShareRow article={data} storyUrl={`${window.location.origin}/site/story/${data.id}`} />

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
            {m.kind === 'audio' && m.transcript && (
              <details className="mt-2 border border-line bg-wash p-3 text-sm text-body">
                <summary className="cursor-pointer font-bold text-ink">Transcript</summary>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{m.transcript}</p>
              </details>
            )}
          </div>
        ))}

        {isHtmlBody ? (
          <>
            <div
              className="mt-8 space-y-5 text-[18px] leading-[1.7] text-body [&_mark]:bg-amber-200 [&_mark]:px-0.5"
              dangerouslySetInnerHTML={{ __html: data.body }}
            />
            <div className="my-8">
              <AdBanner ads={ads} slot="inarticle" />
            </div>
          </>
        ) : (
          <>
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
          </>
        )}

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
