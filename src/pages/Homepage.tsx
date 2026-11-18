import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useLoad } from '../hooks/useLoad';
import type { HomeBlock } from '../lib/types';
import { Button, Card, CardHead, ErrorState, IconButton, PageHeader, Pill, SkeletonRows, Switch, cx, useToast } from '../components/ui';

const slim = (blocks: HomeBlock[]) => blocks.map((b) => ({ id: b.id, enabled: b.enabled, count: b.count }));

export default function Homepage() {
  const toast = useToast();
  const saved = useLoad(() => api<HomeBlock[]>('/api/settings?resource=homepage'), []);
  const [blocks, setBlocks] = useState<HomeBlock[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Homepage sections · 180news Newsroom CMS';
  }, []);

  useEffect(() => {
    if (saved.data) setBlocks(saved.data);
  }, [saved.data]);

  const dirty = Boolean(blocks && saved.data && JSON.stringify(slim(blocks)) !== JSON.stringify(slim(saved.data)));

  const move = (index: number, direction: -1 | 1) => {
    if (!blocks) return;
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);
  };

  const patch = (id: string, change: Partial<HomeBlock>) => setBlocks((list) => (list ? list.map((b) => (b.id === id ? { ...b, ...change } : b)) : list));

  const save = async () => {
    if (!blocks) return;
    setSaving(true);
    try {
      await api('/api/settings', { method: 'PUT', body: { key: 'homepage', value: { blocks: slim(blocks) } } });
      toast('Homepage saved.');
      await saved.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const shown = blocks?.filter((b) => b.enabled && b.categoryEnabled !== false).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Site"
        title="Homepage sections"
        description="The blocks that make up the front page, top to bottom. Put them in order, switch them on or off and set how many stories each one shows."
      />

      {saved.error && !saved.data ? (
        <ErrorState message={saved.error} onRetry={() => saved.reload()} />
      ) : !blocks ? (
        <SkeletonRows rows={6} />
      ) : (
        <Card className="max-w-4xl">
          <CardHead title="Front page, top to bottom" note={`${shown} of ${blocks.length} blocks showing`} />
          <ol className="divide-y divide-line">
            {blocks.map((block, index) => {
              const off = !block.enabled || block.categoryEnabled === false;
              return (
                <li key={block.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex shrink-0 flex-col gap-1">
                      <IconButton label={`Move ${block.label} up`} disabled={index === 0 || saving} onClick={() => move(index, -1)} className="h-7 w-8">
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Move ${block.label} down`} disabled={index === blocks.length - 1 || saving} onClick={() => move(index, 1)} className="h-7 w-8">
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                    <span aria-hidden="true" className={cx('w-7 shrink-0 text-center text-[22px] leading-none font-black tabular-nums', off ? 'text-line-strong' : 'text-brand')}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={cx('text-[16px] font-extrabold', off ? 'text-muted' : 'text-ink')}>{block.label}</span>
                        {block.type === 'category' && <Pill className="bg-navy-tint text-navy">Category</Pill>}
                        {block.categoryEnabled === false && <Pill className="bg-warn-tint text-warn-deep">Category switched off</Pill>}
                      </p>
                      <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{block.description}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-4 pl-[84px] sm:pl-0">
                    {block.count !== null && block.min !== null && block.max !== null && (
                      <label className="flex items-center gap-2 text-sm font-bold text-ink">
                        Stories
                        <select
                          value={block.count}
                          disabled={saving}
                          onChange={(e) => patch(block.id, { count: Number(e.target.value) })}
                          className="h-9 cursor-pointer border border-line-strong bg-paper px-2 text-sm font-bold text-ink focus:border-navy focus:ring-2 focus:ring-navy/20 focus:outline-none"
                        >
                          {Array.from({ length: block.max - block.min + 1 }, (_, i) => block.min! + i).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {block.locked ? (
                      <span className="flex items-center gap-2 text-sm">
                        <Pill className={block.enabled ? 'bg-live-tint text-live-deep' : 'bg-wash text-body ring-1 ring-line-strong ring-inset'}>{block.enabled ? 'On' : 'Off'}</Pill>
                        {block.managedPath && (
                          <Link to={block.managedPath} className="font-bold whitespace-nowrap text-navy hover:underline">
                            Change in {block.managedIn}
                          </Link>
                        )}
                      </span>
                    ) : (
                      <Switch label={`Show ${block.label} on the homepage`} checked={block.enabled} disabled={saving} onChange={(enabled) => patch(block.id, { enabled })} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-wash px-5 py-3.5">
            <p className="text-sm text-muted">{dirty ? <span className="font-bold text-warn-deep">Changes not saved yet.</span> : 'Up to date.'}</p>
            <div className="flex flex-wrap gap-2">
              {dirty && (
                <Button variant="outline" disabled={saving} onClick={() => setBlocks(saved.data)}>
                  Undo changes
                </Button>
              )}
              <Button loading={saving} disabled={!dirty} onClick={save}>
                Save homepage
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
