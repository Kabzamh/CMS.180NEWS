import supabase from './db-client.js';
import { requireMember, logActivity, clean, slugify, canEdit, readSettings, listMembers } from './_lib.js';
import { alertPeople } from './_mail.js';
import { readClips } from './_clips.js';

/*
 * The news desk: who is writing what and by when, the history of every story, search and sharing text,
 * the publishing calendar, breaking-news alerts, backups and the audit log.
 * Reached through /api/team?resource=desk, and used by the story API when a story is saved.
 *
 *  - article_meta       one row per story: its search and sharing text, who it is assigned to, the deadline,
 *                       the brief, and the note an editor left when sending it back.
 *  - article_revisions  a copy of a story each time a save changed it, with who saved it and when.
 *  - newsroom-backups   a private storage bucket holding one file per backup.
 *  - activity           (already there) the audit log.
 */

const META = 'article_meta';
const REVS = 'article_revisions';
const BACKUPS = 'newsroom-backups';
const KEEP_REVISIONS = 50;
const KEEP_BACKUPS = 20;
const DAY = 24 * 60 * 60 * 1000;
const BACKUP_NAME = /^backup-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ-(auto|manual)\.json$/;
// What a backup holds, and the most rows taken from each table.
const BACKUP_TABLES = { sections: 2000, articles: 20000, article_meta: 20000, article_media: 20000, authors: 2000, comments: 20000, ads: 100, settings: 100, media: 20000, click_stats: 20000, activity: 5000 };

/** The address readers use. Shared links and search previews point here. */
export const PUBLIC_SITE = 'https://www.180news.co.za';
export const storyUrl = (id) => `${PUBLIC_SITE}/story/my-cms${String(id).padStart(7, '0')}`;

const sast = (iso) => new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
const validDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
/** JSON with its keys in a fixed order, so two copies of the same thing compare equal. */
const stable = (value) =>
  JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));

/* --------------------------------------------------------------- per story */

async function readMeta(articleId) {
  const { data, error } = await supabase.from(META).select('*').eq('article_id', articleId).maybeSingle();
  if (error) throw error;
  return data;
}

async function saveMeta(articleId, patch) {
  const { error } = await supabase.from(META).upsert({ article_id: articleId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'article_id' });
  if (error) throw error;
}

const workflowOf = (meta) =>
  meta && (meta.assigned_to || meta.deadline || meta.brief || meta.review_note)
    ? {
        assigned_to: meta.assigned_to ?? null,
        assigned_name: meta.assigned_name ?? null,
        assigned_by: meta.assigned_by ?? null,
        assigned_at: meta.assigned_at ?? null,
        deadline: meta.deadline ?? null,
        brief: meta.brief ?? '',
        review_note: meta.review_note ?? null,
        review_by: meta.review_by ?? null,
        review_at: meta.review_at ?? null,
      }
    : null;

const view = (meta) => ({ seo_title: meta?.seo_title || '', seo_description: meta?.seo_description || '', workflow: workflowOf(meta) });

/** What the desk knows about a story, to send with it. Never throws: a story still opens if this cannot be read. */
export async function deskFields(articleId) {
  try {
    return view(await readMeta(articleId));
  } catch (err) {
    console.error('desk fields failed:', err);
    return { ...view(null), warning: 'The search text, assignment and history of this story could not be read. The database tables do not match this CMS.' };
  }
}

/** Whether a story has been assigned to this person. Never throws. */
export async function isAssignedTo(member, articleId) {
  try {
    return (await readMeta(articleId))?.assigned_to === member.id;
  } catch {
    return false;
  }
}

const snapshotOf = (a, meta, clips) => ({
  headline: a.headline || '',
  summary: a.summary || '',
  body: a.body || '',
  section: a.section || null,
  tags: Array.isArray(a.tags) ? a.tags : [],
  image_url: a.image_url || null,
  image_caption: a.image_caption || '',
  image_credit: a.image_credit || '',
  author_name: a.author_name || '',
  placement: a.placement || 'none',
  seo_title: meta?.seo_title || '',
  seo_description: meta?.seo_description || '',
  clips: clips.map((c) => ({ kind: c.kind, url: c.url, title: c.title || '', caption: c.caption || '', credit: c.credit || '', slot: c.slot })),
});

