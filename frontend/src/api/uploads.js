import { ApiError, apiFetch } from './client.js';

// Standalone upload used by the profile, destination, event and education forms. The server
// sanitizes and re-encodes the image before storing it (Cloudinary in Docker/production).
export async function uploadPublicImage(file, purpose) {
  const body = new FormData();
  body.append('image', file);
  const payload = await apiFetch(`/uploads/images?purpose=${encodeURIComponent(purpose)}`, {
    auth: true,
    method: 'POST',
    body,
    timeoutMs: 30_000,
  });
  if (!payload?.data?.url) throw new ApiError('http', 'El servidor no devolvió la imagen subida.');
  return payload.data.url;
}
