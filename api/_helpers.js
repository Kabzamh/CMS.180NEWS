import supabase from './db-client.js';

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function okOptions(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function fail(res, status, message, fields = null, code = null) {
  const body = { error: message };
  if (code) body.code = code;
  if (fields) body.fields = fields;
  return res.status(status).json(body);
}

export async function requireUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Unauthorized', status: 401 };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: 'Invalid token', status: 401 };
  return { user: data.user, token };
}

export async function requireMember(req, roles = null) {
  const auth = await requireUser(req);
  if (auth.error) return auth;
  const { data: member, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('user_id', auth.user.id)
    .eq('active', true)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!member) return { error: 'You are not on the newsroom team.', status: 403 };
  if (roles && !roles.includes(member.role)) {
    return { error: 'You do not have permission for this action.', status: 403 };
  }
  return { user: auth.user, member, token: auth.token };
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

export function storyPath(id) {
  return `/story/my-cms${String(id).padStart(7, '0')}`;
}

export const SITE_ORIGIN = 'https://www.180news.co.za';

export function briefArticle(a) {
  return {
    id: a.id,
    headline: a.headline,
    summary: a.summary,
    section: a.section,
    tags: a.tags || [],
    image_url: a.image_url,
    author_name: a.author_name,
    author_id: a.author_id,
    placement: a.placement || 'none',
    status: a.status,
    publish_at: a.publish_at,
    views: a.views || 0,
    created_at: a.created_at,
    updated_at: a.updated_at,
  };
}

export function fullArticle(a) {
  return {
    ...briefArticle(a),
    body: a.body || '',
    image_caption: a.image_caption || '',
    image_credit: a.image_credit || '',
    media: a.media || [],
    created_by: a.created_by || null,
  };
}

export async function getSetting(key, fallback = null) {
  const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? fallback;
}

export async function setSetting(key, value) {
  const { data, error } = await supabase
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function allSettings() {
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.key] = row.value;
  return map;
}