async function recordRevision(member, article, meta, clips) {
  const snapshot = snapshotOf(article, meta, clips);
  const { data: last, error: lastError } = await supabase.from(REVS).select('id, snapshot, status').eq('article_id', article.id).order('id', { ascending: false }).limit(1);
  if (lastError) throw lastError;
  if (last[0] && last[0].status === article.status && stable(last[0].snapshot) === stable(snapshot)) return; // nothing changed
  const { error } = await supabase.from(REVS).insert({ article_id: article.id, snapshot, status: article.status, saved_by: member.name, saved_by_id: member.id, created_at: new Date().toISOString() });
  if (error) throw error;
  // The oldest go once a story has more than KEEP_REVISIONS.
  const { data: old, error: oldError } = await supabase.from(REVS).select('id').eq('article_id', article.id).order('id', { ascending: false }).range(KEEP_REVISIONS, KEEP_REVISIONS + 200);
  if (oldError) throw oldError;
  if (old.length) await supabase.from(REVS).delete().in('id', old.map((r) => r.id));
}

/**
 * Called after a story is saved: keeps its search and sharing text, clears an editor's note once approval
 * is asked for again, and records the version. Returns what to send back with the story.
 * Never throws: the story itself is already saved.
 */
export async function afterArticleSave(member, before, after, body) {
  try {
    const patch = {};
    if (body.seo_title !== undefined) patch.seo_title = clean(body.seo_title, 70).replace(/\s+/g, ' ') || null;
    if (body.seo_description !== undefined) patch.seo_description = clean(body.seo_description, 200).replace(/\s+/g, ' ') || null;
    if (after.status === 'review' && before?.status !== 'review') Object.assign(patch, { review_note: null, review_by: null, review_at: null });
    const current = await readMeta(after.id);
    const changes = Object.keys(patch).some((k) => (current?.[k] ?? null) !== patch[k]);
    if (changes) await saveMeta(after.id, patch);
    const meta = changes ? await readMeta(after.id) : current;
    await recordRevision(member, after, meta, await readClips(after.id));
    return view(meta);
  } catch (err) {
    console.error('desk save failed:', err);
    return { ...view(null), warning: 'The story is saved, but its search text and this version could not be recorded. The database tables do not match this CMS.' };
  }
}

/** Search and sharing text for the public feeds: Map(story id -> { title, description }). Never throws. */
export async function seoFor(articleIds) {
  const out = new Map();
  try {
    for (let i = 0; i < articleIds.length; i += 200) {
      const { data, error } = await supabase.from(META).select('article_id, seo_title, seo_description').in('article_id', articleIds.slice(i, i + 200));
      if (error) throw error;
      for (const row of data) if (row.seo_title || row.seo_description) out.set(row.article_id, { title: row.seo_title || '', description: row.seo_description || '' });
    }
  } catch (err) {
    console.error('seo read failed:', err);
  }
  return out;
}

/* ------------------------------------------------------- lists for the desk */

async function metaFor(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(META).select('*').in('article_id', ids.slice(i, i + 200));
    if (error) throw error;
    for (const row of data) out.set(row.article_id, row);
  }
  return out;
}

const STORY_COLUMNS = 'id, headline, section, status, author_name, author_id, publish_at, updated_at, updated_by';
const withDesk = (a, meta) => ({ ...a, assigned_to: meta?.assigned_to ?? null, assigned_name: meta?.assigned_name ?? null, deadline: meta?.deadline ?? null, brief: meta?.brief || '', review_note: meta?.review_note ?? null });

/** Stories still on their way to being published, with who has them and when they are due. */
async function board() {
  const { data, error } = await supabase.from('articles').select(STORY_COLUMNS).in('status', ['draft', 'review', 'scheduled']).order('updated_at', { ascending: false }).limit(600);
  if (error) throw error;
  const metas = await metaFor(data.map((a) => a.id));
  return data.map((a) => withDesk(a, metas.get(a.id)));
}

