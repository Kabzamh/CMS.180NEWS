import { useState } from 'react';
import { Check, Copy, ImageOff } from 'lucide-react';
import { Card, CardHead, TextArea, TextInput, cx } from './ui';

const TITLE_FITS = 60; // about what a search result shows of a headline before cutting it
const DESCRIPTION_FITS = 155;
const SITE = 'www.180news.co.za';

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text);
const firstWords = (body: string) =>
  body
    .replace(/^(## |> ?)/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

function Count({ used, fits, max }: { used: number; fits: number; max: number }) {
  return (
    <span className={cx('tabular-nums', used > fits ? 'font-bold text-warn-deep' : '')}>
      {used} of {max} characters{used > fits ? `. Past about ${fits}, search results cut it short.` : '.'}
    </span>
  );
}

/**
 * The headline and description a story carries in search results and on shared links, with a
 * preview of each. Left empty, the story's own headline and summary are used.
 */
export function SeoCard({
  headline,
  summary,
  body,
  imageUrl,
  title,
  description,
  onChange,
  disabled,
  shareUrl,
}: {
  headline: string;
  summary: string;
  body: string;
  imageUrl: string | null;
  title: string;
  description: string;
  onChange: (patch: { seo_title?: string; seo_description?: string }) => void;
  disabled?: boolean;
  /** The link to give out for sharing, once the story is published. */
  shareUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const shownTitle = title.trim() || headline.trim() || 'Your headline will appear here';
  const shownDescription = description.trim() || summary.trim() || firstWords(body) || 'The summary, or the first words of the story, will appear here.';

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card className="@container">
      <CardHead title="Search and sharing" note="How the story reads in search results and when its link is shared" />
      <div className="grid gap-6 p-5 @3xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <TextInput
            id="f-seo_title"
            label="Search headline"
            optional
            maxLength={70}
            disabled={disabled}
            value={title}
            placeholder={headline.trim()}
            onChange={(e) => onChange({ seo_title: e.target.value })}
            hint={title.trim() ? undefined : 'Left empty, the story’s own headline is used. Write one here to put the words people search for first.'}
          />
          {title.trim() && (
            <p className="-mt-2.5 text-[13.5px] leading-snug text-muted">
              <Count used={title.trim().length} fits={TITLE_FITS} max={70} />
            </p>
          )}
          <TextArea
            id="f-seo_description"
            label="Search description"
            optional
            rows={3}
            maxLength={200}
            disabled={disabled}
            value={description}
            placeholder={summary.trim() || undefined}
            onChange={(e) => onChange({ seo_description: e.target.value.replace(/\n/g, ' ') })}
            hint={description.trim() ? undefined : 'Left empty, the summary is used, or the first words of the story.'}
            className="resize-y"
          />
          {description.trim() && (
            <p className="-mt-2.5 text-[13.5px] leading-snug text-muted">
              <Count used={description.trim().length} fits={DESCRIPTION_FITS} max={200} />
            </p>
          )}
          {shareUrl ? (
            <div className="border border-line bg-wash p-3">
              <p className="text-sm font-bold text-ink">Link for sharing</p>
              <p className="mt-0.5 font-mono text-[13px] break-all text-body">{shareUrl}</p>
              <button type="button" onClick={copy} className="mt-2 inline-flex h-9 cursor-pointer items-center gap-2 border border-line-strong bg-paper px-3 text-sm font-bold text-ink hover:border-ink">
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy the link'}
              </button>
              <p className="mt-2 text-[13.5px] leading-snug text-muted">
                Post this link on Facebook, WhatsApp or X. They read the headline, description and picture from it, and readers who tap it go to the story on the site.
              </p>
            </div>
          ) : (
            <p className="text-[13.5px] leading-snug text-muted">A link for sharing on social networks appears here once the story is published.</p>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <p className="mb-1.5 text-[12px] font-black tracking-[0.08em] text-muted uppercase">In search results</p>
            <div className="border border-line bg-paper p-3.5">
              <p className="flex items-center gap-2 text-[13px] leading-tight text-body">
                <img src="/favicon.svg" alt="" className="h-6 w-6 shrink-0 rounded-full" />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">180news</span>
                  <span className="block truncate text-muted">https://{SITE} › story</span>
                </span>
              </p>
              <p className="mt-1.5 text-[18px] leading-snug break-words text-navy">{cut(shownTitle, TITLE_FITS)}</p>
              <p className="mt-0.5 text-[14px] leading-snug break-words text-body">{cut(shownDescription, DESCRIPTION_FITS)}</p>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-black tracking-[0.08em] text-muted uppercase">When the link is shared</p>
            <div className="overflow-hidden border border-line-strong bg-wash">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="aspect-[1.91/1] w-full bg-line object-cover" />
              ) : (
                <div className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-1.5 bg-line/60 text-center text-[13.5px] font-semibold text-muted">
                  <ImageOff className="h-6 w-6" aria-hidden="true" />
                  No main picture, so the card shows without one
                </div>
              )}
              <div className="px-3.5 py-2.5">
                <p className="text-[12px] tracking-[0.04em] text-muted uppercase">{SITE}</p>
                <p className="mt-0.5 line-clamp-2 text-[16px] leading-snug font-bold break-words text-ink">{shownTitle}</p>
                <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug break-words text-muted">{shownDescription}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
