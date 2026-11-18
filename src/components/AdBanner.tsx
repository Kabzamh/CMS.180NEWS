import type { AdSlot } from '../lib/types';

type AdLike = Pick<
  AdSlot,
  'id' | 'slot' | 'image_url' | 'link_url' | 'advertiser' | 'width' | 'height' | 'enabled' | 'position'
>;

function trackAdClick(ad: AdLike) {
  try {
    const payload = JSON.stringify({
      kind: 'ad_click',
      ad_id: ad.id,
      slot: ad.slot,
      page_path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
    });
    // fire-and-forget; keepalive helps on navigation
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/track', blob);
      return;
    }
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
}

export function AdBanner({
  ads,
  slot,
  className = '',
  label = true,
}: {
  ads: AdLike[];
  slot: string;
  className?: string;
  label?: boolean;
}) {
  const ad = ads.find((a) => a.slot === slot && a.image_url && a.enabled !== false);
  if (!ad?.image_url) return null;

  const w = ad.width && ad.width > 0 ? ad.width : undefined;
  const h = ad.height && ad.height > 0 ? ad.height : undefined;
  const isFluid = !w || !h;

  const img = (
    <img
      src={ad.image_url}
      alt={ad.advertiser ? `Advertisement — ${ad.advertiser}` : 'Advertisement'}
      width={w}
      height={h}
      className={
        isFluid
          ? 'mx-auto max-h-48 w-full max-w-full object-contain'
          : 'mx-auto max-w-full object-contain'
      }
      style={
        isFluid
          ? undefined
          : { maxWidth: '100%', width: w, height: 'auto', aspectRatio: `${w} / ${h}` }
      }
    />
  );

  const onClick = () => trackAdClick(ad);

  return (
    <aside
      className={`border-y border-line bg-wash ${className}`}
      aria-label="Advertisement"
      data-ad-slot={slot}
      data-ad-id={ad.id}
      data-ad-size={w && h ? `${w}x${h}` : 'fluid'}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-3 sm:px-6">
        {label && (
          <p className="mb-1.5 text-[10px] font-bold tracking-[0.14em] text-off uppercase">
            Advertisement{w && h ? ` · ${w}×${h}` : ''}
          </p>
        )}
        {ad.link_url ? (
          <a
            href={ad.link_url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="block"
            onClick={onClick}
          >
            {img}
          </a>
        ) : (
          <button type="button" className="block cursor-pointer border-0 bg-transparent p-0" onClick={onClick}>
            {img}
          </button>
        )}
        {ad.advertiser && (
          <p className="mt-1.5 text-[12px] text-muted">Presented by {ad.advertiser}</p>
        )}
      </div>
    </aside>
  );
}

export function pickAds(ads: AdLike[] | undefined, adsEnabled = true): AdLike[] {
  if (!adsEnabled || !ads?.length) return [];
  return ads.filter((a) => a.enabled !== false && a.image_url);
}

/** Record a page visit on the public news app */
export function trackPageVisit(path?: string) {
  try {
    const payload = JSON.stringify({
      kind: 'page',
      path: path || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'),
      referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
      return;
    }
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
}
