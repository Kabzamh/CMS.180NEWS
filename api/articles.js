import supabase from './db-client.js';
import { requireMember, logActivity, promoteDue, clean, slugify, canEdit, isHttpUrl, fail } from './_lib.js';
import { cleanClips, clipKinds, readClips, replaceClips } from './_clips.js';

/** The clip list is only touched when a request sends one. */
const parseClips = (input) => (input === undefined ? { clips: null } : cleanClips(input));
const clipError = (res, message) => res.status(400).json({ error: message, fields: { media: message } });

const STATUSES = ['draft', 'review', 'scheduled', 'published', 'hidden'];
const PLACEMENTS = ['none', 'main', 'headline'];
const LIST_COLUMNS =
  'id, headline, slug, summary, section, tags, image_url, author_name, author_id, placement, status, publish_at, created_at, updated_at, updated_by';

function cleanTags(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const tag = clean(raw, 24).replace(/\s+/g, ' ');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function validDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function prepare(body, member, existing) {
  const fields = {};
  const editor = canEdit(member);
  const pick = (key, max) => (body[key] !== undefined ? clean(body[key], max) : existing?.[key] ?? '');

  const headline = pick('headline', 140);
  const summary = pick('summary', 300);
  const text =
    body.body !== undefined
      ? typeof body.body === 'string'
        ? body.body.trim().slice(0, 60000)
        : ''
      : existing?.body ?? '';
  const section = pick('section', 60);
  const tags = body.tags !== undefined ? cleanTags(body.tags) : existing?.tags ?? [];
  const imageUrl = pick('image_url', 600);
  const imageCaption = pick('image_caption', 240);
  const imageCredit = pick('image_credit', 120);
  const authorName = pick('author_name', 60) || member.name;

  const status = body.status !== undefined ? body.status : existing?.status ?? 'draft';
  if (!STATUSES.includes(status)) return { bad: 'Unknown status.' };
  if (!editor && !['draft', 'review'].includes(status)) {
    return { forbidden: 'Only editors can publish, schedule or hide stories.' };
  }

  let placement = editor
    ? body.placement !== undefined
      ? body.placement
      : existing?.placement ?? 'none'
    : existing?.placement ?? 'none';
  if (!PLACEMENTS.includes(placement)) placement = 'none';

  if (headline.length < 4) fields.headline = 'Give the story a headline (at least 4 characters).';
  if (tags.length > 5) fields.tags = 'Use five tags at most.';
  if (imageUrl && !isHttpUrl(imageUrl)) fields.image_url = 'The image link is not valid. Upload the image again.';

  const needsFull = status !== 'draft';
  if (needsFull && !section) fields.section = 'Choose a category.';
  if (needsFull && text.length < 20) {
    fields.body = 'Write the story before it goes any further (at least 20 characters).';
  }
  if (needsFull && text.length > 20000) {
    fields.body = `The site shows up to 20 000 characters. Shorten the story by ${text.length - 20000}.`;
  }
  if (section) {
    const { data: found, error } = await supabase.from('sections').select('id').eq('slug', section).maybeSingle();
    if (error) throw error;
    if (!found) fields.section = 'That category no longer exists. Choose another.';
  }

  const now = Date.now();
  let publishAt = existing?.publish_at ?? null;
  const asked = validDate(body.publish_at);
  if (status === 'scheduled') {
    const when = asked ?? (body.publish_at === undefined ? validDate(existing?.publish_at) : null);
    if (!when) fields.publish_at = 'Choose a date and time.';
    else if (when.getTime() <= now + 30000) fields.publish_at = 'Choose a time in the future, or publish straight away.';
    else publishAt = when.toISOString();
  } else if (status === 'published') {
    if (existing?.status === 'published' && existing.publish_at) publishAt = existing.publish_at;
    else publishAt = new Date(now).toISOString();
  } else if (status === 'draft' || status === 'review') {
    publishAt = asked && asked.getTime() > now ? asked.toISOString() : null;
  }

  if (Object.keys(fields).length) return { fields };

  return {
    row: {
      headline,
      slug: slugify(headline),
      summary,
      body: text,
      section: section || null,
      tags,
      image_url: imageUrl || null,
      image_caption: imageCaption,
      image_credit: imageCredit,
      author_name: authorName,
      placement,
      status,
      publish_at: publishAt,
      updated_at: new Date(now).toISOString(),
      updated_by: member.name,
    },
  };
}

function describe(member, row, before) {
  const title = `“${row.headline}”`;
  if (!before) {
    if (row.status === 'published') return ['published', `${member.name} published ${title}`];
    if (row.status === 'scheduled') return ['scheduled', `${member.name} scheduled ${title}`];
    if (row.status === 'review') return ['submitted', `${member.name} submitted ${title} for review`];
    return ['created', `${member.name} started a draft: ${title}`];
  }
  if (before.status !== row.status) {
    if (row.status === 'published') return ['published', `${member.name} published ${title}`];
    if (row.status === 'scheduled') return ['scheduled', `${member.name} scheduled ${title}`];
    if (row.status === 'review') return ['submitted', `${member.name} submitted ${title} for review`];
    if (row.status === 'hidden') return ['hidden', `${member.name} hid ${title} from the site`];
    if (row.status === 'draft') return ['drafted', `${member.name} moved ${title} back to draft`];
  }
  if (row.status === 'scheduled' && before.publish_at !== row.publish_at) {
    return ['rescheduled', `${member.name} rescheduled ${title}`];
  }
  return ['updated', `${member.name} edited ${title}`];
}

async function afterSave(saved) {
  if (saved.status === 'published' && saved.placement === 'main') {
    const { error } = await supabase
      .from('articles')
      .update({ placement: 'headline' })
      .eq('placement', 'main')
      .eq('status', 'published')
      .neq('id', saved.id);
    if (error) console.error('demote main failed:', error);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const member = await requireMember(req, res);
    if (!member) return;

    if (req.method === 'GET') {
      const { id, status, section, author, q } = req.query;
      // brief=1 is the top-bar search: a handful of rows, no counts, nothing else to wait for.
      const brief = req.query.brief === '1';
      const max = Math.min(Math.max(Number(req.query.limit) || 300, 1), 300);
      if (!brief) await promoteDue();

      if (id) {
        const { data, error } = await supabase.from('articles').select('*').eq('id', Number(id)).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'That story could not be found. It may have been deleted.' });
        return res.status(200).json({ ...data, media: await readClips(data.id) });
      }

      let query = supabase.from('articles').select(LIST_COLUMNS).order('updated_at', { ascending: false }).limit(max);
      if (status && STATUSES.includes(status)) query = query.eq('status', status);
      if (section) query = query.eq('section', String(section));
      if (author && Number.isFinite(Number(author))) query = query.eq('author_id', Number(author));
      const search = clean(q, 80).replace(/[%_,()\\]/g, ' ').trim();
      if (search) query = query.ilike('headline', `%${search}%`);

      if (brief) {
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ items: data });
      }

      const [list, all] = await Promise.all([query, supabase.from('articles').select('status').limit(5000)]);
      if (list.error) throw list.error;
      if (all.error) throw all.error;
      const counts = { all: all.data.length, draft: 0, review: 0, scheduled: 0, published: 0, hidden: 0 };
      for (const row of all.data) counts[row.status] = (counts[row.status] || 0) + 1;
      const kinds = await clipKinds(list.data.map((a) => a.id));
      return res.status(200).json({ items: list.data.map((a) => ({ ...a, media_kinds: kinds.get(a.id) || [] })), counts });
    }

    if (req.method === 'POST') {
      const media = parseClips((req.body || {}).media);
      if (media.error) return clipError(res, media.error);
      const result = await prepare(req.body || {}, member, null);
      if (result.bad) return res.status(400).json({ error: result.bad });
      if (result.forbidden) return res.status(403).json({ error: result.forbidden });
      if (result.fields) return res.status(400).json({ error: 'Check the highlighted fields.', fields: result.fields });
      const { data, error } = await supabase
        .from('articles')
        .insert({ ...result.row, author_id: member.id, created_at: result.row.updated_at })
        .select()
        .single();
      if (error) throw error;
      if (media.clips) await replaceClips(data.id, media.clips);
      await afterSave(data);
      const [action, summary] = describe(member, data, null);
      await logActivity(member, action, 'article', data.id, summary);
      return res.status(201).json({ ...data, media: await readClips(data.id) });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const id = Number(body.id);
      if (!id) return res.status(400).json({ error: 'Missing story id.' });
      const { data: existing, error: findError } = await supabase.from('articles').select('*').eq('id', id).maybeSingle();
      if (findError) throw findError;
      if (!existing) return res.status(404).json({ error: 'That story could not be found. It may have been deleted.' });
      if (!canEdit(member)) {
        if (existing.author_id !== member.id) {
          return res.status(403).json({ error: 'You can only change your own stories.' });
        }
        if (!['draft', 'review'].includes(existing.status)) {
          return res.status(403).json({ error: 'This story is with the editors now, so it can no longer be changed.' });
        }
      }
      const media = parseClips(body.media);
      if (media.error) return clipError(res, media.error);
      const result = await prepare(body, member, existing);
      if (result.bad) return res.status(400).json({ error: result.bad });
      if (result.forbidden) return res.status(403).json({ error: result.forbidden });
      if (result.fields) return res.status(400).json({ error: 'Check the highlighted fields.', fields: result.fields });
      const { data, error } = await supabase.from('articles').update(result.row).eq('id', id).select().single();
      if (error) throw error;
      if (media.clips) await replaceClips(data.id, media.clips);
      await afterSave(data);
      const [action, summary] = describe(member, data, existing);
      await logActivity(member, action, 'article', data.id, summary);
      return res.status(200).json({ ...data, media: await readClips(data.id) });
    }

    if (req.method === 'DELETE') {
      const id = Number(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Missing story id.' });
      const { data: existing, error: findError } = await supabase.from('articles').select('*').eq('id', id).maybeSingle();
      if (findError) throw findError;
      if (!existing) return res.status(200).json({ ok: true });
      if (!canEdit(member) && !(existing.author_id === member.id && existing.status === 'draft')) {
        return res.status(403).json({ error: 'Writers can only delete their own drafts.' });
      }
      const { error } = await supabase.from('articles').delete().eq('id', id);
      if (error) throw error;
      await logActivity(member, 'deleted', 'article', id, `${member.name} deleted “${existing.headline}”`);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    fail(res, err);
  }
}
