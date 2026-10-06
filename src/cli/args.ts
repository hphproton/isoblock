import { IsoblockError } from "../core/errors";

export type Command = "validate" | "check" | "render" | "describe";
export type CompareFormat = "text" | "md" | "json";

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
      readonly kind: "compare";
      readonly file: string;
      readonly variants: readonly VariantArg[];
      readonly format: CompareFormat;
    };

export const USAGE = [
  "isoblock: isometric scene layout as data",
  "",
  "Usage:",
  "  isoblock validate <scene.json>             schema and reference checks",
  "  isoblock check    <scene.json> [--json]    run the scene's checks",
  "  isoblock render   <scene.json> -o <out.svg>  draw the scene as SVG",
  "  isoblock describe <scene.json>             compact summary for agents",
  "  isoblock patch    <scene.json> <patch> [-o <out.json>] [--dry-run] [--json]",
  "                                             apply a patch (JSON Patch or short commands)",
  "  isoblock diff     <a.json> <b.json> [--json]  list the changes from a to b",
  "  isoblock compare  <scene.json> --variant NAME=FILE... [--format text|md|json]",
  "                                             compare the scene with 1 to 4 variants",
  "  isoblock --help",
  "",
  "Exit codes: 0 success, 1 a check failed or was skipped, 2 invalid input or usage,",
  "3 a patch touches a lock, 70 internal error.",
].join("\n");

const COMMANDS: readonly string[] = ["validate", "check", "render", "describe", "patch", "diff", "compare"];
/** Commands from later stages: name -> stage that adds it. */
const LATER_COMMANDS: Readonly<Record<string, number>> = { solve: 4, export: 5 };
/** Flags of later stages: name -> stage that adds it. */
const LATER_FLAGS: Readonly<Record<string, number>> = { "--state": 6, "--only": 4, "--target": 5 };
const NOT_SCHEDULED_TARGETS: readonly string[] = ["phaser", "tiled"];
/** Flags that take a value. */
const WITH_VALUE: readonly string[] = ["-o", "--variant", "--format"];
/** The commands each flag applies to. */
const FLAG_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  "--json": ["check", "patch", "diff"],
  "-o": ["render", "patch"],
  "--dry-run": ["patch"],
  "--variant": ["compare"],
  "--format": ["compare"],
};
const FORMATS: readonly string[] = ["text", "md", "json"];
const MAX_VARIANTS = 4;

function usage(message: string): IsoblockError {
  return new IsoblockError("E_USAGE", message, ["Try 'isoblock --help'."]);
}

function checkLater(command: string, rest: readonly string[]): void {
  const stage = LATER_COMMANDS[command];
  if (stage === undefined) return;
  if (command === "export") {
    const i = rest.findIndex((a) => a === "--target" || a.startsWith("--target="));
    const target = i < 0 ? undefined : rest[i]?.startsWith("--target=") ? rest[i]?.slice(9) : rest[i + 1];
    if (target !== undefined && NOT_SCHEDULED_TARGETS.includes(target)) {
      throw usage(`export target '${target}' is not scheduled`);
    }
  }
  throw usage(`command '${command}' is added in stage ${stage}`);
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
  readonly output?: string;
  readonly variants: readonly string[];
  readonly format?: string;
}

function scan(command: string, rest: readonly string[]): Scanned {
  const positional: string[] = [];
  const variants: string[] = [];
  let json = false;
  let dryRun = false;
  let output: string | undefined;
  let format: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const [flag, inline] = split(rest[i] as string);
    if (!flag.startsWith("-")) {
      positional.push(flag);
      continue;
    }
    const later = LATER_FLAGS[flag];
    if (later !== undefined) throw usage(`flag '${flag}' is added in stage ${later}`);
    if (flag === "--render" && command === "compare") throw usage("flag '--render' is not scheduled");
    const applies = FLAG_COMMANDS[flag];
    if (applies === undefined) throw usage(`unknown flag '${flag}'`);
    if (!applies.includes(command)) throw usage(`flag '${flag}' does not apply to '${command}'`);
    const value = WITH_VALUE.includes(flag) ? (inline ?? rest[++i]) : undefined;
    if (WITH_VALUE.includes(flag) && value === undefined) throw usage(`flag '${flag}' needs a value`);
    if (flag === "--json") json = true;
    else if (flag === "--dry-run") dryRun = true;
    else if (flag === "-o") output = value;
    else if (flag === "--format") format = value;
    else variants.push(value as string);
  }
  return { positional, json, dryRun, ...(output === undefined ? {} : { output }), variants, ...(format === undefined ? {} : { format }) };
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
  checkLater(command, rest);
  if (!COMMANDS.includes(command)) throw usage(`unknown command '${command}'`);

  const s = scan(command, rest);
  const output = s.output === undefined ? {} : { output: s.output };
  if (command === "patch") {
    const [file, patchFile] = files(s.positional, ["scene file", "patch file"]) as [string, string];
    return { kind: "patch", file, patchFile, json: s.json, dryRun: s.dryRun, ...output };
  }
  if (command === "diff") {
    const [file, other] = files(s.positional, ["first scene file", "second scene file"]) as [string, string];
    return { kind: "diff", file, other, json: s.json };
  }
  const [file] = files(s.positional, ["scene file"]) as [string];
  if (command === "compare") {
    const format = s.format ?? "text";
    if (!FORMATS.includes(format)) throw usage(`unknown format '${format}': use text, md or json`);
    return { kind: "compare", file, variants: parseVariants(s.variants), format: format as CompareFormat };
  }
  if (command === "render") {
    if (s.output === undefined) throw usage("render needs -o <out.svg>");
    if (/\.png$/i.test(s.output)) throw usage("PNG output is added in stage 5; use an .svg file");
    if (!/\.svg$/i.test(s.output)) throw usage("output file must end in .svg");
  }
  return { kind: "run", command: command as Command, file, json: s.json, ...output };
}
