import { Router } from 'express';
import { createLimiter } from '../middleware/rateLimit.js';
import { createImageUpload } from '../middleware/upload.js';

export const DEFAULT_UPLOAD_RATE_LIMIT = { windowMs: 60_000, limit: 30 };

// Public route for the local development driver first; the upload itself is authenticated.
export function createUploadRouter({
  controllers,
  authenticate,
  rateLimit = DEFAULT_UPLOAD_RATE_LIMIT,
}) {
  const router = Router();
  router.get('/public/:folder/:name', controllers.servePublic);
  router.post(
    '/images',
    createLimiter(rateLimit),
    authenticate,
    createImageUpload(),
    controllers.uploadImage,
  );
  return router;
}
