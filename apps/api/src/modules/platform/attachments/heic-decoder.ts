import { Worker } from 'node:worker_threads';

import sharp from 'sharp';

import { HEIC_DECODE_TIMEOUT_MS } from '../../../common/limits.js';

// HEIC to raw RGBA with the WebAssembly libheif (`libheif-js`, add-attachments-upload design R1): the
// prebuilt sharp opens the container but has no HEVC decoder. libheif is synchronous and never shrinks
// its memory, and a decoder keeps its file until the next decode, so every file gets a worker thread
// that ends after it: the API's event loop stays free and all the memory goes back (design R2).

export interface RawPixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

// Beside this module: `.ts` from source (the unit tests — Node strips the types), `.js` in dist.
const WORKER = new URL(
  import.meta.url.endsWith('.ts') ? './heic-decoder.worker.ts' : './heic-decoder.worker.js',
  import.meta.url,
);

function runWorker(file: Uint8Array, maxPixels: number): Promise<RawPixels> {
  return new Promise((resolve, reject) => {
    // stdout / stderr: libheif writes its own messages to the console; the caller gets the error.
    const worker = new Worker(WORKER, {
      workerData: { file, maxPixels },
      execArgv: [],
      stdout: true,
      stderr: true,
    });
    const timer = setTimeout(() => {
      reject(new Error('The HEIC decode took too long'));
      void worker.terminate();
    }, HEIC_DECODE_TIMEOUT_MS);
    worker.once('message', (pixels: RawPixels) => resolve(pixels));
    worker.once('error', reject);
    worker.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('The HEIC decoder ended without a picture')); // no effect once settled
    });
  });
}

/** One decode at a time (design R2): a raw picture at the pixel limit is 200 MB. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * The primary image of a HEIC file. The pixel limit is checked from the container size BEFORE the
 * decoder runs, so a huge file never reaches it. libheif applies the transformations of the file
 * (`irot` rotation, `imir` mirror, `clap` crop), so the pixels are already upright.
 */
export async function decodeHeic(file: Uint8Array, maxPixels: number): Promise<RawPixels> {
  const { width, height } = await sharp(file, { failOn: 'error' }).metadata();
  if (width === undefined || height === undefined || width * height > maxPixels) {
    throw new Error('The HEIC container is unreadable or over the pixel limit');
  }
  const decoded = queue.then(() => runWorker(file, maxPixels));
  queue = decoded.catch(() => undefined);
  return decoded;
}
