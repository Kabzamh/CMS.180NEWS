import { newsroomClient } from './newsroomReal';
import { resolveHomepageBlocks } from './homepageBlocks';

/** Staged bridge. Defaults to read-only and never falls back to demo data. */
export async function newsroomReadPreview(method: string, path: string, payload?: unknown, allowTestWrites = false): Promise<{status: number; body: unknown}> {
  const url = new URL(path, window.location.origin);
  const rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await newsroomClient().rpc(name, args);
    if (result.error) return { status: result.error.code === '40001' ? 409 : (result.status || 500), body: { error: result.error.message } };
    return { status: 200, body: result.data };
  };
  if (method !== 'GET') {
    if (!allowTestWrites) return { status: 403, body: { error: 'This Supabase preview is read-only. No changes were saved.' } };
    if (url.pathname === '/api/articles' && (method === 'POST' || method === 'PUT')) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {status:400, body:{error:'Invalid story.'}};
      const patch = { ...(payload as Record<string, unknown>) };
      const revision = patch.revision;
      delete patch.revision;
      if (patch.status === 'scheduled') return {status:503,body:{error:'Scheduled publication is not enabled. Save a draft or publish manually.'}};
      if (method === 'POST') delete patch.id;
      if (method === 'PUT') {
        if (!Number.isSafeInteger(patch.id) || Number(patch.id) < 1) return {status:400,body:{error:'An existing story ID is required for an update.'}};
        if (!Number.isSafeInteger(revision) || Number(revision) < 1) return {status:409,body:{error:'Reload the story before saving; its revision is missing.'}};
      }
      return rpc('newsroom_article_save', {p_patch:patch,p_expected_revision:method === 'PUT' ? revision : null});
    }
    if (method === 'PUT' && url.pathname === '/api/settings') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {status:400,body:{error:'Invalid setting.'}};
      const {key, value, revision} = payload as Record<string, unknown>;
      if (key !== 'homepage' && key !== 'ads_enabled') return {status:501,body:{error:'This setting is not yet connected to Supabase.'}};
      if (!Number.isSafeInteger(revision) || Number(revision) < 1) return {status:409,body:{error:'Reload this setting before saving; its revision is missing.'}};
      if (key === 'ads_enabled' && typeof value !== 'boolean') return {status:400,body:{error:'Invalid ad switch.'}};
      if (key === 'homepage') {
        if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as Record<string, unknown>).blocks)) return {status:400,body:{error:'Invalid homepage layout.'}};
        try { resolveHomepageBlocks([], [{key, value}], []); } catch { return {status:400,body:{error:'Invalid homepage layout.'}}; }
      }
      return rpc('newsroom_setting_save', {p_key:key,p_value:value,p_expected_revision:revision});
    }
    if (method === 'PUT' && url.pathname === '/api/ads') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {status:400,body:{error:'Invalid advert.'}};
      const {id, revision, ...patch} = payload as Record<string, unknown>;
      if (!Number.isSafeInteger(id) || Number(id) < 1) return {status:400,body:{error:'An existing advert ID is required.'}};
      if (!Number.isSafeInteger(revision) || Number(revision) < 1) return {status:409,body:{error:'Reload this advert before saving; its revision is missing.'}};
      return rpc('newsroom_ad_save', {p_id:id,p_patch:patch,p_expected_revision:revision});
    }
    return {status:501,body:{error:'This change is not yet connected to Supabase.'}};
  }
  if (url.pathname === '/api/team' && (url.searchParams.get('me') === '1' || url.searchParams.get('resource') === 'me')) return rpc('newsroom_me');
  if (url.pathname === '/api/articles') {
    const id = url.searchParams.get('id');
    if (id !== null && (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id)))) return {status:400,body:{error:'Invalid story ID.'}};
    const result = await rpc('newsroom_articles_read', { p_id: id === null ? null : Number(id) });
    if (result.status !== 200 || id !== null) return result;
    const all = Array.isArray(result.body) ? result.body as Array<Record<string, unknown>> : [];
    const counts: Record<string, number> = {total: all.length, draft: 0, review: 0, scheduled: 0, published: 0, hidden: 0};
    for (const row of all) { const key = String(row.status || ''); if (key in counts) counts[key]++; }
    const status = url.searchParams.get('status'); const section = url.searchParams.get('section'); const author = url.searchParams.get('author'); const search = (url.searchParams.get('q') || '').toLowerCase();
    const items = all.filter(row => (!status || row.status === status) && (!section || row.section === section) && (!author || String(row.author_id) === author) && (!search || [row.headline,row.summary,row.author_name].some(v => String(v || '').toLowerCase().includes(search))));
    const limit = Number(url.searchParams.get('limit'));
    return { status: 200, body: {items: limit > 0 ? items.slice(0,limit) : items, counts} };
  }
  const collection = url.pathname === '/api/sections' ? 'sections' : url.pathname === '/api/media' ? 'media' : url.pathname === '/api/ads' ? 'ads' : url.pathname === '/api/comments' ? 'comments' : url.pathname === '/api/team' && url.searchParams.get('authors') === '1' ? 'authors' : null;
  if (collection) {
    const result = await rpc('newsroom_collection_read', {p_collection: collection});
    if (result.status !== 200) return result;
    if (collection === 'authors') return {status:200,body:{authors:result.body}};
    if (collection === 'comments') return {status:200,body:{items:result.body}};
    return result;
  }
  if (url.pathname === '/api/settings') {
    if (url.searchParams.get('resource') === 'homepage') {
      const [sections, settings, articles] = await Promise.all([
        rpc('newsroom_collection_read', {p_collection:'sections'}),
        rpc('newsroom_collection_read', {p_collection:'settings'}),
        rpc('newsroom_articles_read', {p_id:null}),
      ]);
      for (const result of [sections, settings, articles]) if (result.status !== 200) return result;
      if (![sections.body, settings.body, articles.body].every(Array.isArray)) return {status:502,body:{error:'Invalid homepage data received.'}};
      try {
        const setting = (settings.body as Record<string, unknown>[]).find(row => row.key === 'homepage');
        if (!setting || !Number.isSafeInteger(setting.revision) || Number(setting.revision) < 1) return {status:502,body:{error:'Homepage setting revision is unavailable.'}};
        const blocks = resolveHomepageBlocks(sections.body as Record<string, unknown>[], settings.body as Record<string, unknown>[], articles.body as Record<string, unknown>[]);
        return {status:200,body:blocks.map(block => ({...block, revision: setting.revision}))};
      } catch { return {status:502,body:{error:'Invalid homepage settings or section data.'}}; }
    }
    if (url.searchParams.has('resource')) return {status:501,body:{error:'This settings feature is not yet connected to the Supabase preview.'}};
    const result = await rpc('newsroom_collection_read', {p_collection:'settings'});
    if (result.status !== 200) return result;
    if (!Array.isArray(result.body)) return {status:502,body:{error:'Invalid settings data received.'}};
    const entries = result.body as Array<{key:string;value:unknown;revision?:number}>;
    return {status:200,body:{...Object.fromEntries(entries.map(entry => [entry.key,entry.value])), _revisions:Object.fromEntries(entries.map(entry => [entry.key,entry.revision]))}};
  }
  if (url.pathname === '/api/public') {
    // The old /site homepage expects a composite payload that this preview does
    // not yet provide. Fail visibly rather than pretending an array is a homepage.
    if (!url.searchParams.has('resource') || url.searchParams.get('resource') === 'homepage') {
      return {status: 501, body: {error: 'Homepage layout is not connected in this read-only preview.'}};
    }
    const endpoint = new URL('https://javkaoplhtexqslyphqe.supabase.co/functions/v1/newsroom-public');
    endpoint.search = url.search;
    const response = await fetch(endpoint, {cache:'no-store'});
    return { status: response.status, body: await response.json() };
  }
  return { status: 501, body: { error: 'This feature is not yet connected to Supabase in the read-only preview.' } };
}
