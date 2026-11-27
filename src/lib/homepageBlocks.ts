// Pure, read-only mapping used by the staged CMS preview. The public site and
// settings writes are deliberately not connected by this module.
type Row = Record<string, unknown>;
export type HomepageBlock = { id: number; slug: string; label: string; enabled: boolean; categoryEnabled: boolean; count: number };

export function resolveHomepageBlocks(sections: Row[], settings: Row[], articles: Row[], now = Date.now()): HomepageBlock[] {
  const setting = settings.find(row => row.key === 'homepage');
  const value = setting?.value;
  if (value != null && (typeof value !== 'object' || Array.isArray(value))) throw new Error('Invalid homepage settings.');
  const rawBlocks = (value as Row | undefined)?.blocks;
  if (rawBlocks != null && !Array.isArray(rawBlocks)) throw new Error('Invalid homepage block list.');
  const saved = new Map<number, {enabled: boolean; order: number}>();
  for (const [order, item] of (rawBlocks ?? []).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid homepage block.');
    const row = item as Row;
    if (!Number.isSafeInteger(row.id) || Number(row.id) < 1 || (row.enabled != null && typeof row.enabled !== 'boolean') || saved.has(Number(row.id))) throw new Error('Invalid homepage block.');
    saved.set(Number(row.id), {enabled: row.enabled !== false, order});
  }
  const counts = new Map<string, number>();
  for (const article of articles) {
    if (article.status !== 'published' || typeof article.section !== 'string') continue;
    if (article.publish_at) {
      const at = Date.parse(String(article.publish_at));
      if (!Number.isFinite(at) || at > now) continue;
    }
    counts.set(article.section, (counts.get(article.section) ?? 0) + 1);
  }
  return sections.map((section, index) => {
    if (!Number.isSafeInteger(section.id) || Number(section.id) < 1 || typeof section.slug !== 'string' || typeof section.label !== 'string') throw new Error('Invalid section data.');
    const id = Number(section.id);
    return {block: {id, slug: section.slug, label: section.label, enabled: saved.get(id)?.enabled ?? true, categoryEnabled: section.enabled !== false, count: counts.get(section.slug) ?? 0}, order: saved.get(id)?.order ?? Number.MAX_SAFE_INTEGER, sort: typeof section.sort_order === 'number' ? section.sort_order : index, index};
  }).sort((a,b) => a.order - b.order || a.sort - b.sort || a.index - b.index).map(row => row.block);
}
