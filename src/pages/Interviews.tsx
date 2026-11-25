import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mic, Square, Play, Pause, Plus, Repeat2, X, Sparkles, Mic2, Link2, Unlink,
  Download, Trash2, Clock, Headphones, FlaskConical, LayoutGrid, Rows3, Radio,
  Users, Disc3,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader, Card, CardHead, Button, Input, Select, Spinner, ErrorBox, Toast, Empty, Badge, fmtDate, cn,
} from '../components/ui';
import { getSpeechRecognition, type SpeechRecognitionLike } from '../lib/speech';
import type { Article, InterviewRow, TranscriptSegment } from '../lib/types';

function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** A genuine, playable silent WAV clip — used by the mock-interview test
 * mode so "Save" / "Link to story" / playback / scrubbing all run through
 * the exact same code path as a real recording, with a real duration and
 * a real <audio> element, not a stub. */
function buildSilentWavBlob(durationSec: number, sampleRate = 8000): Blob {
  const numSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Scripted two-person exchange the mock mode plays out in real time, so
 * reviewers can test the whole studio — live waveform, auto speaker
 * switching, transcript capture, playback scrubbing, saving and linking
 * to a story — without a microphone or a real guest. */
const MOCK_SCRIPT: Array<{ at: number; speaker: 'host' | 'guest'; text: string }> = [
  { at: 0.6, speaker: 'host', text: "Thanks for joining us — let's start with today's headline announcement." },
  { at: 4.2, speaker: 'guest', text: 'Thank you for having me. Council has approved the new budget allocation for public transport.' },
  { at: 9.5, speaker: 'host', text: 'How will residents feel the impact of this in the next six months?' },
  { at: 13.5, speaker: 'guest', text: 'We expect faster bus routes, with the first phase of the new taxi rank opening next quarter.' },
  { at: 18.5, speaker: 'host', text: 'And the funding concerns raised by opposition parties?' },
  { at: 22.5, speaker: 'guest', text: "We've addressed that directly in the briefing document released this morning." },
];
const MOCK_DURATION = 27;

/** Deterministic decorative waveform used on library cards — a visual
 * fingerprint per recording, stable across renders. */
function seededBars(seed: number, n = 28) {
  let x = (seed * 9301 + 49297) % 233280;
  const next = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  return Array.from({ length: n }, () => 5 + next() * 22);
}

export default function InterviewsPage() {
  const { member } = useAuth();
  const list = useApi<{ interviews: InterviewRow[] }>(() => api('/api/interviews'), []);
  const articles = useApi<{ items: Article[] }>(() => api('/api/articles?brief=1&limit=200'), []);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'rows'>('grid');

  // --- Recorder state (independent studio — its own title/guest fields,
  // its own library, not tied to any single story draft) ---
  const [title, setTitle] = useState('');
  const [guestName, setGuestName] = useState('Guest');
  const [activeSpeaker, setActiveSpeaker] = useState<'host' | 'guest'>('host');
  const activeSpeakerRef = useRef<'host' | 'guest'>('host');
  const [recording, setRecording] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(() => Array(36).fill(4));
  const [playbackWaveform, setPlaybackWaveform] = useState<number[]>([]);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [saving, setSaving] = useState(false);
  const speechSupported = !!getSpeechRecognition();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const waveformTrackRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recordStartRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const waveformHistoryRef = useRef<number[]>([]);
  const mockTimeoutsRef = useRef<number[]>([]);
  const mockWaveIntervalRef = useRef<number | null>(null);

  // --- Library state ---
  const [linkPickerId, setLinkPickerId] = useState<number | null>(null);
  const [linkArticleId, setLinkArticleId] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const [openTranscriptId, setOpenTranscriptId] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Interview Recorder · 180news Newsroom CMS';
  }, []);

  // Stop everything cleanly if the desk navigates away mid-session.
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mockWaveIntervalRef.current) window.clearInterval(mockWaveIntervalRef.current);
      mockTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const speakerName = (who: 'host' | 'guest') => (who === 'host' ? member?.name || 'Host' : guestName.trim() || 'Guest');

  const sampleWaveform = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const bars = 36;
    const step = Math.max(1, Math.floor(data.length / bars));
    const next: number[] = [];
    for (let i = 0; i < bars; i++) next.push(4 + ((data[i * step] || 0) / 255) * 36);
    setWaveform(next);
    waveformHistoryRef.current.push(Math.max(...Array.from(data)) / 255);
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
      setMockMode(false);
      setRecording(true);

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
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
      setToast('Could not reach the microphone. Check your browser permissions — or try the mock interview below.');
      setTimeout(() => setToast(null), 4000);
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

  /** Mock interview test mode — plays out a realistic two-speaker exchange
   * with a live, animated waveform and auto speaker-switching, so the full
   * studio (record → transcript → playback → save → link to story) can be
   * tested and demoed without a microphone. */
  const startMockInterview = () => {
    if (!title.trim()) setTitle('City budget briefing (mock)');
    if (!guestName.trim() || guestName === 'Guest') setGuestName('Thandi Nkosi');
    setRecordedUrl(null);
    setRecordedBlob(null);
    setSegments([]);
    setActiveSpeaker('host');
    activeSpeakerRef.current = 'host';
    setRecordingElapsed(0);
    setPlaybackWaveform([]);
    waveformHistoryRef.current = [];
    recordStartRef.current = performance.now();
    setMockMode(true);
    setRecording(true);

    timerRef.current = window.setInterval(() => {
      setRecordingElapsed((performance.now() - recordStartRef.current) / 1000);
    }, 200);

    mockWaveIntervalRef.current = window.setInterval(() => {
      const t = (performance.now() - recordStartRef.current) / 1000;
      const bars = 36;
      const next: number[] = [];
      for (let i = 0; i < bars; i++) {
        const jitter = Math.sin(t * 6 + i * 0.4) * 0.5 + 0.5;
        next.push(6 + jitter * 32 + Math.random() * 6);
      }
      setWaveform(next);
      waveformHistoryRef.current.push(0.3 + Math.random() * 0.6);
    }, 120);

    MOCK_SCRIPT.forEach((line) => {
      const id = window.setTimeout(() => {
        toggleSpeaker(line.speaker);
        setSegments((prev) => [...prev, { start: line.at, speaker: speakerName(line.speaker), text: line.text }]);
      }, line.at * 1000);
      mockTimeoutsRef.current.push(id);
    });

    const finishId = window.setTimeout(() => stopMockInterview(), (MOCK_DURATION + 1) * 1000);
    mockTimeoutsRef.current.push(finishId);
  };

  const stopMockInterview = () => {
    mockTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    mockTimeoutsRef.current = [];
    if (mockWaveIntervalRef.current) window.clearInterval(mockWaveIntervalRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    mockWaveIntervalRef.current = null;
    timerRef.current = null;

    const duration = Math.max((performance.now() - recordStartRef.current) / 1000, 2);
    setWaveform(Array(36).fill(4));
    setRecordedDuration(duration);

    const history = waveformHistoryRef.current;
    const bars = 120;
    const resampled: number[] = [];
    for (let i = 0; i < bars; i++) {
      const base = history.length ? history[Math.floor((i / bars) * history.length)] : 0.4;
      resampled.push(8 + base * 40 + Math.sin(i * 0.35) * 5);
    }
    setPlaybackWaveform(resampled);

    const blob = buildSilentWavBlob(duration);
    setRecordedBlob(blob);
    setRecordedUrl(URL.createObjectURL(blob));
    setRecording(false);
    setMockMode(false);
  };

  const stopActiveRecording = () => (mockMode ? stopMockInterview() : stopRecording());

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
    setTitle('');
    setGuestName('Guest');
  };

  const saveInterview = async () => {
    if (!recordedBlob) return;
    setSaving(true);
    try {
      const audio_url = await blobToDataUrl(recordedBlob);
      const clean = segments.filter((s) => s.text.trim());
      const transcript = clean.length
        ? clean.map((s) => `[${fmtClock(s.start)}] ${s.speaker}: ${s.text.trim()}`).join('\n')
        : '';
      await api('/api/interviews', {
        method: 'POST',
        body: {
          title: title.trim() || `Interview with ${guestName.trim() || 'guest'}`,
          guest_name: guestName,
          host_name: member?.name,
          audio_url,
          duration: recordedDuration,
          transcript,
          segments: clean,
        },
      });
      setToast('Interview saved to the library.');
      discardRecording();
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // --- Library actions ---
  const linkToArticle = async (interviewId: number) => {
    if (!linkArticleId) return;
    setBusyId(interviewId);
    try {
      await api('/api/interviews', { method: 'PUT', body: { id: interviewId, action: 'link', article_id: Number(linkArticleId) } });
      setToast('Interview linked — the audio and transcript were added to that story.');
      setLinkPickerId(null);
      setLinkArticleId('');
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusyId(null);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const unlinkFromArticle = async (interviewId: number) => {
    setBusyId(interviewId);
    try {
      await api('/api/interviews', { method: 'PUT', body: { id: interviewId, action: 'unlink' } });
      setToast('Interview unlinked. It stays in the library.');
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusyId(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const removeInterview = async () => {
    if (!delId) return;
    try {
      await api('/api/interviews', { method: 'DELETE', body: { id: delId } });
      setToast('Interview deleted.');
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setDelId(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const interviews = list.data?.interviews || [];
  const articleOptions = articles.data?.items || [];
  const totalMinutes = Math.round(interviews.reduce((sum, iv) => sum + (iv.duration || 0), 0) / 60);
  const linkedCount = interviews.filter((iv) => iv.status === 'linked').length;
  const guestCount = new Set(interviews.map((iv) => iv.guest_name.trim().toLowerCase())).size;

  const statusTone = (status: InterviewRow['status']) => (status === 'linked' ? 'published' : status === 'transcribed' ? 'navy' : 'wash');

  return (
    <>
      <PageHeader
        eyebrow="Desk · Studio"
        title="Interview Recorder"
        description="Record an interview from the browser, tag speakers live, get a timestamped transcript, and link it to any story. Try the mock interview below to test the whole studio with no microphone needed."
      />

      {/* Studio stats strip */}
      <ul className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          { label: 'Recordings', value: interviews.length, icon: Disc3, rule: 'bg-navy' },
          { label: 'Minutes recorded', value: totalMinutes, icon: Clock, rule: 'bg-brand' },
          { label: 'Linked to stories', value: linkedCount, icon: Link2, rule: 'bg-emerald-600' },
          { label: 'Guests interviewed', value: guestCount, icon: Users, rule: 'bg-off' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.label} className="relative overflow-hidden rounded-xl border border-line bg-paper p-4 shadow-[0_1px_2px_rgba(20,22,27,0.04)]">
              <div className={`absolute top-0 left-0 h-1 w-full ${s.rule}`} />
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-muted">{s.label}</p>
                <Icon className="h-[18px] w-[18px] text-off" />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink tabular-nums">{s.value}</p>
            </li>
          );
        })}
      </ul>

      {/* Studio console */}
      <Card className="mb-6 overflow-hidden">
        <CardHead title="Recording studio" note="Live waveform, two-speaker tagging, and a clickable transcript" />
        <div className="space-y-4 p-5">
          {!recording && !recordedUrl && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Interview title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Budget briefing with the mayor" />
                <Input
                  label="Guest name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  hint={`Segments are tagged ${member?.name || 'Host'} (you) or the guest.`}
                />
              </div>

              <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line-strong bg-wash px-6 py-8 text-center">
                <button
                  type="button"
                  onClick={startRecording}
                  className="group flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-strong text-white shadow-lg transition-transform hover:scale-105"
                  aria-label="Start interview recording"
                >
                  <Mic className="h-8 w-8" />
                </button>
                <div>
                  <p className="font-extrabold text-ink">Start interview recording</p>
                  <p className="mt-0.5 text-sm text-muted">Uses your microphone. Allow access when your browser asks.</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-off">
                  <span className="h-px w-10 bg-line-strong" /> or <span className="h-px w-10 bg-line-strong" />
                </div>
                <Button type="button" variant="outline" icon={<FlaskConical className="h-4 w-4" />} onClick={startMockInterview}>
                  Try a mock interview (no mic needed)
                </Button>
              </div>
            </>
          )}

          {recording && (
            <div className="space-y-3 rounded-xl border border-line bg-navy-deep p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-sm font-bold text-brand-bright">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand-bright" />
                  {mockMode ? (
                    <>
                      <FlaskConical className="h-3.5 w-3.5" /> Mock recording
                    </>
                  ) : (
                    <>
                      <Radio className="h-3.5 w-3.5" /> Recording
                    </>
                  )}
                </span>
                <span className="font-mono text-2xl font-extrabold text-white tabular-nums">{fmtClock(recordingElapsed)}</span>
                <Button type="button" size="sm" variant="danger" icon={<Square className="h-4 w-4" />} onClick={stopActiveRecording}>
                  Stop
                </Button>
              </div>
              <div className="flex h-14 items-end gap-[3px] rounded-lg bg-black/20 px-2 py-2" aria-hidden>
                {waveform.map((h, i) => (
                  <span key={i} className="w-full flex-1 rounded-sm bg-brand-bright transition-[height] duration-75" style={{ height: `${h}px` }} />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleSpeaker('host')}
                  className={cn(
                    'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition-all',
                    activeSpeaker === 'host' ? 'scale-[1.02] border-brand-bright bg-brand-bright/15 text-brand-bright shadow-[0_0_0_1px_rgba(255,107,107,0.4)]' : 'border-white/15 text-white/60 hover:bg-white/5'
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', activeSpeaker === 'host' ? 'animate-pulse bg-brand-bright' : 'bg-white/30')} />
                  {member?.name || 'Host'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSpeaker('guest')}
                  className={cn(
                    'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition-all',
                    activeSpeaker === 'guest' ? 'scale-[1.02] border-brand-bright bg-brand-bright/15 text-brand-bright shadow-[0_0_0_1px_rgba(255,107,107,0.4)]' : 'border-white/15 text-white/60 hover:bg-white/5'
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', activeSpeaker === 'guest' ? 'animate-pulse bg-brand-bright' : 'bg-white/30')} />
                  {guestName.trim() || 'Guest'}
                </button>
              </div>
              <p className="text-center text-[12px] text-white/50">
                {mockMode
                  ? 'Simulated interview in progress — speakers switch and transcript lines appear automatically.'
                  : 'Tap whoever is talking so the transcript tags the right speaker as you go.'}
              </p>
            </div>
          )}

          {!recording && !recordedUrl && !speechSupported && (
            <p className="text-[13px] text-muted">
              Live AI transcription needs a Chromium-based browser (Chrome or Edge). Recording still works everywhere — add transcript lines by hand with “Add line” once you stop.
            </p>
          )}

          {recordedUrl && (
            <div className="space-y-3 rounded-xl border border-line bg-wash p-3">
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
              <div className="rounded-lg border border-line-strong bg-paper p-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePlayback}
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy text-white shadow-sm hover:bg-navy-deep"
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
                    className="relative mt-3 flex h-14 cursor-pointer items-center gap-[2px] overflow-hidden rounded-lg bg-wash px-1"
                    role="slider"
                    aria-label="Scrub audio"
                    aria-valuemin={0}
                    aria-valuemax={recordedDuration}
                    aria-valuenow={playbackTime}
                  >
                    {playbackWaveform.map((h, i) => {
                      const barFraction = i / playbackWaveform.length;
                      const played = recordedDuration > 0 && barFraction <= playbackTime / recordedDuration;
                      return <span key={i} className={`w-full flex-1 rounded-sm ${played ? 'bg-navy' : 'bg-line-strong'}`} style={{ height: `${h}px` }} />;
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
                        className={`flex gap-2 rounded-lg border-l-4 px-2 py-1.5 ${
                          active ? 'border-brand bg-brand-tint' : isHost ? 'border-navy bg-navy-tint/30' : 'border-emerald-500 bg-emerald-50'
                        }`}
                      >
                        <button type="button" onClick={() => seekTo(seg.start)} className="shrink-0 cursor-pointer font-mono text-xs font-bold text-navy hover:underline" title="Jump to this moment">
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
                        <button type="button" onClick={() => removeSegment(i)} className="shrink-0 cursor-pointer text-off hover:text-brand" aria-label="Remove line">
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
                <Button type="button" size="sm" icon={<Sparkles className="h-4 w-4" />} loading={saving} onClick={saveInterview}>
                  Save to library
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={discardRecording}>
                  Discard
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15.5px] font-extrabold tracking-tight text-ink">Interview library</h2>
            <p className="text-sm text-muted">{interviews.length} recording{interviews.length === 1 ? '' : 's'}</p>
          </div>
          <div className="flex rounded-lg border border-line-strong p-0.5">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={cn('flex h-8 w-8 cursor-pointer items-center justify-center rounded-md', view === 'grid' ? 'bg-navy text-white' : 'text-off hover:bg-wash')}
              aria-label="Grid view"
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('rows')}
              className={cn('flex h-8 w-8 cursor-pointer items-center justify-center rounded-md', view === 'rows' ? 'bg-navy text-white' : 'text-off hover:bg-wash')}
              aria-label="Row view"
              title="Row view"
            >
              <Rows3 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {list.loading && !list.data ? (
          <Spinner label="Loading interviews" />
        ) : list.error ? (
          <ErrorBox message={list.error} onRetry={() => list.reload()} />
        ) : interviews.length === 0 ? (
          <Empty icon={<Mic2 className="h-8 w-8" />} title="No interviews recorded yet">
            Record one above, or try the mock interview — it will show up here, ready to link to any story.
          </Empty>
        ) : (
          <div className={cn('p-4', view === 'grid' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-3')}>
            {interviews.map((iv) => {
              const bars = seededBars(iv.id);
              const accent = iv.status === 'linked' ? 'bg-emerald-600' : iv.status === 'transcribed' ? 'bg-navy' : 'bg-off';
              return (
                <div key={iv.id} className="relative overflow-hidden rounded-xl border border-line bg-paper shadow-[0_1px_2px_rgba(20,22,27,0.04)]">
                  <div className={`absolute top-0 left-0 h-1 w-full ${accent}`} />
                  <div className="space-y-3 p-4 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-tint text-navy">
                          <Headphones className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-ink">{iv.title}</p>
                          <p className="truncate text-xs text-muted">With {iv.guest_name} · {fmtClock(iv.duration)}</p>
                        </div>
                      </div>
                      <Badge tone={statusTone(iv.status)}>{iv.status}</Badge>
                    </div>

                    <div className="flex h-9 items-end gap-[2px] rounded-md bg-wash px-1.5 py-1" aria-hidden>
                      {bars.map((h, i) => (
                        <span key={i} className="w-full flex-1 rounded-sm bg-navy-tint" style={{ height: `${h}px`, backgroundColor: i / bars.length < 0.4 ? 'var(--color-navy)' : undefined }} />
                      ))}
                    </div>

                    <audio src={iv.audio_url} controls className="h-9 w-full" />

                    <p className="text-xs text-muted">
                      Hosted by {iv.host_name} · {fmtDate(iv.created_at)}
                    </p>
                    {iv.article_id && (
                      <p className="text-xs">
                        Linked to{' '}
                        <Link to={`/articles/${iv.article_id}`} className="font-bold text-navy hover:underline">
                          {iv.article_headline || `story #${iv.article_id}`}
                        </Link>
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setOpenTranscriptId(openTranscriptId === iv.id ? null : iv.id)}>
                        {openTranscriptId === iv.id ? 'Hide transcript' : 'Transcript'}
                      </Button>
                      {iv.transcript && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Download className="h-3.5 w-3.5" />}
                          onClick={() => downloadText(`${iv.title.replace(/[^a-z0-9]+/gi, '-')}.txt`, iv.transcript)}
                          aria-label="Download transcript"
                          title="Download transcript"
                        />
                      )}
                      {iv.article_id ? (
                        <Button size="sm" variant="outline" loading={busyId === iv.id} icon={<Unlink className="h-3.5 w-3.5" />} onClick={() => unlinkFromArticle(iv.id)}>
                          Unlink
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon={<Link2 className="h-3.5 w-3.5" />}
                          onClick={() => {
                            setLinkPickerId(linkPickerId === iv.id ? null : iv.id);
                            setLinkArticleId('');
                          }}
                        >
                          Link
                        </Button>
                      )}
                      <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDelId(iv.id)} aria-label="Delete" title="Delete" />
                    </div>

                    {linkPickerId === iv.id && (
                      <div className="space-y-2 rounded-lg border border-line bg-wash p-3">
                        <Select label="Choose a story" value={linkArticleId} onChange={(e) => setLinkArticleId(e.target.value)}>
                          <option value="">Select a story…</option>
                          {articleOptions.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.headline} ({a.status})
                            </option>
                          ))}
                        </Select>
                        <Button size="sm" className="w-full" loading={busyId === iv.id} disabled={!linkArticleId} onClick={() => linkToArticle(iv.id)}>
                          Attach audio & transcript
                        </Button>
                      </div>
                    )}

                    {openTranscriptId === iv.id && (
                      <div className="max-h-56 overflow-y-auto rounded-lg border border-line bg-wash p-3">
                        {iv.segments?.length ? (
                          <ul className="space-y-1.5">
                            {iv.segments.map((seg, i) => (
                              <li key={i} className="flex gap-2 text-sm">
                                <span className="shrink-0 font-mono text-xs font-bold text-navy">{fmtClock(seg.start)}</span>
                                <span className="font-bold text-ink">{seg.speaker}:</span>
                                <span className="text-body">{seg.text}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm text-muted">{iv.transcript || 'No transcript captured for this recording.'}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {delId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-paper p-6">
            <h3 className="text-lg font-extrabold">Delete this interview?</h3>
            <p className="mt-2 text-sm text-muted">The recording and transcript will be removed from the library. This cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDelId(null)}>Cancel</Button>
              <Button variant="danger" onClick={removeInterview}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
