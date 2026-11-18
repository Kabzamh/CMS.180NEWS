import { fmtDateTime, parseBody } from '../lib/format';
import type { ArticleClip } from '../lib/types';
import { ClipPlayer } from './ClipPlayer';

export function ArticlePreview({
  headline,
  summary,
  body,
  sectionLabel,
  author,
  date,
  imageUrl,
  imageCaption,
  imageCredit,
  tags,
  clips = [],
}: {
  headline: string;
  summary: string;
  body: string;
  sectionLabel: string;
  author: string;
  date: string | null;
  imageUrl: string | null;
  imageCaption: string;
  imageCredit: string;
  tags: string[];
  clips?: ArticleClip[];
}) {
  const blocks = parseBody(body);
  const before = clips.filter((clip) => clip.slot !== 'bottom');
  const after = clips.filter((clip) => clip.slot === 'bottom');
  return (
    <article className="border border-line border-t-4 border-t-brand bg-paper">
      <div className="mx-auto max-w-[680px] px-5 py-7 sm:px-8 sm:py-9">
        <p className="text-[13px] font-black uppercase tracking-[0.08em] text-brand">{sectionLabel || 'No category yet'}</p>
        <h1 className="mt-2 text-[30px] font-extrabold leading-[1.08] tracking-tight text-balance text-ink sm:text-[40px]">
          {headline || 'Your headline will appear here'}
        </h1>
        {summary && <p className="mt-4 text-[19px] leading-snug font-medium text-body">{summary}</p>}
        <p className="mt-5 border-y border-line py-2.5 text-sm text-muted">
          By <span className="font-bold text-ink">{author || 'Staff reporter'}</span>
          {date && <> · {fmtDateTime(date)}</>}
        </p>
        {imageUrl && (
          <figure className="mt-6">
            <img src={imageUrl} alt={imageCaption} className="aspect-[16/9] w-full bg-wash object-cover" />
            {(imageCaption || imageCredit) && (
              <figcaption className="mt-2 text-[13.5px] leading-snug text-muted">
                {imageCaption}
                {imageCredit && <span className="font-semibold"> {imageCaption ? '· ' : ''}Picture: {imageCredit}</span>}
              </figcaption>
            )}
          </figure>
        )}
        {before.length > 0 && (
          <div className="mt-6 space-y-5">
            {before.map((clip) => (
              <ClipPlayer key={`${clip.kind}:${clip.youtube_id ?? clip.url}`} clip={clip} />
            ))}
          </div>
        )}
        <div className="mt-6 space-y-5 text-[17.5px] leading-[1.7] text-body">
          {blocks.length === 0 ? (
            <p className="text-muted">The story will appear here as you write it.</p>
          ) : (
            blocks.map((block, i) =>
              block.kind === 'h' ? (
                <h2 key={i} className="pt-2 text-[23px] font-extrabold leading-tight tracking-tight text-ink">
                  {block.text}
                </h2>
              ) : block.kind === 'quote' ? (
                <blockquote key={i} className="border-l-4 border-brand pl-4 text-[19px] font-semibold leading-snug whitespace-pre-line text-ink">
                  {block.text}
                </blockquote>
              ) : (
                <p key={i} className="whitespace-pre-line">
                  {block.text}
                </p>
              ),
            )
          )}
        </div>
        {after.length > 0 && (
          <div className="mt-7 space-y-5">
            {after.map((clip) => (
              <ClipPlayer key={`${clip.kind}:${clip.youtube_id ?? clip.url}`} clip={clip} />
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-2 border-t border-line pt-5">
            {tags.map((tag) => (
              <li key={tag} className="bg-navy-tint px-2.5 py-1 text-sm font-bold text-navy">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
