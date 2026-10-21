import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../helpers/fixtures";

/** The version a reader sees on the README status line, or undefined when that line states none. */
function statusVersion(readme: string): string | undefined {
  const line = readme.split("\n").find((row) => row.includes("Status:"));
  if (line === undefined) return undefined;
  return /version (\d+\.\d+\.\d+)\b/.exec(line)?.[1];
}

/** `version` from package.json. The file is the release's copy of the shipped version. */
function packageVersion(text: string): string {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null || !("version" in data) || typeof data.version !== "string") {
    throw new Error("package.json has no version string");
  }
  return data.version;
}

describe("README status line", () => {
  it("states the same version as package.json", () => {
    const version = packageVersion(readFileSync(join(repoRoot, "package.json"), "utf8"));
    const stated = statusVersion(readFileSync(join(repoRoot, "README.md"), "utf8"));
    expect(stated).toBe(version);
  });
});
