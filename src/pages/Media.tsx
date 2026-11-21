import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Check, Copy, Film, Headphones, Images, Search, Trash2, Upload } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { uploadImage } from '../lib/image';
import { AUDIO_ACCEPT, VIDEO_ACCEPT, fileKind, mediaKind, uploadClip, type MediaKind } from '../lib/clips';
import { useMember } from '../contexts/AuthContext';
import { useLoad } from '../hooks/useLoad';
import { canEdit, type MediaItem } from '../lib/types';
import { fmtBytes, fmtDateTime } from '../lib/format';
import { Button, ConfirmDialog, Dialog, EmptyState, ErrorState, PageHeader, Pill, Skeleton, TextInput, cx, inputClass, useToast } from '../components/ui';

export default function Media() {
  const member = useMember();
  const toast = useToast();
  const media = useLoad(() => api<MediaItem[]>('/api/media'), []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | MediaKind>('all');
  const [progress, setProgress] = useState<{ done: number; total: number; percent?: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [alt, setAlt] = useState('');
  const [savingAlt, setSavingAlt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toDelete, setToDelete] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = 'Media library · 180news Newsroom CMS';
  }, []);

  const upload = async (files: File[]) => {
    if (!files.length || progress) return;
    setProblems([]);
    const failed: string[] = [];
    let done = 0;
    setProgress({ done: 0, total: files.length });
    for (const file of files) {
      try {
        const type = fileKind(file);
        if (type === 'video' || type === 'audio') {
          await uploadClip(file, type, (percent) => setProgress({ done, total: files.length, percent }));
        } else if (type === 'image') {
          await uploadImage(file);
        } else {
          throw new Error(`${file.name} is not an image, video or audio file the library can take.`);
        }
      } catch (err) {
        failed.push(errorMessage(err));
      }
      done += 1;
      setProgress({ done, total: files.length });
    }
    setProgress(null);
    setProblems(failed);
    const ok = files.length - failed.length;
    if (ok > 0) toast(`${ok} ${ok === 1 ? 'file' : 'files'} added to the library.`);
    if (fileRef.current) fileRef.current.value = '';
    await media.reload(true);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    upload(Array.from(e.dataTransfer.files));
  };

  const openItem = (item: MediaItem) => {
    setOpen(item);
    setAlt(item.alt ?? '');
    setCopied(false);
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Copying is blocked in this browser. Select the link and copy it by hand.', 'error');
    }
  };

  const saveAlt = async () => {
    if (!open) return;
    setSavingAlt(true);
    try {
      const saved = await api<MediaItem>('/api/media', { method: 'PUT', body: { id: open.id, alt } });
      setOpen({ ...open, alt: saved.alt });
      toast('Description saved.');
      await media.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSavingAlt(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api('/api/media', { method: 'DELETE', body: { id: toDelete.id } });
      toast('Deleted from the library.');
      setToDelete(null);
      setOpen(null);
      await media.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const term = search.trim().toLowerCase();
  const all = media.data ?? [];
  const counts = { all: all.length, image: 0, video: 0, audio: 0 };
  for (const m of all) counts[mediaKind(m.content_type)] += 1;
  const items = all.filter((m) => (kind === 'all' || mediaKind(m.content_type) === kind) && (!term || m.file_name.toLowerCase().includes(term) || (m.alt ?? '').toLowerCase().includes(term)));
  const mayDelete = (m: MediaItem) => canEdit(member) || m.uploader_id === member.id;

  return (
    <>
      <PageHeader
        eyebrow="Newsroom"
        title="Media library"
        description="Pictures, short videos and audio clips for stories and adverts. Large images are resized as they upload."
        actions={
          <Button loading={Boolean(progress)} onClick={() => fileRef.current?.click()} icon={<Upload className="h-[18px] w-[18px]" aria-hidden="true" />}>
            {progress ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}${progress.percent !== undefined ? ` · ${progress.percent}%` : ''}` : 'Upload files'}
          </Button>
        }
      />

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={`image/jpeg,image/png,image/webp,image/gif,${VIDEO_ACCEPT},${AUDIO_ACCEPT}`}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => upload(Array.from(e.target.files ?? []))}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          'mb-5 hidden items-center justify-center gap-3 border-2 border-dashed px-6 py-6 text-[15px] font-semibold md:flex',
          dragging ? 'border-navy bg-navy-tint text-navy' : 'border-line-strong bg-paper text-muted',
        )}
      >
        <Upload className="h-5 w-5" aria-hidden="true" />
        Drag files here to upload them. Images, short videos (MP4, MOV, WebM) and audio clips (MP3, M4A, WAV, OGG) up to 50 MB.
      </div>

      {problems.length > 0 && (
        <div role="alert" className="mb-5 border-l-4 border-brand bg-brand-tint px-4 py-3 text-[15px] text-ink">
          <p className="font-extrabold">{problems.length === 1 ? 'One file was not uploaded' : `${problems.length} files were not uploaded`}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {(media.data?.length ?? 0) > 0 && (
        <>
          <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div role="group" aria-label="Filter by type" className="flex w-max gap-1.5">
              {(
                [
                  ['all', 'All'],
                  ['image', 'Images'],
                  ['video', 'Videos'],
                  ['audio', 'Audio'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={kind === key}
                  onClick={() => setKind(key)}
                  className={cx(
                    'inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 border px-3.5 text-[15px] font-bold whitespace-nowrap transition-colors',
                    kind === key ? 'border-ink bg-ink text-white' : 'border-line-strong bg-paper text-body hover:border-ink hover:text-ink',
                  )}
                >
                  {label}
                  <span className={cx('text-[13px] font-extrabold tabular-nums', kind === key ? 'text-white/80' : 'text-muted')}>{counts[key]}</span>
                </button>
              ))}
            </div>
          </div>
        <div className="relative mb-5 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" aria-label="Search the library" placeholder="Search by file name or description" value={search} onChange={(e) => setSearch(e.target.value)} className={cx(inputClass, 'pl-10')} />
        </div>
        </>
      )}

      {media.error && !media.data ? (
        <ErrorState message={media.error} onRetry={() => media.reload()} />
      ) : media.loading && !media.data ? (
        <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full" />
          ))}
        </div>
      ) : (media.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Images className="h-8 w-8" aria-hidden="true" />}
          title="The library is empty"
          action={
            <Button onClick={() => fileRef.current?.click()} icon={<Upload className="h-[18px] w-[18px]" aria-hidden="true" />}>
              Upload the first file
            </Button>
          }
        >
          Pictures, short videos and audio clips you add to stories are kept here so the team can use them again.
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={<Search className="h-8 w-8" aria-hidden="true" />} title="Nothing matches" action={<Button variant="outline" onClick={() => { setSearch(''); setKind('all'); }}>Show everything</Button>}>
          Try part of the file name, or a different type.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => openItem(item)} className="group block w-full cursor-pointer border border-line bg-paper text-left transition-colors hover:border-ink">
                <span className="relative block">
                  {mediaKind(item.content_type) === 'image' ? (
                    <img src={item.url} alt={item.alt || item.file_name} loading="lazy" className="aspect-[4/3] w-full bg-wash object-cover" />
                  ) : (
                    <span className={cx('flex aspect-[4/3] w-full flex-col items-center justify-center gap-2', mediaKind(item.content_type) === 'video' ? 'bg-navy-deep text-white' : 'bg-navy-tint text-navy')}>
                      {mediaKind(item.content_type) === 'video' ? <Film className="h-8 w-8" aria-hidden="true" /> : <Headphones className="h-8 w-8" aria-hidden="true" />}
                      <span className="text-[12px] font-black tracking-[0.08em] uppercase">{mediaKind(item.content_type) === 'video' ? 'Short video' : 'Audio clip'}</span>
                    </span>
                  )}
                  {item.in_use && <Pill className="absolute top-2 left-2 bg-live-tint text-live-deep">In use</Pill>}
                </span>
                <span className="block px-3 py-2.5">
                  <span className="block truncate text-sm font-bold text-ink group-hover:text-brand">{item.file_name}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted">
                    {item.width && item.height ? `${item.width} × ${item.height} · ` : ''}
                    {fmtBytes(item.size)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title="File details"
        wide
        footer={
          open && (
            <>
              {mayDelete(open) && (
                <Button variant="danger" onClick={() => setToDelete(open)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
                  Delete
                </Button>
              )}
              <Button variant="navy" onClick={() => copyUrl(open.url)} icon={copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}>
                {copied ? 'Link copied' : 'Copy link'}
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="flex items-center justify-center border border-line bg-wash p-2">
              {mediaKind(open.content_type) === 'video' ? (
                <video src={open.url} controls playsInline preload="metadata" className="max-h-[52dvh] w-auto max-w-full bg-ink" />
              ) : mediaKind(open.content_type) === 'audio' ? (
                <audio src={open.url} controls preload="metadata" className="my-8 w-full max-w-sm" />
              ) : (
                <img src={open.url} alt={open.alt || open.file_name} className="max-h-[52dvh] w-auto max-w-full object-contain" />
              )}
            </div>
            <div className="min-w-0 space-y-4">
              <dl className="space-y-2 text-[15px]">
                <div>
                  <dt className="text-[13px] font-bold text-muted">File</dt>
                  <dd className="font-bold break-all text-ink">{open.file_name}</dd>
                </div>
                <div>
                  <dt className="text-[13px] font-bold text-muted">Size</dt>
                  <dd className="text-ink">
                    {open.width && open.height ? `${open.width} × ${open.height} pixels, ` : ''}
                    {fmtBytes(open.size)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] font-bold text-muted">Added</dt>
                  <dd className="text-ink">
                    {fmtDateTime(open.created_at)} by {open.uploaded_by}
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] font-bold text-muted">Used on the site</dt>
                  <dd className="text-ink">{open.in_use ? 'Yes, in a story or advert' : 'Not at the moment'}</dd>
                </div>
              </dl>
              <TextInput
                label="Description"
                optional
                maxLength={200}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                hint={mediaKind(open.content_type) === 'image' ? 'What the picture shows, for readers who cannot see it.' : 'What the clip is about, to help the team find it again.'}
              />
              <Button variant="outline" size="sm" loading={savingAlt} disabled={alt === (open.alt ?? '')} onClick={saveAlt}>
                Save description
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this file?"
        confirmLabel="Delete file"
        busy={deleting}
        onConfirm={remove}
        onClose={() => !deleting && setToDelete(null)}
      >
        <p>
          <span className="font-bold break-all text-ink">{toDelete?.file_name}</span> will be removed from the library. This cannot be undone.
        </p>
        {toDelete?.in_use && (
          <p className="mt-2 font-bold text-brand">
            {mediaKind(toDelete.content_type) === 'image'
              ? 'It is used in a story or advert at the moment, and will show as a broken picture there until it is replaced.'
              : 'It is on a story at the moment. Deleting it also takes it off that story.'}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
