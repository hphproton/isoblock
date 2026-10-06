import type { DisplayItem } from "./displayTypes";
import type { Vec2 } from "./types";

/** Even-odd ray casting. */
function contains(points: readonly Vec2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i] as Vec2;
    const [xj, yj] = points[j] as Vec2;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(x: number, y: number, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length2));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

function distanceToEdges(points: readonly Vec2[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    best = Math.min(best, distanceToSegment(x, y, points[j] as Vec2, points[i] as Vec2));
  }
  return best;
}

/**
 * The object under a display point. Items are in draw order, so the polygon drawn last wins.
 * When no polygon holds the point, the nearest object polygon within `slop` (display units) is
 * taken, which makes small objects easy to hit with a finger.
 */
export function pickObject(items: readonly DisplayItem[], x: number, y: number, slop: number): string | null {
  let nearest: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as DisplayItem;
    if (item.kind !== "polygon" || item.layer !== "object") continue;
    if (contains(item.points, x, y)) return item.ref;
    if (slop <= 0) continue;
    const d = distanceToEdges(item.points, x, y);
    if (d <= slop && d < nearestDistance) {
      nearest = item.ref;
      nearestDistance = d;
    }
  }
  return nearest;
}
