import supabase from './db-client.js';
import {
  cors,
  okOptions,
  fail,
  requireMember,
  briefArticle,
  fullArticle,
} from './_helpers.js';
import { queueNotification } from './notifications.js';

async function notifyStory(data, prevStatus) {
  try {
    if (data.status === 'published' && prevStatus !== 'published') {
      await queueNotification({
        kind: 'publish',
        title: `Published: ${data.headline}`,
        body: `${data.author_name || 'Someone'} published a story.`,
        link: `/articles/${data.id}`,
        onlyIf: (prefs) => prefs.notify_publish && prefs.digest !== 'off',
      });
    } else if (data.status === 'review' && prevStatus !== 'review') {
      await queueNotification({
        kind: 'review',
        title: `In review: ${data.headline}`,
        body: `${data.author_name || 'Someone'} sent a story for review.`,
        link: `/articles/${data.id}`,
        onlyIf: (prefs) => prefs.notify_review && prefs.digest !== 'off',
      });
    } else if (data.status === 'scheduled' && prevStatus !== 'scheduled') {
      await queueNotification({
        kind: 'schedule',
        title: `Scheduled: ${data.headline}`,
        body: `Goes live ${data.publish_at || 'later'}.`,
        link: `/articles/${data.id}`,
        onlyIf: (prefs) => prefs.notify_schedule && prefs.digest !== 'off',
      });
    }
  } catch (e) {
    console.error('notifyStory', e);
  }
}

function canEdit(member, article) {
  if (['owner', 'editor'].includes(member.role)) return true;
  return article.created_by === member.user_id && ['draft', 'review'].includes(article.status);
}

export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;

  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    if (req.method === 'GET') {
      const { id, status, section, author, q, brief, limit } = req.query;

      if (id) {
        const { data, error } = await supabase.from('articles').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!data) return fail(res, 404, 'Story not found.');
        return res.status(200).json(fullArticle(data));
      }

      let query = supabase.from('articles').select('*').order('updated_at', { ascending: false });
      if (status) query = query.eq('status', status);
      if (section) query = query.eq('section', section);
      if (author) query = query.eq('author_id', author);
      if (q) query = query.or(`headline.ilike.%${q}%,summary.ilike.%${q}%,author_name.ilike.%${q}%`);
      if (limit) query = query.limit(Number(limit) || 50);

      const { data, error } = await query;
      if (error) throw error;

      const { data: all } = await supabase.from('articles').select('status');
      const counts = { total: 0, draft: 0, review: 0, scheduled: 0, published: 0, hidden: 0 };
      for (const row of all || []) {
        counts.total += 1;
        if (counts[row.status] !== undefined) counts[row.status] += 1;
      }

      const items = (data || []).map((a) => (brief === '1' ? briefArticle(a) : fullArticle(a)));
      return res.status(200).json({ items, counts });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const fields = {};
      if (!body.headline || String(body.headline).trim().length < 4) {
        fields.headline = 'Give the story a headline (at least 4 characters).';
      }
      const status = body.status || 'draft';
      if (status !== 'draft' && !body.section) {
        fields.section = 'Choose a category before leaving draft.';
      }
      if (Object.keys(fields).length) return fail(res, 400, 'Check the form.', fields);

      const now = new Date().toISOString();
      let publish_at = body.publish_at || null;
      if (status === 'published' && !publish_at) publish_at = now;

      const row = {
        headline: String(body.headline).trim(),
        summary: body.summary || '',
        body: body.body || '',
        section: body.section || '',
        tags: Array.isArray(body.tags) ? body.tags : [],
        image_url: body.image_url || null,
        image_caption: body.image_caption || '',
        image_credit: body.image_credit || '',
        author_name: body.author_name || auth.member.name,
        author_id: body.author_id || null,
        placement: body.placement || 'none',
        status,
        publish_at,
        media: Array.isArray(body.media) ? body.media : [],
        views: 0,
        created_by: auth.user.id,
        created_at: now,
        updated_at: now,
      };

      if (row.placement === 'main' && status === 'published') {
        await supabase.from('articles').update({ placement: 'headline' }).eq('placement', 'main').eq('status', 'published');
      }

      const { data, error } = await supabase.from('articles').insert(row).select().single();
      if (error) throw error;
      await notifyStory(data, null);
      return res.status(201).json(fullArticle(data));
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      if (!body.id) return fail(res, 400, 'Missing story id.');
      const { data: existing, error: findErr } = await supabase
        .from('articles')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!existing) return fail(res, 404, 'Story not found.');
      if (!canEdit(auth.member, existing)) {
        return fail(res, 403, 'You cannot edit this story.');
      }

      const patch = { updated_at: new Date().toISOString() };
      const keys = [
        'headline', 'summary', 'body', 'section', 'tags', 'image_url', 'image_caption',
        'image_credit', 'author_name', 'author_id', 'placement', 'status', 'publish_at', 'media',
      ];
      for (const k of keys) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      if (patch.headline !== undefined && String(patch.headline).trim().length < 4) {
        return fail(res, 400, 'Check the form.', { headline: 'Give the story a headline (at least 4 characters).' });
      }
      if (patch.status === 'published' && !patch.publish_at && !existing.publish_at) {
        patch.publish_at = new Date().toISOString();
      }
      if (patch.placement === 'main' && (patch.status || existing.status) === 'published') {
        await supabase
          .from('articles')
          .update({ placement: 'headline' })
          .eq('placement', 'main')
          .eq('status', 'published')
          .neq('id', existing.id);
      }

      const { data, error } = await supabase
        .from('articles')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      await notifyStory(data, existing.status);
      return res.status(200).json(fullArticle(data));
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return fail(res, 400, 'Missing story id.');
      const { data: existing } = await supabase.from('articles').select('*').eq('id', id).maybeSingle();
      if (!existing) return fail(res, 404, 'Story not found.');
      if (!canEdit(auth.member, existing) && auth.member.role !== 'owner') {
        return fail(res, 403, 'You cannot delete this story.');
      }
      const { error } = await supabase.from('articles').delete().eq('id', id);
      if (error) throw error;
      await supabase.from('comments').delete().eq('article_id', id);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('articles error:', err);
    return fail(res, 500, err.message || 'Server error');
  }
}
