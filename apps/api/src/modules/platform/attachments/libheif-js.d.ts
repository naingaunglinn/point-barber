// Minimal types of the part of `libheif-js` (WASM bundle) that the image pipeline uses.
declare module 'libheif-js/wasm-bundle' {
  export interface HeifImage {
    /** Size after the transformations of the file (irot / imir / clap are applied by libheif). */
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
    ): void;
  }
  export class HeifDecoder {
    decode(buffer: Buffer | Uint8Array): HeifImage[];
  }
}
