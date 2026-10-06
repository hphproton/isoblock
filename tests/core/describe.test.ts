import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { describeScene, fmt } from "../../src/core/describe";
import { loadScene } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";

const DOT = "\u00b7";
const TIMES = "\u00d7";
const APPROX = "\u2248";

/** SPEC Appendix B, written with escapes so that this file stays ASCII. */
const APPENDIX_B = [
  `scene yard v1 draft ${DOT} unit u ${DOT} camera iso30 ${DOT} 80 px/u ${DOT} frame 1000x1000 (view y 150-1000)`,
  "id      type   pos(u,v)    size(w,d,h)       rot  locks",
  "tree    tree   3.00,0.20   1.20,1.20,2.40*   0    pos",
  "actor   actor  2.30,0.97   0.40,0.40,1.20    0    -",
  "crate1  crate  6.00,0.50   0.60,0.60,0.60    0    -",
  "crate2  crate  6.80,0.50   0.60,0.60,0.60    0    -",
  "bench   bench  3.40,2.60   1.20,0.40,0.50    0    -",
  `FAIL c4 clearance crate1${TIMES}crate2: gap 0.20 < 0.50`,
  `FAIL c7 lane_reaches haul: meets right edge at y${APPROX}1104 (view y 150-1000)`,
  "FAIL c8 visible actor: 40% occluded (tree)",
  "assumptions: tree.size.h=2.40",
  "(* = provisional value)",
].join("\n");

function describeFixture(name: string): string {
  const scene = loadScene(name);
  return describeScene(scene, runChecks(scene));
}

describe("describe: Appendix B", () => {
  it("reproduces the yard output exactly", () => {
    expect(describeFixture("yard")).toBe(APPENDIX_B);
  });
});

describe("describe: check lines", () => {
  it("uses the template of every implemented check", () => {
    const lines = describeFixture("overlap").split("\n");
    expect(lines).toContain("FAIL c1 no_overlap a" + TIMES + "b: 1 overlapping pairs");
    expect(lines).toContain("FAIL c3 clearance a" + TIMES + "c: gap 2.00 < 2.50");
    expect(lines).toContain("FAIL c5 in_region d: outside view");

    const laneLines = describeFixture("lane").split("\n");
    expect(laneLines).toContain("FAIL c1 lane_clear L1: blocked by d");
    expect(laneLines).toContain(`FAIL c4 lane_reaches L2: meets right edge at y${APPROX}1366 (view y 150-1000)`);
    expect(laneLines).toContain("FAIL c5 lane_reaches L3: does not reach right edge");
    expect(laneLines.filter((l) => l.startsWith("SKIP"))).toEqual([
      expect.stringMatching(/^SKIP c6 lane_clear: /),
      expect.stringMatching(/^SKIP c7 reachable: /),
    ]);

    const visibleLines = describeFixture("visible").split("\n");
    expect(visibleLines).toContain("FAIL c1 visible h1: 100% occluded (w)");
    expect(visibleLines).toContain("FAIL c3 visible h3: 76% occluded (k)");
  });

  it("appends the strip to the region of in_region lines", () => {
    const scene = makeScene({
      strips: [{ id: "floor", v: [0, 1] }],
      objects: [{ id: "a", type: "box", pos: [0, 5] }],
      checks: [{ id: "c", check: "in_region", region: "view", strip: "floor" }],
    });
    expect(describeScene(scene, runChecks(scene))).toContain("FAIL c in_region a: outside view/floor");
  });

  it("joins several ids and pairs with a comma and a space", () => {
    const scene = makeScene({
      objects: [
        { id: "a", type: "box", pos: [0, 0] },
        { id: "b", type: "box", pos: [0.5, 0] },
        { id: "c", type: "box", pos: [0.7, 0] },
      ],
      checks: [{ id: "c1", check: "no_overlap" }],
    });
    const text = describeScene(scene, runChecks(scene));
    expect(text).toContain(`FAIL c1 no_overlap a${TIMES}b, a${TIMES}c, b${TIMES}c: 3 overlapping pairs`);
  });

  it("prints checks: all N pass when nothing fails", () => {
    const scene = makeScene({
      objects: [{ id: "a", type: "box", pos: [0, 5] }],
      checks: [{ id: "c1", check: "no_overlap" }, { id: "c2", check: "in_region", region: "view", ids: ["a"] }],
    });
    expect(describeScene(scene, runChecks(scene))).toContain("\nchecks: all 2 pass\n");
  });

  it("prints checks: none when the scene declares no checks", () => {
    const scene = makeScene();
    expect(describeScene(scene, [])).toContain("\nchecks: none\n");
  });
});

