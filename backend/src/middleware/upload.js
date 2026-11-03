import multer from 'multer';
import { HttpError } from '../utils/httpError.js';

export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_FIELD_BYTES = 16 * 1024;
const MAX_TEXT_FIELDS = 12;
// Photos plus a generous allowance for the multipart framing and the text fields.
export const MAX_BODY_BYTES = MAX_PHOTOS * MAX_PHOTO_BYTES + 256 * 1024;

const tooLarge = () =>
  new HttpError(
    413,
    'PAYLOAD_TOO_LARGE',
    `Cada foto puede pesar hasta ${MAX_PHOTO_BYTES / 1024 / 1024} MB y puedes adjuntar hasta ${MAX_PHOTOS}.`,
  );

const MULTER_ERRORS = {
  LIMIT_FILE_SIZE: tooLarge,
  LIMIT_FIELD_VALUE: tooLarge,
  LIMIT_FILE_COUNT: () =>
    new HttpError(400, 'VALIDATION_ERROR', `photos: máximo ${MAX_PHOTOS} fotos por reporte.`),
  LIMIT_UNEXPECTED_FILE: () =>
    new HttpError(400, 'VALIDATION_ERROR', 'photos: campo de archivo inesperado.'),
  LIMIT_FIELD_COUNT: () => new HttpError(400, 'VALIDATION_ERROR', 'Demasiados campos.'),
  LIMIT_PART_COUNT: () => new HttpError(400, 'VALIDATION_ERROR', 'Demasiadas partes.'),
};

// Parses `multipart/form-data` fully in memory (photos are re-encoded right after) and turns every
// multer failure into the API's uniform error shape. The body size is bounded twice: by the
// declared Content-Length before reading anything, and by multer's own limits while streaming.
export function createReportUpload() {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: MAX_PHOTOS,
      fileSize: MAX_PHOTO_BYTES,
      fields: MAX_TEXT_FIELDS,
      fieldSize: MAX_TEXT_FIELD_BYTES,
      parts: MAX_PHOTOS + MAX_TEXT_FIELDS,
    },
  }).array('photos', MAX_PHOTOS);

  return (req, res, next) => {
    if (!req.is('multipart/form-data')) {
      return next(
        new HttpError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'El reporte debe enviarse como multipart/form-data.',
        ),
      );
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return next(tooLarge());
    return parser(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        return next((MULTER_ERRORS[error.code] ?? tooLarge)());
      }
      // Malformed multipart bodies surface as plain errors from busboy.
      return next(new HttpError(400, 'VALIDATION_ERROR', 'El cuerpo multipart no es válido.'));
    });
  };
}

const imageTooLarge = () =>
  new HttpError(
    413,
    'PAYLOAD_TOO_LARGE',
    `La imagen puede pesar hasta ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`,
  );

const IMAGE_MULTER_ERRORS = {
  LIMIT_FILE_SIZE: imageTooLarge,
  LIMIT_FILE_COUNT: () => new HttpError(400, 'VALIDATION_ERROR', 'Sube solo una imagen a la vez.'),
  LIMIT_UNEXPECTED_FILE: () =>
    new HttpError(400, 'VALIDATION_ERROR', 'image: campo de archivo inesperado.'),
  LIMIT_FIELD_COUNT: () => new HttpError(400, 'VALIDATION_ERROR', 'Demasiados campos.'),
  LIMIT_PART_COUNT: () => new HttpError(400, 'VALIDATION_ERROR', 'Demasiadas partes.'),
};

// One public image per request (`image` field). The API re-encodes it to WebP before storing it,
// so only the bytes are kept in memory and only for the duration of the sanitization.
export function createImageUpload() {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: 1,
      fileSize: MAX_PHOTO_BYTES,
      fields: 0,
      parts: 2,
    },
  }).single('image');

  return (req, res, next) => {
    if (!req.is('multipart/form-data')) {
      return next(
        new HttpError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'La imagen debe enviarse como multipart/form-data.',
        ),
      );
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES + 64 * 1024) {
      return next(imageTooLarge());
    }
    return parser(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        return next((IMAGE_MULTER_ERRORS[error.code] ?? imageTooLarge)());
      }
      return next(new HttpError(400, 'VALIDATION_ERROR', 'El cuerpo multipart no es válido.'));
    });
  };
}
