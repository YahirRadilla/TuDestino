import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

// Outside every public route and ignored by git.
export const DEFAULT_UPLOADS_DIR = fileURLToPath(new URL('../../uploads', import.meta.url));

// Image storage behind one interface. Both drivers expose:
//   save(buffer, { folder, name, mimeType, visibility }) -> { url, publicId }
//   remove(publicId, { visibility }) -> void  (idempotent)
//   read(publicId) -> { stream, size? } | null  (null when the file does not exist)
// Report evidence uses the default `private` visibility: the authority reads it through the
// authenticated admin route. Profile avatars, destinations, events and education covers use
// `public`, so the browser can render the returned URL directly.

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const assertSegment = (value, label) => {
  if (!SAFE_SEGMENT.test(value) || value.includes('..')) {
    throw new Error(`Invalid storage ${label}.`);
  }
};

export function createLocalStorage({ uploadsDir }) {
  const root = path.resolve(uploadsDir);
  const resolveKey = (key) => {
    const target = path.resolve(root, key);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error('Invalid storage key.');
    }
    return target;
  };
  return {
    driver: 'local',
    async save(buffer, { folder, name, visibility = 'private' }) {
      assertSegment(folder, 'folder');
      assertSegment(name, 'name');
      const key = `${folder}/${name}`;
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer, { flag: 'wx' });
      // `local-public:` is resolved by the upload controller to the API route that serves it.
      const prefix = visibility === 'public' ? 'local-public:' : 'local:';
      return { url: `${prefix}${key}`, publicId: key };
    },
    async remove(publicId) {
      await rm(resolveKey(publicId), { force: true });
    },
    async read(publicId) {
      const target = resolveKey(publicId);
      let info;
      try {
        info = await stat(target);
      } catch {
        return null;
      }
      if (!info.isFile()) return null;
      return { stream: createReadStream(target), size: info.size };
    },
  };
}

// `CLOUDINARY_URL` format: cloudinary://<api_key>:<api_secret>@<cloud_name>
export function parseCloudinaryUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('CLOUDINARY_URL no es una URL válida.');
  }
  if (url.protocol !== 'cloudinary:' || !url.username || !url.password || !url.hostname) {
    throw new Error(
      'CLOUDINARY_URL debe tener el formato cloudinary://api_key:api_secret@cloud_name.',
    );
  }
  return {
    cloud_name: url.hostname,
    api_key: decodeURIComponent(url.username),
    api_secret: decodeURIComponent(url.password),
    secure: true,
  };
}

export const SIGNED_URL_TTL_SECONDS = 60;
const WEBP_SUFFIX = /\.webp$/i;

// `sdk` and `fetchImpl` are injectable for tests; production loads the official SDK lazily.
export function createCloudinaryStorage({ cloudinaryUrl, sdk, fetchImpl = globalThis.fetch } = {}) {
  const credentials = parseCloudinaryUrl(cloudinaryUrl);
  let clientPromise;
  const client = () => {
    clientPromise ??= (async () => {
      const v2 = sdk ?? (await import('cloudinary')).default.v2;
      v2.config(credentials);
      return v2;
    })();
    return clientPromise;
  };
  return {
    driver: 'cloudinary',
    async save(buffer, { folder, name, visibility = 'private' }) {
      assertSegment(folder, 'folder');
      assertSegment(name, 'name');
      const v2 = await client();
      // Cloudinary appends the real format to the URL; keeping `.webp` in public_id would produce
      // `...webp.webp`. The local driver keeps the extension because it maps directly to a file.
      const publicId = name.replace(WEBP_SUFFIX, '');
      const result = await new Promise((resolve, reject) => {
        const stream = v2.uploader.upload_stream(
          {
            folder,
            public_id: publicId,
            resource_type: 'image',
            // Report evidence is `authenticated` (only reachable with a signed URL); profile,
            // destination, event and education images are public assets.
            type: visibility === 'public' ? 'upload' : 'authenticated',
            overwrite: false,
            unique_filename: false,
          },
          (error, uploaded) => (error ? reject(error) : resolve(uploaded)),
        );
        stream.end(buffer);
      });
      return { url: result.secure_url, publicId: result.public_id };
    },
    async remove(publicId, { visibility = 'private' } = {}) {
      const v2 = await client();
      await v2.uploader.destroy(publicId, {
        resource_type: 'image',
        type: visibility === 'public' ? 'upload' : 'authenticated',
        invalidate: true,
      });
    },
    // Short-lived signed download URL (the asset is `authenticated`, so it has no public URL).
    async signedUrl(publicId, { ttlSeconds = SIGNED_URL_TTL_SECONDS } = {}) {
      const v2 = await client();
      return v2.utils.private_download_url(publicId.replace(WEBP_SUFFIX, ''), 'webp', {
        resource_type: 'image',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
      });
    },
    async read(publicId) {
      const response = await fetchImpl(await this.signedUrl(publicId));
      if (!response.ok || !response.body) return null;
      const size = Number(response.headers.get('content-length'));
      return { stream: Readable.fromWeb(response.body), size: size > 0 ? size : undefined };
    },
  };
}

export function createStorage({
  driver = 'local',
  uploadsDir,
  cloudinaryUrl,
  sdk,
  fetchImpl,
} = {}) {
  if (driver === 'cloudinary') return createCloudinaryStorage({ cloudinaryUrl, sdk, fetchImpl });
  if (driver === 'local') {
    if (!uploadsDir) throw new Error('El driver local necesita uploadsDir.');
    return createLocalStorage({ uploadsDir });
  }
  throw new Error(`STORAGE_DRIVER desconocido: ${driver}`);
}