/** Stories with a deadline that are not published yet, soonest first. Reporters get their own. Never throws. */
export async function deadlinesFor(member) {
  try {
    const { data: metas, error } = await supabase.from(META).select('*').not('deadline', 'is', null).order('deadline', { ascending: true }).limit(500);
    if (error) throw error;
    if (!metas.length) return [];
    const { data: stories, error: storyError } = await supabase.from('articles').select(STORY_COLUMNS).in('id', metas.map((m) => m.article_id)).in('status', ['draft', 'review']);
    if (storyError) throw storyError;
    const byId = new Map(stories.map((a) => [a.id, a]));
    return metas
      .filter((m) => byId.has(m.article_id))
      .map((m) => withDesk(byId.get(m.article_id), m))
      .filter((s) => canEdit(member) || s.assigned_to === member.id || s.author_id === member.id)
      .slice(0, 8);
  } catch (err) {
    console.error('deadlines failed:', err);
    return [];
  }
}

async function calendar(member, fromInput, toInput) {
  const from = validDate(fromInput);
  const to = validDate(toInput);
  if (!from || !to || to <= from || to - from > 70 * DAY) return { status: 400, error: 'Choose a month to show.' };
  const [published, due] = await Promise.all([
    supabase.from('articles').select(STORY_COLUMNS).in('status', ['scheduled', 'published']).gte('publish_at', from.toISOString()).lt('publish_at', to.toISOString()).order('publish_at', { ascending: true }).limit(1500),
    supabase.from(META).select('*').gte('deadline', from.toISOString()).lt('deadline', to.toISOString()).limit(1500),
  ]);
  if (published.error) throw published.error;
  if (due.error) throw due.error;
  const items = published.data.map((a) => ({ id: a.id, headline: a.headline, kind: a.status === 'scheduled' ? 'scheduled' : 'published', at: a.publish_at, who: a.author_name || '' }));
  if (due.data.length) {
    const { data: stories, error } = await supabase.from('articles').select(STORY_COLUMNS).in('id', due.data.map((m) => m.article_id)).in('status', ['draft', 'review']);
    if (error) throw error;
    const byId = new Map(stories.map((a) => [a.id, a]));
    for (const m of due.data) {
      const a = byId.get(m.article_id);
      if (a) items.push({ id: a.id, headline: a.headline, kind: 'deadline', at: m.deadline, who: m.assigned_name || a.author_name || '', mine: m.assigned_to === member.id || a.author_id === member.id });
    }
  }
  items.sort((a, b) => new Date(a.at) - new Date(b.at));
  return { status: 200, data: { items } };
}

/* ------------------------------------------------------------- assignments */

async function assign(member, body) {
  const people = (await listMembers()).filter((p) => p.active);
  const fields = {};
  const to = body.assigned_to === null || body.assigned_to === '' ? null : people.find((p) => p.id === Number(body.assigned_to));
  if (to === undefined) fields.assigned_to = 'Choose someone on the team.';
  const brief = typeof body.brief === 'string' ? body.brief.trim().slice(0, 2000) : '';
  const deadline = body.deadline ? validDate(body.deadline) : null;
  if (body.deadline && !deadline) fields.deadline = 'Choose a date and time.';

  let article = null;
  let current = null;
  if (body.id) {
    const { data, error } = await supabase.from('articles').select('*').eq('id', Number(body.id)).maybeSingle();
    if (error) throw error;
    if (!data) return { status: 404, error: 'That story could not be found. It may have been deleted.' };
    if (!['draft', 'review', 'scheduled'].includes(data.status)) return { status: 400, error: 'This story is already published, so there is nothing left to assign.' };
    article = data;
    current = await readMeta(article.id);
  } else {
    if (clean(body.headline, 140).length < 4) fields.headline = 'Give the story a working headline (at least 4 characters).';
    if (!to && !fields.assigned_to) fields.assigned_to = 'Choose who will write it.';
  }
  // A deadline that is being set or moved must be ahead; one already passed can stay while other things change.
  const moved = deadline && (!current?.deadline || new Date(current.deadline).getTime() !== deadline.getTime());
  if (moved && deadline.getTime() < Date.now() + 60000) fields.deadline = 'Choose a deadline that is still ahead.';
  if (Object.keys(fields).length) return { status: 400, error: 'Check the highlighted fields.', fields };

  const now = new Date().toISOString();
  if (!article) {
    const headline = clean(body.headline, 140);
    const { data, error } = await supabase
      .from('articles')
      .insert({ headline, slug: slugify(headline), summary: '', body: '', tags: [], placement: 'none', status: 'draft', author_id: to.id, author_name: to.name, updated_by: member.name, created_at: now, updated_at: now })
      .select()
      .single();
    if (error) throw error;
    article = data;
  }
  const changedPerson = (current?.assigned_to ?? null) !== (to?.id ?? null);
  await saveMeta(article.id, {
    assigned_to: to?.id ?? null,
    assigned_name: to?.name ?? null,
    ...(changedPerson || !current ? { assigned_by: to ? member.name : null, assigned_at: to ? now : null } : {}),
    deadline: deadline ? deadline.toISOString() : null,
    brief,
  });
  const due = deadline ? `, due ${sast(deadline)}` : '';
  await logActivity(member, 'assigned', 'article', article.id, to ? `${member.name} assigned “${article.headline}” to ${to.name}${due}` : `${member.name} took the assignment off “${article.headline}”`);
  if (to && to.id !== member.id && (changedPerson || moved || !body.id)) {
    await alertPeople((p) => p.id === to.id && p.alerts.mine !== false, {
      subject: `${changedPerson || !body.id ? 'Assigned to you' : 'Deadline changed'}: ${article.headline}`,
      body: `${member.name} assigned this story to you. ${deadline ? `It is due on ${sast(deadline)}, South African time.` : 'No deadline has been set.'}${brief ? `\n\nBrief:\n${brief}` : ''}`,
      link: `/articles/${article.id}`,
      ref: `story:${article.id}`,
    });
  }
  return { status: body.id ? 200 : 201, data: { id: article.id, ...view(await readMeta(article.id)) } };
}

