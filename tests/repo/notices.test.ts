import { build, type Metafile } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../helpers/fixtures";

const NOTICE = "Third-party notices: THIRD_PARTY_NOTICES.md next to this file.";

interface NoticeRow {
  readonly name: string;
  readonly version: string;
  readonly files: readonly string[];
}

function noticeRows(text: string): NoticeRow[] {
  return text.split("\n").flatMap((line) => {
    if (!line.startsWith("| `")) return [];
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    return [{
      name: (cells[0] ?? "").replaceAll("`", ""),
      version: cells[1] ?? "",
      files: (cells[3] ?? "").split(",").map((file) => file.trim().replaceAll("`", "")),
    }];
  });
}

/** Name and version from the nearest package.json under node_modules. */
function packageOf(file: string): { name: string; version: string } | null {
  let dir = dirname(file);
  const marker = `${sep}node_modules${sep}`;
  while (dir.includes(marker) || dir.endsWith(`${sep}node_modules`)) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string; version?: string };
      if (pkg.name !== undefined && pkg.version !== undefined) return { name: pkg.name, version: pkg.version };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function bundled(meta: Metafile): Map<string, string> {
  const out = new Map<string, string>();
  for (const input of Object.keys(meta.inputs)) {
    if (!input.includes("node_modules/")) continue;
    const file = join(repoRoot, ...input.split("/"));
    const pkg = packageOf(file);
    if (pkg === null) throw new Error(`no package.json for ${input}`);
    const prev = out.get(pkg.name);
    if (prev !== undefined && prev !== pkg.version) throw new Error(`${pkg.name} is both ${prev} and ${pkg.version}`);
    out.set(pkg.name, pkg.version);
  }
  return out;
}

function expectPackages(actual: Map<string, string>, rows: readonly NoticeRow[], file: string): void {
  const expected = new Map(rows.filter((row) => row.files.includes(file)).map((row) => [row.name, row.version]));
  expect([...actual.keys()].sort(), file).toEqual([...expected.keys()].sort());
  for (const [name, version] of actual) expect(version, `${file} ${name}`).toBe(expected.get(name));
}

describe("third-party notices", () => {
  it("copies the notices and writes the header line in each built file", () => {
    const source = readFileSync(join(repoRoot, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(readFileSync(join(repoRoot, "dist", "THIRD_PARTY_NOTICES.md"), "utf8")).toBe(source);
    const cli = readFileSync(join(repoRoot, "dist", "isoblock.mjs"), "utf8").split("\n");
    expect(cli[0]).toBe("#!/usr/bin/env node");
    expect(cli[1]).toBe(`// ${NOTICE}`);
    const html = readFileSync(join(repoRoot, "dist", "editor.html"), "utf8").split("\n");
    expect(html[0]?.toLowerCase()).toBe("<!doctype html>");
    expect(html[1]).toBe(`<!-- ${NOTICE} -->`);
  });

  it("lists exactly the packages each bundle contains", async () => {
    const rows = noticeRows(readFileSync(join(repoRoot, "THIRD_PARTY_NOTICES.md"), "utf8"));
    const cli = await build({
      entryPoints: [join(repoRoot, "src/cli/main.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      loader: { ".wasm": "binary" },
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    const editor = await build({
      entryPoints: [join(repoRoot, "src/editor/main.ts")],
      bundle: true,
      platform: "browser",
      format: "iife",
      target: "es2022",
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    expectPackages(bundled(cli.metafile), rows, "isoblock.mjs");
    expectPackages(bundled(editor.metafile), rows, "editor.html");
  });
});
