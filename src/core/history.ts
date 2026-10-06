/** Undo and redo over immutable snapshots. */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

export const DEFAULT_LIMIT = 200;

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

/** Make `next` the present. The redo list is dropped; at most `limit` past steps are kept. */
export function commit<T>(history: History<T>, next: T, limit = DEFAULT_LIMIT): History<T> {
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  return { past: past.slice(Math.max(0, past.length - limit)), present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