/** An editor sends a story that is waiting for approval back to its reporter, with a note saying what it needs. */
async function sendBack(member, body) {
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (note.length < 3) return { status: 400, error: 'Say what the story needs.', fields: { note: 'Say what the story needs before it can be approved.' } };
  const { data: article, error } = await supabase.from('articles').select('*').eq('id', Number(body.id)).maybeSingle();
  if (error) throw error;
  if (!article) return { status: 404, error: 'That story could not be found. It may have been deleted.' };
  if (article.status !== 'review') return { status: 400, error: 'Only a story that is waiting for approval can be sent back.' };
  const now = new Date().toISOString();
  const { data: saved, error: saveError } = await supabase.from('articles').update({ status: 'draft', updated_at: now, updated_by: member.name }).eq('id', article.id).eq('status', 'review').select().single();
  if (saveError) throw saveError;
  await saveMeta(article.id, { review_note: note, review_by: member.name, review_at: now });
  const meta = await readMeta(article.id);
  await recordRevision(member, saved, meta, await readClips(article.id));
  await logActivity(member, 'sent back', 'article', article.id, `${member.name} sent “${article.headline}” back to its reporter`);
  await alertPeople((p) => p.id !== member.id && (p.id === article.author_id || p.id === meta?.assigned_to) && p.alerts.mine !== false, {
    subject: `Sent back: ${article.headline}`,
    body: `${member.name} read your story and sent it back before approving it.\n\n${note}\n\nMake the changes, then ask for approval again.`,
    link: `/articles/${article.id}`,
    ref: `story:${article.id}`,
  });
  return { status: 200, data: { ok: true } };
}

/* ---------------------------------------------------------- breaking news */

/**
 * A breaking-news alert: the story's line goes to the front of the site's headline crawl, the story can
 * be pinned as the lead, and everyone on the team is alerted in Mail.
 */
