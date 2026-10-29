import { boxInfo, pairOrder } from "./drawOrder";
import { IsoblockError } from "./errors";
import { EPS, boxesOverlap, sizeBox, worldParts, type Box } from "./geometry";
import { orderDirection, projector } from "./projection";
import { round } from "./round";
import { insidePiece, lanePieces, surfaceHeight } from "./checks/lanePieces";
import { laneLevel } from "./checks/laneShape";
import { insidePolygon } from "./polygon";
import { sceneInState } from "./states";
import { boxOutline, convexOverlapArea } from "./sort/outline";
import type { Scene } from "./types";

const MAX_POINTS = 1_000_000;
const DEFAULT_STEP = 0.25;

export interface OccluderRow {
  readonly id: string;
  readonly positions: number;
  readonly area: number;
}

export interface OccludersReport {
  readonly scene: string;
  readonly state: string | null;
  readonly area: { readonly kind: "lane" | "zone"; readonly id: string; readonly level: number | null };
  readonly actor: readonly [number, number, number];
  readonly step: number;
  readonly positions: number;
  readonly occluders: readonly OccluderRow[];
}

/** The report plus the used positions, for the editor plan marks. The JSON stays the report alone. */
export interface OccludersStudy {
  readonly report: OccludersReport;
  readonly points: readonly (readonly [number, number])[];
}

interface Area {
  readonly kind: "lane" | "zone";
  readonly id: string;
  /** The flat lane's or the zone's level. `null` for a lane that is not flat (SPEC 11.4). */
  readonly level: number | null;
  readonly heightAt: (u: number, v: number) => number;
  readonly holds: (u: number, v: number) => boolean;
  readonly bounds: readonly [number, number, number, number];
}

/**
 * Objects that hide part of an actor somewhere in a lane or a zone, by the painter's order
 * (SPEC 11.4). An unknown area, a lane without a piece, a zone of fewer than 3 points, an actor
 * that is not three numbers above 0, and a grid of more than 1,000,000 points are usage errors.
 */
export function occludersReport(
  scene: Scene,
  state: string | null,
  actor: readonly [number, number, number],
  step: number,
  lane: string | undefined,
  zone: string | undefined,
): OccludersReport {
  return occludersStudy(scene, state, actor, step, lane, zone).report;
}

/** Same measurement as `occludersReport`, also listing each used position (SPEC 11.4, editor overlay). */
export function occludersStudy(
  scene: Scene,
  state: string | null,
  actor: readonly [number, number, number],
  step: number,
  lane: string | undefined,
  zone: string | undefined,
): OccludersStudy {
  if (actor.length !== 3 || actor.some((n) => !(n > 0))) {
    throw new IsoblockError("E_USAGE", "actor must be three numbers above 0, written w,d,h");
  }
  if (!(step > 0)) throw new IsoblockError("E_USAGE", "--step must be a number above 0");
  const viewed = state === null ? scene : sceneInState(scene, state);
  const area = lane !== undefined ? laneArea(scene, lane) : zoneArea(scene, zone as string);
  const [w, d, h] = actor;
  const [u0, v0, u1, v1] = area.bounds;
  const [i0, i1] = span(u0, u1, step);
  const [j0, j1] = span(v0, v1, step);
  const columns = i1 >= i0 ? i1 - i0 + 1 : 0;
  const rows = j1 >= j0 ? j1 - j0 + 1 : 0;
  const grid = columns * rows;
  if (grid > MAX_POINTS) {
    throw new IsoblockError("E_USAGE", `the area covers ${grid} grid points; use a larger step`);
  }
  const blocked = blockedZones(scene);
  const boxes = viewed.objects.map((object) => sizeBox(viewed, object));
  const c = orderDirection(viewed.camera);
  const at = projector(viewed.camera);
  const parts = viewed.objects.flatMap((object) =>
    worldParts(viewed, object).map((part) => ({
      id: object.id,
      box: part.box,
      info: boxInfo(part.box, viewed.camera, c),
      outline: boxOutline(part.box, at),
    })),
  );
  const hits = new Map<string, { positions: number; area: number }>();
  const points: [number, number][] = [];
  let positions = 0;
  for (let j = j0; j <= j1; j++) {
    const v = (j + 0.5) * step;
    for (let i = i0; i <= i1; i++) {
      const u = (i + 0.5) * step;
      if (!area.holds(u, v)) continue;
      const level = area.heightAt(u, v);
      if (blocked.some((zone) => Math.abs(zone.level - level) <= EPS && insidePolygon(zone.points, u, v))) continue;
      const actorBox: Box = { u0: u - w / 2, v0: v - d / 2, h0: level, u1: u + w / 2, v1: v + d / 2, h1: level + h };
      if (boxes.some((box) => boxesOverlap(box, actorBox))) continue;
      positions += 1;
      points.push([u, v]);
      const info = boxInfo(actorBox, viewed.camera, c);
      const outline = boxOutline(actorBox, at);
      const best = new Map<string, number>();
      for (const part of parts) {
        if (boxesOverlap(part.box, actorBox)) continue;
        if (pairOrder(info, part.info, c) !== -1) continue;
        const overlap = convexOverlapArea(outline, part.outline);
        if (overlap <= EPS) continue;
        best.set(part.id, Math.max(best.get(part.id) ?? 0, overlap));
      }
      for (const [id, overlap] of best) {
        const row = hits.get(id) ?? { positions: 0, area: 0 };
        row.positions += 1;
        row.area = Math.max(row.area, overlap);
        hits.set(id, row);
      }
    }
  }
  const occluders = viewed.objects.flatMap((object) => {
    const row = hits.get(object.id);
    return row === undefined ? [] : [{ id: object.id, positions: row.positions, area: round(row.area, 2) }];
  });
  return {
    report: {
      scene: scene.id,
      state,
      area: { kind: area.kind, id: area.id, level: area.level },
      actor: [w, d, h],
      step,
      positions,
      occluders,
    },
    points,
  };
}

