import sharp from 'sharp';

export const GPS_LAT = 24.133333333333333;
export const GPS_LNG = -110.3;

const raw = (width, height, background = '#e11d48') => ({
  create: { width, height, channels: 3, background },
});

// A JPEG that carries camera info, an EXIF orientation and a GPS position (24.13 N, 110.30 W).
export const jpegWithGps = ({ width = 40, height = 20, orientation = 6 } = {}) =>
  sharp(raw(width, height))
    .jpeg()
    .withMetadata({
      orientation,
      exif: {
        IFD0: { Make: 'TestCam', Model: 'Privacy-1' },
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '24/1 8/1 0/1',
          GPSLongitudeRef: 'W',
          GPSLongitude: '110/1 18/1 0/1',
        },
      },
    })
    .toBuffer();

export const png = (width = 64, height = 48) => sharp(raw(width, height)).png().toBuffer();
export const webp = (width = 64, height = 48) => sharp(raw(width, height)).webp().toBuffer();
export const jpeg = (width = 64, height = 48) => sharp(raw(width, height)).jpeg().toBuffer();
