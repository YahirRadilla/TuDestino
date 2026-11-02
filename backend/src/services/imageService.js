import sharp from 'sharp';
import { HttpError } from '../utils/httpError.js';

export const MAX_IMAGE_EDGE_PX = 1600;
const MAX_INPUT_PIXELS = 40_000_000;
const OUTPUT_QUALITY = 80;

const startsWith = (buffer, bytes, offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);

// Identifies the real format from the leading bytes; the client-declared mimetype is never trusted.
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  return null;
}

const unsupported = () =>
  new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Solo se aceptan fotos JPEG, PNG o WebP válidas.');

// Validates the magic bytes, applies the EXIF orientation, bounds the size and re-encodes to WebP.
// sharp drops every metadata block (EXIF/GPS, XMP, ICC) unless asked to keep it (ADR-03, section 13).
export async function sanitizeImage(buffer) {
  if (!detectImageType(buffer)) throw unsupported();
  try {
    const data = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({
        width: MAX_IMAGE_EDGE_PX,
        height: MAX_IMAGE_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: OUTPUT_QUALITY })
      .toBuffer();
    return { data, mimeType: 'image/webp' };
  } catch {
    // Corrupt files, truncated streams and decompression bombs all end up here.
    throw unsupported();
  }
}
