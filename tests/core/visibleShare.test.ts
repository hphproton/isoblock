import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import { compareVariants } from "../../src/core/compare/compare";
import { formatCompareText } from "../../src/core/compare/format";
import { searchesGrid } from "../../src/core/incremental";
import { parseScene } from "../../src/core/validate";
import { repoRoot } from "../helpers/fixtures";

const file = JSON.parse(readFileSync(join(repoRoot, "tests/fixtures/masks/cases.json"), "utf8")) as {
  readonly tolerance: { readonly share: number };
  readonly checks: readonly {
    readonly scene: string;
    readonly state: string | null;
    readonly checks: readonly Record<string, unknown>[];
  }[];
};

describe("visible_share (SPEC 9.6)", () => {
  it("waits for the end of a drag, with the grid checks", () => {
    expect(searchesGrid({ id: "v", check: "visible_share", tag: "seat", min: 0.5 })).toBe(true);
  });

  it("labels a compare row visible_share <id> (% shown) and prints the share as a whole percent", () => {
    const scene = parseScene(readFileSync(join(repoRoot, "tests/fixtures/masks/plaza.scene.json"), "utf8"));
    const comparison = compareVariants(scene, [{ name: "A", text: "# leave the plaza as it is\n" }]);
    const seats = comparison.checks.find((row) => row.id === "seats_shown");
    const shop = comparison.checks.find((row) => row.id === "shop_shown");
    expect(seats?.label).toBe("visible_share seats_shown (% shown)");
    expect(shop?.label).toBe("visible_share shop_shown (% shown)");
    const text = formatCompareText(comparison);
    expect(text).toContain("visible_share seats_shown (% shown)");
    expect(text).toMatch(/visible_share seats_shown \(% shown\)\s+0 \u2717\s+0 \u2717/);
    expect(shop?.values[0]).toBeCloseTo(0.913731, 5);
    expect(text).not.toContain("visible_share shop_shown");
    const closed = compareVariants(scene, [{ name: "A", text: "# leave the plaza as it is\n" }], "closed");
    expect(formatCompareText(closed)).toMatch(/visible_share shop_shown \(% shown\)\s+87 \u2717\s+87 \u2717/);
  });

  for (const c of file.checks) {
    const label = `${c.scene} state ${c.state ?? "default"}`;
    it(`${label}: matches the expected shares`, () => {
      const scene = parseScene(readFileSync(join(repoRoot, c.scene), "utf8"));
      const results = c.state === null ? runChecks(scene) : runChecksInState(scene, c.state);
      expect(results.map((r) => r.id)).toEqual(c.checks.map((r) => r.id));
      c.checks.forEach((exp, i) => {
        const act = results[i] as unknown as Record<string, unknown>;
        const tag = `${label} ${exp.id as string}`;
        expect(act.check, tag).toBe(exp.check);
        expect(act.status, tag).toBe(exp.status);
        expect(act.ids, tag).toEqual(exp.ids);
        expect(act.threshold, tag).toEqual(exp.threshold);
        if (exp.value === null) expect(act.value, tag).toBeNull();
        else expect(Math.abs((act.value as number) - (exp.value as number)), tag).toBeLessThanOrEqual(file.tolerance.share);
        if ("shares" in exp) {
          const shares = act.shares as number[];
          expect(shares, tag).toHaveLength((exp.shares as number[]).length);
          (exp.shares as number[]).forEach((share, n) => {
            expect(Math.abs((shares[n] as number) - share), `${tag} share ${n}`).toBeLessThanOrEqual(file.tolerance.share);
          });
        } else {
          expect(act.shares, tag).toBeUndefined();
        }
        if (exp.status === "skip") expect(act.message, tag).toMatch(/no listed object is drawn|hidden in state/);
      });
    });
  }
});
