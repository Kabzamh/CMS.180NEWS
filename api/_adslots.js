import supabase from './db-client.js';

/*
 * The advert positions on the 180news site, in the order they are listed, each with the banner size it
 * is built for (pixels, width by height).
 *
 *  - connector: false  the news app has this position itself and draws the advert.
 *  - connector: true   the news app has no place of its own for it, so /connect.js draws it.
 *  - flexible: true    the position takes any shape; the size is the one that fills it best.
 *
 * The same nine rows are seeded by database/schema.sql. Keep the two in step.
 */
export const AD_SLOTS = [
  {
    slot: 'header',
    slot_name: 'Site header',
    size: { w: 480, h: 120, format: 'Header banner' },
    connector: false,
    description: 'One advert at the top of every public page.',
    shape:
      'A compact banner about four times as wide as it is tall works best here, for example 480 by 120. It is shown up to 60 pixels tall, and 44 on a phone, where a long thin banner becomes too small to read.',
    positions: [['header', 'Beside the logo, in the same row, on every screen size']],
    position: 'header',
  },
  {
    slot: 'banner',
    slot_name: 'Top banner',
    size: { w: 728, h: 90, format: 'Leaderboard' },
    connector: false,
    description: 'An advert-only banner directly above the navigation bar on every public page.',
    shape:
      'A wide leaderboard works best here: 728 by 90. It is shown up to 90 pixels tall, and scaled to the width of the screen on a phone, where it is about 44 pixels tall.',
    positions: [
      ['abovemenu', 'Above the navigation bar'],
      ['verytop', 'Very top of the page'],
    ],
    position: 'abovemenu',
  },
  {
    slot: 'billboard',
    slot_name: 'Front page billboard',
    size: { w: 970, h: 250, format: 'Billboard' },
    connector: true,
    description: 'A large advert at the top of the front page, above the headline news.',
    shape: 'Billboard: 970 by 250 pixels. On a phone it is scaled to the width of the screen, about 90 pixels tall, so keep the wording large.',
    positions: [['top', 'Top of the front page, above the headline news']],
    position: 'top',
  },
  {
    slot: 'home',
    slot_name: 'Front page',
    size: { w: 970, h: 250, format: 'Billboard', flexible: true },
    connector: false,
    description: 'One advert on the front page.',
    shape: 'A billboard, 970 by 250 pixels, fills this space best. Any shape works: it is shown up to 280 pixels tall, and scaled to the width of the screen on a phone.',
    positions: [
      ['top', 'Directly under the headline news'],
      ['elections', 'After the Elections update'],
      ['middle', 'Mid-page, above Sport'],
      ['bottom', 'End of the page'],
    ],
    position: 'elections',
  },
  {
    slot: 'section',
    slot_name: 'Section pages',
    size: { w: 728, h: 90, format: 'Leaderboard' },
    connector: true,
    description: 'One advert at the top of every section page, and of Latest, tag pages and search.',
    shape: 'Leaderboard: 728 by 90 pixels. On a phone it is scaled to the width of the screen, about 44 pixels tall.',
    positions: [['top', 'Top of the page, above the title']],
    position: 'top',
  },
  {
    slot: 'article',
    slot_name: 'Story pages',
    size: { w: 300, h: 250, format: 'Medium rectangle', flexible: true },
    connector: false,
    description: 'One advert on every story and article.',
    shape: 'A medium rectangle, 300 by 250 pixels, suits this space best and stays full size on a phone. Any shape works: it is shown up to 280 pixels tall.',
    positions: [
      ['inline', 'Straight after the story'],
      ['below', 'Lower down, after the related headlines'],
    ],
    position: 'inline',
  },
  {
    slot: 'sidebar',
    slot_name: 'Story sidebar',
    size: { w: 300, h: 250, format: 'Medium rectangle' },
    connector: true,
    description: 'One advert beside every story. On a phone it follows the story.',
    shape: 'Medium rectangle: 300 by 250 pixels. It stays full size on a phone.',
    positions: [
      ['top', 'Top of the sidebar, above the list of headlines'],
      ['bottom', 'Bottom of the sidebar, under the list of headlines'],
    ],
    position: 'top',
  },
  {
    slot: 'halfpage',
    slot_name: 'Tall story sidebar',
    size: { w: 300, h: 600, format: 'Half page' },
    connector: true,
    description: 'A tall advert beside every story. It sits under the list of headlines and stays in view as the reader scrolls on. Shown on computers only.',
    shape: 'Half page: 300 by 600 pixels. It is not shown on phones or small tablets, where it would fill the screen.',
    positions: [['sticky', 'Under the list of headlines, staying in view as the reader scrolls on']],
    position: 'sticky',
  },
  {
    slot: 'footer',
    slot_name: 'Footer banner',
    size: { w: 728, h: 90, format: 'Leaderboard' },
    connector: true,
    description: 'One advert above the footer on every public page.',
    shape: 'Leaderboard: 728 by 90 pixels. On a phone it is scaled to the width of the screen, about 44 pixels tall.',
    positions: [['abovefooter', 'Above the footer']],
    position: 'abovefooter',
  },
];

const BY_SLOT = new Map(AD_SLOTS.map((def, index) => [def.slot, { ...def, sort: index + 1 }]));

/** The banner size a position is built for, or null for a position this code does not know. */
export const adSize = (slot) => BY_SLOT.get(slot)?.size ?? null;

/** A row from the ads table with its banner size, as the CMS shows it. */
export const withSize = (row) => ({ ...row, size: adSize(row.slot), connector: BY_SLOT.get(row.slot)?.connector === true });

const inOrder = (rows) =>
  rows
    .map(withSize)
    .sort((a, b) => (BY_SLOT.get(a.slot)?.sort ?? 1000 + (a.sort || 0)) - (BY_SLOT.get(b.slot)?.sort ?? 1000 + (b.sort || 0)) || a.id - b.id);

/**
 * Every advert position, in order, with its size. A database set up before the newer positions
 * existed gets them added here, switched off, so nothing has to be run by hand. Adverts that are
 * already set up are never touched.
 */
export async function loadAdSlots() {
  const read = async () => {
    const { data, error } = await supabase.from('ads').select('*').order('id', { ascending: true });
    if (error) throw error;
    return data;
  };
  let rows = await read();

  const have = new Set(rows.map((r) => r.slot));
  const missing = [...BY_SLOT.values()].filter((def) => !have.has(def.slot));
  const unsized = rows.filter((r) => r.shape == null && BY_SLOT.get(r.slot)?.shape);
  if (!missing.length && !unsized.length) return inOrder(rows);

  if (missing.length) {
    const { error } = await supabase.from('ads').insert(
      missing.map((def) => ({
        slot: def.slot,
        slot_name: def.slot_name,
        description: def.description,
        shape: def.shape,
        positions: def.positions,
        position: def.position,
        enabled: false,
        sort: def.sort,
      })),
    );
    // 23505: another request added them a moment ago. Anything else is a real failure.
    if (error && error.code !== '23505') throw error;
  }
  for (const row of unsized) {
    const { error } = await supabase.from('ads').update({ shape: BY_SLOT.get(row.slot).shape }).eq('id', row.id).is('shape', null);
    if (error) throw error;
  }

  rows = await read();
  // Two requests at the same moment can both add a position. The first row is kept.
  const first = new Map();
  const extra = [];
  for (const row of rows) {
    if (first.has(row.slot)) extra.push(row.id);
    else first.set(row.slot, row);
  }
  if (extra.length) {
    const { error } = await supabase.from('ads').delete().in('id', extra);
    if (error) throw error;
  }
  return inOrder([...first.values()]);
}
