import supabase from './db-client.js';
import { requireMember, clean, slugify } from './_lib.js';

/*
 * Video and audio on stories.
 *  - YouTube videos are stored as a video id.
 *  - Short videos and audio clips are files in the newsroom-av bucket. They are far too big to pass
 *    through an API route, so the browser sends them straight to storage with a one-off signed link
 *    made here, then asks for the upload to be recorded in the media library.
 */

export const AV_BUCKET = 'newsroom-av';
export const MAX_AV_BYTES = 50 * 1024 * 1024;
const MAX_CLIPS = 10;

// content type -> [kind, file extension]
const AV_TYPES = {
  'video/mp4': ['video', 'mp4'],
  'video/webm': ['video', 'webm'],
  'video/quicktime': ['video', 'mov'],
  'audio/mpeg': ['audio', 'mp3'],
  'audio/mp4': ['audio', 'm4a'],
  'audio/aac': ['audio', 'aac'],
  'audio/wav': ['audio', 'wav'],
  'audio/ogg': ['audio', 'ogg'],
  'audio/webm': ['audio', 'weba'],
};
const PATH = /^(video|audio)\/\d{4}\/\d{2}\/\d{13}-[a-z0-9-]{1,80}\.[a-z0-9]{2,5}$/;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export const avKind = (contentType) => /^(video|audio)\//.exec(contentType || '')?.[1] ?? null;

const publicPrefix = () => supabase.storage.from(AV_BUCKET).getPublicUrl('x').data.publicUrl.slice(0, -1);

/** Accepts a bare id or any of the usual YouTube links: watch, youtu.be, shorts, live, embed. */
export function youtubeId(input) {
  const raw = String(input || '').trim();
  if (YT_ID.test(raw)) return raw;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

const dimension = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 && n <= 20000 ? n : null;
};

/** Validates the clip list sent with a story. Returns { clips } or { error }. */
export function cleanClips(input) {
  if (!Array.isArray(input)) return { error: 'The video and audio list was not understood. Reload the page and try again.' };
  if (input.length > MAX_CLIPS) return { error: `A story can carry ${MAX_CLIPS} video and audio clips at most.` };
  const prefix = publicPrefix();
  const seen = new Set();
  const clips = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return { error: 'One of the clips was not understood. Remove it and add it again.' };
    const base = {
      title: clean(raw.title, 120),
      caption: clean(raw.caption, 240),
      credit: clean(raw.credit, 120),
      slot: raw.slot === 'bottom' ? 'bottom' : 'top',
      width: dimension(raw.width),
      height: dimension(raw.height),
    };
    let clip;
    if (raw.kind === 'youtube') {
      const id = youtubeId(raw.youtube_id || raw.url);
      if (!id) return { error: 'One of the YouTube links is not valid. Remove it and paste the link again.' };
      clip = { ...base, kind: 'youtube', youtube_id: id, url: `https://www.youtube.com/watch?v=${id}`, content_type: null, size: null, file_name: null };
    } else if (raw.kind === 'video' || raw.kind === 'audio') {
      const url = clean(raw.url, 600);
      if (!url.startsWith(prefix) || !PATH.test(url.slice(prefix.length)) || !url.slice(prefix.length).startsWith(`${raw.kind}/`)) {
        return { error: 'One of the clips is not in the media library. Remove it and upload it again.' };
      }
      clip = {
        ...base,
        kind: raw.kind,
        youtube_id: null,
        url,
        content_type: clean(raw.content_type, 60) || null,
        size: Number(raw.size) > 0 ? Math.round(Number(raw.size)) : null,
        file_name: clean(raw.file_name, 120) || null,
      };
    } else {
      return { error: 'One of the clips was not understood. Remove it and add it again.' };
    }
    const key = clip.youtube_id || clip.url;
    if (seen.has(key)) return { error: 'The same clip is on this story twice. Remove one of them.' };
    seen.add(key);
    clips.push(clip);
  }
  return { clips };
}

const present = (row) => ({
  id: row.id,
  kind: row.kind,
  url: row.url,
  youtube_id: row.youtube_id,
  title: row.title || '',
  caption: row.caption || '',
  credit: row.credit || '',
  slot: row.slot === 'bottom' ? 'bottom' : 'top',
  width: row.width,
  height: row.height,
  content_type: row.content_type,
  size: row.size,
  file_name: row.file_name,
});

