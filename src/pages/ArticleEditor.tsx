import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Save, Send, Clock, EyeOff, Trash2, ImagePlus, X, Youtube, Film, Headphones } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, ApiError, errMsg } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader, Card, CardHead, Button, Input, TextArea, Select, Spinner, ErrorBox, Toast, Badge,
} from '../components/ui';
import { MediaPlayer, parseYouTubeId } from '../components/MediaPlayer';
import type { Article, ArticleStatus, MediaAsset, MediaEmbed, Placement, Section } from '../lib/types';

interface FormState {
  headline: string;
  summary: string;
  body: string;
  section: string;
  tags: string[];
  image_url: string | null;
  image_caption: string;
  image_credit: string;
  author_name: string;
  placement: Placement;
  when: 'now' | 'later';
  publish_local: string;
  media: Article['media'];
}

const empty = (name: string): FormState => ({
  headline: '',
  summary: '',
  body: '',
  section: '',
  tags: [],
  image_url: null,
  image_caption: '',
  image_credit: '',
  author_name: name,
  placement: 'none',
  when: 'now',
  publish_local: '',
  media: [],
});

function fromArticle(a: Article): FormState {
  return {
    headline: a.headline,
    summary: a.summary ?? '',
    body: a.body ?? '',
    section: a.section ?? '',
    tags: Array.isArray(a.tags) ? a.tags : [],
    image_url: a.image_url,
    image_caption: a.image_caption ?? '',
    image_credit: a.image_credit ?? '',
    author_name: a.author_name ?? '',
    placement: a.placement || 'none',
    when: a.status === 'scheduled' ? 'later' : 'now',
    publish_local:
      a.status === 'scheduled' && a.publish_at
        ? new Date(a.publish_at).toISOString().slice(0, 16)
        : '',
    media: a.media ?? [],
  };
}

