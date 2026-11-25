import { useEffect, useMemo, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { DESK, type Revision, type Snapshot } from '../lib/desk';
import { changed, diffWords, type Part } from '../lib/diff';
import { fmtDateTime, wordCount } from '../lib/format';
import { useLoad } from '../hooks/useLoad';
import { Button, Dialog, ErrorState, Spinner, StatusBadge, cx } from './ui';

function Changes({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.kind === 'same' ? (
          <span key={index}>{part.text}</span>
        ) : part.kind === 'add' ? (
          <ins key={index} className="bg-live-tint font-semibold text-live-deep decoration-live-deep">
            {part.text}
          </ins>
        ) : (
          <del key={index} className="bg-brand-tint text-brand">
            {part.text}
          </del>
        ),
      )}
    </>
  );
}

const SMALL: [keyof Snapshot, string][] = [
  ['section', 'Category'],
  ['author_name', 'Byline'],
  ['image_url', 'Main picture'],
  ['image_caption', 'Picture caption'],
  ['image_credit', 'Picture credit'],
  ['seo_title', 'Search headline'],
  ['seo_description', 'Search description'],
];
const say = (key: keyof Snapshot, value: unknown) => (key === 'image_url' ? (value ? 'a picture' : 'no picture') : value ? `“${String(value)}”` : 'nothing');

/** The other things a save changed, one line each. */
function smallChanges(from: Snapshot, to: Snapshot): string[] {
  const lines: string[] = [];
  for (const [key, label] of SMALL) {
    if ((from[key] || '') === (to[key] || '')) continue;
    lines.push(key === 'image_url' && from.image_url && to.image_url ? 'Main picture: replaced with another' : `${label}: ${say(key, from[key])} became ${say(key, to[key])}`);
  }
  const tags = (s: Snapshot) => (s.tags || []).join(', ');
  if (tags(from) !== tags(to)) lines.push(`Tags: ${tags(from) || 'none'} became ${tags(to) || 'none'}`);
  const clips = (s: Snapshot) => (s.clips || []).map((c) => c.url).join('|');
  if (clips(from) !== clips(to)) lines.push(`Video and audio: ${(from.clips || []).length} ${(from.clips || []).length === 1 ? 'clip' : 'clips'} became ${(to.clips || []).length}`);
  return lines;
}

/**
 * Every saved version of a story. Any one can be compared, word for word, with the version before it
 * or with what is in the editor now, and put back into the editor.
 */
