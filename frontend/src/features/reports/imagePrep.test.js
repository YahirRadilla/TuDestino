import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotoError, fitWithin, preparePhoto } from './imagePrep.js';
import { photoFile } from '../../test/reportFixtures.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fitWithin', () => {
  it('shrinks the long edge to 1600 px keeping the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('never enlarges and never returns a zero size', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1, 100_000)).toEqual({ width: 1, height: 1600 });
  });
});

describe('preparePhoto', () => {
  it('rejects anything that is not JPEG, PNG or WebP', async () => {
    await expect(preparePhoto(photoFile('a.gif', 'image/gif'))).rejects.toBeInstanceOf(PhotoError);
    await expect(preparePhoto(photoFile('a.pdf', 'application/pdf'))).rejects.toThrow(
      'Usa fotos JPEG, PNG o WebP.',
    );
  });

  it('redraws on a canvas at <= 1600 px and returns a JPEG', async () => {
    const drawImage = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }),
    );
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (done, type, quality) => {
        expect(type).toBe('image/jpeg');
        expect(quality).toBeGreaterThan(0.5);
        done(new Blob(['x'], { type: 'image/jpeg' }));
      },
    };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const result = await preparePhoto(photoFile('Mi Foto.PNG', 'image/png'));
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('Mi Foto.jpg');
  });

  it('keeps a small original when the browser cannot decode it (the server re-encodes)', async () => {
    const original = photoFile('a.jpg', 'image/jpeg', 1000);
    await expect(preparePhoto(original)).resolves.toBe(original);
  });

  it('refuses an original above 5 MB that could not be reduced', async () => {
    const big = photoFile('big.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1);
    await expect(preparePhoto(big)).rejects.toThrow(/más de 5 MB/);
  });
});
