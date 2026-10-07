/** Turns an SVG document into the bytes of a PNG image (SPEC section 14). */
export type Rasterize = (svg: string) => Uint8Array;

/** File and terminal access. The only thing the CLI needs from the outside world. */
export interface Io {
  readText(path: string): string;
  writeText(path: string, text: string): void;
  /** Write a binary file, such as a PNG image. */
  writeBytes(path: string, bytes: Uint8Array): void;
  /** Add text to the end of a file; the file is created when it does not exist. */
  appendText(path: string, text: string): void;
  exists(path: string): boolean;
  out(text: string): void;
  err(text: string): void;
  /**
   * PNG rasterizer. The host provides it before `run` is called, because loading the WebAssembly
   * module is asynchronous; without it `render` cannot write a PNG.
   */
  readonly rasterize?: Rasterize;
}
