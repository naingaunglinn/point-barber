import { parentPort, workerData } from 'node:worker_threads';

import libheif from 'libheif-js/wasm-bundle.js'; // a CommonJS module: the default import is its exports

// The worker thread of `decodeHeic` (heic-decoder.ts): decodes the primary image of ONE file to raw
// RGBA, posts it, and ends. It imports nothing of this repository, so it runs from source as well.

const { file, maxPixels } = workerData as { file: Uint8Array; maxPixels: number };

const images = new libheif.HeifDecoder().decode(file);
const image = images.find((candidate) => candidate.is_primary()) ?? images[0];
if (image === undefined) throw new Error('The HEIC file holds no image');
const width = image.get_width();
const height = image.get_height();
if (width * height > maxPixels) throw new Error('The HEIC image is over the pixel limit');
const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
image.display(target, (result) => {
  for (const each of images) each.free();
  if (result === null) throw new Error('The HEIC image could not be decoded');
  parentPort?.postMessage({ data: target.data, width, height }, [target.data.buffer]);
});
