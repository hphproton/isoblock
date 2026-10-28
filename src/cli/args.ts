import { IsoblockError } from "../core/errors";

export type Command = "validate" | "check" | "render" | "describe" | "relations";
export type CompareFormat = "text" | "md" | "json";
export type ExportTarget = "runtime" | "gen-bbox" | "masks";

export interface VariantArg {
  readonly name: string;
  readonly file: string;
}

export type Parsed =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | {
      readonly kind: "run";
      readonly command: Command;
      readonly file: string;
      readonly json: boolean;
      readonly output?: string;
      /** `--state` of `check` and `render`; absent when every object is present. */
      readonly state?: string;
      /** Check ids of `check --only`; absent when every check runs. */
      readonly only?: readonly string[];
      /** `check --failing`: the lines and JSON results are only `fail` and `skip`. */
      readonly failing?: boolean;
      /** `describe --relations`. Absent when the flag is not set. */
      readonly relations?: boolean;
      /** `describe --states`. Absent when the flag is not set. */
      readonly states?: boolean;
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
      readonly target: "runtime" | "gen-bbox";
      readonly output?: string;
      /** `--bbox-units` of `gen-bbox`; absent when not given (the default is `px`). */
      readonly bboxUnits?: "px" | "norm1000";
      /** `--bbox-order` of `gen-bbox`; absent when not given (the default is `xyxy`). */
      readonly bboxOrder?: "xyxy" | "yxyx";
      /** `--state` of `gen-bbox`; absent when every object is present. */
      readonly state?: string;
    }
  | {
      readonly kind: "export";
      readonly file: string;
      readonly target: "masks";
      readonly output: string;
      /** `--grow` of `masks`, 0 to 64. */
      readonly grow: number;
      /** `--state` of `masks`; absent when every object is present. */
      readonly state?: string;
    }
  | {
      readonly kind: "visibility";
      readonly file: string;
      readonly json: boolean;
      /** Frame region. Absent means the whole raster. */
      readonly region?: string;
      readonly state?: string;
    }
  | {
      readonly kind: "occluders";
      readonly file: string;
      readonly json: boolean;
      readonly actor: readonly [number, number, number];
      readonly lane?: string;
      readonly zone?: string;
      readonly step?: number;
      readonly state?: string;
    }
  | {
      readonly kind: "compare";
      readonly file: string;
      readonly variants: readonly VariantArg[];
      readonly format: CompareFormat;
      readonly state?: string;
      /** `compare --relations`. Absent when the flag is not set. */
      readonly relations?: boolean;
    };

export const USAGE = [
  "isoblock: isometric scene layout as data",
  "",
  "Usage:",
  "  isoblock --version                         print the version",
  "  isoblock validate <scene.json> [--json]    schema and reference checks",
  "  isoblock check    <scene.json> [--json] [--state NAME] [--only a,b] [--failing]",
  "                                             run the scene's checks",
  "  isoblock render   <scene.json> [--state NAME] -o <out.svg|out.png>",
  "                                             draw the scene as SVG or PNG",
  "  isoblock describe <scene.json> [--relations] [--states]",
  "                                             compact summary for agents",
  "  isoblock relations <scene.json> [--json]   measure the scene's relations",
  "  isoblock solve    <scene.json> [--only a,b] [-o <proposal.json>] [--patch <moves.patch|->] [--json]",
  "                                             propose positions that meet the relations",
  "  isoblock patch    <scene.json> <patch|-> [-o <out.json>] [--dry-run] [--json]",
  "                                             apply a patch (JSON Patch or short commands)",
  "  isoblock diff     <a.json> <b.json> [--json]  list the changes from a to b",
  "  isoblock compare  <scene.json> --variant NAME=FILE... [--state NAME]",
  "                    [--format text|md|json] [--relations]",
  "                                             compare the scene with 1 to 4 variants",
  "  isoblock export   <scene.json> --target runtime|gen-bbox|masks [-o <out.json|dir>]",
  "                    [--bbox-units px|norm1000] [--bbox-order xyxy|yxyx] [--state NAME] [--grow N]",
  "                                             write the runtime file, generation boxes or masks",
  "  isoblock visibility <scene.json> [--region ID] [--state NAME] [--json]",
  "                                             shares and coverage of objects in a region",
  "  isoblock occluders <scene.json> --actor w,d,h (--lane ID | --zone ID) [--step S] [--state NAME] [--json]",
  "                                             objects that hide an actor in a lane or a zone",
  "  isoblock --help",
  "",
  "Exit codes: 0 success, 1 a check failed or was skipped (relations: a hard relation is not",
  "satisfied; solve: also a conflict), 2 invalid input or usage,",
  "3 a patch touches a lock, 70 internal error.",
].join("\n");