/** Integers i whose center (i + 0.5) * step lies in [lo, hi], edges included within EPS. */
function span(lo: number, hi: number, step: number): readonly [number, number] {
  return [Math.ceil((lo - EPS) / step - 0.5), Math.floor((hi + EPS) / step - 0.5)];
}

function laneArea(scene: Scene, id: string): Area {
  const lane = (scene.lanes ?? []).find((item) => item.id === id);
  if (lane === undefined) throw new IsoblockError("E_USAGE", `unknown lane '${id}'`);
  const shape = lanePieces(lane);
  if (!shape.ok) throw new IsoblockError("E_USAGE", shape.reason);
  const flat = laneLevel(lane);
  let u0 = Infinity;
  let v0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  for (const piece of shape.pieces) {
    for (const [u, v] of piece.corners) {
      if (u < u0) u0 = u;
      if (v < v0) v0 = v;
      if (u > u1) u1 = u;
      if (v > v1) v1 = v;
    }
  }
  const pieces = shape.pieces;
  return {
    kind: "lane",
    id,
    level: flat.flat ? flat.level : null,
    heightAt: (u, v) => {
      for (const piece of pieces) if (insidePiece(piece, u, v)) return surfaceHeight(piece, u, v);
      return flat.level;
    },
    holds: (u, v) => pieces.some((piece) => insidePiece(piece, u, v)),
    bounds: [u0, v0, u1, v1],
  };
}

function zoneArea(scene: Scene, id: string): Area {
  const zone = (scene.zones ?? []).find((item) => item.id === id);
  if (zone === undefined) throw new IsoblockError("E_USAGE", `unknown zone '${id}'`);
  const points = zone.points ?? [];
  if (points.length < 3) throw new IsoblockError("E_USAGE", `zone '${id}' has ${points.length} points; an area needs 3 or more`);
  let u0 = Infinity;
  let v0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  for (const [u, v] of points) {
    if (u < u0) u0 = u;
    if (v < v0) v0 = v;
    if (u > u1) u1 = u;
    if (v > v1) v1 = v;
  }
  return {
    kind: "zone",
    id,
    level: zone.h ?? 0,
    heightAt: () => zone.h ?? 0,
    holds: (u, v) => insidePolygon(points, u, v),
    bounds: [u0, v0, u1, v1],
  };
}

function blockedZones(scene: Scene): readonly { readonly level: number; readonly points: readonly [number, number][] }[] {
  return (scene.zones ?? []).flatMap((zone) => {
    const points = zone.points ?? [];
    if (zone.kind !== "blocked" || points.length < 3) return [];
    return [{ level: zone.h ?? 0, points: points as readonly [number, number][] }];
  });
}

/** Text form of an occluders report. The layout is for people; tools read the JSON. */
export function formatOccluders(report: OccludersReport): string {
  const state = report.state === null ? "default" : report.state;
  const [w, d, h] = report.actor;
  const head =
    `occluders ${report.scene} state ${state} ${report.area.kind} ${report.area.id} level ${report.area.level}: ` +
    `actor ${w},${d},${h} step ${report.step}, ${report.positions} positions`;
  const lines = report.occluders.map((row) => `${row.id}: ${row.positions} positions, ${row.area.toFixed(2)} px2`);
  return [head, ...lines].join("\n");
}

export { DEFAULT_STEP };
