import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import exifr from 'exifr';
import {
  detectImageType,
  MAX_IMAGE_EDGE_PX,
  sanitizeImage,
} from '../../src/services/imageService.js';
import { GPS_LAT, GPS_LNG, jpeg, jpegWithGps, png, webp } from '../helpers/images.js';

describe('detectImageType (magic bytes)', () => {
  it('recognises JPEG, PNG and WebP by their content', async () => {
    expect(detectImageType(await jpeg())).toBe('image/jpeg');
    expect(detectImageType(await png())).toBe('image/png');
    expect(detectImageType(await webp())).toBe('image/webp');
  });

  it('rejects anything else, whatever its name or declared type', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType('not a buffer')).toBeNull();
  });

  it('does not take a RIFF container that is not WebP for an image', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
    expect(detectImageType(wav)).toBeNull();
  });
});

describe('sanitizeImage', () => {
  it('fixture sanity: the source JPEG really carries GPS and an orientation', async () => {
    const source = await jpegWithGps();
    const gps = await exifr.gps(source);
    expect(gps.latitude).toBeCloseTo(GPS_LAT, 4);
    expect(gps.longitude).toBeCloseTo(GPS_LNG, 4);
    expect((await sharp(source).metadata()).orientation).toBe(6);
  });

  it('re-encodes to WebP without EXIF, GPS or any other metadata block', async () => {
    const { data, mimeType } = await sanitizeImage(await jpegWithGps());
    expect(mimeType).toBe('image/webp');
    expect(detectImageType(data)).toBe('image/webp');
    const meta = await sharp(data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    // exifr either finds nothing or refuses a file without EXIF; either way there is no GPS.
    const gps = await exifr.gps(data).catch(() => undefined);
    expect(gps).toBeUndefined();
    expect(data.includes(Buffer.from('EXIF'))).toBe(false);
    expect(data.includes(Buffer.from('TestCam'))).toBe(false);
  });

  it('applies the EXIF orientation before dropping it', async () => {
    const { data } = await sanitizeImage(await jpegWithGps({ width: 40, height: 20 }));
    const meta = await sharp(data).metadata();
    expect([meta.width, meta.height]).toEqual([20, 40]);
    expect(meta.orientation).toBeUndefined();
  });

  it('shrinks large images to at most 1600 px and never enlarges small ones', async () => {
    const big = await sanitizeImage(await jpeg(3200, 1800));
    const bigMeta = await sharp(big.data).metadata();
    expect(Math.max(bigMeta.width, bigMeta.height)).toBe(MAX_IMAGE_EDGE_PX);
    expect(bigMeta.width / bigMeta.height).toBeCloseTo(3200 / 1800, 1);

    const small = await sanitizeImage(await png(100, 50));
    const smallMeta = await sharp(small.data).metadata();
    expect([smallMeta.width, smallMeta.height]).toEqual([100, 50]);
  });

  it('answers 415 for a file that is not an image', async () => {
    await expect(sanitizeImage(Buffer.from('MZ not an image'))).rejects.toMatchObject({
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  });

  it('answers 415 for a file with image magic bytes but corrupt content', async () => {
    const truncated = (await png()).subarray(0, 40);
    await expect(sanitizeImage(truncated)).rejects.toMatchObject({ status: 415 });
    await expect(
      sanitizeImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, 7)])),
    ).rejects.toMatchObject({ status: 415 });
  });
});
