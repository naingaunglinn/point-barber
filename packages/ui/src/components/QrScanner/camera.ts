// The camera side of QrScanner (AD-ATT-01 · design D10 / D11): the error kinds of design D10, and a QR
// detector — the browser's own BarcodeDetector where it reads QR codes, otherwise the `barcode-detector`
// ponyfill (ZXing in WebAssembly). The WebAssembly file is served by the web app from its own origin
// (apps/web/scripts/copy-vendor.mjs), never from a CDN.

export type QrErrorKind = 'permission_denied' | 'no_camera' | 'unreadable';

/**
 * `NotAllowedError` → permission denied; `NotFoundError` / `OverconstrainedError` (a desktop or a CI
 * browser without a camera) → no camera (design D10); anything else → unreadable.
 */
export function cameraErrorKind(error: unknown): QrErrorKind {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError') return 'permission_denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no_camera';
  return 'unreadable';
}

export interface QrDetector {
  detect(source: HTMLVideoElement): Promise<readonly { readonly rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): QrDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** Where the web app serves the ZXing WebAssembly file of a given version. */
export const zxingPath = (version: string) => `/vendor/zxing-wasm@${version}`;

export async function createQrDetector(): Promise<QrDetector> {
  const native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (native !== undefined && (await native.getSupportedFormats()).includes('qr_code')) {
    return new native({ formats: ['qr_code'] });
  }
  const { BarcodeDetector, setZXingModuleOverrides, ZXING_WASM_VERSION } =
    await import('barcode-detector/ponyfill');
  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? `${zxingPath(ZXING_WASM_VERSION)}/${path}` : prefix + path,
  });
  return new BarcodeDetector({ formats: ['qr_code'] });
}
