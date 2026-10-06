import type { Vec2 } from "./types";

export type Layer = "frame" | "strip" | "zone" | "lane" | "object" | "anchor" | "region" | "label";

export interface DisplayPolygon {
  readonly kind: "polygon";
  readonly layer: Layer;
  readonly ref: string;
  readonly points: readonly Vec2[];
  /** Bounds of `points`: min x, min y, max x, max y. */
  readonly bounds: readonly [number, number, number, number];
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly dashed: boolean;
}

export type LabelTarget = "strip" | "lane" | "region" | "object" | "anchor";

export interface DisplayLabel {
  readonly kind: "label";
  readonly layer: "label";
  /** What the label names. */
  readonly target: LabelTarget;
  readonly align: "start" | "middle" | "end";
  readonly ref: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export type DisplayItem = DisplayPolygon | DisplayLabel;

/** Everything a renderer needs, in draw order. The core never draws; renderers do. */
export interface DisplayList {
  readonly width: number;
  readonly height: number;
  readonly items: readonly DisplayItem[];
}

export interface Style {
  readonly fill: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly opacity?: number;
  readonly dashed?: boolean;
}

export function polygon(layer: Layer, ref: string, points: readonly Vec2[], style: Style): DisplayPolygon {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return {
    kind: "polygon",
    layer,
    ref,
    points,
    bounds: [x0, y0, x1, y1],
    fill: style.fill,
    stroke: style.stroke ?? "#777777",
    strokeWidth: style.strokeWidth ?? 1,
    opacity: style.opacity ?? 1,
    dashed: style.dashed ?? false,
  };
}

export function label(
  target: LabelTarget,
  ref: string,
  text: string,
  at: Vec2,
  align: DisplayLabel["align"] = "start",
): DisplayLabel {
  return { kind: "label", layer: "label", target, align, ref, text, x: at[0], y: at[1] };
}
