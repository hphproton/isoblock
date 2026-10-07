// The resvg WebAssembly module as bytes. The bundler inlines it (loader "binary" in scripts/build.mjs),
// so that dist/isoblock.mjs needs no other file.
import wasm from "@resvg/resvg-wasm/index_bg.wasm";

export default wasm;
