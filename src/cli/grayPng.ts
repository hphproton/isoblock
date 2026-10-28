import { deflateSync } from "node:zlib";

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = (CRC[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  return out;
}

function ihdr(width: number, height: number, depth: 8 | 16): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = depth;
  return chunk("IHDR", data);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function png(width: number, height: number, depth: 8 | 16, raw: Uint8Array): Uint8Array {
  const compressed = deflateSync(raw);
  return concat([SIGNATURE, ihdr(width, height, depth), chunk("IDAT", compressed), chunk("IEND", new Uint8Array())]);
}

/** An 8-bit grayscale PNG. Samples are one byte per pixel, 0 to 255, row-major. Not interlaced. */
export function encodeGray8(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    const from = y * width;
    const to = y * (width + 1) + 1;
    raw.set(pixels.subarray(from, from + width), to);
  }
  return png(width, height, 8, raw);
}

/** A 16-bit grayscale PNG. Samples are big-endian, row-major. Not interlaced. */
export function encodeGray16(width: number, height: number, pixels: Uint16Array): Uint8Array {
  const raw = new Uint8Array(height * (width * 2 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 2 + 1) + 1;
    for (let x = 0; x < width; x++) {
      const value = pixels[y * width + x] as number;
      raw[row + x * 2] = (value >> 8) & 255;
      raw[row + x * 2 + 1] = value & 255;
    }
  }
  return png(width, height, 16, raw);
}
