import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Input, Spinner, ErrorBox, Toast, Empty } from '../components/ui';

interface TagRow { tag: string; count: number }

export default function TagsPage() {
  const list = useApi<TagRow[]>(() => api('/api/tags'), []);
  const [edit, setEdit] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Tags · 180news Newsroom CMS';
  }, []);

  const rename = async () => {
    if (!edit || !to.trim()) return;
    setBusy(true);
    try {
      await api('/api/tags', { method: 'PUT', body: { from: edit, to: to.trim() } });
      setToast('Tag renamed on every story that uses it.');
      setEdit(null);
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const remove = async (tag: string) => {
    setBusy(true);
    try {
      await api('/api/tags', { method: 'DELETE', body: { tag } });
      setToast(`“${tag}” removed from every story.`);
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Library" title="Tags" description="Rename or remove tags across every story." />
      <Card>
        {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> : !(list.data || []).length ? (
          <Empty title="No tags yet" />
        ) : (
          <ul className="divide-y divide-line">
            {(list.data || []).map((t) => (
              <li key={t.tag} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">{t.tag}</p>
                  <p className="text-sm text-muted">{t.count} {t.count === 1 ? 'story' : 'stories'}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setEdit(t.tag); setTo(t.tag); }}>Rename</Button>
                <Button size="sm" variant="danger" loading={busy} onClick={() => remove(t.tag)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="w-full max-w-md space-y-4 border border-line bg-paper p-6">
            <h3 className="text-lg font-extrabold">Rename tag</h3>
            <Input label="New name" value={to} onChange={(e) => setTo(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
              <Button loading={busy} onClick={rename}>Save</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}
