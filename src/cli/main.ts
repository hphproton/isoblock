#!/usr/bin/env node
import { nodeIo } from "./nodeIo";
import { run } from "./run";
import type { Io } from "./io";

/**
 * The WebAssembly module of the PNG rasterizer loads asynchronously, so it is set up here, and
 * only for a command that writes a PNG. `run` itself stays synchronous.
 */
async function ioFor(argv: readonly string[]): Promise<Io> {
  const wantsPng = argv[0] === "render" && argv.some((a) => /\.png$/i.test(a));
  if (!wantsPng) return nodeIo;
  const { createRasterizer } = await import("./png");
  const { default: wasm } = await import("./wasmBytes");
  return { ...nodeIo, rasterize: await createRasterizer(wasm) };
}

const argv = process.argv.slice(2);
process.exitCode = run(argv, await ioFor(argv));
