/** File and terminal access. The only thing the CLI needs from the outside world. */
export interface Io {
  readText(path: string): string;
  writeText(path: string, text: string): void;
  /** Add text to the end of a file; the file is created when it does not exist. */
  appendText(path: string, text: string): void;
  exists(path: string): boolean;
  out(text: string): void;
  err(text: string): void;
}
