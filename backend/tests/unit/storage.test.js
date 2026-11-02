import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createCloudinaryStorage,
  createLocalStorage,
  createStorage,
  parseCloudinaryUrl,
} from '../../src/services/storage.js';

describe('local storage driver', () => {
  let dir;
  let storage;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'td-storage-'));
    storage = createLocalStorage({ uploadsDir: dir });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes the file under the uploads directory and returns a non-public reference', async () => {
    const saved = await storage.save(Buffer.from('hello'), { folder: 'reports', name: 'a.webp' });
    expect(saved).toEqual({ url: 'local:reports/a.webp', publicId: 'reports/a.webp' });
    expect(await readFile(path.join(dir, 'reports', 'a.webp'), 'utf8')).toBe('hello');
    expect(saved.url).not.toMatch(/^https?:/);
  });

  it('removes files and tolerates removing something already gone', async () => {
    const { publicId } = await storage.save(Buffer.from('x'), {
      folder: 'reports',
      name: 'b.webp',
    });
    await storage.remove(publicId);
    await expect(stat(path.join(dir, 'reports', 'b.webp'))).rejects.toThrow();
    await expect(storage.remove(publicId)).resolves.toBeUndefined();
    expect(await readdir(path.join(dir, 'reports'))).toEqual([]);
  });

  it('never overwrites an existing file', async () => {
    await storage.save(Buffer.from('1'), { folder: 'reports', name: 'c.webp' });
    await expect(
      storage.save(Buffer.from('2'), { folder: 'reports', name: 'c.webp' }),
    ).rejects.toThrow();
    expect(await readFile(path.join(dir, 'reports', 'c.webp'), 'utf8')).toBe('1');
  });

  it('refuses path traversal in names, folders and removal keys', async () => {
    await expect(
      storage.save(Buffer.from('x'), { folder: 'reports', name: '../escape.webp' }),
    ).rejects.toThrow(/Invalid/);
    await expect(
      storage.save(Buffer.from('x'), { folder: '../out', name: 'a.webp' }),
    ).rejects.toThrow(/Invalid/);
    await expect(storage.save(Buffer.from('x'), { folder: 'a/b', name: 'a.webp' })).rejects.toThrow(
      /Invalid/,
    );
    await expect(storage.remove('../../etc/passwd')).rejects.toThrow(/Invalid/);
  });
});

describe('cloudinary storage driver', () => {
  const url = 'cloudinary://123456:s3cr3t@my-cloud';

  it('parses CLOUDINARY_URL and rejects malformed values', () => {
    expect(parseCloudinaryUrl(url)).toEqual({
      cloud_name: 'my-cloud',
      api_key: '123456',
      api_secret: 's3cr3t',
      secure: true,
    });
    expect(() => parseCloudinaryUrl('https://x:y@z')).toThrow(/formato/);
    expect(() => parseCloudinaryUrl('cloudinary://nokey')).toThrow();
    expect(() => parseCloudinaryUrl('not a url')).toThrow(/válida/);
  });

  const fakeSdk = () => {
    const calls = { upload: [], destroy: [], config: [] };
    return {
      calls,
      config: (c) => calls.config.push(c),
      uploader: {
        upload_stream: (options, done) => {
          calls.upload.push(options);
          return {
            end: (buffer) =>
              done(null, {
                secure_url: `https://res.cloudinary.test/${options.folder}/${options.public_id}`,
                public_id: `${options.folder}/${options.public_id}`,
                bytes: buffer.length,
              }),
          };
        },
        destroy: vi.fn(async (id, options) => calls.destroy.push([id, options])),
      },
    };
  };

  it('uploads as an authenticated (private) asset and returns its id', async () => {
    const sdk = fakeSdk();
    const storage = createStorage({ driver: 'cloudinary', cloudinaryUrl: url, sdk });
    const saved = await storage.save(Buffer.from('img'), { folder: 'reports', name: 'x' });
    expect(saved).toEqual({
      url: 'https://res.cloudinary.test/reports/x',
      publicId: 'reports/x',
    });
    expect(sdk.calls.config[0]).toMatchObject({ cloud_name: 'my-cloud', api_key: '123456' });
    expect(sdk.calls.upload[0]).toMatchObject({
      type: 'authenticated',
      resource_type: 'image',
      overwrite: false,
    });
  });

  it('removes by public id and surfaces upload failures', async () => {
    const sdk = fakeSdk();
    const storage = createCloudinaryStorage({ cloudinaryUrl: url, sdk });
    await storage.remove('reports/x');
    expect(sdk.calls.destroy[0][0]).toBe('reports/x');

    sdk.uploader.upload_stream = (_options, done) => ({ end: () => done(new Error('boom')) });
    await expect(storage.save(Buffer.from('x'), { folder: 'reports', name: 'y' })).rejects.toThrow(
      'boom',
    );
  });
});