describe("describe: header, table and assumptions", () => {
  it("labels cameras", () => {
    const label = (angleU: number, angleV: number) =>
      describeScene(makeScene({ camera: { angleU, angleV, pxPerUnit: 64, origin: [0, 0] } }), []).split("\n")[0];
    expect(label(30, 150)).toContain("camera iso30");
    expect(label(26.565051, 153.434949)).toContain("camera dimetric21");
    expect(label(45, 135)).toContain("camera u45/v135");
    expect(label(20.5, 160)).toContain("camera u20.5/v160");
  });

  it("names the first region without blocksScene in the frame label", () => {
    const first = describeScene(makeScene(), []).split("\n")[0];
    expect(first).toContain("frame 1000x1000 (view y 150-1000)");
    const none = describeScene(
      makeScene({ frame: { w: 640, h: 480, regions: [{ id: "all", rect: [0, 0, 640, 480], blocksScene: true }] } }),
      [],
    ).split("\n")[0];
    expect(none).toMatch(/frame 640x480$/);
  });

  it("omits version and status when meta is absent", () => {
    const { meta: _meta, ...scene } = loadScene("yard");
    expect(describeScene(scene, []).split("\n")[0]).toMatch(/^scene yard \u00b7 unit u/);
  });

  it("prints a dash for no assumptions, and no legend", () => {
    const text = describeScene(makeScene(), []);
    expect(text).toContain("\nassumptions: -");
    expect(text).not.toContain("provisional");
  });

  it("shortens assumption paths and joins entries", () => {
    const scene = makeScene({
      types: { tree: { size: [1, 2, 3], parts: [{ id: "trunk", box: [0, 0, 0, 1, 1, 1] }, { id: "canopy", box: [0, 0, 1, 1, 2.5, 3] }] } },
      objects: [{ id: "t", type: "tree", pos: [1, 2] }],
      assumptions: [
        { path: "/types/tree/size/1", value: 2 },
        { path: "/types/tree/parts/1/box/4", value: 2.5 },
        { path: "/objects/0/pos/0", value: 1 },
        { path: "/types/tree/size/0", value: 1 },
      ],
    });
    const text = describeScene(scene, []);
    expect(text).toContain(
      `assumptions: tree.size.d=2.00 ${DOT} tree.canopy.v1=2.50 ${DOT} /objects/0/pos/0=1.00 ${DOT} tree.size.w=1.00`,
    );
    expect(text).toContain("t   tree  1.00*,2.00   1.00*,2.00*,3.00   0    -");
    expect(text).toContain("(* = provisional value)");
  });

  it("joins several locks with commas", () => {
    const scene = makeScene({ objects: [{ id: "a", type: "box", pos: [0, 0], locks: ["pos", "rot"] }] });
    expect(describeScene(scene, []).split("\n")[2]).toMatch(/ pos,rot$/);
  });
});

describe("describe: number format", () => {
  it("prints 2 decimals, up to 4 when 2 would lose information", () => {
    expect(fmt(2.4)).toBe("2.40");
    expect(fmt(0.19999999999999929)).toBe("0.20");
    expect(fmt(0.125)).toBe("0.125");
    expect(fmt(0.12345)).toBe("0.1235");
    expect(fmt(1.23456789)).toBe("1.2346");
    expect(fmt(-0.0001)).toBe("-0.0001");
    expect(fmt(-0)).toBe("0.00");
    expect(fmt(12)).toBe("12.00");
  });
});
