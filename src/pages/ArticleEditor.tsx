import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Save, Send, Clock, EyeOff, Trash2, ImagePlus, X, Youtube, Film, Headphones,
  Mic, Square, Sparkles, Play, Pause, Plus, Repeat2, Facebook, MessageCircle, Copy, Check,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, ApiError, errMsg } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader, Card, CardHead, Button, Input, TextArea, Select, Spinner, ErrorBox, Toast, Badge,
} from '../components/ui';
import { RichTextEditor } from '../components/RichTextEditor';
import { MediaPlayer, parseYouTubeId } from '../components/MediaPlayer';
import { getSpeechRecognition, type SpeechRecognitionLike } from '../lib/speech';
import type { Article, ArticleStatus, MediaAsset, MediaEmbed, Placement, Section, TranscriptSegment } from '../lib/types';

function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

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
  const [captionCopied, setCaptionCopied] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytError, setYtError] = useState<string | null>(null);
  const [clipUploading, setClipUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [attachingClip, setAttachingClip] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = !!getSpeechRecognition();

  // Descript-style interview recorder: live waveform, two-speaker tagging,
  // and a timestamped transcript you can click to seek and edit as you go.
  const [intervieweeName, setIntervieweeName] = useState('Guest');
  const [activeSpeaker, setActiveSpeaker] = useState<'host' | 'guest'>('host');
  const activeSpeakerRef = useRef<'host' | 'guest'>('host');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(() => Array(36).fill(4));
  const [playbackWaveform, setPlaybackWaveform] = useState<number[]>([]);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const waveformTrackRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recordStartRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const waveformHistoryRef = useRef<number[]>([]);

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

  const speakerName = (who: 'host' | 'guest') => (who === 'host' ? member?.name || 'Host' : intervieweeName.trim() || 'Guest');

  const sampleWaveform = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const bars = 36;
    const step = Math.max(1, Math.floor(data.length / bars));
    const next: number[] = [];
    for (let i = 0; i < bars; i++) {
      const v = data[i * step] || 0;
      next.push(4 + (v / 255) * 36);
    }
    setWaveform(next);
    // Peak amplitude for this frame, kept for the scrubbable waveform
    // shown after recording — the hallmark Descript "see the audio" view.
    const peak = Math.max(...Array.from(data)) / 255;
    waveformHistoryRef.current.push(peak);
    rafRef.current = requestAnimationFrame(sampleWaveform);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecordedUrl(null);
      setRecordedBlob(null);
      setSegments([]);
      setActiveSpeaker('host');
      activeSpeakerRef.current = 'host';
      setRecordingElapsed(0);
      setPlaybackWaveform([]);
      waveformHistoryRef.current = [];
      recordStartRef.current = performance.now();
      setRecording(true);

      // Live waveform via Web Audio, exactly what you see metering in
      // Descript while an interview is being captured.
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        rafRef.current = requestAnimationFrame(sampleWaveform);
      }

      timerRef.current = window.setInterval(() => {
        setRecordingElapsed((performance.now() - recordStartRef.current) / 1000);
      }, 200);

      const SpeechRecognitionCtor = getSpeechRecognition();
      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = 'en-ZA';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let finalText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) finalText += res[0].transcript + ' ';
          }
          const text = finalText.trim();
          if (text) {
            const start = (performance.now() - recordStartRef.current) / 1000;
            setSegments((prev) => [...prev, { start, speaker: speakerName(activeSpeakerRef.current), text }]);
          }
        };
        recognition.onerror = () => {};
        recognitionRef.current = recognition;
        recognition.start();
      } else {
        recognitionRef.current = null;
      }
    } catch {
      setToast('Could not reach the microphone. Check your browser permissions.');
      setTimeout(() => setToast(null), 3500);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    recognitionRef.current?.stop();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    audioCtxRef.current?.close().catch(() => {});
    rafRef.current = null;
    timerRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setWaveform(Array(36).fill(4));
    setRecordedDuration(recordingElapsed);

    // Resample the captured peaks into a fixed number of bars so the
    // scrubbable waveform below the player looks the same regardless of
    // how long the interview ran — just like Descript's audio track.
    const history = waveformHistoryRef.current;
    const bars = 120;
    if (history.length) {
      const resampled: number[] = [];
      for (let i = 0; i < bars; i++) {
        const start = Math.floor((i / bars) * history.length);
        const end = Math.max(start + 1, Math.floor(((i + 1) / bars) * history.length));
        const slice = history.slice(start, end);
        const avg = slice.reduce((a, v) => a + v, 0) / (slice.length || 1);
        resampled.push(6 + avg * 46);
      }
      setPlaybackWaveform(resampled);
    }
    setRecording(false);
  };

  const toggleSpeaker = (who: 'host' | 'guest') => {
    setActiveSpeaker(who);
    activeSpeakerRef.current = who;
  };

  const seekTo = (t: number) => {
    const el = audioElRef.current;
    if (!el) return;
    el.currentTime = t;
    el.play();
    setIsPlaying(true);
  };

  const seekFromWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = waveformTrackRef.current;
    if (!track || !recordedDuration) return;
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seekTo(fraction * recordedDuration);
  };

  const togglePlayback = () => {
    const el = audioElRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  const updateSegmentText = (i: number, text: string) =>
    setSegments((prev) => prev.map((s, idx) => (idx === i ? { ...s, text } : s)));

  const cycleSegmentSpeaker = (i: number) =>
    setSegments((prev) =>
      prev.map((s, idx) =>
        idx === i ? { ...s, speaker: s.speaker === speakerName('host') ? speakerName('guest') : speakerName('host') } : s
      )
    );

  const removeSegment = (i: number) => setSegments((prev) => prev.filter((_, idx) => idx !== i));

  const addManualSegment = () => {
    const at = recording ? recordingElapsed : playbackTime;
    setSegments((prev) => [...prev, { start: at, speaker: speakerName(activeSpeaker), text: '' }].sort((a, c) => a.start - c.start));
  };

  const discardRecording = () => {
    setRecordedUrl(null);
    setRecordedBlob(null);
    setSegments([]);
    setPlaybackTime(0);
    setIsPlaying(false);
    setPlaybackWaveform([]);
    setRecordedDuration(0);
  };

  const attachRecordedClip = async () => {
    if (!recordedBlob) return;
    setAttachingClip(true);
    try {
      const fileName = `interview-${Date.now()}.webm`;
      const file = new File([recordedBlob], fileName, { type: recordedBlob.type || 'audio/webm' });
      const row = await uploadFile(file);
      const clean = segments.filter((s) => s.text.trim());
      const transcriptText = clean.length
        ? clean.map((s) => `[${fmtClock(s.start)}] ${s.speaker}: ${s.text.trim()}`).join('\n')
        : 'No transcript captured — add one by hand.';
      const embed: MediaEmbed = {
        kind: 'audio',
        url: row.url,
        youtube_id: null,
        title: `Interview with ${intervieweeName.trim() || 'guest'}`,
        caption: '',
        credit: '',
        slot: 'top',
        width: null,
        height: null,
        content_type: row.content_type,
        size: row.size,
        file_name: row.file_name,
        transcript: transcriptText,
        segments: clean,
      };
      set({ media: [...form.media, embed] });
      media.reload(true);
      setToast('Interview recording and transcript attached to the story.');
      discardRecording();
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setAttachingClip(false);
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

  // Social sharing for a published story — opens Facebook's and WhatsApp's
  // own share dialogs (the only way a browser app can hand off to those
  // apps without a server-side Graph API integration), plus a ready-made
  // caption staff can paste straight into a Facebook post or WhatsApp
  // status update.
  const storyShareUrl = article ? `${window.location.origin}/site/story/${article.id}` : '';
  const shareCaption = article
    ? [article.headline, article.summary, storyShareUrl].filter(Boolean).join('\n\n')
    : '';

  const shareToFacebook = () => {
    if (!storyShareUrl) return;
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(storyShareUrl)}&quote=${encodeURIComponent(article?.headline || '')}`;
    window.open(url, 'facebook-share', 'noopener,noreferrer,width=600,height=640');
  };

  const shareToWhatsApp = () => {
    if (!storyShareUrl) return;
    const url = `https://wa.me/?text=${encodeURIComponent(shareCaption)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(shareCaption);
      setCaptionCopied(true);
      setToast('Caption copied — paste it into a Facebook post or WhatsApp status.');
      setTimeout(() => setCaptionCopied(false), 2500);
    } catch {
      setToast('Could not copy. Select and copy the caption by hand.');
    } finally {
      setTimeout(() => setToast(null), 3000);
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
            <RichTextEditor
              label="Body"
              value={form.body}
              onChange={(html) => set({ body: html })}
              hint="Select text, then use Bold or Highlight in the toolbar."
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
                      {m.kind === 'audio' && (
                        <TextArea
                          label="Transcript"
                          rows={3}
                          className="mt-2"
                          placeholder="No transcript yet."
                          value={m.transcript || ''}
                          onChange={(e) => {
                            const next = [...form.media];
                            next[i] = { ...m, transcript: e.target.value };
                            set({ media: next });
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Interview recorder" note="Record an interview, tag who's speaking, and get a clickable, editable transcript — Descript-style" />
            <div className="space-y-4 p-5">
              {!recording && !recordedUrl && (
                <Input
                  label="Guest name"
                  value={intervieweeName}
                  onChange={(e) => setIntervieweeName(e.target.value)}
                  hint={`Segments are tagged ${member?.name || 'Host'} (you) or the guest, so the transcript reads like a conversation.`}
                />
              )}

              {!recording ? (
                !recordedUrl && (
                  <Button type="button" variant="navy" icon={<Mic className="h-4 w-4" />} onClick={startRecording}>
                    Start interview recording
                  </Button>
                )
              ) : (
                <div className="space-y-3 border border-line bg-navy-deep p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-bright">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-brand-bright" /> Recording
                    </span>
                    <span className="font-mono text-lg font-extrabold text-white tabular-nums">{fmtClock(recordingElapsed)}</span>
                    <Button type="button" size="sm" variant="danger" icon={<Square className="h-4 w-4" />} onClick={stopRecording}>
                      Stop
                    </Button>
                  </div>
                  <div className="flex h-12 items-end gap-[3px]" aria-hidden>
                    {waveform.map((h, i) => (
                      <span
                        key={i}
                        className="w-full flex-1 rounded-sm bg-brand-bright transition-[height] duration-75"
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSpeaker('host')}
                      className={`flex-1 cursor-pointer border px-3 py-2 text-sm font-bold ${
                        activeSpeaker === 'host' ? 'border-brand-bright bg-brand-bright/15 text-brand-bright' : 'border-white/20 text-white/70 hover:bg-white/5'
                      }`}
                    >
                      🎙 {member?.name || 'Host'} speaking
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSpeaker('guest')}
                      className={`flex-1 cursor-pointer border px-3 py-2 text-sm font-bold ${
                        activeSpeaker === 'guest' ? 'border-brand-bright bg-brand-bright/15 text-brand-bright' : 'border-white/20 text-white/70 hover:bg-white/5'
                      }`}
                    >
                      🎙 {intervieweeName.trim() || 'Guest'} speaking
                    </button>
                  </div>
                  <p className="text-[12px] text-white/60">Tap whoever is talking so the transcript tags the right speaker as you go.</p>
                </div>
              )}

              {!speechSupported && (
                <p className="text-[13px] text-muted">
                  Live AI transcription needs a Chromium-based browser (Chrome or Edge). Recording still works everywhere — add transcript lines by hand with “Add line” below.
                </p>
              )}

              {recordedUrl && (
                <div className="space-y-3 border border-line bg-wash p-3">
                  <audio
                    ref={audioElRef}
                    src={recordedUrl}
                    className="hidden"
                    onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      if (Number.isFinite(d) && d > 0) setRecordedDuration(d);
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />
                  <div className="border border-line-strong bg-paper p-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={togglePlayback}
                        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy text-white hover:bg-navy-deep"
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <span className="font-mono text-sm font-bold text-ink tabular-nums">{fmtClock(playbackTime)}</span>
                      <span className="font-mono text-sm text-off tabular-nums">/ {fmtClock(recordedDuration)}</span>
                      <span className="hidden text-sm text-muted sm:inline">Click the waveform or a line to jump there</span>
                    </div>

                    {playbackWaveform.length > 0 && (
                      <div
                        ref={waveformTrackRef}
                        onClick={seekFromWaveformClick}
                        className="relative mt-3 flex h-14 cursor-pointer items-center gap-[2px] overflow-hidden rounded-sm bg-wash px-1"
                        role="slider"
                        aria-label="Scrub audio"
                        aria-valuemin={0}
                        aria-valuemax={recordedDuration}
                        aria-valuenow={playbackTime}
                      >
                        {playbackWaveform.map((h, i) => {
                          const barFraction = i / playbackWaveform.length;
                          const played = recordedDuration > 0 && barFraction <= playbackTime / recordedDuration;
                          return (
                            <span
                              key={i}
                              className={`w-full flex-1 rounded-sm ${played ? 'bg-navy' : 'bg-line-strong'}`}
                              style={{ height: `${h}px` }}
                            />
                          );
                        })}
                        {segments.map((seg, i) =>
                          recordedDuration > 0 ? (
                            <span
                              key={`tick-${i}`}
                              className="pointer-events-none absolute top-0 h-full w-0.5 bg-brand/70"
                              style={{ left: `${(seg.start / recordedDuration) * 100}%` }}
                              title={`${seg.speaker} · ${fmtClock(seg.start)}`}
                            />
                          ) : null
                        )}
                        <span
                          className="pointer-events-none absolute top-0 h-full w-0.5 bg-brand"
                          style={{ left: `${recordedDuration > 0 ? (playbackTime / recordedDuration) * 100 : 0}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="max-h-80 space-y-1 overflow-y-auto">
                    {segments.length === 0 ? (
                      <p className="px-1 py-4 text-sm text-muted">No transcript lines yet. Use “Add line” to type one in.</p>
                    ) : (
                      segments.map((seg, i) => {
                        const next = segments[i + 1];
                        const active = playbackTime >= seg.start && (!next || playbackTime < next.start);
                        const isHost = seg.speaker === speakerName('host');
                        return (
                          <div
                            key={i}
                            className={`flex gap-2 border-l-4 px-2 py-1.5 ${
                              active ? 'border-brand bg-brand-tint' : isHost ? 'border-navy bg-navy-tint/30' : 'border-emerald-500 bg-emerald-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => seekTo(seg.start)}
                              className="shrink-0 cursor-pointer font-mono text-xs font-bold text-navy hover:underline"
                              title="Jump to this moment"
                            >
                              {fmtClock(seg.start)}
                            </button>
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => cycleSegmentSpeaker(i)}
                                className={`mb-0.5 block cursor-pointer text-[11px] font-black tracking-wide uppercase hover:underline ${isHost ? 'text-navy' : 'text-emerald-700'}`}
                                title="Click to switch speaker"
                              >
                                {seg.speaker} <Repeat2 className="inline h-3 w-3" />
                              </button>
                              <textarea
                                value={seg.text}
                                onChange={(e) => updateSegmentText(i, e.target.value)}
                                rows={1}
                                className="w-full resize-none border-0 bg-transparent p-0 text-[14.5px] leading-snug text-ink outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSegment(i)}
                              className="shrink-0 cursor-pointer text-off hover:text-brand"
                              aria-label="Remove line"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <Button type="button" size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={addManualSegment}>
                    Add line
                  </Button>

                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <Button type="button" size="sm" icon={<Sparkles className="h-4 w-4" />} loading={attachingClip} onClick={attachRecordedClip}>
                      Attach interview to story
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={discardRecording}>
                      Discard
                    </Button>
                  </div>
                </div>
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

          {article?.status === 'published' && (
            <Card>
              <CardHead title="Share" note="Post this story to Facebook or a WhatsApp status" />
              <div className="space-y-3 p-5">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="w-full text-white"
                    style={{ backgroundColor: '#1877F2' }}
                    icon={<Facebook className="h-4 w-4" />}
                    onClick={shareToFacebook}
                  >
                    Facebook
                  </Button>
                  <Button
                    type="button"
                    className="w-full text-white"
                    style={{ backgroundColor: '#25D366' }}
                    icon={<MessageCircle className="h-4 w-4" />}
                    onClick={shareToWhatsApp}
                  >
                    WhatsApp
                  </Button>
                </div>
                <p className="text-[12.5px] text-muted">
                  Facebook opens the post composer with the story link. WhatsApp opens a chat you can forward, or paste the caption below into a status update.
                </p>
                <div>
                  <span className="mb-1.5 block text-sm font-bold text-ink">Caption</span>
                  <textarea
                    readOnly
                    value={shareCaption}
                    rows={4}
                    className="w-full resize-none border border-line-strong bg-wash px-3 py-2 text-sm text-ink outline-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    icon={captionCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    onClick={copyCaption}
                  >
                    {captionCopied ? 'Copied' : 'Copy caption'}
                  </Button>
                </div>
              </div>
            </Card>
          )}
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