describe('createStorage', () => {
  it('selects the driver and rejects unknown ones', () => {
    expect(createStorage({ driver: 'local', uploadsDir: tmpdir() }).driver).toBe('local');
    expect(() => createStorage({ driver: 'local' })).toThrow(/uploadsDir/);
    expect(() => createStorage({ driver: 's3' })).toThrow(/desconocido/);
  });
});

describe('reading evidence back (admin download)', () => {
  it('local driver streams the stored bytes and reports the size', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'td-read-'));
    try {
      const storage = createLocalStorage({ uploadsDir: dir });
      const { publicId } = await storage.save(Buffer.from('imagen'), {
        folder: 'reports',
        name: 'r.webp',
      });
      const file = await storage.read(publicId);
      expect(file.size).toBe(6);
      const chunks = [];
      for await (const chunk of file.stream) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe('imagen');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('local driver answers null for a missing file or a directory and refuses traversal', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'td-read-'));
    try {
      const storage = createLocalStorage({ uploadsDir: dir });
      await storage.save(Buffer.from('x'), { folder: 'reports', name: 'r.webp' });
      expect(await storage.read('reports/nada.webp')).toBeNull();
      expect(await storage.read('reports')).toBeNull();
      await expect(storage.read('../../etc/passwd')).rejects.toThrow(/Invalid/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  describe('cloudinary driver', () => {
    const sdk = () => ({
      config: vi.fn(),
      utils: { private_download_url: vi.fn(() => 'https://api.cloudinary.com/signed?sig=1') },
    });

    it('signs a short-lived download URL for the authenticated asset', async () => {
      const fake = sdk();
      const storage = createCloudinaryStorage({
        cloudinaryUrl: 'cloudinary://key:secret@demo',
        sdk: fake,
      });
      const before = Math.floor(Date.now() / 1000);
      const url = await storage.signedUrl('reports/a-1.webp');
      expect(url).toBe('https://api.cloudinary.com/signed?sig=1');
      const [publicId, format, options] = fake.utils.private_download_url.mock.calls[0];
      expect([publicId, format]).toEqual(['reports/a-1', 'webp']);
      expect(options).toMatchObject({ type: 'authenticated', resource_type: 'image' });
      expect(options.expires_at).toBeGreaterThanOrEqual(before + 59);
      expect(options.expires_at).toBeLessThanOrEqual(before + 62);
    });

    it('streams the file through the server instead of exposing the signed URL', async () => {
      const fetchImpl = vi.fn(
        async () => new Response('bytes', { status: 200, headers: { 'content-length': '5' } }),
      );
      const storage = createCloudinaryStorage({
        cloudinaryUrl: 'cloudinary://key:secret@demo',
        sdk: sdk(),
        fetchImpl,
      });
      const file = await storage.read('reports/a-1.webp');
      expect(fetchImpl).toHaveBeenCalledWith('https://api.cloudinary.com/signed?sig=1');
      expect(file.size).toBe(5);
      const chunks = [];
      for await (const chunk of file.stream) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe('bytes');
    });

    it('answers null when the asset does not exist', async () => {
      const storage = createCloudinaryStorage({
        cloudinaryUrl: 'cloudinary://key:secret@demo',
        sdk: sdk(),
        fetchImpl: vi.fn(async () => new Response('nope', { status: 404 })),
      });
      expect(await storage.read('reports/missing.webp')).toBeNull();
    });
  });
});