async function breaking(member, body) {
  const { data: article, error } = await supabase.from('articles').select('*').eq('id', Number(body.id)).maybeSingle();
  if (error) throw error;
  if (!article) return { status: 404, error: 'That story could not be found. It may have been deleted.' };
  if (article.status !== 'published') return { status: 400, error: 'Publish the story first. A breaking-news alert points readers at a story that is live.' };
  const line = (clean(body.line, 140) || `BREAKING: ${article.headline}`).replace(/\s+/g, ' ').slice(0, 140);
  const settings = await readSettings();
  const crawl = { enabled: true, speed: settings.crawl.speed, message: line };
  const { error: crawlError } = await supabase.from('settings').upsert({ key: 'crawl', value: crawl, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (crawlError) throw crawlError;
  if (body.pin === true && article.placement !== 'main') {
    const { error: pinError } = await supabase.from('articles').update({ placement: 'main' }).eq('id', article.id);
    if (pinError) throw pinError;
    const { error: demoteError } = await supabase.from('articles').update({ placement: 'headline' }).eq('placement', 'main').eq('status', 'published').neq('id', article.id);
    if (demoteError) throw demoteError;
  }
  await logActivity(member, 'breaking', 'article', article.id, `${member.name} sent a breaking-news alert for “${article.headline}”${body.pin === true ? ' and pinned it as the lead story' : ''}`);
  const alerted = await alertPeople((p) => p.id !== member.id, {
    subject: `Breaking: ${article.headline}`,
    body: `${member.name} sent a breaking-news alert.\n\nOn the site’s headline crawl now: “${line}”${body.pin === true ? '\nThe story is pinned as the lead on the front page.' : ''}`,
    link: `/articles/${article.id}`,
    ref: `breaking:${article.id}`,
  });
  return { status: 200, data: { crawl, alerted, pinned: body.pin === true } };
}

/* ---------------------------------------------------------------- backups */

async function allRows(table, cap) {
  const rows = [];
  for (let from = 0; from < cap; from += 1000) {
    let query = supabase.from(table).select('*');
    query = table === 'activity' ? query.order('id', { ascending: false }) : table === 'settings' || table === 'click_stats' ? query.order('key', { ascending: true }) : table === META ? query.order('article_id', { ascending: true }) : query.order('id', { ascending: true });
    const { data, error } = await query.range(from, Math.min(from + 999, cap - 1));
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function listBackups() {
  const { data, error } = await supabase.storage.from(BACKUPS).list('', { limit: 200, sortBy: { column: 'name', order: 'desc' } });
  if (error) throw error;
  return (data || [])
    .filter((file) => BACKUP_NAME.test(file.name))
    .sort((a, b) => (a.name < b.name ? 1 : -1))
    .map((file) => ({ name: file.name, at: file.name.slice(7, 27).replace(/T(\d\d)-(\d\d)-(\d\d)Z/, 'T$1:$2:$3Z'), kind: file.name.includes('-auto.') ? 'auto' : 'manual', size: Number(file.metadata?.size) || 0 }));
}

async function makeBackup(member, kind) {
  const now = new Date();
  const tables = {};
  const counts = {};
  for (const [table, cap] of Object.entries(BACKUP_TABLES)) {
    let rows = await allRows(table, cap);
    // Starter sign-in details, if any are still stored, stay out of the file.
    if (table === 'settings') rows = rows.filter((row) => row.key !== 'demo_login');
    tables[table] = rows;
    counts[table] = rows.length;
  }
  const file = Buffer.from(JSON.stringify({ app: '180news-newsroom-cms', version: 1, made_at: now.toISOString(), made_by: member.name, kind, counts, tables }));
  if (file.length > 48 * 1024 * 1024) throw new Error('The backup is larger than 48 MB, more than can be stored in one file.');
  const name = `backup-${now.toISOString().slice(0, 19).replace(/:/g, '-')}Z-${kind}.json`;
  const { error } = await supabase.storage.from(BACKUPS).upload(name, file, { contentType: 'application/json', upsert: true });
  if (error) throw error;
  await supabase.from('settings').upsert({ key: 'backups', value: { last: now.toISOString() }, updated_at: now.toISOString() }, { onConflict: 'key' });
  const all = await listBackups();
  if (all.length > KEEP_BACKUPS) await supabase.storage.from(BACKUPS).remove(all.slice(KEEP_BACKUPS).map((b) => b.name));
  await logActivity(member, 'backup', 'backup', null, kind === 'auto' ? `The daily backup was made (${counts.articles} stories)` : `${member.name} made a backup (${counts.articles} stories)`);
  return { name, at: now.toISOString(), kind, size: file.length, counts };
}

/** Makes the day's backup if the last one is more than a day old. Called when the dashboard is opened. Never throws. */
export async function backupIfDue(settings) {
  try {
    const last = validDate(settings.backups?.last);
    if (last && Date.now() - last.getTime() < DAY) return;
    // Marked first, so two people opening the dashboard at once make one backup between them.
    await supabase.from('settings').upsert({ key: 'backups', value: { last: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    await makeBackup({ name: 'System' }, 'auto');
  } catch (err) {
    console.error('daily backup failed:', err);
  }
}

async function readBackup(name) {
  if (!BACKUP_NAME.test(String(name))) return null;
  const { data, error } = await supabase.storage.from(BACKUPS).download(name);
  if (error) return null;
  try {
    const backup = JSON.parse(await data.text());
    return backup && backup.app === '180news-newsroom-cms' && backup.tables ? backup : null;
  } catch {
    return null;
  }
}

/** The stories in a backup, each marked as still here unchanged, changed since, or no longer in the CMS. */
async function backupStories(name) {
  const backup = await readBackup(name);
  if (!backup) return { status: 404, error: 'That backup could not be opened. It may have been removed to make room for newer ones.' };
  const stories = Array.isArray(backup.tables.articles) ? backup.tables.articles : [];
  const now = new Map();
  for (let i = 0; i < stories.length; i += 200) {
    const { data, error } = await supabase.from('articles').select('id, updated_at').in('id', stories.slice(i, i + 200).map((a) => a.id));
    if (error) throw error;
    for (const row of data) now.set(row.id, row.updated_at);
  }
  return {
    status: 200,
    data: {
      made_at: backup.made_at,
      counts: backup.counts || {},
      stories: stories
        .map((a) => ({ id: a.id, headline: a.headline, status: a.status, author_name: a.author_name || '', updated_at: a.updated_at, now: !now.has(a.id) ? 'missing' : new Date(now.get(a.id)).getTime() === new Date(a.updated_at).getTime() ? 'same' : 'changed' }))
        .sort((a, b) => (a.now === b.now ? new Date(b.updated_at) - new Date(a.updated_at) : a.now === 'missing' ? -1 : b.now === 'missing' ? 1 : a.now === 'changed' ? -1 : 1)),
    },
  };
}

/** Brings one story from a backup back as a new draft. Nothing that is in the CMS now is changed. */
async function restoreStory(member, body) {
  const backup = await readBackup(body.name);
  if (!backup) return { status: 404, error: 'That backup could not be opened. It may have been removed to make room for newer ones.' };
  const id = Number(body.id);
  const old = (backup.tables.articles || []).find((a) => a.id === id);
  if (!old || typeof old.headline !== 'string' || !old.headline.trim()) return { status: 404, error: 'That story is not in this backup.' };
  const { data: sections, error: sectionError } = await supabase.from('sections').select('slug');
  if (sectionError) throw sectionError;
  const now = new Date().toISOString();
  const headline = clean(old.headline, 140);
  const { data: article, error } = await supabase
    .from('articles')
    .insert({
      headline,
      slug: slugify(headline),
      summary: clean(old.summary, 300),
      body: typeof old.body === 'string' ? old.body.slice(0, 60000) : '',
      section: sections.some((s) => s.slug === old.section) ? old.section : null,
      tags: Array.isArray(old.tags) ? old.tags.filter((t) => typeof t === 'string').slice(0, 5) : [],
      image_url: typeof old.image_url === 'string' ? old.image_url : null,
      image_caption: clean(old.image_caption, 240),
      image_credit: clean(old.image_credit, 120),
      author_name: clean(old.author_name, 60) || member.name,
      author_id: Number.isInteger(old.author_id) ? old.author_id : member.id,
      placement: 'none',
      status: 'draft',
      publish_at: null,
      created_at: now,
      updated_at: now,
      updated_by: member.name,
    })
    .select()
    .single();
  if (error) throw error;
  const meta = (backup.tables.article_meta || []).find((m) => m.article_id === id);
  if (meta?.seo_title || meta?.seo_description) await saveMeta(article.id, { seo_title: clean(meta.seo_title, 70) || null, seo_description: clean(meta.seo_description, 200) || null });
  const clips = (backup.tables.article_media || []).filter((c) => c.article_id === id && ['youtube', 'video', 'audio'].includes(c.kind) && typeof c.url === 'string').slice(0, 10);
  if (clips.length) {
    const { error: clipError } = await supabase.from('article_media').insert(clips.map(({ id: _id, article_id: _a, ...clip }, index) => ({ ...clip, article_id: article.id, position: index + 1, created_at: now })));
    if (clipError) console.error('restoring clips failed:', clipError);
  }
  await recordRevision(member, article, await readMeta(article.id), await readClips(article.id));
  await logActivity(member, 'restored', 'article', article.id, `${member.name} brought “${headline}” back from the backup of ${sast(backup.made_at)} as a draft`);
  return { status: 201, data: { id: article.id } };
}

/* ---------------------------------------------------------------- handler */

export async function deskHandler(req, res) {
  const member = await requireMember(req, res);
  if (!member) return;
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const send = (result) => (result.error ? res.status(result.status).json({ error: result.error, fields: result.fields }) : res.status(result.status).json(result.data));
  const editor = canEdit(member);
  const admin = member.role === 'owner';
  const refuse = () => res.status(403).json({ error: 'Your role does not allow this.', code: 'role' });

  if (req.method === 'GET') {
    const what = String(req.query.view || '');
    if (what === 'board') {
      const people = (await listMembers()).filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, role: p.role }));
      return res.status(200).json({ stories: await board(), people, me: member.id });
    }
    if (what === 'calendar') return send(await calendar(member, req.query.from, req.query.to));
    if (what === 'revisions') {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'Missing story.' });
      const { data, error } = await supabase.from(REVS).select('id, status, saved_by, created_at, headline:snapshot->>headline').eq('article_id', id).order('id', { ascending: false }).limit(KEEP_REVISIONS);
      if (error) throw error;
      return res.status(200).json({ revisions: data });
    }
    if (what === 'revision') {
      const { data, error } = await supabase.from(REVS).select('*').eq('id', Number(req.query.rev) || 0).maybeSingle();
      if (error) throw error;
      return data ? res.status(200).json(data) : res.status(404).json({ error: 'That version is no longer kept.' });
    }
    if (what === 'audit') {
      if (!admin) return refuse();
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 5000);
      let query = supabase.from('activity').select('*').order('id', { ascending: false }).limit(limit + 1);
      if (req.query.who) query = query.eq('actor', clean(req.query.who, 80));
      if (req.query.kind) query = query.eq('entity_type', clean(req.query.kind, 30));
      const q = clean(req.query.q, 80).replace(/[%_,()\\]/g, ' ').trim();
      if (q) query = query.ilike('summary', `%${q}%`);
      if (Number(req.query.before) > 0) query = query.lt('id', Number(req.query.before));
      const day = validDate(req.query.day);
      if (day) query = query.gte('created_at', day.toISOString()).lt('created_at', new Date(day.getTime() + DAY).toISOString());
      const { data, error } = await query;
      if (error) throw error;
      const people = [...new Set([...(await listMembers()).map((p) => p.name), 'System'])].sort((a, b) => a.localeCompare(b));
      return res.status(200).json({ items: data.slice(0, limit), more: data.length > limit, people });
    }
    if (what === 'backups') {
      if (!admin) return refuse();
      return res.status(200).json({ backups: await listBackups(), keep: KEEP_BACKUPS });
    }
    return res.status(400).json({ error: 'Unknown view.' });
  }

  if (req.method === 'POST') {
    const action = String(body.action || '');
    if (action === 'assign') return editor ? send(await assign(member, body)) : refuse();
    if (action === 'sendback') return editor ? send(await sendBack(member, body)) : refuse();
    if (action === 'breaking') return editor ? send(await breaking(member, body)) : refuse();
    if (['backup', 'backup_link', 'backup_stories', 'restore_story'].includes(action) && !admin) return refuse();
    if (action === 'backup') return res.status(201).json(await makeBackup(member, 'manual'));
    if (action === 'backup_link') {
      if (!BACKUP_NAME.test(String(body.name))) return res.status(400).json({ error: 'Unknown backup.' });
      const { data, error } = await supabase.storage.from(BACKUPS).createSignedUrls([body.name], 600);
      if (error) throw error;
      if (!data?.[0]?.signedUrl) return res.status(404).json({ error: 'That backup is no longer kept.' });
      await logActivity(member, 'downloaded', 'backup', null, `${member.name} downloaded the backup ${body.name}`);
      return res.status(200).json({ url: `${data[0].signedUrl}&download=${encodeURIComponent(`180news-${body.name}`)}` });
    }
    if (action === 'backup_stories') return send(await backupStories(body.name));
    if (action === 'restore_story') return send(await restoreStory(member, body));
    return res.status(400).json({ error: 'Unknown action.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