const COMMANDS: readonly string[] = [
  "validate", "check", "render", "describe", "relations", "solve", "patch", "diff", "compare", "export",
  "visibility", "occluders",
];
const EXPORT_TARGETS: readonly string[] = ["runtime", "gen-bbox", "masks"];
const NOT_SCHEDULED_TARGETS: readonly string[] = ["godot", "phaser", "tiled"];
const BBOX_UNITS: readonly string[] = ["px", "norm1000"];
const BBOX_ORDERS: readonly string[] = ["xyxy", "yxyx"];
/** The commands each flag applies to. */
const FLAG_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  "--json": ["validate", "check", "relations", "solve", "patch", "diff", "visibility", "occluders"],
  "-o": ["render", "solve", "patch", "export"],
  "--only": ["solve", "check"],
  "--relations": ["describe", "compare"],
  "--states": ["describe"],
  "--patch": ["solve"],
  "--dry-run": ["patch"],
  "--variant": ["compare"],
  "--format": ["compare"],
  "--state": ["check", "render", "compare", "export", "visibility", "occluders"],
  "--failing": ["check"],
  "--target": ["export"],
  "--bbox-units": ["export"],
  "--bbox-order": ["export"],
  "--grow": ["export"],
  "--region": ["visibility"],
  "--actor": ["occluders"],
  "--lane": ["occluders"],
  "--zone": ["occluders"],
  "--step": ["occluders"],
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
  readonly relations: boolean;
  readonly states: boolean;
  readonly failing: boolean;
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
  let relations = false;
  let states = false;
  let failing = false;
  for (let i = 0; i < rest.length; i++) {
    const [flag, inline] = split(rest[i] as string);
    // `-` is the patch file name that means standard input, not a flag.
    if (!flag.startsWith("-") || flag === "-") {
      positional.push(flag);
      continue;
    }
    if (flag === "--render" && command === "compare") throw usage("flag '--render' is not scheduled");
    const applies = FLAG_COMMANDS[flag];
    if (applies === undefined) throw usage(`unknown flag '${flag}'`);
    if (!applies.includes(command)) throw usage(`flag '${flag}' does not apply to '${command}'`);
    if (flag === "--json") json = true;
    else if (flag === "--dry-run") dryRun = true;
    else if (flag === "--relations") relations = true;
    else if (flag === "--states") states = true;
    else if (flag === "--failing") failing = true;
    else {
      const value = inline ?? rest[++i];
      if (value === undefined) throw usage(`flag '${flag}' needs a value`);
      if (flag === "--variant") variants.push(value);
      else values[flag] = value;
    }
  }
  return { positional, json, dryRun, relations, states, failing, variants, values };
}

/** `--only a,b`: ids separated by commas, none empty; repeated ids count once. */
function parseOnly(value: string, what: string): readonly string[] {
  const ids = value.split(",").map((id) => id.trim());
  if (ids.some((id) => id === "")) throw usage(`--only '${value}' must list ${what} separated by commas`);
  return [...new Set(ids)];
}

function parseSolve(file: string, s: Scanned): Parsed {
  const { "--only": only, "-o": output, "--patch": patchOutput } = s.values;
  if (patchOutput === "-" && s.json) throw usage("solve --patch - writes to standard output and cannot be combined with --json");
  return {
    kind: "solve", file, json: s.json,
    ...(only === undefined ? {} : { only: parseOnly(only, "object ids") }),
    ...(output === undefined ? {} : { output }),
    ...(patchOutput === undefined ? {} : { patchOutput }),
  };
}

/** `--grow N`: an integer from 0 to 64. Absent means 0. */
function parseGrow(value: string | undefined): number {
  if (value === undefined) return 0;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw usage("--grow must be an integer from 0 to 64");
  const n = Number(value);
  if (n > 64) throw usage("--grow must be an integer from 0 to 64");
  return n;
}

/** `--actor w,d,h`: three numbers above 0. */
function parseActor(value: string): readonly [number, number, number] {
  const parts = value.split(",").map((part) => part.trim());
  const nums = parts.map((part) => Number(part));
  if (parts.length !== 3 || nums.some((n) => !Number.isFinite(n) || !(n > 0))) {
    throw usage("--actor must be three numbers above 0, written w,d,h");
  }
  return [nums[0] as number, nums[1] as number, nums[2] as number];
}

function parseStep(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || !(n > 0)) throw usage("--step must be a number above 0");
  return n;
}

