import { Resvg, initWasm } from "@resvg/resvg-wasm";
import type { Rasterize } from "./io";

/**
 * Load the resvg WebAssembly module and return a rasterizer for SVG documents (SPEC section 14).
 * No fonts are loaded, so text is never drawn and the image does not depend on the machine.
 * The module can be initialised once per process.
 */
export async function createRasterizer(wasm: Uint8Array | WebAssembly.Module): Promise<Rasterize> {
  await initWasm(wasm);
  return (svg) => {
    const resvg = new Resvg(svg, { font: { loadSystemFonts: false, fontFiles: [], fontDirs: [] } });
    const image = resvg.render();
    try {
      return image.asPng();
    } finally {
      image.free();
      resvg.free();
    }
  };
}
