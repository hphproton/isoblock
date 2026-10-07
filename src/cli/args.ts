import { IsoblockError } from "../core/errors";

export type Command = "validate" | "check" | "render" | "describe" | "relations";
export type CompareFormat = "text" | "md" | "json";
export type ExportTarget = "runtime" | "gen-bbox";

export interface VariantArg {
  readonly name: string;
  readonly file: string;
}

export type Parsed =
  | { readonly kind: "help" }
  | {
      readonly kind: "run";
      readonly command: Command;
      readonly file: string;
      readonly json: boolean;
      readonly output?: string;
      /** `--state` of `check` and `render`; absent when every object is present. */
      readonly state?: string;
    }
  | {
      readonly kind: "patch";
      readonly file: string;
      readonly patchFile: string;
      readonly json: boolean;
      readonly dryRun: boolean;
      readonly output?: string;
    }
  | { readonly kind: "diff"; readonly file: string; readonly other: string; readonly json: boolean }
  | {
      readonly kind: "solve";
      readonly file: string;
      readonly json: boolean;
      /** Object ids of `--only`; absent when every object may move. */
      readonly only?: readonly string[];
      readonly output?: string;
      readonly patchOutput?: string;
    }
  | {
      readonly kind: "export";
      readonly file: string;
      readonly target: ExportTarget;
      readonly output?: string;
      /** `--bbox-units` of `gen-bbox`; absent when not given (the default is `px`). */
      readonly bboxUnits?: "px" | "norm1000";
      /** `--bbox-order` of `gen-bbox`; absent when not given (the default is `xyxy`). */
      readonly bboxOrder?: "xyxy" | "yxyx";
      /** `--state` of `gen-bbox`; absent when every object is present. */
      readonly state?: string;
    }
  | {
      readonly kind: "compare";
      readonly file: string;
      readonly variants: readonly VariantArg[];
      readonly format: CompareFormat;
      readonly state?: string;
    };

export const USAGE = [
  "isoblock: isometric scene layout as data",
  "",
  "Usage:",
  "  isoblock validate <scene.json>             schema and reference checks",
  "  isoblock check    <scene.json> [--json] [--state NAME]  run the scene's checks",
  "  isoblock render   <scene.json> [--state NAME] -o <out.svg|out.png>  draw the scene as SVG or PNG",
  "  isoblock describe <scene.json>             compact summary for agents",
  "  isoblock relations <scene.json> [--json]   measure the scene's relations",
  "  isoblock solve    <scene.json> [--only a,b] [-o <proposal.json>] [--patch <moves.patch>] [--json]",
  "                                             propose positions that meet the relations",
  "  isoblock patch    <scene.json> <patch> [-o <out.json>] [--dry-run] [--json]",
  "                                             apply a patch (JSON Patch or short commands)",
  "  isoblock diff     <a.json> <b.json> [--json]  list the changes from a to b",
  "  isoblock compare  <scene.json> --variant NAME=FILE... [--state NAME] [--format text|md|json]",
  "                                             compare the scene with 1 to 4 variants",
  "  isoblock export   <scene.json> --target runtime|gen-bbox [-o <out.json>]",
  "                    [--bbox-units px|norm1000] [--bbox-order xyxy|yxyx] [--state NAME]",
  "                                             write the runtime file or the generation boxes",
  "  isoblock --help",
  "",
  "Exit codes: 0 success, 1 a check failed or was skipped (relations: a hard relation is not",
  "satisfied; solve: also a conflict), 2 invalid input or usage,",
  "3 a patch touches a lock, 70 internal error.",
].join("\n");