/** `export`: the target is required and checked before the file, so that its errors come first. */
function parseExport(file: string, s: Scanned): Parsed {
  const { "--bbox-units": units, "--bbox-order": order, "-o": output, "--state": state, "--grow": growText } = s.values;
  const target = s.values["--target"] as string;
  if (units !== undefined && !BBOX_UNITS.includes(units)) throw usage("--bbox-units must be px or norm1000");
  if (order !== undefined && !BBOX_ORDERS.includes(order)) throw usage("--bbox-order must be xyxy or yxyx");
  if (target !== "masks" && growText !== undefined) throw usage("--grow applies to the masks target only");
  if (target === "runtime") {
    if (units !== undefined) throw usage("--bbox-units applies to the gen-bbox target only");
    if (order !== undefined) throw usage("--bbox-order applies to the gen-bbox target only");
    if (state !== undefined) throw usage("--state applies to gen-bbox and masks: the runtime file carries all states");
  }
  if (target === "masks") {
    if (units !== undefined) throw usage("--bbox-units applies to the gen-bbox target only");
    if (order !== undefined) throw usage("--bbox-order applies to the gen-bbox target only");
    if (output === undefined) throw usage("export --target masks needs -o <dir>");
    return {
      kind: "export", file, target: "masks", output, grow: parseGrow(growText),
      ...(state === undefined ? {} : { state }),
    };
  }
  return {
    kind: "export", file, target: target as "runtime" | "gen-bbox",
    ...(output === undefined ? {} : { output }),
    ...(units === undefined ? {} : { bboxUnits: units as "px" | "norm1000" }),
    ...(order === undefined ? {} : { bboxOrder: order as "xyxy" | "yxyx" }),
    ...(state === undefined ? {} : { state }),
  };
}

function parseVisibility(file: string, s: Scanned): Parsed {
  const region = s.values["--region"];
  const state = s.values["--state"];
  return {
    kind: "visibility", file, json: s.json,
    ...(region === undefined ? {} : { region }),
    ...(state === undefined ? {} : { state }),
  };
}

function parseOccluders(file: string, s: Scanned): Parsed {
  const actor = s.values["--actor"];
  const lane = s.values["--lane"];
  const zone = s.values["--zone"];
  const state = s.values["--state"];
  if (actor === undefined) throw usage("occluders needs --actor w,d,h");
  if ((lane === undefined) === (zone === undefined)) throw usage("occluders needs exactly one of --lane and --zone");
  const step = parseStep(s.values["--step"]);
  return {
    kind: "occluders", file, json: s.json, actor: parseActor(actor),
    ...(lane === undefined ? {} : { lane }),
    ...(zone === undefined ? {} : { zone }),
    ...(step === undefined ? {} : { step }),
    ...(state === undefined ? {} : { state }),
  };
}

/** The `--target` of `export`: a usage error unless it names a target that exists. */
function checkTarget(target: string | undefined): void {
  if (target === undefined) throw usage("export needs --target runtime, gen-bbox or masks");
  if (NOT_SCHEDULED_TARGETS.includes(target)) throw usage(`export target '${target}' is not scheduled`);
  if (!EXPORT_TARGETS.includes(target)) throw usage(`unknown export target '${target}': use runtime, gen-bbox or masks`);
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
  if (argv.length === 1 && argv[0] === "--version") return { kind: "version" };
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
  if (command === "visibility") return parseVisibility(file, s);
  if (command === "occluders") return parseOccluders(file, s);
  if (command === "compare") {
    const format = s.values["--format"] ?? "text";
    if (!FORMATS.includes(format)) throw usage(`unknown format '${format}': use text, md or json`);
    const state = s.values["--state"];
    return {
      kind: "compare", file, variants: parseVariants(s.variants), format: format as CompareFormat,
      ...(state === undefined ? {} : { state }),
      ...(s.relations ? { relations: true } : {}),
    };
  }
  if (command === "render") {
    if (s.values["-o"] === undefined) throw usage("render needs -o <out.svg|out.png>");
    if (!/\.(svg|png)$/i.test(s.values["-o"])) throw usage("output file must end in .svg or .png");
  }
  const state = s.values["--state"];
  const only = command === "check" && s.values["--only"] !== undefined ? parseOnly(s.values["--only"], "check ids") : undefined;
  return {
    kind: "run", command: command as Command, file, json: s.json, ...output,
    ...(state === undefined ? {} : { state }),
    ...(only === undefined ? {} : { only }),
    ...(s.relations ? { relations: true } : {}),
    ...(s.states ? { states: true } : {}),
    ...(s.failing ? { failing: true } : {}),
  };
}
