import { boxDifference, countDifferences, frameIds, frameLimit, paintedIds, polygonBoxes, type Box } from "./measure";
import { objectPolygons } from "./svgObjects";

export interface CaseInput {
  /** The SVG written by `isoblock render` for the same scene. */
  readonly svg: string;
  /** Object ids in file order. */
  readonly ids: readonly string[];
  readonly width: number;
  readonly height: number;
  /** What the engine drew for each object alone, in file order. */
  readonly alone: readonly { readonly id: string; readonly box: Box | null }[];
  /** The whole engine frame, 4 bytes per pixel. */
  readonly rgba: Uint8Array;
}

export interface CaseMeasure {
  /** The largest edge difference over all objects, in pixels. */
  readonly worstBox: number;
  readonly worstObject: string | null;
  readonly frameDifferences: number;
  readonly frameLimit: number;
  readonly problems: readonly string[];
}

/** The measures of SPEC 13.6 for one case: each object alone, and the whole frame. */
export function measureCase(input: CaseInput): CaseMeasure {
  const { ids, width, height } = input;
  const polygons = objectPolygons(input.svg);
  const problems: string[] = [];
  if (input.alone.length !== ids.length || input.alone.some((a, i) => a.id !== ids[i])) {
    problems.push("the engine drew a different list of objects");
  }
  if (input.rgba.length !== width * height * 4) problems.push("the engine frame has a different size");
  if (problems.length > 0) return { worstBox: Infinity, worstObject: null, frameDifferences: Infinity, frameLimit: frameLimit(width, height), problems };

  const boxes = polygonBoxes(polygons, ids, width, height);
  let worstBox = 0;
  let worstObject: string | null = null;
  input.alone.forEach((a, i) => {
    const d = boxDifference(a.box, boxes[i] as Box | null);
    if (worstObject === null || d > worstBox) {
      worstBox = d;
      worstObject = a.id;
    }
    if (d > 1) problems.push(`object ${a.id} alone: pixel box ${JSON.stringify(a.box)}, polygon box ${JSON.stringify(boxes[i])}`);
  });
  const frameDifferences = countDifferences(frameIds(input.rgba), paintedIds(polygons, ids, width, height));
  const limit = frameLimit(width, height);
  if (frameDifferences > limit) problems.push(`${frameDifferences} pixels differ in the whole frame (limit ${limit})`);
  return { worstBox, worstObject, frameDifferences, frameLimit: limit, problems };
}
