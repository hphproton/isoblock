import { join } from "node:path";
import { maskBundle } from "../core/raster/masks";
import { serializeJson } from "../core/serialize";
import { parseScene } from "../core/validate";
import type { Parsed } from "./args";
import { encodeGray16, encodeGray8 } from "./grayPng";
import type { Io } from "./io";

type MaskArgs = Extract<Parsed, { kind: "export"; target: "masks" }>;

/** `export --target masks`: write the label image, the mask PNGs and masks.json into a folder. */
export function runMasksCommand(args: MaskArgs, io: Io): number {
  const scene = parseScene(io.readText(args.file));
  const bundle = maskBundle(scene, args.state ?? null, args.grow);
  const dir = args.output;
  io.mkdir(dir);
  io.writeBytes(join(dir, "labels.png"), encodeGray16(bundle.width, bundle.height, bundle.labels));
  for (const image of bundle.images) {
    const parts = image.name.split("/");
    let at = dir;
    for (const part of parts.slice(0, -1)) {
      at = join(at, part);
      io.mkdir(at);
    }
    io.writeBytes(join(dir, ...parts), encodeGray8(image.width, image.height, image.pixels));
  }
  io.writeText(join(dir, "masks.json"), serializeJson(bundle.json));
  io.out(`wrote ${dir}\n`);
  return 0;
}
