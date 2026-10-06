import type { Relation, Scene } from "../types";
import { bandDistanceMeasure, clearOfMeasure } from "./distance";
import { insideMeasure } from "./inside";
import { onLaneMeasure } from "./onLane";
import { alignedMeasure, axisOf, orderAlongMeasure } from "./order";
import { separationMeasure, type SeparationRel } from "./separation";
import type { Band, Measure } from "./shared";
import { resolveTarget, targetLabel, wrongTarget, type Target } from "./targets";

/** A relation ready to be measured on any set of footprints (SPEC section 7). */
export interface PreparedRelation {
  readonly relation: Relation;
  readonly hard: boolean;
  readonly weight: number;
  /** Indexes of the objects involved, ascending (object order). */
  readonly objects: readonly number[];
  /** How the relation is measured; `null` when it is skipped. */
  readonly measure: Measure | null;
  /** Why the relation is skipped; `null` when it is measured. */
  readonly reason: string | null;
}

const UNBOUNDED: Band = [0, Infinity];

type Built = Measure | string;

function objectPair(a: Target, b: Target, build: (a: number, b: number) => Built): Built {
  if (a.kind !== "object") return wrongTarget("a", ["object"], a);
  if (b.kind !== "object") return wrongTarget("b", ["object"], b);
  return build(a.index, b.index);
}

function fromObject(a: Target, build: (a: number) => Built): Built {
  return a.kind === "object" ? build(a.index) : wrongTarget("a", ["object"], a);
}

function orderAlong(scene: Scene, r: Relation): Built {
  const targets = (r.ids ?? []).map((name) => resolveTarget(scene, name));
  const other = targets.find((t) => t.kind !== "object");
  if (other) return `order_along orders objects only, not ${targetLabel(other)}`;
  if (targets.length < 2) return "order_along needs 2 or more objects";
  const axis = axisOf(r.axis, "u");
  if (axis === null) return `axis must be u or v, not "${r.axis}"`;
  return orderAlongMeasure(targets.map((t) => (t as Extract<Target, { kind: "object" }>).index), axis);
}

function build(scene: Scene, r: Relation, a: Target, b: Target): Built {
  switch (r.rel) {
    case "left_of":
    case "right_of":
    case "in_front_of":
    case "behind":
      return objectPair(a, b, (i, j) => separationMeasure(scene, r.rel as SeparationRel, i, j, r.gap ?? UNBOUNDED));
    case "gap":
      return fromObject(a, (i) => bandDistanceMeasure(i, b, r.gap ?? UNBOUNDED, ["object"]));
    case "against":
      return fromObject(a, (i) => bandDistanceMeasure(i, b, r.gap ?? [0, 0], ["object", "lane", "strip"]));
    case "inside":
      return fromObject(a, (i) => (b.kind === "zone" ? insideMeasure(i, b.zone) : wrongTarget("b", ["zone"], b)));
    case "aligned": {
      const axis = axisOf(r.axis, null);
      if (axis === null) return `aligned needs axis u or v${r.axis === undefined ? "" : `, not "${r.axis}"`}`;
      return objectPair(a, b, (i, j) => alignedMeasure(i, j, axis));
    }
    case "on_lane":
      return fromObject(a, (i) => (b.kind === "lane" ? onLaneMeasure(i, b.lane, r.t ?? [0, 1]) : wrongTarget("b", ["lane"], b)));
    case "clear_of":
      return fromObject(a, (i) => clearOfMeasure(i, b, r.min ?? 0));
    case "order_along":
      return orderAlong(scene, r);
    case "facing":
      return "facing is not measured yet";
    default:
      return `relation "${r.rel}" is not supported`;
  }
}

/** Indexes of the objects a relation names in `a`, `b` and `ids`, ascending. */
function involved(scene: Scene, r: Relation): number[] {
  const names = new Set([r.a, r.b, ...(r.ids ?? [])]);
  return scene.objects.flatMap((o, i) => (names.has(o.id) ? [i] : []));
}

export function prepareRelation(scene: Scene, r: Relation): PreparedRelation {
  const built = build(scene, r, resolveTarget(scene, r.a), resolveTarget(scene, r.b));
  return {
    relation: r,
    hard: r.hard ?? false,
    weight: r.weight ?? 1,
    objects: involved(scene, r),
    measure: typeof built === "string" ? null : built,
    reason: typeof built === "string" ? built : null,
  };
}

/** Every relation of the scene, in file order. */
export function prepareRelations(scene: Scene): readonly PreparedRelation[] {
  return (scene.relations ?? []).map((r) => prepareRelation(scene, r));
}
