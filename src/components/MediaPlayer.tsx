import type { MediaEmbed } from '../lib/types';

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const shorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shorts) return shorts[1];
    const embed = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embed) return embed[1];
  } catch {
    return null;
  }
  return null;
}

export function MediaPlayer({ item, className = '' }: { item: MediaEmbed; className?: string }) {
  if (item.kind === 'youtube' && item.youtube_id) {
    return (
      <div className={`overflow-hidden bg-ink ${className}`}>
        <div className="relative aspect-video w-full">
          <iframe
            title={item.title || 'YouTube video'}
            src={`https://www.youtube.com/embed/${item.youtube_id}`}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        {(item.caption || item.credit) && (
          <p className="px-3 py-2 text-sm text-white/80">
            {item.caption}
            {item.credit ? ` · ${item.credit}` : ''}
          </p>
        )}
      </div>
    );
  }
  if (item.kind === 'video') {
    return (
      <figure className={className}>
        <video src={item.url} controls playsInline className="w-full bg-ink" />
        {(item.caption || item.title) && (
          <figcaption className="mt-1.5 text-sm text-muted">
            {item.title || item.caption}
            {item.credit ? ` · ${item.credit}` : ''}
          </figcaption>
        )}
      </figure>
    );
  }
  if (item.kind === 'audio') {
    return (
      <figure className={`border border-line bg-wash p-4 ${className}`}>
        {item.title && <p className="mb-2 font-bold text-ink">{item.title}</p>}
        <audio src={item.url} controls className="w-full" />
        {(item.caption || item.credit) && (
          <figcaption className="mt-2 text-sm text-muted">
            {item.caption}
            {item.credit ? ` · ${item.credit}` : ''}
          </figcaption>
        )}
      </figure>
    );
  }
  return null;
}
