// Copies the ZXing WebAssembly file that the QR scanner's `barcode-detector` ponyfill loads into
// public/vendor/zxing-wasm@<version>/, so the web app serves it from its own origin instead of the
// library's CDN default (add-shared-ui-components design D10 / D11 — packages/ui/src/components/
// QrScanner/camera.ts builds the same path). The version in the folder name keeps a cached file of an
// older version from being used. public/vendor is generated and git-ignored. Run by the `dev` and
// `build` scripts.
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fromUi = createRequire(resolve(web, '../../packages/ui/package.json'));
const fromDetector = createRequire(fromUi.resolve('barcode-detector/ponyfill'));
const wasm = fromDetector.resolve('zxing-wasm/reader/zxing_reader.wasm');
const { version } = JSON.parse(readFileSync(resolve(dirname(wasm), '../../package.json'), 'utf8'));

const vendor = join(web, 'public/vendor');
const target = join(vendor, `zxing-wasm@${version}`);
rmSync(vendor, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
copyFileSync(wasm, join(target, basename(wasm)));
console.log(`copy-vendor: ${basename(wasm)} → apps/web/public/vendor/zxing-wasm@${version}`);
