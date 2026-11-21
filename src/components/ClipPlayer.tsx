import { Film, Headphones, Play, type LucideIcon } from 'lucide-react';
import type { ArticleClip, ClipKind } from '../lib/types';
import { Pill, cx } from './ui';

export const CLIP_META: Record<ClipKind, { label: string; pill: string; icon: LucideIcon }> = {
  youtube: { label: 'YouTube', pill: 'bg-brand text-white', icon: Play },
  video: { label: 'Short video', pill: 'bg-navy text-white', icon: Film },
  audio: { label: 'Audio clip', pill: 'bg-ink text-white', icon: Headphones },
};

export function KindPill({ kind }: { kind: ClipKind }) {
  const { label, pill, icon: Icon } = CLIP_META[kind];
  return (
    <Pill className={cx('gap-1.5', pill)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Pill>
  );
}

/** Small markers for lists: does this story carry video, audio or both? */
export function MediaBadges({ kinds }: { kinds?: ClipKind[] }) {
  if (!kinds?.length) return null;
  const video = kinds.includes('youtube') || kinds.includes('video');
  return (
    <>
      {video && (
        <Pill className="gap-1.5 bg-navy-tint text-navy">
          <Film className="h-3.5 w-3.5" aria-hidden="true" />
          Video
        </Pill>
      )}
      {kinds.includes('audio') && (
        <Pill className="gap-1.5 bg-navy-tint text-navy">
          <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
          Audio
        </Pill>
      )}
    </>
  );
}

/** A clip as readers see it on the story page. */
export function ClipPlayer({ clip }: { clip: ArticleClip }) {
  const portrait = Boolean(clip.width && clip.height && clip.height > clip.width);
  const ratio = clip.width && clip.height ? `${clip.width} / ${clip.height}` : '16 / 9';
  const note = [clip.caption, clip.credit && `${clip.kind === 'audio' ? 'Audio' : 'Video'}: ${clip.credit}`].filter(Boolean);

  if (clip.kind === 'audio') {
    return (
      <figure className="border border-line border-l-4 border-l-navy bg-wash p-4">
        <p className="flex items-center gap-2 text-[12px] font-black tracking-[0.08em] text-navy uppercase">
          <Headphones className="h-4 w-4" aria-hidden="true" />
          Listen
        </p>
        {clip.title && <p className="mt-1 text-[17px] leading-snug font-extrabold text-ink">{clip.title}</p>}
        <audio controls preload="none" src={clip.url} className="mt-3 w-full" />
        {note.length > 0 && <figcaption className="mt-2 text-[13.5px] leading-snug text-muted">{note.join(' · ')}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className={cx(portrait && 'mx-auto max-w-[340px]')}>
      <div className="bg-ink" style={{ aspectRatio: ratio }}>
        {clip.kind === 'youtube' ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${clip.youtube_id}?rel=0&playsinline=1`}
            title={clip.title || 'YouTube video player'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full border-0"
          />
        ) : (
          <video src={clip.url} controls playsInline preload="metadata" className="h-full w-full object-contain" />
        )}
      </div>
      {(clip.title || note.length > 0) && (
        <figcaption className="mt-2 text-[13.5px] leading-snug text-muted">
          {clip.title && <span className="font-bold text-ink">{clip.title}</span>}
          {clip.title && note.length > 0 && ' · '}
          {note.join(' · ')}
        </figcaption>
      )}
    </figure>
  );
}
