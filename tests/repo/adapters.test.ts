import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../helpers/fixtures";

const godot = join(repoRoot, "adapters", "godot");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("Godot adapter (SPEC 13.8)", () => {
  const adapter = readFileSync(join(godot, "isoblock_runtime.gd"), "utf8");

  it("is 150 to 400 lines without its tests", () => {
    const lines = adapter.trimEnd().split("\n").length;
    expect(lines).toBeGreaterThanOrEqual(150);
    expect(lines).toBeLessThanOrEqual(400);
  });

  it("is not npm code and imports nothing from src/", () => {
    for (const file of files(godot).filter((f) => f.endsWith(".gd"))) {
      const text = readFileSync(file, "utf8");
      expect(/src\/|\.\.\/|res:\/\/\.\./.test(text), relative(repoRoot, file)).toBe(false);
    }
    expect(files(godot).some((f) => /package\.json$|\.(ts|mjs|js)$/.test(f))).toBe(false);
  });

  it("is written in plain ASCII", () => {
    for (const file of files(godot)) {
      expect(/[^\x00-\x7f]/.test(readFileSync(file, "utf8")), relative(repoRoot, file)).toBe(false);
    }
  });

  it("uses the Compatibility renderer and keeps the engine cache out of the repository", () => {
    const project = readFileSync(join(godot, "project.godot"), "utf8");
    expect(project).toMatch(/rendering_method="gl_compatibility"/);
    expect(readFileSync(join(godot, ".gitignore"), "utf8")).toMatch(/^\.godot\/$/m);
  });

  it("reports the error codes of SPEC 13.8, and no longer E_Z_RANGE", () => {
    for (const code of ["E_SCHEMA", "E_DUPLICATE_ID", "E_IO", "E_JSON_PARSE", "E_STATE", "E_ACTOR"]) expect(adapter).toContain(code);
    expect(adapter).not.toContain("E_Z_RANGE");
  });

  it("draws by the child order of one node, without z_index or y-sort (SPEC 13.8)", () => {
    expect(adapter).not.toMatch(/z_index\s*=|z_as_relative\s*=|y_sort_enabled\s*=/);
    for (const api of ["static func build(data: Dictionary, color_of: Callable = Callable(), scenes: Dictionary = {})", "static func apply_state(", "static func add_actor(", "static func move_actor(", "static func remove_actor(", "static func sort_key("]) {
      expect(adapter).toContain(api);
    }
  });

  it("reads the schema value of the runtime file the tool writes", () => {
    expect(adapter).toContain('SCHEMA := "isoblock-runtime/2"');
    expect(adapter).not.toContain("isoblock-runtime/1");
  });
});

describe("npm run test:godot", () => {
  it("is listed in package.json and is not part of npm test", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["test:godot"]).toBe("node scripts/test-godot.mjs");
    expect(pkg.scripts["test"]).toBe("vitest run");
  });

  it("stops with exit code 2 and says what to set when GODOT is not set", () => {
    const { GODOT: _unused, ...env } = process.env;
    const r = spawnSync(process.execPath, [join(repoRoot, "scripts", "test-godot.mjs")], { encoding: "utf8", env });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/GODOT must name the Godot 4\.7\.1 binary/);
  });

  it("stops with exit code 2 when GODOT is not Godot 4.7", () => {
    const r = spawnSync(process.execPath, [join(repoRoot, "scripts", "test-godot.mjs")], {
      encoding: "utf8",
      env: { ...process.env, GODOT: "/bin/echo" },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/GODOT must name Godot 4\.7/);
  });
});
