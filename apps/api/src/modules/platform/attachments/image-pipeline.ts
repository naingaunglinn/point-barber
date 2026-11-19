import { HeifDecoder } from 'libheif-js/wasm-bundle';
import sharp, { type Sharp } from 'sharp';

import {
  type DetectedFileType,
  IMAGE_LONG_EDGE_PX,
  IMAGE_MAX_INPUT_PIXELS,
  VARIANT_WIDTHS,
} from '@point/shared';

// The image pipeline of an upload (P8-RULE-03 · ADR-014 decision 3 · CG-SEC-08 · add-attachments-upload
// design D5): decode, apply the EXIF orientation, drop all metadata, shrink to a long edge of 2,560 px,
// re-encode in the input format, then one WebP per variant width that is not wider than the result.
// A pure function of bytes: no storage, no database.

/** JPEG encoder quality of a stored original (HEIC is stored as JPEG too). Fixed in code (ADR-014). */
export const JPEG_QUALITY = 85;
/** WebP encoder quality of the original (a WebP upload) and of every variant. */
export const WEBP_QUALITY = 80;
/** PNG deflate level of a stored original (0 - 9; lossless, so only size and speed change). */
export const PNG_COMPRESSION_LEVEL = 9;

/** One WebP variant object: `name` is `w400`, `w800` or `w1600`. */
export interface ImageVariant {
  readonly name: `w${(typeof VARIANT_WIDTHS)[number]}`;
  readonly width: number;
  readonly height: number;
  readonly body: Buffer;
}

export interface ProcessedImage {
  /** The stored original, in the detected format (HEIC: JPEG), with its size after the resize. */
  readonly original: { readonly body: Buffer; readonly width: number; readonly height: number };
  /** Ascending by width; only widths not wider than the original. */
  readonly variants: readonly ImageVariant[];
}

/**
 * A file with a valid image signature that cannot be decoded: damaged, over the pixel limit, or a
 * codec this build lacks. The upload answers 422 `file_type_not_allowed` (P8-RULE-03 · design D3).
 */
export class ImageNotDecodable extends Error {
  constructor(readonly reason: unknown) {
    super('The file has an image signature but cannot be decoded');
    this.name = 'ImageNotDecodable';
  }
}

type Format = DetectedFileType['format'];

function encode(image: Sharp, format: Format): Sharp {
  switch (format) {
    case 'PNG':
      return image.png({ compressionLevel: PNG_COMPRESSION_LEVEL });
    case 'WebP':
      return image.webp({ quality: WEBP_QUALITY });
    default:
      return image.jpeg({ quality: JPEG_QUALITY });
  }
}

interface RawPixels {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

/**
 * HEIC to raw RGBA with the WebAssembly libheif (`libheif-js`, add-attachments-upload design R1): the
 * prebuilt sharp opens the container but has no HEVC decoder. The pixel limit is checked from the
 * container size BEFORE the decoder runs, so a huge file never reaches it. libheif applies the
 * transformations of the file (`irot` rotation, `imir` mirror, `clap` crop) while decoding, so the
 * pixels are already upright and no `rotate()` is needed. Only the primary image is decoded.
 */
async function decodeHeic(buffer: Buffer): Promise<RawPixels> {
  const meta = await sharp(buffer, { failOn: 'error' }).metadata();
  if (
    meta.width === undefined ||
    meta.height === undefined ||
    meta.width * meta.height > IMAGE_MAX_INPUT_PIXELS
  ) {
    throw new Error('The HEIC container is unreadable or over the pixel limit');
  }
  const image = new HeifDecoder().decode(buffer)[0];
  if (image === undefined) throw new Error('The HEIC file holds no image');
  const width = image.get_width();
  const height = image.get_height();
  if (width * height > IMAGE_MAX_INPUT_PIXELS)
    throw new Error('The HEIC image is over the pixel limit');
  const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
  const decoded = await new Promise<Uint8ClampedArray | null>((resolve) => {
    image.display(target, (result) => resolve(result === null ? null : result.data));
  });
  if (decoded === null) throw new Error('The HEIC image could not be decoded');
  return {
    data: Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength),
    width,
    height,
  };
}

/**
 * Decodes, cleans, shrinks and re-encodes `buffer`, and makes its variants. Sharp drops every metadata
 * block (EXIF, GPS, XMP, IPTC, thumbnails) unless asked to keep it; `rotate()` first turns the pixels
 * upright. Throws `ImageNotDecodable` when the bytes cannot be decoded.
 */
export async function processImage(
  buffer: Buffer,
  detected: Pick<DetectedFileType, 'format'>,
): Promise<ProcessedImage> {
  try {
    let input: Sharp;
    if (detected.format === 'HEIC') {
      const pixels = await decodeHeic(buffer);
      input = sharp(pixels.data, {
        raw: { width: pixels.width, height: pixels.height, channels: 4 },
        limitInputPixels: IMAGE_MAX_INPUT_PIXELS,
      });
    } else {
      input = sharp(buffer, { failOn: 'error', limitInputPixels: IMAGE_MAX_INPUT_PIXELS }).rotate();
    }
    const stored = await encode(
      input.resize({
        width: IMAGE_LONG_EDGE_PX,
        height: IMAGE_LONG_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      }),
      detected.format,
    ).toBuffer({ resolveWithObject: true });
    const { width, height } = stored.info;

    const variants: ImageVariant[] = [];
    for (const target of VARIANT_WIDTHS) {
      if (target > width) continue;
      const made = await sharp(stored.data)
        .resize({ width: target })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      variants.push({
        name: `w${target}`,
        width: made.info.width,
        height: made.info.height,
        body: made.data,
      });
    }
    return { original: { body: stored.data, width, height }, variants };
  } catch (error) {
    throw new ImageNotDecodable(error);
  }
}
