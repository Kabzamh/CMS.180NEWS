import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Input, Toggle, Spinner, ErrorBox, Toast, Empty } from '../components/ui';
import type { Section } from '../lib/types';

export default function SectionsPage() {
  const list = useApi<Section[]>(() => api('/api/sections'), []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Categories · 180news Newsroom CMS';
  }, []);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      if (ok) flash(ok);
      await list.reload(true);
      return true;
    } catch (e) {
      setErr(errMsg(e));
      flash(errMsg(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    const label = name.trim();
    if (label.length < 2) return setErr('Give the category a name (at least 2 characters).');
    const ok = await run('add', () => api('/api/sections', { method: 'POST', body: { label } }), `${label} added.`);
    if (ok) setName('');
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const items = [...(list.data || [])];
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    [items[idx], items[j]] = [items[j], items[idx]];
    list.setData(items);
    await run(`move-${items[j].id}`, () =>
      api('/api/sections', { method: 'PUT', body: { action: 'reorder', ids: items.map((s) => s.id) } })
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Categories"
        description="Sections on the site. Switch one off to hide its stories from the public feed."
      />
      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input label="New category" value={name} onChange={(e) => setName(e.target.value)} error={err || undefined} />
          </div>
          <Button icon={<Plus className="h-4 w-4" />} loading={busy === 'add'} onClick={add}>
            Add
          </Button>
        </div>
      </Card>
      <Card>
        {list.loading && !list.data ? (
          <Spinner />
        ) : list.error ? (
          <ErrorBox message={list.error} onRetry={() => list.reload()} />
        ) : !(list.data || []).length ? (
          <Empty title="No categories yet" />
        ) : (
          <ul className="divide-y divide-line">
            {(list.data || []).map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-ink">{s.label}</p>
                  <p className="text-sm text-muted">
                    {s.slug} · {s.count || 0} stories
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={i === (list.data!.length - 1)} onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Toggle
                    label={s.enabled ? 'On' : 'Off'}
                    checked={s.enabled}
                    disabled={busy !== null}
                    onChange={(v) =>
                      run(`en-${s.id}`, () => api('/api/sections', { method: 'PUT', body: { id: s.id, enabled: v } }), v ? `${s.label} is back on the site.` : `${s.label} is switched off.`)
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {toast && <Toast message={toast} />}
    </>
  );
}
