import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { IsoblockError } from "../core/errors";
import type { Io } from "./io";

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** `Io` backed by the file system and the process streams. */
export const nodeIo: Io = {
  readText(path) {
    try {
      return readFileSync(path, "utf8");
    } catch (e) {
      throw new IsoblockError("E_IO", `cannot read ${path}: ${reason(e)}`);
    }
  },
  writeText(path, text) {
    try {
      writeFileSync(path, text);
    } catch (e) {
      throw new IsoblockError("E_IO", `cannot write ${path}: ${reason(e)}`);
    }
  },
  writeBytes(path, bytes) {
    try {
      writeFileSync(path, bytes);
    } catch (e) {
      throw new IsoblockError("E_IO", `cannot write ${path}: ${reason(e)}`);
    }
  },
  appendText(path, text) {
    try {
      appendFileSync(path, text);
    } catch (e) {
      throw new IsoblockError("E_IO", `cannot write ${path}: ${reason(e)}`);
    }
  },
  exists(path) {
    return existsSync(path);
  },
  out(text) {
    process.stdout.write(text);
  },
  err(text) {
    process.stderr.write(text);
  },
};