const COMMANDS: readonly string[] = ["validate", "check", "render", "describe", "relations", "solve", "patch", "diff", "compare", "export"];
const EXPORT_TARGETS: readonly string[] = ["runtime", "gen-bbox"];
const NOT_SCHEDULED_TARGETS: readonly string[] = ["godot", "phaser", "tiled"];
const BBOX_UNITS: readonly string[] = ["px", "norm1000"];
const BBOX_ORDERS: readonly string[] = ["xyxy", "yxyx"];
/** The commands each flag applies to. */
const FLAG_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  "--json": ["check", "relations", "solve", "patch", "diff"],
  "-o": ["render", "solve", "patch", "export"],
  "--only": ["solve"],
  "--patch": ["solve"],
  "--dry-run": ["patch"],
  "--variant": ["compare"],
  "--format": ["compare"],
  "--state": ["check", "render", "compare", "export"],
  "--target": ["export"],
  "--bbox-units": ["export"],
  "--bbox-order": ["export"],
};
const FORMATS: readonly string[] = ["text", "md", "json"];
const MAX_VARIANTS = 4;

function usage(message: string): IsoblockError {
  return new IsoblockError("E_USAGE", message, ["Try 'isoblock --help'."]);
}

/** Split `--name=value` into its two parts; other arguments pass through. */
function split(arg: string): readonly [string, string | undefined] {
  const eq = arg.indexOf("=");
  return arg.startsWith("-") && eq > 0 ? [arg.slice(0, eq), arg.slice(eq + 1)] : [arg, undefined];
}

interface Scanned {
  readonly positional: readonly string[];
  readonly json: boolean;
  readonly dryRun: boolean;
  readonly variants: readonly string[];
  /** The value of each flag that takes one, except `--variant`, which may repeat. */
  readonly values: Readonly<Record<string, string>>;
}

function scan(command: string, rest: readonly string[]): Scanned {
  const positional: string[] = [];
  const variants: string[] = [];
  const values: Record<string, string> = {};
  let json = false;
  let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    const [flag, inline] = split(rest[i] as string);
    if (!flag.startsWith("-")) {
      positional.push(flag);
      continue;
    }
    if (flag === "--render" && command === "compare") throw usage("flag '--render' is not scheduled");
    const applies = FLAG_COMMANDS[flag];
    if (applies === undefined) throw usage(`unknown flag '${flag}'`);
    if (!applies.includes(command)) throw usage(`flag '${flag}' does not apply to '${command}'`);
    if (flag === "--json") json = true;
    else if (flag === "--dry-run") dryRun = true;
    else {
      const value = inline ?? rest[++i];
      if (value === undefined) throw usage(`flag '${flag}' needs a value`);
      if (flag === "--variant") variants.push(value);
      else values[flag] = value;
    }
  }
  return { positional, json, dryRun, variants, values };
}

/** `--only a,b`: object ids separated by commas, none empty; repeated ids count once. */
function parseOnly(value: string): readonly string[] {
  const ids = value.split(",").map((id) => id.trim());
  if (ids.some((id) => id === "")) throw usage(`--only '${value}' must list object ids separated by commas`);
  return [...new Set(ids)];
}

function parseSolve(file: string, s: Scanned): Parsed {
  const { "--only": only, "-o": output, "--patch": patchOutput } = s.values;
  return {
    kind: "solve", file, json: s.json,
    ...(only === undefined ? {} : { only: parseOnly(only) }),
    ...(output === undefined ? {} : { output }),
    ...(patchOutput === undefined ? {} : { patchOutput }),
  };
}

/** `export`: the target is required and checked before the file, so that its errors come first. */
function parseExport(file: string, s: Scanned): Parsed {
  const { "--bbox-units": units, "--bbox-order": order, "-o": output, "--state": state } = s.values;
  const target = s.values["--target"] as string;
  if (units !== undefined && !BBOX_UNITS.includes(units)) throw usage("--bbox-units must be px or norm1000");
  if (order !== undefined && !BBOX_ORDERS.includes(order)) throw usage("--bbox-order must be xyxy or yxyx");
  if (target === "runtime") {
    if (units !== undefined) throw usage("--bbox-units applies to the gen-bbox target only");
    if (order !== undefined) throw usage("--bbox-order applies to the gen-bbox target only");
    if (state !== undefined) throw usage("--state applies to the gen-bbox target only: the runtime file does not carry states yet");
  }
  return {
    kind: "export", file, target: target as ExportTarget,
    ...(output === undefined ? {} : { output }),
    ...(units === undefined ? {} : { bboxUnits: units as "px" | "norm1000" }),
    ...(order === undefined ? {} : { bboxOrder: order as "xyxy" | "yxyx" }),
    ...(state === undefined ? {} : { state }),
  };
}

