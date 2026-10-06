import { IsoblockError } from "../core/errors";

export type Command = "validate" | "check" | "render" | "describe";

export type Parsed =
  | { readonly kind: "help" }
  | {
      readonly kind: "run";
      readonly command: Command;
      readonly file: string;
      readonly json: boolean;
      readonly output?: string;
    };

export const USAGE = [
  "isoblock: isometric scene layout as data",
  "",
  "Usage:",
  "  isoblock validate <scene.json>             schema and reference checks",
  "  isoblock check    <scene.json> [--json]    run the scene's checks",
  "  isoblock render   <scene.json> -o <out.svg>  draw the scene as SVG",
  "  isoblock describe <scene.json>             compact summary for agents",
  "  isoblock --help",
  "",
  "Exit codes: 0 success, 1 a check failed or was skipped, 2 invalid input or usage, 70 internal error.",
].join("\n");

const COMMANDS: readonly Command[] = ["validate", "check", "render", "describe"];
/** Commands from later stages: name -> stage that adds it. */
const LATER_COMMANDS: Readonly<Record<string, number>> = { patch: 3, diff: 3, compare: 3, solve: 4, export: 5 };
/** Flags of later stages: name -> stage that adds it. */
const LATER_FLAGS: Readonly<Record<string, number>> = {
  "--state": 6, "--only": 4, "--variant": 3, "--format": 3, "--render": 3, "--target": 5,
};
const NOT_SCHEDULED_TARGETS: readonly string[] = ["phaser", "tiled"];

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

export function parseArgs(argv: readonly string[]): Parsed {
  if (argv.includes("--help") || argv.includes("-h")) return { kind: "help" };
  const [command, ...rest] = argv;
  if (command === undefined) throw usage("missing command");
  checkLater(command, rest);
  if (!COMMANDS.includes(command as Command)) throw usage(`unknown command '${command}'`);

  const positional: string[] = [];
  let json = false;
  let output: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const [flag, inline] = split(rest[i] as string);
    if (!flag.startsWith("-")) {
      positional.push(flag);
      continue;
    }
    const later = LATER_FLAGS[flag];
    if (later !== undefined) throw usage(`flag '${flag}' is added in stage ${later}`);
    if (flag === "--json") {
      if (command !== "check") throw usage(`flag '--json' does not apply to '${command}'`);
      json = true;
    } else if (flag === "-o") {
      if (command !== "render") throw usage(`flag '-o' does not apply to '${command}'`);
      const value = inline ?? rest[++i];
      if (value === undefined) throw usage("flag '-o' needs a value");
      output = value;
    } else {
      throw usage(`unknown flag '${flag}'`);
    }
  }
  const [file, extra] = positional;
  if (file === undefined) throw usage("missing scene file");
  if (extra !== undefined) throw usage(`unexpected argument '${extra}'`);
  if (command === "render") {
    if (output === undefined) throw usage("render needs -o <out.svg>");
    if (/\.png$/i.test(output)) throw usage("PNG output is added in stage 5; use an .svg file");
    if (!/\.svg$/i.test(output)) throw usage("output file must end in .svg");
  }
  return { kind: "run", command: command as Command, file, json, ...(output === undefined ? {} : { output }) };
}
