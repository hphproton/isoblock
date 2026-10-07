import { IsoblockError } from "../../src/core/errors";
import type { Io } from "../../src/cli/run";
import { existsSync, readFileSync } from "node:fs";
import { fixturesDir } from "./fixtures";

export interface Captured {
  readonly io: Io;
  readonly out: () => string;
  readonly err: () => string;
  readonly files: Map<string, string>;
  /** Binary files written by the command. */
  readonly bytes: Map<string, Uint8Array>;
}

/** In-memory I/O. Fixture paths read the real fixture; other paths use `files`. */
export function memoryIo(initial: Record<string, string> = {}, rasterize?: Io["rasterize"]): Captured {
  const files = new Map(Object.entries(initial));
  const bytes = new Map<string, Uint8Array>();
  let out = "";
  let err = "";
  const io: Io = {
    readText(path) {
      const mem = files.get(path);
      if (mem !== undefined) return mem;
      // Scene files under tests/fixtures/ are read from the repository.
      if (path.startsWith(fixturesDir) && path.endsWith(".scene.json") && existsSync(path)) return readFileSync(path, "utf8");
      throw new IsoblockError("E_IO", `cannot read ${path}: no such file`);
    },
    writeText(path, text) {
      files.set(path, text);
    },
    writeBytes(path, data) {
      bytes.set(path, data);
    },
    ...(rasterize === undefined ? {} : { rasterize }),
    appendText(path, text) {
      files.set(path, (files.get(path) ?? "") + text);
    },
    exists(path) {
      return files.has(path);
    },
    out(text) {
      out += text;
    },
    err(text) {
      err += text;
    },
  };
  return { io, out: () => out, err: () => err, files, bytes };
}