export function RevisionsDialog({ articleId, now, canRestore, onRestore, onClose }: { articleId: number; now: Snapshot; canRestore: boolean; onRestore: (snapshot: Snapshot, savedAt: string) => void; onClose: () => void }) {
  const list = useLoad(() => api<{ revisions: Revision[] }>(`${DESK}&view=revisions&id=${articleId}`), [articleId]);
  const revisions = list.data?.revisions ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const [against, setAgainst] = useState<'before' | 'now'>('before');
  const [copies, setCopies] = useState<Record<number, Snapshot>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const index = revisions.findIndex((r) => r.id === picked);
  const chosen = index >= 0 ? revisions[index] : null;
  const earlier = index >= 0 ? revisions[index + 1] ?? null : null;

  useEffect(() => {
    if (picked === null && revisions.length) setPicked(revisions[0].id);
  }, [revisions, picked]);

  // The text of the chosen version, and of the one before it, is fetched when first needed.
  useEffect(() => {
    const wanted = [chosen?.id, against === 'before' ? earlier?.id : undefined].filter((id): id is number => typeof id === 'number' && !copies[id]);
    if (!wanted.length) return;
    let cancelled = false;
    setProblem(null);
    Promise.all(wanted.map((id) => api<{ id: number; snapshot: Snapshot }>(`${DESK}&view=revision&rev=${id}`)))
      .then((loaded) => {
        if (!cancelled) setCopies((current) => ({ ...current, ...Object.fromEntries(loaded.map((r) => [r.id, r.snapshot])) }));
      })
      .catch((err) => {
        if (!cancelled) setProblem(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen?.id, earlier?.id, against]);

  const version = chosen ? copies[chosen.id] : undefined;
  // "before": what this save changed. "now": what has changed since this version.
  const from = against === 'before' ? (earlier ? copies[earlier.id] : undefined) : version;
  const to = against === 'before' ? version : now;
  const first = against === 'before' && chosen !== null && earlier === null;

  const compared = useMemo(() => {
    if (!from || !to) return null;
    return { headline: diffWords(from.headline, to.headline), summary: diffWords(from.summary, to.summary), body: diffWords(from.body, to.body), small: smallChanges(from, to) };
  }, [from, to]);
  const nothing = compared && !changed(compared.headline) && !changed(compared.summary) && !changed(compared.body) && compared.small.length === 0;

  return (
    <Dialog
      open
      wide
      title="Version history"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canRestore && (
            <Button disabled={!version || !chosen} onClick={() => version && chosen && onRestore(version, chosen.created_at)} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
              Restore this version
            </Button>
          )}
        </>
      }
    >
      {list.error ? (
        <ErrorState message={list.error} onRetry={() => list.reload()} />
      ) : list.loading ? (
        <Spinner label="Loading the versions" />
      ) : revisions.length === 0 ? (
        <div className="py-8 text-center">
          <History className="mx-auto h-8 w-8 text-navy" aria-hidden="true" />
          <p className="mt-2 text-lg font-extrabold text-ink">No versions yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[15px] leading-snug text-muted">A version is kept each time a save changes the story, starting from the next save.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[230px_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="mb-1.5 text-[12px] font-black tracking-[0.08em] text-muted uppercase">
              {revisions.length} {revisions.length === 1 ? 'version' : 'versions'}, newest first
            </p>
            <ol className="max-h-48 divide-y divide-line overflow-y-auto border border-line md:max-h-[52dvh]">
              {revisions.map((revision, i) => (
                <li key={revision.id}>
                  <button
                    type="button"
                    aria-current={picked === revision.id ? 'true' : undefined}
                    onClick={() => setPicked(revision.id)}
                    className={cx('block w-full cursor-pointer border-l-[3px] px-3 py-2 text-left', picked === revision.id ? 'border-brand bg-navy-tint' : 'border-transparent hover:bg-wash')}
                  >
                    <span className="block text-[14.5px] font-bold text-ink tabular-nums">{fmtDateTime(revision.created_at)}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                      <StatusBadge status={revision.status} />
                      <span className="min-w-0 truncate">
                        {revision.saved_by || 'Unknown'}
                        {i === 0 ? ' · latest' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="min-w-0">
            <div role="group" aria-label="Compare with" className="mb-3 flex flex-wrap border border-line-strong">
              {(
                [
                  ['before', 'What this save changed'],
                  ['now', 'What has changed since'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={against === key}
                  onClick={() => setAgainst(key)}
                  className={cx('h-9 flex-1 cursor-pointer px-3 text-sm font-bold whitespace-nowrap', against === key ? 'bg-ink text-white' : 'text-body hover:bg-wash')}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span>
                <ins className="bg-live-tint px-1 font-semibold text-live-deep">Added</ins>
              </span>
              <span>
                <del className="bg-brand-tint px-1 text-brand">Removed</del>
              </span>
              {version && <span className="tabular-nums">{wordCount(version.body)} words in this version</span>}
            </p>

            {problem ? (
              <ErrorState message={problem} />
            ) : first && version ? (
              <div className="space-y-3">
                <p className="border-l-4 border-navy bg-navy-tint px-3.5 py-2.5 text-sm leading-snug text-body">This is the first version that was kept, so there is nothing before it to compare with. It read:</p>
                <p className="text-[19px] leading-tight font-extrabold break-words text-ink">{version.headline}</p>
                {version.summary && <p className="text-[15px] leading-snug font-semibold break-words text-body">{version.summary}</p>}
                <p className="max-h-[38dvh] overflow-y-auto text-[15px] leading-relaxed break-words whitespace-pre-wrap text-body">{version.body || 'No text yet.'}</p>
              </div>
            ) : !compared ? (
              <Spinner label="Comparing" />
            ) : nothing ? (
              <p className="border-l-4 border-navy bg-navy-tint px-3.5 py-2.5 text-[15px] leading-snug text-body">
                {against === 'now' ? 'The editor holds exactly this version.' : 'Only the status changed at this save. The words are the same as the version before.'}
              </p>
            ) : (
              <div className="max-h-[46dvh] space-y-4 overflow-y-auto pr-1">
                {changed(compared.headline) && (
                  <section>
                    <h3 className="text-[12px] font-black tracking-[0.08em] text-muted uppercase">Headline</h3>
                    <p className="mt-1 text-[18px] leading-snug font-extrabold break-words text-ink">
                      <Changes parts={compared.headline} />
                    </p>
                  </section>
                )}
                {changed(compared.summary) && (
                  <section>
                    <h3 className="text-[12px] font-black tracking-[0.08em] text-muted uppercase">Summary</h3>
                    <p className="mt-1 text-[15px] leading-snug break-words text-body">
                      <Changes parts={compared.summary} />
                    </p>
                  </section>
                )}
                {changed(compared.body) && (
                  <section>
                    <h3 className="text-[12px] font-black tracking-[0.08em] text-muted uppercase">Article</h3>
                    <p className="mt-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-body">
                      <Changes parts={compared.body} />
                    </p>
                  </section>
                )}
                {compared.small.length > 0 && (
                  <section>
                    <h3 className="text-[12px] font-black tracking-[0.08em] text-muted uppercase">Also changed</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px] leading-snug break-words text-body">
                      {compared.small.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
            {canRestore && (
              <p className="mt-4 text-[13.5px] leading-snug text-muted">
                Restoring puts this version’s headline, summary, text, category, tags, picture, byline and search text into the editor. Nothing is saved until you save, and the versions in between are kept.
              </p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
