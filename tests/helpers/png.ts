import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import type { Rasterize } from "../../src/cli/io";
import { createRasterizer } from "../../src/cli/png";

export interface Image {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, rows from the top. */
  readonly data: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode an 8-bit, non-interlaced PNG of color type 2 (RGB) or 6 (RGBA) to RGBA pixels. */
export function decodePng(bytes: Uint8Array): Image {
  const buf = Buffer.from(bytes);
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at < buf.length; ) {
    const length = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8).toString("latin1");
    const body = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9] as number;
      if (body[8] !== 8 || body[12] !== 0) throw new Error("only 8-bit, non-interlaced PNGs are supported");
    } else if (type === "IDAT") {
      idat.push(body);
    }
    at += 12 + length;
  }
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported PNG color type ${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x] as number;
      const left = x >= bpp ? (rows[y * stride + x - bpp] as number) : 0;
      const up = y > 0 ? (rows[(y - 1) * stride + x] as number) : 0;
      const upLeft = y > 0 && x >= bpp ? (rows[(y - 1) * stride + x - bpp] as number) : 0;
      const add = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
      rows[y * stride + x] = (cur + add) & 255;
    }
  }
  if (bpp === 4) return { width, height, data: rows };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(rows.subarray(i * 3, i * 3 + 3), i * 4);
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** The largest difference of any channel of any pixel; Infinity when the sizes differ. */
export function maxChannelDifference(a: Image, b: Image): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) worst = Math.max(worst, Math.abs((a.data[i] as number) - (b.data[i] as number)));
  return worst;
}

let rasterizer: Promise<Rasterize> | undefined;

/** The resvg rasterizer of the CLI, with the module from `node_modules`; set up once per test file. */
export function testRasterizer(): Promise<Rasterize> {
  rasterizer ??= createRasterizer(readFileSync(createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm")));
  return rasterizer;
}
