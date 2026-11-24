import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Input, Spinner, ErrorBox, Toast, Empty } from '../components/ui';
import type { MediaAsset } from '../lib/types';

export default function MediaPage() {
  const list = useApi<MediaAsset[]>(() => api('/api/media'), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [edit, setEdit] = useState<MediaAsset | null>(null);
  const [alt, setAlt] = useState('');
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all');

  useEffect(() => {
    document.title = 'Media library · 180news Newsroom CMS';
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await api('/api/media', {
        method: 'POST',
        body: { fileName: file.name, fileBase64: base64, contentType: file.type },
      });
      setToast('Uploaded.');
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setUploading(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const saveAlt = async () => {
    if (!edit) return;
    try {
      await api('/api/media', { method: 'PUT', body: { id: edit.id, alt } });
      setToast('Description saved.');
      setEdit(null);
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const remove = async (m: MediaAsset) => {
    try {
      await api('/api/media', { method: 'DELETE', body: { id: m.id } });
      setToast('Removed from the library.');
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const items = (list.data || []).filter((m) => filter === 'all' || m.kind === filter || m.content_type?.startsWith(filter + '/'));

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Media library"
        description="Pictures, short videos and audio clips for stories and adverts."
        actions={
          <>
            <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button loading={uploading} icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Upload
            </Button>
          </>
        }
      />
      <div className="mb-4 flex gap-2">
        {(['all', 'image', 'video', 'audio'] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'navy' : 'outline'} onClick={() => setFilter(f)} className="capitalize">
            {f}
          </Button>
        ))}
      </div>
      <Card>
        {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> : !items.length ? (
          <Empty title="Nothing in the library yet" />
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((m) => (
              <div key={m.id} className="border border-line bg-wash">
                {m.kind === 'image' || m.content_type?.startsWith('image/') ? (
                  <img src={m.url} alt={m.alt || ''} className="aspect-video w-full object-cover" />
                ) : m.kind === 'video' || m.content_type?.startsWith('video/') ? (
                  <video src={m.url} className="aspect-video w-full object-cover" controls />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-navy-tint text-sm font-bold text-navy">Audio</div>
                )}
                <div className="space-y-2 p-2">
                  <p className="truncate text-xs font-bold text-ink">{m.file_name}</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEdit(m); setAlt(m.alt || ''); }}>Alt</Button>
                    <Button size="sm" variant="danger" onClick={() => remove(m)} aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="w-full max-w-md space-y-4 border border-line bg-paper p-6">
            <h3 className="text-lg font-extrabold">Description</h3>
            <Input label="Alt text" value={alt} onChange={(e) => setAlt(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={saveAlt}>Save</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}
