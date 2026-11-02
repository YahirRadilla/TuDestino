// Photos are shrunk on the device before they are stored or sent: it saves mobile data and the
// IndexedDB quota, and redrawing on a canvas also drops EXIF/GPS metadata (the server strips it
// again; this is defence in depth).

export const MAX_PHOTOS = 4;
export const MAX_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.85;
export const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Size that fits `width x height` inside a `max x max` box, never enlarging. */
export function fitWithin(width, height, max = MAX_EDGE_PX) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const baseName = (name) => name.replace(/\.[^.]+$/, '') || 'foto';

export class PhotoError extends Error {}

async function drawToJpeg(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('encode failed');
    return blob;
  } finally {
    bitmap.close?.();
  }
}

/**
 * Validates and shrinks one picked file. Returns a File ready to store/send.
 * If the browser cannot decode or draw it, the original is kept when it is small enough for the
 * server (5 MB), and the server re-encodes it anyway.
 */
export async function preparePhoto(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new PhotoError('Usa fotos JPEG, PNG o WebP.');
  }
  try {
    const blob = await drawToJpeg(file);
    return new File([blob], `${baseName(file.name)}.jpg`, { type: 'image/jpeg' });
  } catch {
    if (file.size > MAX_ORIGINAL_BYTES) {
      throw new PhotoError('No pudimos reducir esa foto y pesa más de 5 MB. Elige otra.');
    }
    return file;
  }
}
