import supabase from './db-client.js';
import { requireMember, logActivity, clean, readSettings, resolveHomepage, fail } from './_lib.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isPhone = (v) => /^[+\d][\d\s()-]*$/.test(v) && v.replace(/\D/g, '').length >= 7;
const LABELS = {
  ads_enabled: 'adverts',
  crawl: 'the headline crawl',
  notice: 'the site notice',
  elections_update: 'the elections update',
  live_updates: 'live updates',
  scheduled_panel: 'the scheduled panel',
  contact: 'the contact details',
  comments: 'the comment settings',
  homepage: 'the homepage sections',
};

function validate(key, value) {
  const v = value && typeof value === 'object' ? value : {};
  const fields = {};
  switch (key) {
    case 'ads_enabled':
      return { value: value === true };
    case 'crawl': {
      const speed = ['slow', 'normal', 'fast'].includes(v.speed) ? v.speed : 'normal';
      return { value: { enabled: v.enabled === true, speed, message: clean(v.message, 160) } };
    }
    case 'notice': {
      const text = clean(v.text, 240);
      if (v.enabled === true && !text) fields.text = 'Write the notice before switching it on.';
      return Object.keys(fields).length ? { fields } : { value: { enabled: v.enabled === true, text } };
    }
    case 'elections_update': {
      const title = clean(v.title, 80) || 'Elections update';
      const text = clean(v.text, 600);
      if (v.enabled === true && !text) fields.text = 'Write the update before switching it on.';
      return Object.keys(fields).length ? { fields } : { value: { enabled: v.enabled === true, title, text } };
    }
    case 'live_updates':
    case 'scheduled_panel':
      return { value: { enabled: v.enabled === true } };
    case 'comments':
      return { value: { enabled: v.enabled === true, hold: v.hold !== false } };
    case 'homepage': {
      const blocks = (Array.isArray(v.blocks) ? v.blocks : [])
        .filter((b) => b && typeof b.id === 'string' && b.id.length <= 100)
        .slice(0, 80)
        .map((b) => ({ id: b.id, enabled: b.enabled !== false, count: Number.isFinite(Number(b.count)) && b.count !== null ? Math.round(Number(b.count)) : null }));
      return { value: { blocks } };
    }
    case 'contact': {
      const email = clean(v.email, 160);
      const phone = clean(v.phone, 40);
      const adsPhone = clean(v.ads_phone, 40);
      if (!email) fields.email = 'Enter the newsroom email address.';
      else if (!EMAIL.test(email)) fields.email = 'Enter a valid email address, for example news@180news.co.za.';
      if (!phone) fields.phone = 'Enter the contact number.';
      else if (!isPhone(phone)) fields.phone = 'Enter a phone number, for example 011 555 0180.';
      if (adsPhone && !isPhone(adsPhone)) fields.ads_phone = 'Enter a phone number, for example 011 555 0181.';
      return Object.keys(fields).length ? { fields } : { value: { email, phone, ads_phone: adsPhone } };
    }
    default:
      return { unknown: true };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const member = await requireMember(req, res);
      if (!member) return;
      if (req.query.resource === 'homepage') {
        const [settings, sections] = await Promise.all([readSettings(), supabase.from('sections').select('slug, label, enabled, position').order('position', { ascending: true })]);
        if (sections.error) throw sections.error;
        return res.status(200).json(resolveHomepage(settings, sections.data));
      }
      return res.status(200).json(await readSettings());
    }

    if (req.method === 'PUT') {
      const member = await requireMember(req, res, ['owner', 'editor']);
      if (!member) return;
      const key = req.body?.key;
      const result = validate(key, req.body?.value);
      if (result.unknown) return res.status(400).json({ error: 'Unknown setting.' });
      if (result.fields) return res.status(400).json({ error: 'Check the highlighted fields.', fields: result.fields });
      const { error } = await supabase
        .from('settings')
        .upsert({ key, value: result.value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      await logActivity(member, 'updated', 'settings', null, `${member.name} changed ${LABELS[key]}`);
      return res.status(200).json(await readSettings());
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    fail(res, err);
  }
}
