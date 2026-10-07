import { rectCorners, type Rect } from "../geometry";
import { fmt } from "../format";
import { distanceToPolygon } from "../polygon";
import type { Zone } from "../types";
import { SATISFIED, type Measure, type Rects } from "./shared";

/** `inside`: the largest distance from a footprint corner to the zone. Needs 3 or more points. */
export function insideMeasure(a: number, zone: Zone): Measure | string {
  const points = zone.points ?? [];
  if (points.length < 3) return `zone "${zone.id}" has ${points.length} points; inside needs 3 or more`;
  const largest = (rects: Rects) =>
    Math.max(...rectCorners(rects[a] as Rect).map(([u, v]) => distanceToPolygon(points, u, v)));
  return {
    violation: largest,
    message: (rects) => {
      const d = largest(rects);
      return d > SATISFIED ? `a corner is ${fmt(d)} outside zone ${zone.id}` : `all corners inside zone ${zone.id}`;
    },
  };
}
