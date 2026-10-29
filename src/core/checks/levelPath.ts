import type { Grid } from "./walkGrid";

/** Directed edges of the level graph: node key to [neighbor, length]. */
export type LevelEdges = Map<string, [string, number][]>;

interface HeapItem {
  readonly key: string;
  readonly cost: number;
}

function siftUp(heap: HeapItem[], index: number): void {
  const item = heap[index] as HeapItem;
  let i = index;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    const above = heap[parent] as HeapItem;
    if (above.cost <= item.cost) break;
    heap[i] = above;
    i = parent;
  }
  heap[i] = item;
}

function siftDown(heap: HeapItem[], index: number): void {
  const item = heap[index] as HeapItem;
  let i = index;
  while (true) {
    const left = i * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    let child = left;
    if (right < heap.length && (heap[right] as HeapItem).cost < (heap[left] as HeapItem).cost) child = right;
    if ((heap[child] as HeapItem).cost >= item.cost) break;
    heap[i] = heap[child] as HeapItem;
    i = child;
  }
  heap[i] = item;
}

function pop(heap: HeapItem[]): HeapItem | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (top === undefined || last === undefined) return top;
  if (heap.length > 0) {
    heap[0] = last;
    siftDown(heap, 0);
  }
  return top;
}

function neighbors(grid: Grid, cell: number): number[] {
  const { cols, rows, free } = grid;
  const i = Math.floor(cell / rows);
  const j = cell - i * rows;
  const next = [i > 0 ? cell - rows : -1, i < cols - 1 ? cell + rows : -1, j > 0 ? cell - 1 : -1, j < rows - 1 ? cell + 1 : -1];
  return next.filter((n) => n >= 0 && free[n] === 1);
}

/** The edge list of `key`, created when it is first asked for. */
export function edgeList(edges: LevelEdges, key: string): [string, number][] {
  const list = edges.get(key);
  if (list !== undefined) return list;
  const next: [string, number][] = [];
  edges.set(key, next);
  return next;
}

/** One edge of length `step` between free cells of one level that share a side. */
export function addGridEdges(edges: LevelEdges, grids: readonly (Grid | null)[], step: number): void {
  grids.forEach((grid, index) => {
    if (grid === null) return;
    for (let cell = 0; cell < grid.free.length; cell++) {
      if (grid.free[cell] !== 1) continue;
      const list = edgeList(edges, `${index}:${cell}`);
      for (const next of neighbors(grid, cell)) list.push([`${index}:${next}`, step]);
    }
  });
}

/** Shortest path length, or null when `goal` cannot be reached. */
export function shortestCost(edges: LevelEdges, start: string, goal: string): number | null {
  const best = new Map<string, number>([[start, 0]]);
  const heap: HeapItem[] = [{ key: start, cost: 0 }];
  while (heap.length > 0) {
    const item = pop(heap) as HeapItem;
    if (item.cost !== best.get(item.key)) continue;
    if (item.key === goal) return item.cost;
    for (const [next, weight] of edges.get(item.key) ?? []) {
      const cost = item.cost + weight;
      const known = best.get(next);
      if (known !== undefined && !(cost < known)) continue;
      best.set(next, cost);
      heap.push({ key: next, cost });
      siftUp(heap, heap.length - 1);
    }
  }
  return null;
}
