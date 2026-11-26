// Minimal types of the part of `libheif-js` (WASM bundle) that the image pipeline uses.
declare module 'libheif-js/wasm-bundle.js' {
  export interface HeifImage {
    /** Size after the transformations of the file (irot / imir / clap are applied by libheif). */
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    /** Releases the image handle inside the WebAssembly memory. */
    free(): void;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
    ): void;
  }
  const libheif: {
    readonly HeifDecoder: new () => { decode(buffer: Uint8Array): HeifImage[] };
  };
  export default libheif;
}
