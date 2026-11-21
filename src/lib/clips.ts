import { api } from './api';
import { fmtBytes } from './format';
import type { ArticleClip, MediaItem } from './types';

export const MAX_CLIPS = 10;
export const MAX_CLIP_BYTES = 50 * 1024 * 1024;
export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov';
export const AUDIO_ACCEPT = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.aac,.wav,.ogg,.oga';

export type MediaKind = 'image' | 'video' | 'audio';

const ALIASES: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-aac': 'audio/aac',
  'video/x-m4v': 'video/mp4',
};
const ALLOWED = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/webm']);
const BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  weba: 'audio/webm',
};

export const mediaKind = (contentType: string | null | undefined): MediaKind =>
  contentType?.startsWith('video/') ? 'video' : contentType?.startsWith('audio/') ? 'audio' : 'image';

function clipType(file: File): string | null {
  const given = ALIASES[file.type] ?? file.type;
  if (ALLOWED.has(given)) return given;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? null;
}

/** What a chosen file is, or null when the library cannot take it. */
export function fileKind(file: File): MediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  const type = clipType(file);
  if (type) return mediaKind(type);
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name) ? 'image' : null;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts a bare id or any of the usual YouTube links: watch, youtu.be, shorts, live, embed. */
export function youtubeId(input: string): string | null {
  const raw = input.trim();
  if (YT_ID.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

export const clipKey = (clip: ArticleClip) => `${clip.kind}:${clip.youtube_id ?? clip.url}`;

export const clipFromMedia = (item: MediaItem): ArticleClip => ({
  kind: mediaKind(item.content_type) === 'audio' ? 'audio' : 'video',
  url: item.url,
  youtube_id: null,
  title: '',
  caption: '',
  credit: '',
  slot: 'top',
  width: item.width,
  height: item.height,
  content_type: item.content_type,
  size: item.size,
  file_name: item.file_name,
});

/** Reads a video's width and height in the browser. Null when this browser cannot open the file. */
function videoSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const finish = (result: { width: number; height: number } | null) => {
      window.clearTimeout(timer);
      video.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), 4000);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => finish(video.videoWidth && video.videoHeight ? { width: video.videoWidth, height: video.videoHeight } : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

function send(url: string, file: File, contentType: string, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancelled = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    if (signal?.aborted) return cancelled();
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else if (xhr.status === 413) reject(new Error(`${file.name} is too large for the library. The limit is 50 MB.`));
      else reject(new Error(`${file.name} was not accepted by the library (error ${xhr.status}). Try again.`));
    };
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.onabort = cancelled;
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/**
 * Uploads a short video or an audio clip to the media library. The file goes straight from the
 * browser to storage, so its size is not held back by the API.
 */
export async function uploadClip(file: File, kind: 'video' | 'audio', onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<MediaItem> {
  const contentType = clipType(file);
  if (!contentType) {
    throw new Error(kind === 'video' ? `${file.name} is not an MP4, MOV or WebM video.` : `${file.name} is not an MP3, M4A, WAV or OGG audio file.`);
  }
  if (mediaKind(contentType) !== kind) {
    throw new Error(kind === 'video' ? `${file.name} is an audio file. Use Upload audio clip for it.` : `${file.name} is a video. Use Upload short video for it.`);
  }
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  if (file.size > MAX_CLIP_BYTES) {
    throw new Error(`${file.name} is ${fmtBytes(file.size)}. The limit is 50 MB, so trim it or export it at a lower quality.`);
  }

  const size = kind === 'video' ? await videoSize(file) : null;
  onProgress?.(0);
  const signed = await api<{ path: string; signedUrl: string }>('/api/media?resource=clips', {
    method: 'POST',
    body: { action: 'sign', fileName: file.name, contentType, size: file.size },
  });
  await send(signed.signedUrl, file, contentType, onProgress, signal);
  return api<MediaItem>('/api/media?resource=clips', {
    method: 'POST',
    body: { action: 'complete', path: signed.path, fileName: file.name, width: size?.width, height: size?.height },
  });
}
