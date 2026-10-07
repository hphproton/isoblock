import { plain } from "../format";
import { EPS } from "../geometry";
import type { CheckStatus } from "../types";
import type { CompareCheck, Comparison } from "./compare";

const DOT = "\u00b7";
const CROSS = "\u2717";

/** Text of one value in the table, by check (SPEC section 11.1). */
function valueCell(check: string, value: number | null, status: CheckStatus): string {
  if (status === "skip") return `skip ${CROSS}`;
  let text: string;
  if (value === null) text = "none";
  else if (check === "clearance" || check === "reachable") text = value.toFixed(2);
  else if (check === "min_screen_size") text = String(Math.floor(value + 0.5 + EPS));
  else if (check === "lane_reaches") text = String(Math.round(value));
  else if (check === "visible") text = String(Math.round(value * 100));
  else text = plain(value);
  return status === "fail" ? `${text} ${CROSS}` : text;
}

/** A check row shows when it fails or is skipped in some column, or a value differs from the base. */
function worthShowing(c: CompareCheck): boolean {
  if (c.status.some((s) => s === "fail" || s === "skip")) return true;
  return c.values.some((value, i) => i > 0 && (c.delta[i] === null ? value !== c.values[0] : c.delta[i] !== 0));
}

/** The table as rows of cells: the header, then one row per measure. */
function tableRows(c: Comparison): readonly (readonly string[])[] {
  const checks = c.checks.filter(worthShowing).map((k) => [k.label, ...k.values.map((v, i) => valueCell(k.check, v, k.status[i] as CheckStatus))]);
  return [
    ["metric", ...c.variants.map((v) => v.name)],
    ["failing checks", ...c.failing.map(String)],
    ["locks touched", ...c.locksTouched.map((l) => (l.length === 0 ? "0" : `${l.length} ${CROSS} (${l.join(", ")})`))],
    ...checks,
    [`objects moved / total (${c.unit})`, ...c.moved.map((m) => (m === null ? "-" : `${m.count} / ${m.distance.toFixed(2)}`))],
  ];
}

function width(text: string): number {
  return Array.from(text).length;
}

/**
 * The `text` format (SPEC section 11.1, Appendix D): two lines, then a table whose columns are
 * left-aligned and as wide as their widest cell plus 2 spaces. No trailing newline.
 */
export function formatCompareText(c: Comparison): string {
  const names = c.variants.slice(1).map((v) => v.name);
  const head = [
    `compare ${c.scene} ${DOT} state ${c.state} ${DOT} base vs ${names.join(", ")}`,
    c.variants.slice(1).map((v) => `${v.name} = ${v.label ?? v.name}`).join(` ${DOT} `),
  ];
  const rows = tableRows(c);
  const widths = (rows[0] as readonly string[]).map((_, col) => Math.max(...rows.map((r) => width(r[col] as string))) + 2);
  const lines = rows.map((r) =>
    r.map((cell, col) => cell + " ".repeat((widths[col] as number) - width(cell))).join("").trimEnd(),
  );
  return [...head, ...lines].join("\n");
}

/** The `md` format: the same rows as a Markdown table. No trailing newline. */
export function formatCompareMarkdown(c: Comparison): string {
  const [header, ...rows] = tableRows(c) as [readonly string[], ...(readonly string[])[]];
  const line = (cells: readonly string[]) => `| ${cells.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(header), `|${header.map(() => "---").join("|")}|`, ...rows.map(line)].join("\n");
}

/** The `json` format. */
export function compareJson(c: Comparison) {
  return {
    scene: c.scene,
    state: c.state,
    variants: c.variants,
    failing: c.failing,
    locksTouched: c.locksTouched,
    moved: c.moved,
    checks: c.checks,
  };
}
