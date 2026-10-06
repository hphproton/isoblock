import { IsoblockError } from "../../src/core/errors";
import type { Io } from "../../src/cli/run";
import { fixturePath, readFixtureText } from "./fixtures";

export interface Captured {
  readonly io: Io;
  readonly out: () => string;
  readonly err: () => string;
  readonly files: Map<string, string>;
}

/** In-memory I/O. Fixture paths read the real fixture; other paths use `files`. */
export function memoryIo(initial: Record<string, string> = {}): Captured {
  const files = new Map(Object.entries(initial));
  let out = "";
  let err = "";
  const io: Io = {
    readText(path) {
      const mem = files.get(path);
      if (mem !== undefined) return mem;
      const m = /([^/]+)\.scene\.json$/.exec(path);
      if (m && path === fixturePath(m[1] as string)) return readFixtureText(m[1] as string);
      throw new IsoblockError("E_IO", `cannot read ${path}: no such file`);
    },
    writeText(path, text) {
      files.set(path, text);
    },
    out(text) {
      out += text;
    },
    err(text) {
      err += text;
    },
  };
  return { io, out: () => out, err: () => err, files };
}