function toLocalInputValue(d = new Date()) {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ArticleEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const nav = useNavigate();
  const { member } = useAuth();
  const [form, setForm] = useState<FormState>(() => empty(member?.name || ''));
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [picker, setPicker] = useState<'image' | 'clip' | false>(false);
  const [delOpen, setDelOpen] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytError, setYtError] = useState<string | null>(null);
  const [clipUploading, setClipUploading] = useState(false);

  const sections = useApi<Section[]>(() => api('/api/sections'), []);
  const media = useApi<MediaAsset[]>(() => api('/api/media'), []);

  useEffect(() => {
    document.title = isNew ? 'New story · 180news Newsroom CMS' : 'Edit story · 180news Newsroom CMS';
  }, [isNew]);

  useEffect(() => {
    if (isNew) {
      setForm(empty(member?.name || ''));
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    api<Article>(`/api/articles?id=${encodeURIComponent(id!)}`)
      .then((a) => {
        if (!alive) return;
        setArticle(a);
        setForm(fromArticle(a));
      })
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, isNew, member?.name]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const buildPayload = (status: ArticleStatus) => {
    const publish_at =
      status === 'scheduled'
        ? form.publish_local
          ? new Date(form.publish_local).toISOString()
          : null
        : status === 'published'
          ? article?.publish_at || new Date().toISOString()
          : article?.publish_at || null;
    return {
      headline: form.headline.trim(),
      summary: form.summary,
      body: form.body,
      section: form.section,
      tags: form.tags,
      image_url: form.image_url,
      image_caption: form.image_caption,
      image_credit: form.image_credit,
      author_name: form.author_name,
      placement: form.placement,
      media: form.media,
      status,
      publish_at,
    };
  };

  const save = async (status: ArticleStatus) => {
    const f: Record<string, string> = {};
    if (form.headline.trim().length < 4) f.headline = 'Give the story a headline (at least 4 characters).';
    if (status !== 'draft' && !form.section) f.section = 'Choose a category before leaving draft.';
    if (status === 'scheduled' && !form.publish_local) f.publish_local = 'Pick a date and time to schedule.';
    setFields(f);
    if (Object.keys(f).length) return;

    setSaving(true);
    try {
      const body = buildPayload(status);
      const saved = isNew || !article
        ? await api<Article>('/api/articles', { method: 'POST', body })
        : await api<Article>('/api/articles', { method: 'PUT', body: { id: article.id, ...body } });
      setArticle(saved);
      setForm(fromArticle(saved));
      const msgs: Record<string, string> = {
        draft: 'Draft saved.',
        review: 'Saved. It is with the editors for review.',
        scheduled: `Scheduled for ${new Date(saved.publish_at!).toLocaleString('en-ZA')}.`,
        published: 'Published. It is live on the site feed.',
        hidden: 'Saved. It is hidden from the site.',
      };
      setToast(msgs[status] || 'Saved.');
      if (isNew) nav(`/articles/${saved.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setToast(errMsg(e));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const uploadFile = async (file: File) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return api<MediaAsset>('/api/media', {
      method: 'POST',
      body: { fileName: file.name, fileBase64: base64, contentType: file.type },
    });
  };

  const onUpload = async (file: File) => {
    try {
      const row = await uploadFile(file);
      set({ image_url: row.url });
      media.reload(true);
      setToast('Image uploaded.');
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const onClipUpload = async (file: File) => {
    setClipUploading(true);
    try {
      const row = await uploadFile(file);
      const kind: MediaEmbed['kind'] =
        row.kind === 'audio' || row.content_type?.startsWith('audio/') ? 'audio' : 'video';
      const embed: MediaEmbed = {
        kind,
        url: row.url,
        youtube_id: null,
        title: row.file_name || '',
        caption: '',
        credit: '',
        slot: 'top',
        width: row.width,
        height: row.height,
        content_type: row.content_type,
        size: row.size,
        file_name: row.file_name,
      };
      set({ media: [...form.media, embed] });
      media.reload(true);
      setToast(kind === 'audio' ? 'Audio attached to the story.' : 'Video attached to the story.');
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setClipUploading(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const addYouTube = () => {
    const id = parseYouTubeId(ytUrl);
    if (!id) {
      setYtError('That does not look like a YouTube link. Copy it from the Share button under the video.');
      return;
    }
    const isShorts = /\/shorts\//i.test(ytUrl);
    const embed: MediaEmbed = {
      kind: 'youtube',
      url: `https://www.youtube.com/watch?v=${id}`,
      youtube_id: id,
      title: '',
      caption: '',
      credit: '',
      slot: 'top',
      width: isShorts ? 9 : 16,
      height: isShorts ? 16 : 9,
      content_type: null,
      size: null,
      file_name: null,
    };
    set({ media: [...form.media, embed] });
    setYtUrl('');
    setYtError(null);
    setToast('YouTube video added.');
    setTimeout(() => setToast(null), 3000);
  };

  const removeMedia = (idx: number) => set({ media: form.media.filter((_, i) => i !== idx) });

  const remove = async () => {
    if (!article) return;
    setSaving(true);
    try {
      await api('/api/articles', { method: 'DELETE', body: { id: article.id } });
      nav('/articles', { replace: true });
    } catch (e) {
      setToast(errMsg(e));
      setSaving(false);
    }
  };

  if (loading) return <Spinner label="Loading story" />;
  if (error) return <ErrorBox message={error} />;

  const status = article?.status || 'draft';

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title={isNew ? 'New story' : 'Edit story'}
        description={isNew ? 'Draft a story for the 180news site.' : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {article && <Badge tone={status}>{status}</Badge>}
            <Link to="/articles"><Button variant="outline">Back</Button></Link>
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <Input
              label="Headline"
              value={form.headline}
              onChange={(e) => set({ headline: e.target.value })}
              error={fields.headline}
              maxLength={200}
            />
            <TextArea
              label="Summary"
              rows={3}
              value={form.summary}
              onChange={(e) => set({ summary: e.target.value })}
              hint="Shown on cards and in feeds."
            />
            <TextArea
              label="Body"
              rows={16}
              value={form.body}
              onChange={(e) => set({ body: e.target.value })}
              className="resize-y font-normal leading-relaxed"
              hint="Write the full story. Use blank lines between paragraphs."
            />
          </Card>

          <Card>
            <CardHead title="Picture" note="Hero image for the story" />
            <div className="space-y-3 p-5">
              {form.image_url ? (
                <div className="relative">
                  <img src={form.image_url} alt="" className="max-h-64 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-2 right-2 cursor-pointer bg-ink/80 p-1.5 text-white"
                    onClick={() => set({ image_url: null })}
                    aria-label="Remove image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted">No image yet.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-11 cursor-pointer items-center gap-2 border border-line-strong bg-paper px-4 text-[15px] font-bold hover:bg-wash">
                  <ImagePlus className="h-4 w-4" /> Upload
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
                </label>
                <Button type="button" variant="outline" onClick={() => { media.reload(); setPicker('image'); }}>
                  Media library
                </Button>
              </div>
              <Input label="Caption" value={form.image_caption} onChange={(e) => set({ image_caption: e.target.value })} />
              <Input label="Credit" value={form.image_credit} onChange={(e) => set({ image_credit: e.target.value })} />
            </div>
          </Card>

          <Card>
            <CardHead title="Video & audio" note="YouTube, short videos and audio clips in the story" />
            <div className="space-y-4 p-5">
              <div>
                <span className="mb-1.5 flex items-center gap-2 text-sm font-bold text-ink">
                  <Youtube className="h-4 w-4 text-brand" /> YouTube link
                </span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={ytUrl}
                    onChange={(e) => { setYtUrl(e.target.value); setYtError(null); }}
                    placeholder="https://www.youtube.com/watch?v=… or Shorts link"
                    className="h-11 flex-1 border border-line-strong px-3.5 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                  />
                  <Button type="button" variant="navy" onClick={addYouTube}>Add YouTube</Button>
                </div>
                {ytError && <p className="mt-1 text-sm font-bold text-brand">{ytError}</p>}
              </div>

              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-11 cursor-pointer items-center gap-2 border border-line-strong bg-paper px-4 text-[15px] font-bold hover:bg-wash">
                  <Film className="h-4 w-4" /> {clipUploading ? 'Uploading…' : 'Upload short video'}
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    disabled={clipUploading}
                    onChange={(e) => e.target.files?.[0] && onClipUpload(e.target.files[0])}
                  />
                </label>
                <label className="inline-flex h-11 cursor-pointer items-center gap-2 border border-line-strong bg-paper px-4 text-[15px] font-bold hover:bg-wash">
                  <Headphones className="h-4 w-4" /> Upload audio
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/*"
                    className="hidden"
                    disabled={clipUploading}
                    onChange={(e) => e.target.files?.[0] && onClipUpload(e.target.files[0])}
                  />
                </label>
                <Button type="button" variant="outline" onClick={() => { media.reload(); setPicker('clip'); }}>
                  From library
                </Button>
              </div>

              {form.media.length === 0 ? (
                <p className="text-sm text-muted">No clips on this story yet. Readers will see them under the hero image.</p>
              ) : (
                <ul className="space-y-4">
                  {form.media.map((m, i) => (
                    <li key={`${m.kind}-${m.url}-${i}`} className="border border-line bg-wash p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <Badge tone={m.kind === 'youtube' ? 'brand' : m.kind === 'audio' ? 'navy' : 'ink'}>
                          {m.kind === 'youtube' ? 'YouTube' : m.kind === 'audio' ? 'Audio' : 'Video'}
                        </Badge>
                        <Button type="button" size="sm" variant="danger" onClick={() => removeMedia(i)}>
                          Remove
                        </Button>
                      </div>
                      <MediaPlayer item={m} />
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Input
                          label="Title"
                          value={m.title || ''}
                          onChange={(e) => {
                            const next = [...form.media];
                            next[i] = { ...m, title: e.target.value };
                            set({ media: next });
                          }}
                        />
                        <Input
                          label="Caption"
                          value={m.caption || ''}
                          onChange={(e) => {
                            const next = [...form.media];
                            next[i] = { ...m, caption: e.target.value };
                            set({ media: next });
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-5 space-y-4">
            <Select label="Category" value={form.section} onChange={(e) => set({ section: e.target.value })} error={fields.section}>
              <option value="">Choose…</option>
              {(sections.data ?? []).filter((s) => s.enabled).map((s) => (
                <option key={s.slug} value={s.slug}>{s.label}</option>
              ))}
            </Select>
            <Input label="Byline" value={form.author_name} onChange={(e) => set({ author_name: e.target.value })} />
            <div>
              <span className="mb-1.5 block text-sm font-bold text-ink">Tags</span>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="cursor-pointer bg-wash px-2 py-1 text-xs font-bold text-ink hover:bg-brand-tint hover:text-brand"
                    onClick={() => set({ tags: form.tags.filter((x) => x !== t) })}
                  >
                    {t} ×
                  </button>
                ))}
              </div>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const t = tagInput.trim();
                    if (t && !form.tags.includes(t)) set({ tags: [...form.tags, t] });
                    setTagInput('');
                  }
                }}
                placeholder="Type a tag and press Enter"
                className="h-11 w-full border border-line-strong px-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>

            <div>
              <span className="mb-2 block text-sm font-bold text-ink">Front page</span>
              <div className="space-y-2">
                {([
                  { value: 'none', title: 'Not on the front page', text: 'Section, Latest and search only.' },
                  { value: 'main', title: 'Main headline', text: 'Leads the front page.' },
                  { value: 'headline', title: 'Headline news', text: 'Joins the headline strip.' },
                ] as const).map((p) => (
                  <label
                    key={p.value}
                    className={`flex cursor-pointer gap-3 border p-3 ${form.placement === p.value ? 'border-navy bg-navy-tint' : 'border-line-strong hover:border-ink'}`}
                  >
                    <input
                      type="radio"
                      name="placement"
                      className="mt-1 h-4 w-4 accent-navy"
                      checked={form.placement === p.value}
                      onChange={() => set({ placement: p.value })}
                    />
                    <span>
                      <span className="block font-bold text-ink">{p.title}</span>
                      <span className="text-sm text-muted">{p.text}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-sm font-bold text-ink">When to publish</span>
              <div className="mb-2 flex gap-2">
                <Button type="button" size="sm" variant={form.when === 'now' ? 'navy' : 'outline'} onClick={() => set({ when: 'now' })}>
                  Now
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.when === 'later' ? 'navy' : 'outline'}
                  onClick={() => set({ when: 'later', publish_local: form.publish_local || toLocalInputValue(new Date(Date.now() + 3600000)) })}
                >
                  Later
                </Button>
              </div>
              {form.when === 'later' && (
                <Input
                  type="datetime-local"
                  label="Schedule for"
                  value={form.publish_local}
                  onChange={(e) => set({ publish_local: e.target.value })}
                  error={fields.publish_local}
                />
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            <Button className="w-full" loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => save('draft')}>
              Save draft
            </Button>
            <Button className="w-full" variant="outline" loading={saving} onClick={() => save('review')}>
              Send for review
            </Button>
            {form.when === 'later' ? (
              <Button className="w-full" variant="navy" loading={saving} icon={<Clock className="h-4 w-4" />} onClick={() => save('scheduled')}>
                Schedule
              </Button>
            ) : (
              <Button className="w-full" variant="navy" loading={saving} icon={<Send className="h-4 w-4" />} onClick={() => save('published')}>
                Publish
              </Button>
            )}
            {article?.status === 'published' && (
              <>
                <Button className="w-full" variant="outline" loading={saving} icon={<EyeOff className="h-4 w-4" />} onClick={() => save('hidden')}>
                  Hide from site
                </Button>
                <a
                  href={`/site/story/${article.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 w-full items-center justify-center border border-line-strong bg-paper text-[15px] font-bold text-navy hover:bg-wash"
                >
                  Open on news app ↗
                </a>
              </>
            )}
            {article && (
              <Button className="w-full" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDelOpen(true)}>
                Delete story
              </Button>
            )}
          </Card>
        </div>
      </div>

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col border border-line bg-paper shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-lg font-extrabold">
                {picker === 'clip' ? 'Choose a video or audio clip' : 'Choose from the media library'}
              </h3>
              <button type="button" className="cursor-pointer p-1" onClick={() => setPicker(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              {media.loading ? (
                <Spinner />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(media.data ?? [])
                    .filter((m) =>
                      picker === 'clip'
                        ? m.kind === 'video' || m.kind === 'audio' || m.content_type?.startsWith('video/') || m.content_type?.startsWith('audio/')
                        : m.kind === 'image' || m.content_type?.startsWith('image/')
                    )
                    .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="cursor-pointer border border-line hover:border-navy"
                      onClick={() => {
                        if (picker === 'image') {
                          set({ image_url: m.url });
                        } else {
                          const kind: MediaEmbed['kind'] =
                            m.kind === 'audio' || m.content_type?.startsWith('audio/') ? 'audio' : 'video';
                          set({
                            media: [
                              ...form.media,
                              {
                                kind,
                                url: m.url,
                                youtube_id: null,
                                title: m.file_name || '',
                                caption: m.alt || '',
                                credit: '',
                                slot: 'top',
                                width: m.width,
                                height: m.height,
                                content_type: m.content_type,
                                size: m.size,
                                file_name: m.file_name,
                              },
                            ],
                          });
                        }
                        setPicker(false);
                      }}
                    >
                      {m.kind === 'image' || m.content_type?.startsWith('image/') ? (
                        <img src={m.url} alt={m.alt || ''} className="aspect-video w-full object-cover" />
                      ) : m.kind === 'video' || m.content_type?.startsWith('video/') ? (
                        <video src={m.url} className="aspect-video w-full object-cover" muted />
                      ) : (
                        <div className="flex aspect-video items-center justify-center bg-navy-tint text-sm font-bold text-navy">Audio</div>
                      )}
                      <p className="truncate p-1.5 text-left text-xs font-bold">{m.file_name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {delOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="w-full max-w-md border border-line bg-paper p-6">
            <h3 className="text-lg font-extrabold">Delete this story?</h3>
            <p className="mt-2 text-sm text-muted">This cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDelOpen(false)}>Cancel</Button>
              <Button variant="danger" loading={saving} onClick={remove}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
// after successful api call in save()
window.dispatchEvent(new CustomEvent('cms-content-changed', { detail: { type: 'article', id: saved.id } }));
