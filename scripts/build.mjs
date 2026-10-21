// Build script: bundles the CLI into dist/isoblock.mjs and the editor into one self-contained dist/editor.html.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });

const NOTICE = "Third-party notices: THIRD_PARTY_NOTICES.md next to this file.";

/** Line 2 of the CLI bundle, after the shebang (SPEC section 16). */
function withCliNotice(text) {
  const line = `// ${NOTICE}\n`;
  if (!text.startsWith("#!")) return line + text;
  const nl = text.indexOf("\n");
  return text.slice(0, nl + 1) + line + text.slice(nl + 1);
}

/** The line after the doctype of the editor page (SPEC section 16). */
function withHtmlNotice(text) {
  const match = /^<!doctype html>\r?\n/i.exec(text);
  if (match === null) throw new Error("editor html has no doctype");
  return `${text.slice(0, match[0].length)}<!-- ${NOTICE} -->\n${text.slice(match[0].length)}`;
}

await build({
  entryPoints: [join(root, "src/cli/main.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // The WebAssembly module of the PNG rasterizer is inlined, so the bundle needs no other file.
  loader: { ".wasm": "binary" },
  outfile: join(dist, "isoblock.mjs"),
  logLevel: "warning",
});

const cliPath = join(dist, "isoblock.mjs");
writeFileSync(cliPath, withCliNotice(readFileSync(cliPath, "utf8")));

const editor = await build({
  entryPoints: [join(root, "src/editor/main.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  write: false,
  logLevel: "warning",
});

/** Text that is safe inside an inline <script> or <style> element. */
const inline = (text) => text.replace(/<\/(script|style)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

const template = readFileSync(join(root, "src/editor/index.html"), "utf8");
const css = readFileSync(join(root, "src/editor/editor.css"), "utf8");
const script = editor.outputFiles[0].text;
const html = template.replace("/*__STYLE__*/", () => inline(css)).replace("/*__SCRIPT__*/", () => inline(script));
if (html.includes("__STYLE__") || html.includes("__SCRIPT__")) throw new Error("editor template placeholder was not replaced");
writeFileSync(join(dist, "editor.html"), withHtmlNotice(html));
copyFileSync(join(root, "THIRD_PARTY_NOTICES.md"), join(dist, "THIRD_PARTY_NOTICES.md"));
