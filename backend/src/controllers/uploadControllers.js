import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { sanitizeImage } from '../services/imageService.js';

// `roles: null` means any signed-in account. Destination and education covers belong to the
// staff panel; avatars and event proposals are available to every authenticated user.
const PURPOSES = Object.freeze({
  avatar: { folder: 'avatars', roles: null },
  event: { folder: 'events', roles: null },
  destination: { folder: 'destinations', roles: ['authority', 'admin'] },
  education: { folder: 'education', roles: ['authority', 'admin'] },
});

const LOCAL_PUBLIC_PREFIX = 'local-public:';
const PUBLIC_PATH_PREFIX = '/api/v1/uploads/public/';

const badPurpose = () =>
  new HttpError(
    400,
    'VALIDATION_ERROR',
    'purpose debe ser avatar, event, destination o education.',
  );

// Public images are uploaded before the form is submitted, so the URL can be previewed and the
// same field keeps working for edits. The API never trusts the browser's mimetype: sharp checks
// the magic bytes, strips metadata and re-encodes to WebP.
export function createUploadControllers({ storage }) {
  return {
    uploadImage: asyncHandler(async (req, res) => {
      const purpose = String(req.query.purpose ?? '');
      const target = PURPOSES[purpose];
      if (!target) throw badPurpose();
      if (target.roles && !target.roles.includes(req.user.role)) {
        throw new HttpError(403, 'FORBIDDEN', 'No tienes permisos para subir esta imagen.');
      }
      if (!req.file) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Selecciona una imagen para subir.');
      }

      const image = await sanitizeImage(req.file.buffer);
      const name = `${Date.now()}-${randomUUID()}.webp`;
      const saved = await storage.save(image.data, {
        folder: target.folder,
        name,
        mimeType: image.mimeType,
        visibility: 'public',
      });

      const url = saved.url.startsWith(LOCAL_PUBLIC_PREFIX)
        ? `${PUBLIC_PATH_PREFIX}${saved.url.slice(LOCAL_PUBLIC_PREFIX.length)}`
        : saved.url;
      res.status(201).json({ data: { url } });
    }),

    // Only the local development driver needs this route. Cloudinary assets are public URLs.
    servePublic: asyncHandler(async (req, res) => {
      if (storage.driver !== 'local') {
        throw new HttpError(404, 'NOT_FOUND', 'No encontramos la imagen.');
      }
      let file;
      try {
        file = await storage.read(`${req.params.folder}/${req.params.name}`);
      } catch {
        file = null;
      }
      if (!file) throw new HttpError(404, 'NOT_FOUND', 'No encontramos la imagen.');

      res.set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        ...(file.size ? { 'Content-Length': String(file.size) } : {}),
      });
      await pipeline(file.stream, res);
    }),
  };
}
