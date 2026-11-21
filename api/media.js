import supabase from './db-client.js';
import { requireMember, logActivity, clean, slugify, canEdit, fail } from './_lib.js';
import { AV_BUCKET, avKind, clipsHandler } from './_clips.js';

const BUCKET = 'newsroom-media';
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BYTES = 3.4 * 1024 * 1024;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.query.resource === 'clips') return await clipsHandler(req, res);

    const member = await requireMember(req, res);
    if (!member) return;

    if (req.method === 'GET') {
      const [media, articles, ads, clips] = await Promise.all([
        supabase.from('media').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('articles').select('image_url').not('image_url', 'is', null).limit(5000),
        supabase.from('ads').select('image_url').not('image_url', 'is', null),
        supabase.from('article_media').select('url').neq('kind', 'youtube').limit(5000),
      ]);
      if (media.error) throw media.error;
      if (articles.error) throw articles.error;
      if (ads.error) throw ads.error;
      if (clips.error) throw clips.error;
      const used = new Set([...articles.data.map((r) => r.image_url), ...ads.data.map((r) => r.image_url), ...clips.data.map((r) => r.url)]);
      return res.status(200).json(media.data.map((m) => ({ ...m, in_use: used.has(m.url) })));
    }

    if (req.method === 'POST') {
      const { fileName, fileBase64, contentType } = req.body || {};
      const ext = TYPES[contentType];
      if (!ext) return res.status(400).json({ error: 'Use a JPG, PNG, WebP or GIF image.' });
      if (typeof fileBase64 !== 'string' || !fileBase64) return res.status(400).json({ error: 'The image did not arrive. Try again.' });
      const buffer = Buffer.from(fileBase64, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'The image did not arrive. Try again.' });
      if (buffer.length > MAX_BYTES) return res.status(400).json({ error: 'That image is too large. Use one under 3 MB.' });

      const original = clean(fileName, 120) || `image.${ext}`;
      const base = slugify(original.replace(/\.[a-z0-9]+$/i, '')) || 'image';
      const now = new Date();
      const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getTime()}-${base}.${ext}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const { data, error } = await supabase
        .from('media')
        .insert({
          file_name: original,
          path,
          url: urlData.publicUrl,
          content_type: contentType,
          size: buffer.length,
          width: Number(req.body.width) > 0 ? Math.round(Number(req.body.width)) : null,
          height: Number(req.body.height) > 0 ? Math.round(Number(req.body.height)) : null,
          alt: clean(req.body.alt, 200),
          uploaded_by: member.name,
          uploader_id: member.id,
          created_at: now.toISOString(),
        })
        .select()
        .single();
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return res.status(201).json({ ...data, in_use: false });
    }

    if (req.method === 'PUT') {
      const id = Number(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Missing image id.' });
      const { data, error } = await supabase
        .from('media')
        .update({ alt: clean(req.body.alt, 200) })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = Number(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Missing image id.' });
      const { data: item, error: findError } = await supabase.from('media').select('*').eq('id', id).maybeSingle();
      if (findError) throw findError;
      if (!item) return res.status(200).json({ ok: true });
      if (!canEdit(member) && item.uploader_id !== member.id) {
        return res.status(403).json({ error: 'Reporters can only delete images they uploaded.' });
      }
      const kind = avKind(item.content_type);
      if (kind) {
        // A deleted clip comes off any story that carries it, so readers never get a dead player.
        const { error: detachError } = await supabase.from('article_media').delete().eq('url', item.url);
        if (detachError) throw detachError;
      }
      if (item.path) {
        const { error: removeError } = await supabase.storage.from(kind ? AV_BUCKET : BUCKET).remove([item.path]);
        if (removeError) console.error('storage remove failed:', removeError);
      }
      const { error } = await supabase.from('media').delete().eq('id', id);
      if (error) throw error;
      const what = kind === 'video' ? 'video' : kind === 'audio' ? 'audio clip' : 'image';
      await logActivity(member, 'deleted', 'media', id, `${member.name} deleted the ${what} ${item.file_name}`);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    fail(res, err);
  }
}
