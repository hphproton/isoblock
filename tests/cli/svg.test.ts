import { describe, expect, it } from "vitest";
import { buildDisplayList } from "../../src/core/displayList";
import { toSvg } from "../../src/cli/svg";
import { loadScene } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";

describe("svg output", () => {
  const scene = loadScene("yard");
  const svg = toSvg(buildDisplayList(scene));

  it("is a standalone SVG sized to the frame", () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('width="1000" height="1000" viewBox="0 0 1000 1000"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("writes one polygon per display polygon and one text per label", () => {
    const list = buildDisplayList(scene);
    const polygons = list.items.filter((i) => i.kind === "polygon").length;
    const labels = list.items.filter((i) => i.kind === "label").length;
    expect(svg.match(/<polygon /g)).toHaveLength(polygons);
    expect(svg.match(/<text /g)).toHaveLength(labels);
  });

  it("tags elements with layer and reference", () => {
    expect(svg).toContain('data-layer="object" data-ref="tree"');
    expect(svg).toContain('data-layer="lane" data-ref="haul"');
    expect(svg).toContain(">actor</text>");
  });

  it("clips the drawing to the frame", () => {
    expect(svg).toContain('<clipPath id="frame">');
    expect(svg).toContain('clip-path="url(#frame)"');
  });

  it("rounds coordinates to 2 decimals", () => {
    const numbers = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) => (m[1] as string).split(/[ ,]/));
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) expect(n).toMatch(/^-?\d+(\.\d{1,2})?$/);
  });

  it("is deterministic", () => {
    expect(toSvg(buildDisplayList(scene))).toBe(svg);
  });

  it("escapes markup in labels and ids", () => {
    const odd = makeScene({
      id: "a&b",
      types: { box: { size: [1, 1, 1] } },
      objects: [{ id: 'x<"y">&', type: "box", pos: [0, 0] }],
    });
    const out = toSvg(buildDisplayList(odd));
    expect(out).toContain("x&lt;&quot;y&quot;&gt;&amp;");
    expect(out).not.toContain('x<"y">');
  });
});
