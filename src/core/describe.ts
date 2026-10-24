import { checkLines } from "./describeChecks";
import { fmt, plain } from "./format";
import { pointerTokens } from "./pointer";
import { isViewCamera } from "./projection";
import { evaluateRelations } from "./relations/evaluate";
import type { CheckResult, Relation, Scene, SceneState } from "./types";

export { fmt } from "./format";

const DOT = "\u00b7";
const TIMES = "\u00d7";
const SIZE_NAMES = ["w", "d", "h"] as const;
const BOX_NAMES = ["u0", "v0", "h0", "u1", "v1", "h1"] as const;
/** Spaces after the widest cell, per column: id, type, pos, size, rot. */
const GAPS = [2, 2, 3, 3, 2] as const;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-3;
}

function cameraLabel(scene: Scene): string {
  if (isViewCamera(scene.camera)) return `e${plain(scene.camera.elevation)}/d${plain(scene.camera.direction ?? 45)}`;
  const { angleU, angleV } = scene.camera;
  if (near(angleU, 30) && near(angleV, 150)) return "iso30";
  if (near(angleU, 26.565051) && near(angleV, 153.434949)) return "dimetric21";
  return `u${plain(angleU)}/v${plain(angleV)}`;
}

function pixelsPerUnit(scene: Scene): number {
  return isViewCamera(scene.camera) ? scene.camera.scale : scene.camera.pxPerUnit;
}

function header(scene: Scene): string {
  const meta = scene.meta ?? {};
  const name = scene.units.name;
  const view = scene.frame.regions.find((r) => r.blocksScene !== true);
  const frame = `frame ${plain(scene.frame.w)}x${plain(scene.frame.h)}`;
  const region = view ? ` (${view.id} y ${plain(view.rect[1])}-${plain(view.rect[3])})` : "";
  const head = [`scene ${scene.id}`, meta.version === undefined ? "" : `v${meta.version}`, meta.status ?? ""];
  return [
    head.filter((p) => p !== "").join(" "),
    `unit ${name}`,
    `camera ${cameraLabel(scene)}`,
    `${plain(pixelsPerUnit(scene))} px/${name}`,
    `${frame}${region}`,
  ].join(` ${DOT} `);
}

/** Provisional marks: `size:<type>:<k>` and `pos:<object index>:<k>`. */
function marks(scene: Scene): ReadonlySet<string> {
  const out = new Set<string>();
  for (const a of scene.assumptions ?? []) {
    const t = pointerTokens(a.path);
    if (t[0] === "types" && t[2] === "size" && t.length === 4) out.add(`size:${t[1]}:${t[3]}`);
    if (t[0] === "objects" && t[2] === "pos" && t.length === 4) out.add(`pos:${t[1]}:${t[3]}`);
  }
  return out;
}

function numbers(values: readonly number[], key: (k: number) => string, set: ReadonlySet<string>): string {
  return values.map((v, k) => fmt(v) + (set.has(key(k)) ? "*" : "")).join(",");
}

function positionOf(scene: Scene, index: number): readonly number[] {
  const pos = scene.objects[index]?.pos ?? [];
  const raised = scene.objects.some((object) => object.pos.length >= 3);
  return raised ? [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0] : pos;
}

function table(scene: Scene): { lines: string[]; provisional: boolean } {
  const set = marks(scene);
  const raised = scene.objects.some((object) => object.pos.length >= 3);
  const rows = scene.objects.map((o, i) => [
    o.id,
    o.type,
    numbers(positionOf(scene, i), (k) => `pos:${i}:${k}`, set),
    numbers((scene.types[o.type] as { size: readonly number[] }).size, (k) => `size:${o.type}:${k}`, set),
    String(o.rot ?? 0),
    (o.locks ?? []).join(",") || "-",
  ]);
  const all = [["id", "type", raised ? "pos(u,v,h)" : "pos(u,v)", "size(w,d,h)", "rot", "locks"], ...rows];
  const lines = all.map((row) =>
    row
      .map((cell, c) => {
        if (c === GAPS.length) return cell;
        const width = Math.max(...all.map((r) => (r[c] as string).length)) + (GAPS[c] as number);
        return cell.padEnd(width);
      })
      .join(""),
  );
  return { lines, provisional: rows.some((r) => (r[2] as string).includes("*") || (r[3] as string).includes("*")) };
}

