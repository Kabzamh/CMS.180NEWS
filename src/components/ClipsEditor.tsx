import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Film, FolderOpen, Headphones, Play, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { AUDIO_ACCEPT, MAX_CLIPS, VIDEO_ACCEPT, clipFromMedia, clipKey, mediaKind, uploadClip, youtubeId } from '../lib/clips';
import { fmtBytes, fmtShort } from '../lib/format';
import type { ArticleClip, MediaItem } from '../lib/types';
import { useLoad } from '../hooks/useLoad';
import { KindPill } from './ClipPlayer';
import { Button, Card, CardHead, Dialog, EmptyState, ErrorState, IconButton, SelectInput, Spinner, TextInput, cx, inputClass } from './ui';

function ClipLibrary({ taken, onPick, onClose }: { taken: Set<string>; onPick: (item: MediaItem) => void; onClose: () => void }) {
  const media = useLoad(() => api<MediaItem[]>('/api/media'), []);
  const clips = (media.data ?? []).filter((item) => mediaKind(item.content_type) !== 'image');
  return (
    <Dialog open onClose={onClose} title="Choose a video or audio clip" wide>
      {media.loading ? (
        <Spinner label="Loading clips" />
      ) : media.error ? (
        <ErrorState message={media.error} onRetry={() => media.reload()} />
      ) : clips.length === 0 ? (
        <EmptyState icon={<Film className="h-8 w-8" aria-hidden="true" />} title="No clips in the library yet">
          Upload a short video or an audio clip and it is kept here to use again.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {clips.map((item) => {
            const kind = mediaKind(item.content_type) === 'audio' ? 'audio' : 'video';
            const added = taken.has(item.url);
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0">
                  <KindPill kind={kind} />
                  <p className="mt-1 text-[15px] font-bold break-all text-ink">{item.file_name}</p>
                  <p className="text-[13px] text-muted">
                    {fmtBytes(item.size)} · added {fmtShort(item.created_at)} by {item.uploaded_by}
                  </p>
                </div>
                <Button variant={added ? 'outline' : 'navy'} size="sm" disabled={added} onClick={() => onPick(item)}>
                  {added ? 'On this story' : 'Add to story'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

export function ClipsEditor({
  value,
  onChange,
  disabled,
  error,
  onBusyChange,
}: {
  value: ArticleClip[];
  onChange: (clips: ArticleClip[]) => void;
  disabled?: boolean;
  error?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const uploading = upload !== null;
  const full = value.length >= MAX_CLIPS;

  useEffect(() => {
    onBusyChange?.(uploading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploading]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Adds a clip to the latest list. Returns a message when it cannot be added. */
  const add = (clip: ArticleClip): string | null => {
    const list = valueRef.current;
    if (list.some((existing) => clipKey(existing) === clipKey(clip))) return 'That clip is already on this story.';
    if (list.length >= MAX_CLIPS) return `A story can carry ${MAX_CLIPS} clips at most. Remove one first.`;
    onChange([...list, clip]);
    return null;
  };

  const addLink = (e: FormEvent) => {
    e.preventDefault();
    const id = youtubeId(link);
    if (!id) return setLinkError('That does not look like a YouTube link. Copy it from the Share button under the video.');
    const portrait = /\/shorts\//i.test(link);
    const failed = add({
      kind: 'youtube',
      url: `https://www.youtube.com/watch?v=${id}`,
      youtube_id: id,
      title: '',
      caption: '',
      credit: '',
      slot: 'top',
      width: portrait ? 9 : 16,
      height: portrait ? 16 : 9,
      content_type: null,
      size: null,
      file_name: null,
    });
    if (failed) return setLinkError(failed);
    setLink('');
    setLinkError(null);
    setLinkOpen(false);
    setProblem(null);
  };

  const onFile = async (file: File | undefined, kind: 'video' | 'audio') => {
    if (!file || uploading) return;
    setProblem(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setUpload({ name: file.name, percent: 0 });
    try {
      const item = await uploadClip(file, kind, (percent) => setUpload({ name: file.name, percent }), controller.signal);
      const failed = add(clipFromMedia(item));
      if (failed) setProblem(failed);
    } catch (err) {
      if (!controller.signal.aborted) setProblem(errorMessage(err));
    } finally {
      abortRef.current = null;
      setUpload(null);
      if (videoRef.current) videoRef.current.value = '';
      if (audioRef.current) audioRef.current.value = '';
    }
  };

  const patch = (index: number, change: Partial<ArticleClip>) => onChange(value.map((clip, i) => (i === index ? { ...clip, ...change } : clip)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const shown = problem ?? error;
  const blocked = disabled || uploading;

  return (
    <Card className="@container">
      <CardHead
        title="Video and audio"
        note="YouTube videos, short videos and audio clips shown with the story"
        action={value.length > 0 ? <span className="text-sm font-bold text-muted tabular-nums">{value.length} of {MAX_CLIPS}</span> : undefined}
      />

      {shown && (
        <p role="alert" className="border-b border-line bg-brand-tint px-5 py-3 text-[14.5px] font-bold text-brand">
          {shown}
        </p>
      )}

      {value.length === 0 ? (
        <p className="px-5 py-6 text-[15px] leading-snug text-muted">
          {disabled ? 'This story has no video or audio.' : 'Nothing added yet. Embed a YouTube video, or upload a short video or an audio clip from your phone or computer.'}
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {value.map((clip, index) => (
            <li key={clipKey(clip)} aria-label={`Clip ${index + 1} of ${value.length}`} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <KindPill kind={clip.kind} />
                <p className="min-w-0 flex-1 basis-40 truncate text-sm text-muted">
                  {clip.kind === 'youtube' ? (
                    <a href={clip.url} target="_blank" rel="noreferrer" className="font-semibold text-navy hover:underline">
                      youtu.be/{clip.youtube_id}
                    </a>
                  ) : (
                    <>
                      <span className="font-semibold text-body">{clip.file_name ?? 'Uploaded clip'}</span>
                      {clip.size ? ` · ${fmtBytes(clip.size)}` : ''}
                    </>
                  )}
                </p>
                {!disabled && (
                  <div className="flex shrink-0 gap-1.5">
                    <IconButton label={`Move clip ${index + 1} up`} disabled={index === 0 || uploading} onClick={() => move(index, -1)}>
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton label={`Move clip ${index + 1} down`} disabled={index === value.length - 1 || uploading} onClick={() => move(index, 1)}>
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton label={`Remove clip ${index + 1} from the story`} tone="danger" disabled={uploading} onClick={() => onChange(value.filter((_, i) => i !== index))}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                  </div>
                )}
              </div>

              <div className="mt-3 grid gap-4 @lg:grid-cols-[200px_minmax(0,1fr)]">
                <div className="max-w-md min-w-0">
                  {clip.kind === 'youtube' ? (
                    <a href={clip.url} target="_blank" rel="noreferrer" aria-label="Open the video on YouTube" className="group relative block">
                      <img src={`https://i.ytimg.com/vi/${clip.youtube_id}/hqdefault.jpg`} alt="" loading="lazy" className="aspect-video w-full bg-ink object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-colors group-hover:bg-brand-strong">
                          <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
                        </span>
                      </span>
                    </a>
                  ) : clip.kind === 'video' ? (
                    <video src={clip.url} controls playsInline preload="metadata" className="aspect-video w-full bg-ink object-contain" />
                  ) : (
                    <>
                      <div aria-hidden="true" className="flex h-16 items-center justify-center bg-navy-tint text-navy">
                        <Headphones className="h-7 w-7" />
                      </div>
                      <audio src={clip.url} controls preload="none" className="mt-2 w-full" />
                    </>
                  )}
                </div>

                <div className="min-w-0 space-y-3">
                  <TextInput
                    label="Title"
                    optional
                    maxLength={120}
                    disabled={blocked}
                    value={clip.title}
                    onChange={(e) => patch(index, { title: e.target.value })}
                    placeholder={clip.kind === 'audio' ? 'For example, Listen: the mayor responds' : 'For example, Watch: the scene outside court'}
                  />
                  <TextInput label="Caption" optional maxLength={240} disabled={blocked} value={clip.caption} onChange={(e) => patch(index, { caption: e.target.value })} />
                  <div className="grid gap-3 @2xl:grid-cols-2">
                    <TextInput label="Credit" optional maxLength={120} disabled={blocked} value={clip.credit} onChange={(e) => patch(index, { credit: e.target.value })} />
                    <SelectInput label="Where it appears" disabled={blocked} value={clip.slot} onChange={(e) => patch(index, { slot: e.target.value === 'bottom' ? 'bottom' : 'top' })}>
                      <option value="top">Before the story text</option>
                      <option value="bottom">After the story text</option>
                    </SelectInput>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {!disabled && (
        <div className="border-t border-line bg-wash p-4 sm:p-5">
          <input ref={videoRef} type="file" accept={VIDEO_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" data-clip-input="video" onChange={(e) => onFile(e.target.files?.[0], 'video')} />
          <input ref={audioRef} type="file" accept={AUDIO_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" data-clip-input="audio" onChange={(e) => onFile(e.target.files?.[0], 'audio')} />

          {upload ? (
            <div role="status">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-[15px] font-bold text-ink">Uploading {upload.name}</p>
                <span className="shrink-0 text-[15px] font-extrabold text-navy tabular-nums">{upload.percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label={`Uploading ${upload.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={upload.percent}
                className="mt-2 h-2 bg-line"
              >
                <div className="h-full bg-navy transition-[width] duration-200" style={{ width: `${upload.percent}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13.5px] text-muted">Keep this page open. Saving is paused until the upload finishes.</p>
                <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
                  Cancel upload
                </Button>
              </div>
            </div>
          ) : linkOpen ? (
            <form onSubmit={addLink} noValidate>
              <label htmlFor="clip-youtube-link" className="mb-1.5 block text-sm font-bold text-ink">
                YouTube link
              </label>
              <div className="flex flex-col gap-2 @xl:flex-row">
                <input
                  id="clip-youtube-link"
                  autoFocus
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={link}
                  aria-invalid={linkError ? true : undefined}
                  aria-describedby="clip-youtube-help"
                  onChange={(e) => {
                    setLink(e.target.value);
                    setLinkError(null);
                  }}
                  className={cx(inputClass, linkError && 'border-brand')}
                />
                <div className="flex gap-2">
                  <Button type="submit" variant="navy" className="flex-1 @xl:flex-none">
                    Add video
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setLinkOpen(false);
                      setLink('');
                      setLinkError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
              <p id="clip-youtube-help" role={linkError ? 'alert' : undefined} className={cx('mt-1.5 text-[13.5px] leading-snug', linkError ? 'font-bold text-brand' : 'text-muted')}>
                {linkError ?? 'Paste the link to a video, a Short or a live stream. It plays inside the story.'}
              </p>
            </form>
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2">
                <Button variant="outline" disabled={full} onClick={() => setLinkOpen(true)} icon={<Play className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />}>
                  Add YouTube video
                </Button>
                <Button variant="outline" disabled={full} onClick={() => videoRef.current?.click()} icon={<Film className="h-4 w-4 shrink-0 text-navy" aria-hidden="true" />}>
                  Upload short video
                </Button>
                <Button variant="outline" disabled={full} onClick={() => audioRef.current?.click()} icon={<Headphones className="h-4 w-4 shrink-0 text-navy" aria-hidden="true" />}>
                  Upload audio clip
                </Button>
                <Button variant="outline" disabled={full} onClick={() => setLibraryOpen(true)} icon={<FolderOpen className="h-4 w-4 shrink-0 text-navy" aria-hidden="true" />}>
                  From library
                </Button>
              </div>
              <p className="mt-2.5 text-[13.5px] leading-snug text-muted">
                {full
                  ? `${MAX_CLIPS} clips is the limit for one story. Remove one to add another.`
                  : 'Short videos: MP4, MOV or WebM. Audio: MP3, M4A, WAV or OGG. Up to 50 MB each. MP4 video plays on every phone.'}
              </p>
            </>
          )}
        </div>
      )}

      {libraryOpen && (
        <ClipLibrary
          taken={new Set(value.map((clip) => clip.url))}
          onClose={() => setLibraryOpen(false)}
          onPick={(item) => {
            const failed = add(clipFromMedia(item));
            setProblem(failed);
            setLibraryOpen(false);
          }}
        />
      )}
    </Card>
  );
}
