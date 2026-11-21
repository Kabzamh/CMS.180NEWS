import { uploadImage } from './image';
import type { MediaItem } from './types';

/*
 * The 180 News house advert: an "Advertise with us" banner in the site's own colours, with the
 * 180 News mark, drawn at the exact size of an advert position. It fills a position until the
 * space is sold.
 */

const NAVY_DEEP = '#02034f';
const BRAND = '#890303';
const LINE = '#c3c8d2';
const HEADLINE = 'Advertise with us';
// The space in "180 News" is a non-breaking one, so the name is never split across two lines.
const SUBLINE = 'Put your business in front of 180\u00a0News readers.';
const LOGO_RATIO = 480 / 274;
const FONT = '"Figtree", "Segoe UI", Arial, sans-serif';

function loadLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The 180 News logo could not be loaded. Reload the page and try again.'));
    img.src = '/logo.png';
  });
}

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

/** Breaks text into lines no wider than maxWidth at the font already set on the context. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface Block {
  lines: string[];
  size: number;
  weight: number;
  leading: number;
}

/** The largest size, from max down to min, at which the text fits the width in at most maxLines lines. */
function fitBlock(ctx: CanvasRenderingContext2D, text: string, weight: number, maxWidth: number, max: number, min: number, maxLines: number, leading: number): Block {
  let size = max;
  for (;;) {
    ctx.font = font(weight, size);
    const lines = wrap(ctx, text, maxWidth);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if ((lines.length <= maxLines && widest <= maxWidth) || size <= min) return { lines, size, weight, leading };
    size -= 1;
  }
}

const blockHeight = (b: Block) => b.lines.length * b.size * b.leading;

function drawBlock(ctx: CanvasRenderingContext2D, b: Block, x: number, top: number, align: CanvasTextAlign, colour: string): number {
  ctx.font = font(b.weight, b.size);
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  b.lines.forEach((line, i) => ctx.fillText(line, x, top + (i + 0.5) * b.size * b.leading));
  return top + blockHeight(b);
}

/** Draws the house advert at w by h pixels and returns it as a PNG file. */
export async function drawHouseAd(w: number, h: number, scale = 1): Promise<File> {
  const logo = await loadLogo();
  try {
    await Promise.all([document.fonts.load(font(900, 40)), document.fonts.load(font(600, 20))]);
  } catch {
    /* the fallback fonts are used */
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not draw the advert.');
  ctx.scale(canvas.width / w, canvas.height / h);
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  if (w / h >= 2) {
    // Wide: the mark on white at the left, the message on navy at the right.
    const pad = Math.max(8, h * 0.11);
    const logoH = h - pad * 2;
    const logoW = logoH * LOGO_RATIO;
    const split = Math.round(logoW + pad * 2.4);
    ctx.drawImage(logo, pad * 1.2, pad, logoW, logoH);
    ctx.fillStyle = NAVY_DEEP;
    ctx.fillRect(split, 0, w - split, h);
    ctx.fillStyle = BRAND;
    ctx.fillRect(split, 0, Math.max(4, h * 0.05), h);

    const left = split + Math.max(4, h * 0.05) + h * 0.22;
    const room = w - left - h * 0.2;
    const head = fitBlock(ctx, HEADLINE, 900, room, h * 0.34, 14, 1, 1.05);
    const sub = fitBlock(ctx, SUBLINE, 600, room, Math.max(11, head.size * 0.5), 11, h >= 110 ? 2 : 1, 1.25);
    const gap = h * 0.06;
    const showSub = sub.lines.length <= (h >= 110 ? 2 : 1) && blockHeight(head) + gap + blockHeight(sub) <= h - pad * 1.2;
    const total = blockHeight(head) + (showSub ? gap + blockHeight(sub) : 0);
    let y = (h - total) / 2;
    y = drawBlock(ctx, head, left, y, 'left', '#ffffff');
    if (showSub) drawBlock(ctx, sub, left, y + gap, 'left', 'rgba(255,255,255,0.86)');
  } else {
    // Square or tall: the mark on white at the top, the message on navy below.
    const top = Math.round(h * (h / w > 1.5 ? 0.34 : 0.44));
    const logoW = Math.min(w * 0.78, (top - h * 0.06) * LOGO_RATIO);
    const logoH = logoW / LOGO_RATIO;
    ctx.drawImage(logo, (w - logoW) / 2, (top - logoH) / 2, logoW, logoH);
    ctx.fillStyle = NAVY_DEEP;
    ctx.fillRect(0, top, w, h - top);
    ctx.fillStyle = BRAND;
    ctx.fillRect(0, top, w, Math.max(4, w * 0.02));

    const tall = h / w > 1.5;
    const room = w * 0.82;
    const head = fitBlock(ctx, HEADLINE, 900, room, tall ? w * 0.2 : w * 0.105, 14, tall ? 2 : 1, 1.05);
    const sub = fitBlock(ctx, SUBLINE, 600, room, tall ? w * 0.075 : w * 0.056, 11, tall ? 4 : 2, 1.3);
    const gap = tall ? h * 0.04 : h * 0.04;
    const total = blockHeight(head) + gap + blockHeight(sub);
    let y = top + Math.max(4, w * 0.02) + (h - top - Math.max(4, w * 0.02) - total) / 2;
    y = drawBlock(ctx, head, w / 2, y, 'center', '#ffffff');
    drawBlock(ctx, sub, w / 2, y + gap, 'center', 'rgba(255,255,255,0.86)');
  }

  // A hairline keeps the white part of the banner visible on a white page.
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('This browser could not draw the advert.');
  return new File([blob], `180news-house-advert-${w}x${h}.png`, { type: 'image/png' });
}

/**
 * Draws the house advert for a position and stores it in the media library.
 * Positions with a fixed size get a copy twice as large, which looks sharper on phones.
 */
export async function createHouseAd(size: { w: number; h: number; flexible?: boolean }): Promise<MediaItem> {
  const scale = size.flexible ? 1 : Math.min(2, 1600 / Math.max(size.w, size.h));
  return uploadImage(await drawHouseAd(size.w, size.h, scale));
}
