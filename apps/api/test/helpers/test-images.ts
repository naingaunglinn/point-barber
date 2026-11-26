import sharp from 'sharp';

// Test images are made by code, never read from a file (add-attachments-upload design D15 · CG-TEST-08):
// no real photo, and no person's location, enters the repository. The GPS values are the fixture
// values of the spec (16.8409 N, 96.1735 E, written as degrees, minutes, seconds).

export const FIXTURE_GPS = {
  latitude: 16.8409,
  longitude: 96.1735,
} as const;

export type TestImageFormat = 'jpeg' | 'png' | 'webp';

export interface TestImageOptions {
  /** EXIF orientation tag 1 - 8 (JPEG and WebP; a PNG has no such tag here). */
  readonly orientation?: number;
  /** Write the GPS tags of the spec fixture. */
  readonly gps?: boolean;
}

/** `16.8409` → `16/1 50/1 2724/100` (degrees, minutes, seconds as EXIF rationals). */
function toDms(value: number): string {
  const degrees = Math.floor(value);
  const minutesFull = (value - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = Math.round((minutesFull - minutes) * 60 * 100);
  return `${degrees}/1 ${minutes}/1 ${seconds}/100`;
}

/** A horizontal colour gradient as raw RGB bytes: one row is built and copied down. */
function gradient(width: number, height: number): Buffer {
  const row = Buffer.alloc(width * 3);
  for (let x = 0; x < width; x++) {
    row[x * 3] = Math.round((x * 255) / Math.max(1, width - 1));
    row[x * 3 + 1] = 96;
    row[x * 3 + 2] = 255 - row[x * 3]!;
  }
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) row.copy(raw, y * row.length);
  return raw;
}

/** A gradient image of the given pixel size in the given format, with optional EXIF orientation and GPS. */
export async function gradientImage(
  format: TestImageFormat,
  width: number,
  height: number,
  options: TestImageOptions = {},
): Promise<Buffer> {
  let image = sharp(gradient(width, height), { raw: { width, height, channels: 3 } });
  if (options.gps === true) {
    image = image.withExif({
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: toDms(FIXTURE_GPS.latitude),
        GPSLongitudeRef: 'E',
        GPSLongitude: toDms(FIXTURE_GPS.longitude),
      },
    });
  }
  // withExif cannot set the orientation tag (sharp writes its own); withMetadata can.
  if (options.orientation !== undefined)
    image = image.withMetadata({ orientation: options.orientation });
  return image.toFormat(format).toBuffer();
}

/** A solid-colour image of the same kinds — cheap for the pixel-limit tests (a few kilobytes). */
export function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#808080' } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * `bytes` followed by zero bytes up to exactly `length` bytes — a JPEG or PDF still reads (trailing
 * bytes are ignored), so `boundary-10mb.jpg` is a real picture of exactly 10,485,760 bytes.
 */
export function padTo(bytes: Buffer, length: number): Buffer {
  if (bytes.length > length) throw new Error(`The file is ${bytes.length} bytes, over ${length}`);
  return Buffer.concat([bytes, Buffer.alloc(length - bytes.length)]);
}
