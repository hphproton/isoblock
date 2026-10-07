import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { runChecksInState } from "../../src/core/checks/inState";
import { compareVariants } from "../../src/core/compare/compare";
import { compareJson, formatCompareMarkdown, formatCompareText } from "../../src/core/compare/format";
import { expectSameJson } from "../helpers/exportCases";
import { expectMatchesCompare, expectMatchesExpected, type CompareExpected } from "../helpers/fixtures";
import { memoryIo } from "../helpers/cli";
import { decodePng, maxChannelDifference, testRasterizer } from "../helpers/png";
import {
  caseScenePath,
  loadCaseScene,
  loadStateCases,
  loadStateExpected,
  readStateJson,
  readStateText,
  stateFilePath,
} from "../helpers/states";

const { cases, compare } = loadStateCases();
const PX_TOLERANCE = 0.02;
const PNG_CHANNEL = 1;

describe("state fixtures: check results per state", () => {
  for (const c of cases) {
    const expected = loadStateExpected(c);

    it(`${c.scene} in state ${c.state}: the core gives ${c.checks}`, () => {
      expect(expected.state).toBe(c.state);
      expectMatchesExpected(runChecksInState(loadCaseScene(c), c.state), expected);
    });

    it(`${c.scene} in state ${c.state}: check --json --state gives ${c.checks}`, () => {
      const cap = memoryIo();
      const code = run(["check", caseScenePath(c), "--json", "--state", c.state], cap.io);
      const report = JSON.parse(cap.out());
      expect(code).toBe(expected.results.some((r) => r.status === "fail" || r.status === "skip") ? 1 : 0);
      expect(report.scene).toBe(expected.scene);
      expectMatchesExpected(report.results, expected);
    });
  }
});

describe("state fixtures: generation boxes", () => {
  for (const c of cases.filter((x) => x.genBbox !== null)) {
    const file = c.genBbox as string;

    it(`${c.scene} in state ${c.state}: export --target gen-bbox --state gives ${file} (keys in order, px within ${PX_TOLERANCE})`, () => {
      const cap = memoryIo();
      const code = run(["export", caseScenePath(c), "--target", "gen-bbox", "--state", c.state], cap.io);
      expect(code).toBe(0);
      expectSameJson(JSON.parse(cap.out()), readStateJson(file), PX_TOLERANCE, file);
    });

    it(`${c.scene} in state ${c.state}: gives no box to a hidden object, and two runs give identical bytes`, () => {
      const scene = loadCaseScene(c);
      const hidden = new Set(scene.states?.[c.state]?.hide ?? []);
      expect(hidden.size).toBeGreaterThan(0);
      const args = ["export", caseScenePath(c), "--target", "gen-bbox", "--state", c.state];
      const a = memoryIo();
      const b = memoryIo();
      run(args, a.io);
      run(args, b.io);
      const ids = (JSON.parse(a.out()).boxes as { id: string }[]).map((box) => box.id);
      expect(ids.filter((id) => hidden.has(id))).toEqual([]);
      expect(ids.length).toBeGreaterThan(0);
      expect(a.out()).toBe(b.out());
    });
  }
});

describe("state fixtures: block image", () => {
  for (const c of cases.filter((x) => x.png !== null)) {
    it(`${c.scene} in state ${c.state}: render --state -o out.png gives ${c.png} (every channel within ${PNG_CHANNEL})`, async () => {
      const cap = memoryIo({}, await testRasterizer());
      expect(run(["render", caseScenePath(c), "--state", c.state, "-o", "out.png"], cap.io)).toBe(0);
      const actual = decodePng(cap.bytes.get("out.png") as Uint8Array);
      const expected = decodePng(readFileSync(stateFilePath(c.png as string)));
      expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
      expect(maxChannelDifference(actual, expected)).toBeLessThanOrEqual(PNG_CHANNEL);
    });
  }
});

describe("state fixtures: compare", () => {
  for (const c of compare) {
    const files: Record<string, string> = Object.fromEntries(c.variants.map((v) => [v.file, readStateText(v.file)]));
    const variantArgs = c.variants.flatMap((v) => ["--variant", `${v.name}=${v.file}`]);
    const label = `${c.scene} in state ${c.state} with ${c.variants.map((v) => v.name).join(", ")}`;

    function compareCli(format: string): string {
      const cap = memoryIo(files);
      expect(run(["compare", caseScenePath(c), ...variantArgs, "--state", c.state, "--format", format], cap.io)).toBe(0);
      return cap.out();
    }

    it(`${label}: the json equals ${c.expected.json} within its tolerance`, () => {
      const expected = readStateJson<CompareExpected>(c.expected.json);
      expect(expected.state).toBe(c.state);
      expectMatchesCompare(JSON.parse(compareCli("json")), expected);
    });

    it(`${label}: the text equals ${c.expected.text} byte for byte`, () => {
      expect(compareCli("text")).toBe(readStateText(c.expected.text));
    });

    it(`${label}: the Markdown equals ${c.expected.md} byte for byte`, () => {
      expect(compareCli("md")).toBe(readStateText(c.expected.md));
    });

    it(`${label}: the core gives the same text, Markdown and JSON`, () => {
      const comparison = compareVariants(loadCaseScene(c), c.variants.map((v) => ({ name: v.name, text: files[v.file] as string })), c.state);
      expect(`${formatCompareText(comparison)}\n`).toBe(readStateText(c.expected.text));
      expect(`${formatCompareMarkdown(comparison)}\n`).toBe(readStateText(c.expected.md));
      expectMatchesCompare(JSON.parse(JSON.stringify(compareJson(comparison))), readStateJson<CompareExpected>(c.expected.json));
    });
  }
});