/** The `--target` of `export`: a usage error unless it names a target that exists. */
function checkTarget(target: string | undefined): void {
  if (target === undefined) throw usage("export needs --target runtime or gen-bbox");
  if (NOT_SCHEDULED_TARGETS.includes(target)) throw usage(`export target '${target}' is not scheduled`);
  if (!EXPORT_TARGETS.includes(target)) throw usage(`unknown export target '${target}': use runtime or gen-bbox`);
}

function parseVariants(values: readonly string[]): readonly VariantArg[] {
  if (values.length === 0) throw usage("compare needs at least one --variant NAME=FILE");
  if (values.length > MAX_VARIANTS) throw usage(`compare takes at most ${MAX_VARIANTS} variants`);
  const out: VariantArg[] = [];
  for (const value of values) {
    const eq = value.indexOf("=");
    const name = eq < 0 ? "" : value.slice(0, eq);
    const file = eq < 0 ? "" : value.slice(eq + 1);
    if (name === "" || file === "") throw usage(`variant '${value}' must be written NAME=FILE`);
    if (name === "base") throw usage("the variant name 'base' is reserved for the scene itself");
    if (out.some((v) => v.name === name)) throw usage(`variant name '${name}' is used twice`);
    out.push({ name, file });
  }
  return out;
}

/** The files named without a flag: exactly `names.length` of them. */
function files(positional: readonly string[], names: readonly string[]): readonly string[] {
  names.forEach((name, i) => {
    if (positional[i] === undefined) throw usage(`missing ${name}`);
  });
  const extra = positional[names.length];
  if (extra !== undefined) throw usage(`unexpected argument '${extra}'`);
  return positional;
}

export function parseArgs(argv: readonly string[]): Parsed {
  if (argv.includes("--help") || argv.includes("-h")) return { kind: "help" };
  const [command, ...rest] = argv;
  if (command === undefined) throw usage("missing command");
  if (!COMMANDS.includes(command)) throw usage(`unknown command '${command}'`);

  const s = scan(command, rest);
  const output = s.values["-o"] === undefined ? {} : { output: s.values["-o"] };
  if (command === "export") checkTarget(s.values["--target"]);
  if (command === "patch") {
    const [file, patchFile] = files(s.positional, ["scene file", "patch file"]) as [string, string];
    return { kind: "patch", file, patchFile, json: s.json, dryRun: s.dryRun, ...output };
  }
  if (command === "diff") {
    const [file, other] = files(s.positional, ["first scene file", "second scene file"]) as [string, string];
    return { kind: "diff", file, other, json: s.json };
  }
  const [file] = files(s.positional, ["scene file"]) as [string];
  if (command === "solve") return parseSolve(file, s);
  if (command === "export") return parseExport(file, s);
  if (command === "compare") {
    const format = s.values["--format"] ?? "text";
    if (!FORMATS.includes(format)) throw usage(`unknown format '${format}': use text, md or json`);
    const state = s.values["--state"];
    return {
      kind: "compare", file, variants: parseVariants(s.variants), format: format as CompareFormat,
      ...(state === undefined ? {} : { state }),
    };
  }
  if (command === "render") {
    if (s.values["-o"] === undefined) throw usage("render needs -o <out.svg|out.png>");
    if (!/\.(svg|png)$/i.test(s.values["-o"])) throw usage("output file must end in .svg or .png");
  }
  const state = s.values["--state"];
  return { kind: "run", command: command as Command, file, json: s.json, ...output, ...(state === undefined ? {} : { state }) };
}
