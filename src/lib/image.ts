import { api } from './api';
import type { MediaItem } from './types';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_UPLOAD = 3 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} could not be read as an image. Try saving it again as a JPG or PNG.`));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('The image could not be read. Try again.'));
    reader.readAsDataURL(blob);
  });
}

/** Resizes large pictures in the browser so every upload fits, then stores it in the media library. */
export async function uploadImage(file: File, maxDimension = 1600): Promise<MediaItem> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error(`${file.name} is not a JPG, PNG, WebP or GIF image.`);
  }

  const img = await loadImage(file);
  let width = img.naturalWidth;
  let height = img.naturalHeight;
  let blob: Blob = file;

  const isGif = file.type === 'image/gif';
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const needsWork = !isGif && (scale < 1 || file.size > 1.5 * 1024 * 1024);

  if (needsWork) {
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not resize the image. Try a smaller one.');

    let out: Blob | null = null;
    if (file.type === 'image/png') {
      ctx.drawImage(img, 0, 0, width, height);
      out = await toBlob(canvas, 'image/png');
    }
    if (!out || out.size > MAX_UPLOAD) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      out = await toBlob(canvas, 'image/jpeg', 0.86);
    }
    if (!out) throw new Error('This browser could not resize the image. Try a smaller one.');
    blob = out;
  }

  if (blob.size > MAX_UPLOAD) {
    throw new Error(`${file.name} is too large (over 3 MB). Try a smaller image.`);
  }

  return api<MediaItem>('/api/media', {
    method: 'POST',
    body: {
      fileName: file.name,
      fileBase64: await toBase64(blob),
      contentType: blob.type || file.type,
      width,
      height,
    },
  });
}