/** Assumption path as `describe` prints it (Appendix B). */
export function shortAssumptionPath(scene: Scene, path: string): string {
  const t = pointerTokens(path);
  if (t[0] === "types" && t[2] === "size" && t.length === 4) return `${t[1]}.size.${SIZE_NAMES[Number(t[3])]}`;
  if (t[0] === "types" && t[2] === "parts" && t[4] === "box" && t.length === 6) {
    const part = scene.types[t[1] as string]?.parts?.[Number(t[3])];
    if (part) return `${t[1]}.${part.id}.${BOX_NAMES[Number(t[5])]}`;
  }
  return path;
}

function assumptionLine(scene: Scene): string {
  const list = (scene.assumptions ?? []).map((a) => {
    const value = typeof a.value === "number" ? fmt(a.value) : JSON.stringify(a.value);
    return `${shortAssumptionPath(scene, a.path)}=${value}`;
  });
  return `assumptions: ${list.length > 0 ? list.join(` ${DOT} `) : "-"}`;
}

function relationTargets(rel: Relation): string {
  if (rel.rel === "order_along") return (rel.ids ?? []).join(TIMES);
  if (rel.a === undefined) return "";
  return rel.b === undefined ? rel.a : `${rel.a}${TIMES}${rel.b}`;
}

/** Violated and skipped relations, then the summary line (SPEC Appendix B). */
function relationBlock(scene: Scene): string[] {
  const report = evaluateRelations(scene);
  const relations = scene.relations ?? [];
  if (report.results.length === 0) return ["relations: none"];
  const lines = report.results.flatMap((result, i) => {
    if (result.status === "satisfied") return [];
    const rel = relations[i];
    const targets = rel === undefined ? result.ids.join(TIMES) : relationTargets(rel);
    if (result.status === "skip") return [`SKIP ${result.id} ${result.rel} ${targets}: ${result.message}`];
    const hard = result.hard ? "hard; " : "";
    return [`BAD ${result.id} ${result.rel} ${targets}: ${hard}violation ${fmt(result.violation ?? 0)}`];
  });
  const violated = report.results.filter((r) => r.status === "violated").length;
  const skipped = report.results.filter((r) => r.status === "skip").length;
  const hard = report.results.filter((r) => r.hard);
  const satisfied = hard.filter((r) => r.status === "satisfied").length;
  lines.push(
    `relations: ${report.results.length} ${DOT} ${violated} violated ${DOT} ${skipped} skipped ${DOT} hard ${satisfied} of ${hard.length} satisfied ${DOT} soft penalty ${fmt(report.softPenalty)}`,
  );
  return lines;
}

function hiddenItems(def: SceneState): string[] {
  const items: string[] = [];
  const hide = def.hide ?? [];
  if (hide.length > 0) items.push(hide.join(", "));
  const parts = Object.entries(def.hideParts ?? {}).flatMap(([id, list]) => list.map((part) => `${id}/${part}`));
  if (parts.length > 0) items.push(`parts ${parts.join(", ")}`);
  const regions = def.hideRegions ?? [];
  if (regions.length > 0) items.push(`regions ${regions.join(", ")}`);
  return items;
}

/** One line for every state, in file order (SPEC Appendix B). */
function statesLine(scene: Scene): string {
  const entries = Object.entries(scene.states ?? {});
  if (entries.length === 0) return "states: none";
  const parts = entries.map(([name, def]) => {
    const items = hiddenItems(def);
    return items.length === 0 ? `${name} hides nothing` : `${name} hides ${items.join("; ")}`;
  });
  return `states: ${parts.join(` ${DOT} `)}`;
}

export interface DescribeOptions {
  /** Relation lines of SPEC Appendix B. */
  readonly relations?: boolean;
  /** The state line of SPEC Appendix B. */
  readonly states?: boolean;
}

/** Compact scene summary for agents (SPEC section 12, Appendix B). No trailing newline. */
export function describeScene(scene: Scene, results: readonly CheckResult[], options: DescribeOptions = {}): string {
  const lines = checkLines(scene, results);
  const count = (scene.checks ?? []).length;
  const status = lines.length > 0 ? lines : [count === 0 ? "checks: none" : `checks: all ${count} pass`];
  const extra = [
    ...(options.relations ? relationBlock(scene) : []),
    ...(options.states ? [statesLine(scene)] : []),
  ];
  const { lines: rows, provisional } = table(scene);
  return [
    header(scene),
    ...rows,
    ...status,
    ...extra,
    assumptionLine(scene),
    ...(provisional ? ["(* = provisional value)"] : []),
  ].join("\n");
}
