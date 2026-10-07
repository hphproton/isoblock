import { EPS, type Rect } from "../geometry";
import { insidePolygon } from "../polygon";
import type { Vec2 } from "../types";

/** The most cells a grid may have; a larger grid is not evaluated (use a larger `step`). */
export const MAX_CELLS = 4_000_000;

/** Free cells of the walkable ground, on a grid whose cell (i, j) has its center at ((i + 0.5) step, (j + 0.5) step). */
export interface Grid {
  readonly step: number;
  /** Index of the first column and of the first row. */
  readonly i0: number;
  readonly j0: number;
  /** Number of columns (along u) and rows (along v). */
  readonly cols: number;
  readonly rows: number;
  /** One byte per cell, column by column: 1 when the cell is free. */
  readonly free: Uint8Array;
}

export interface GridInput {
  readonly step: number;
  readonly radius: number;
  readonly walkable: readonly (readonly Vec2[])[];
  readonly blocked: readonly (readonly Vec2[])[];
  readonly obstacles: readonly Rect[];
}

const centerOf = (index: number, step: number): number => (index + 0.5) * step;

function insideAny(polygons: readonly (readonly Vec2[])[], u: number, v: number): boolean {
  return polygons.some((points) => insidePolygon(points, u, v));
}

function rectDistance(r: Rect, u: number, v: number): number {
  return Math.hypot(Math.max(0, r.u0 - u, u - r.u1), Math.max(0, r.v0 - v, v - r.v1));
}

/** The grid of a walkable area, or `null` when it would have more than `MAX_CELLS` cells. */
export function buildGrid(input: GridInput): Grid | null {
  const { step, radius } = input;
  const points = input.walkable.flat();
  const us = points.map((p) => p[0]);
  const vs = points.map((p) => p[1]);
  const i0 = Math.floor(Math.min(...us) / step - 0.5) - 1;
  const j0 = Math.floor(Math.min(...vs) / step - 0.5) - 1;
  const cols = Math.ceil(Math.max(...us) / step - 0.5) + 1 - i0 + 1;
  const rows = Math.ceil(Math.max(...vs) / step - 0.5) + 1 - j0 + 1;
  if (!(cols * rows <= MAX_CELLS)) return null;
  const free = new Uint8Array(cols * rows);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const u = centerOf(i0 + i, step);
      const v = centerOf(j0 + j, step);
      if (insideAny(input.walkable, u, v) && !insideAny(input.blocked, u, v)) free[i * rows + j] = 1;
    }
  }
  const grid: Grid = { step, i0, j0, cols, rows, free };
  for (const r of input.obstacles) closeNear(grid, r, radius);
  return grid;
}

/** Close the cells whose center is closer than `radius - EPS` to the footprint. */
function closeNear(grid: Grid, r: Rect, radius: number): void {
  const { step, i0, j0, cols, rows } = grid;
  const iFrom = Math.max(0, Math.floor((r.u0 - radius) / step - 0.5) - i0 - 1);
  const iTo = Math.min(cols - 1, Math.ceil((r.u1 + radius) / step - 0.5) - i0 + 1);
  const jFrom = Math.max(0, Math.floor((r.v0 - radius) / step - 0.5) - j0 - 1);
  const jTo = Math.min(rows - 1, Math.ceil((r.v1 + radius) / step - 0.5) - j0 + 1);
  for (let i = iFrom; i <= iTo; i++) {
    for (let j = jFrom; j <= jTo; j++) {
      if (rectDistance(r, centerOf(i0 + i, step), centerOf(j0 + j, step)) < radius - EPS) grid.free[i * rows + j] = 0;
    }
  }
}

/**
 * The free cell whose center is nearest the point (distances within EPS of the smallest count as
 * equal; then the smaller i, then the smaller j), with that distance; `null` without free cells.
 */
export function nearestFree(grid: Grid, [u, v]: Vec2): { readonly cell: number; readonly distance: number } | null {
  const { step, i0, j0, cols, rows, free } = grid;
  const distanceTo = (i: number, j: number): number => Math.hypot(centerOf(i0 + i, step) - u, centerOf(j0 + j, step) - v);
  let best = Infinity;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (free[i * rows + j] === 1) best = Math.min(best, distanceTo(i, j));
  if (best === Infinity) return null;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (free[i * rows + j] === 1 && distanceTo(i, j) <= best + EPS) return { cell: i * rows + j, distance: best };
    }
  }
  return null;
}

/** Fewest moves between free cells that share an edge, or -1 when there is no path. */
export function shortestMoves(grid: Grid, from: number, to: number): number {
  const { cols, rows, free } = grid;
  const moves = new Int32Array(cols * rows).fill(-1);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  moves[from] = 0;
  queue[tail++] = from;
  while (head < tail) {
    const cell = queue[head++] as number;
    if (cell === to) return moves[cell] as number;
    const i = Math.floor(cell / rows);
    const j = cell - i * rows;
    const next = [i > 0 ? cell - rows : -1, i < cols - 1 ? cell + rows : -1, j > 0 ? cell - 1 : -1, j < rows - 1 ? cell + 1 : -1];
    for (const n of next) {
      if (n < 0 || free[n] !== 1 || (moves[n] as number) >= 0) continue;
      moves[n] = (moves[cell] as number) + 1;
      queue[tail++] = n;
    }
  }
  return -1;
}
