import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Toggle, Spinner, ErrorBox, Toast, fmtNum } from '../components/ui';

interface Block {
  id: number;
  slug?: string;
  label?: string;
  enabled: boolean;
  categoryEnabled?: boolean;
  count?: number;
  revision?: number;
}

export default function HomepagePage() {
  const list = useApi<Block[]>(() => api('/api/settings?resource=homepage'), []);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Homepage sections · 180news Newsroom CMS';
  }, []);

  useEffect(() => {
    if (list.data) setBlocks(list.data);
  }, [list.data]);

  const dirty =
    blocks &&
    list.data &&
    JSON.stringify(blocks.map((b) => ({ id: b.id, enabled: b.enabled }))) !==
      JSON.stringify(list.data.map((b) => ({ id: b.id, enabled: b.enabled })));

  const move = (i: number, dir: -1 | 1) => {
    if (!blocks) return;
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };

  const save = async () => {
    if (!blocks) return;
    setSaving(true);
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: { key: 'homepage', revision: list.data?.[0]?.revision, value: { blocks: blocks.map((b) => ({ id: b.id, enabled: b.enabled })) } },
      });
      setToast('Homepage saved.');
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Site"
        title="Homepage sections"
        description="Order and switch the category blocks on the 180news front page."
        actions={
          <Button loading={saving} disabled={!dirty} onClick={save}>
            Save homepage
          </Button>
        }
      />
      <Card>
        {list.loading && !blocks ? (
          <Spinner />
        ) : list.error ? (
          <ErrorBox message={list.error} onRetry={() => list.reload()} />
        ) : (
          <ul className="divide-y divide-line">
            {(blocks || []).map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-ink">{b.label || b.slug}</p>
                  <p className="text-sm text-muted">{fmtNum(b.count || 0)} published stories</p>
                  {b.categoryEnabled === false && (
                    <p className="text-sm font-bold text-brand">Category is switched off</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" disabled={i === (blocks!.length - 1)} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Toggle
                  label={b.enabled ? 'On homepage' : 'Off homepage'}
                  checked={b.enabled}
                  onChange={(v) => setBlocks((all) => all && all.map((x) => (x.id === b.id ? { ...x, enabled: v } : x)))}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {toast && <Toast message={toast} />}
    </>
  );
}