export async function readClips(articleId) {
  const { data, error } = await supabase
    .from('article_media')
    .select('*')
    .eq('article_id', articleId)
    .order('position', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return data.map(present);
}

/** Swaps a story's clips for the given list. The new rows go in before the old ones come out. */
export async function replaceClips(articleId, clips) {
  const { data: old, error: oldError } = await supabase.from('article_media').select('id').eq('article_id', articleId);
  if (oldError) throw oldError;
  if (clips.length) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('article_media')
      .insert(clips.map((clip, index) => ({ ...clip, article_id: articleId, position: index + 1, created_at: now })));
    if (error) throw error;
  }
  if (old.length) {
    const { error } = await supabase.from('article_media').delete().in('id', old.map((row) => row.id));
    if (error) throw error;
  }
}

/** Which kinds of clip each story carries: Map(articleId -> ['youtube', 'audio']). Never throws. */
export async function clipKinds(articleIds) {
  const out = new Map();
  if (!articleIds.length) return out;
  try {
    const { data, error } = await supabase.from('article_media').select('article_id, kind').in('article_id', articleIds);
    if (error) throw error;
    for (const row of data) {
      const kinds = out.get(row.article_id) || [];
      if (!kinds.includes(row.kind)) kinds.push(row.kind);
      out.set(row.article_id, kinds);
    }
  } catch (err) {
    console.error('clip kinds failed:', err);
  }
  return out;
}

/** A clip as the 180news site receives it. */
export function publicClip(clip) {
  const base = {
    type: clip.kind,
    title: clip.title,
    caption: clip.caption,
    credit: clip.credit,
    position: clip.slot === 'bottom' ? 'after' : 'before',
    width: clip.width,
    height: clip.height,
  };
  if (clip.kind === 'youtube') {
    return {
      ...base,
      videoId: clip.youtube_id,
      url: clip.url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${clip.youtube_id}`,
      thumbnail: `https://i.ytimg.com/vi/${clip.youtube_id}/hqdefault.jpg`,
    };
  }
  return { ...base, url: clip.url, contentType: clip.content_type };
}

/** POST /api/media?resource=clips with action "sign" (before the upload) or "complete" (after it). */
export async function clipsHandler(req, res) {
  const member = await requireMember(req, res);
  if (!member) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};

  if (body.action === 'sign') {
    const type = AV_TYPES[body.contentType];
    if (!type) return res.status(400).json({ error: 'Use an MP4, MOV or WebM video, or an MP3, M4A, WAV or OGG audio file.' });
    const size = Number(body.size);
    if (!(size > 0)) return res.status(400).json({ error: 'That file is empty.' });
    if (size > MAX_AV_BYTES) return res.status(400).json({ error: 'That file is over 50 MB. Trim it, or export it at a lower quality.' });
    const original = clean(body.fileName, 120);
    const base = slugify(original.replace(/\.[a-z0-9]+$/i, '')).slice(0, 60) || 'clip';
    const now = new Date();
    const path = `${type[0]}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getTime()}-${base}.${type[1]}`;
    const { data, error } = await supabase.storage.from(AV_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return res.status(200).json({ path, signedUrl: data.signedUrl });
  }

  if (body.action === 'complete') {
    const path = clean(body.path, 200);
    if (!PATH.test(path)) return res.status(400).json({ error: 'The upload could not be matched. Try again.' });
    const { data: already, error: alreadyError } = await supabase.from('media').select('*').eq('path', path).maybeSingle();
    if (alreadyError) throw alreadyError;
    if (already) return res.status(200).json({ ...already, in_use: false });

    const cut = path.lastIndexOf('/');
    const name = path.slice(cut + 1);
    const { data: found, error: listError } = await supabase.storage.from(AV_BUCKET).list(path.slice(0, cut), { search: name, limit: 10 });
    if (listError) throw listError;
    const object = (found || []).find((o) => o.name === name);
    if (!object) return res.status(400).json({ error: 'The upload did not arrive. Try again.' });

    const contentType = object.metadata?.mimetype || '';
    const kind = avKind(contentType);
    if (!kind || !path.startsWith(`${kind}/`)) {
      await supabase.storage.from(AV_BUCKET).remove([path]);
      return res.status(400).json({ error: 'That file is not a video or audio clip the library can take.' });
    }
    const { data: urlData } = supabase.storage.from(AV_BUCKET).getPublicUrl(path);
    const { data, error } = await supabase
      .from('media')
      .insert({
        file_name: clean(body.fileName, 120) || name,
        path,
        url: urlData.publicUrl,
        content_type: contentType,
        size: Number(object.metadata?.size) || 0,
        width: kind === 'video' ? dimension(body.width) : null,
        height: kind === 'video' ? dimension(body.height) : null,
        alt: '',
        uploaded_by: member.name,
        uploader_id: member.id,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json({ ...data, in_use: false });
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
