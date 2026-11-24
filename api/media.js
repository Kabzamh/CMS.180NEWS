import supabase from './db-client.js';
import { cors, okOptions, fail, requireMember } from './_helpers.js';

const BUCKET = 'news-media';

function kindFromType(ct = '') {
  if (ct.startsWith('video/')) return 'video';
  if (ct.startsWith('audio/')) return 'audio';
  return 'image';
}

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST' && req.query.resource === 'clips') {
      const body = req.body || {};
      if (body.action === 'sign') {
        const fileName = body.fileName || `clip-${Date.now()}`;
        const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `clips/${Date.now()}-${safe}`;
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error) {
          // Fallback: client will use base64 upload
          return res.status(200).json({ path, signedUrl: null, token: null, fallback: true });
        }
        return res.status(200).json({ path, signedUrl: data.signedUrl, token: data.token });
      }
      if (body.action === 'complete') {
        const path = body.path;
        if (!path) return fail(res, 400, 'Missing path.');
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const contentType = body.contentType || 'application/octet-stream';
        const row = {
          url: urlData.publicUrl,
          file_name: body.fileName || path.split('/').pop(),
          content_type: contentType,
          alt: '',
          width: body.width || null,
          height: body.height || null,
          size: body.size || null,
          path,
          kind: kindFromType(contentType),
          uploaded_by: auth.user.id,
          created_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from('media_assets').insert(row).select().single();
        if (error) throw error;
        return res.status(201).json(data);
      }
      return fail(res, 400, 'Unknown clip action.');
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { fileName, fileBase64, contentType, width, height, alt } = body;
      if (!fileBase64 || !fileName) return fail(res, 400, 'Missing file data.');

      const safe = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `uploads/${Date.now()}-${safe}`;
      const buffer = Buffer.from(fileBase64, 'base64');
      const ct = contentType || 'application/octet-stream';

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
        contentType: ct,
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const row = {
        url: urlData.publicUrl,
        file_name: fileName,
        content_type: ct,
        alt: alt || '',
        width: width || null,
        height: height || null,
        size: buffer.length,
        path,
        kind: kindFromType(ct),
        uploaded_by: auth.user.id,
        created_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('media_assets').insert(row).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, alt } = req.body || {};
      if (!id) return fail(res, 400, 'Missing media id.');
      const { data, error } = await supabase
        .from('media_assets')
        .update({ alt: alt ?? '' })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return fail(res, 400, 'Missing media id.');
      const { data: row } = await supabase.from('media_assets').select('*').eq('id', id).maybeSingle();
      if (!row) return fail(res, 404, 'Media not found.');
      if (row.path) {
        try {
          await supabase.storage.from(BUCKET).remove([row.path]);
        } catch (_) {}
      }
      const { error } = await supabase.from('media_assets').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('media error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
