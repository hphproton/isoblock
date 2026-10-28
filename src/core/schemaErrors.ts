import Ajv, { type ErrorObject } from "ajv";
import schema from "../../schema/isoblock-1.json";
import { hint } from "./suggest";

/** Check names of SPEC section 9, in the order of that table. */
const CHECK_NAMES = [
  "in_region", "no_overlap", "clearance", "lane_clear", "lane_reaches", "lane_apart",
  "reachable", "capacity", "visible", "min_screen_size", "sort_consistency", "visible_share", "state_stable",
] as const;

/** Relation names of SPEC section 7, in the order of that table. */
const REL_NAMES = [
  "left_of", "right_of", "in_front_of", "behind", "gap", "against",
  "inside", "aligned", "facing", "on_lane", "clear_of", "order_along",
] as const;

function detailData(e: ErrorObject): unknown {
  return (e as { data?: unknown }).data;
}

function propertyNames(e: ErrorObject): readonly string[] {
  const parent = (e as { parentSchema?: { properties?: Record<string, unknown> } }).parentSchema;
  return parent?.properties === undefined ? [] : Object.keys(parent.properties);
}

function describeError(e: ErrorObject): string {
  const where = e.instancePath === "" ? "/" : e.instancePath;
  if (e.keyword === "const") return `${where}: must be ${JSON.stringify(e.params.allowedValue)}`;
  if (e.keyword === "enum") {
    const values = (e.params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ");
    return `${where}: must be one of ${values}`;
  }
  const extra = typeof e.params.additionalProperty === "string" ? `: "${e.params.additionalProperty}"` : "";
  return `${where}: ${e.message ?? "invalid"}${extra}`;
}

/** A detail that only says the value must match one of several schemas (SPEC section 6). */
function choice(e: ErrorObject): boolean {
  return e.keyword === "oneOf" || e.keyword === "discriminator";
}

function atOrBelow(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/**
 * Drop a oneOf or discriminator detail when another detail reports a problem at or below its
 * path. The other detail is the one an agent can act on.
 */
function kept(errors: readonly ErrorObject[]): ErrorObject[] {
  const rest = errors.filter((e) => !choice(e));
  return errors.filter((e) => !choice(e) || !rest.some((other) => atOrBelow(e.instancePath, other.instancePath)));
}

function unknownName(e: ErrorObject): { readonly name: string; readonly pool: readonly string[] } | undefined {
  if (e.keyword === "additionalProperties" && typeof e.params.additionalProperty === "string") {
    return { name: e.params.additionalProperty, pool: propertyNames(e) };
  }
  const data = detailData(e);
  if (e.keyword === "enum" && typeof data === "string") {
    const prop = e.instancePath.slice(e.instancePath.lastIndexOf("/") + 1);
    if (prop === "check") return { name: data, pool: CHECK_NAMES };
    if (prop === "rel") return { name: data, pool: REL_NAMES };
  }
  return undefined;
}

function lineOf(e: ErrorObject): string {
  const found = unknownName(e);
  const suffix = found === undefined ? "" : hint(found.name, found.pool);
  return `${describeError(e)}${suffix}`;
}

/** One line per schema problem, with the suggestions of SPEC section 6. Duplicate lines are dropped. */
export function schemaDetailLines(value: unknown): string[] {
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, discriminator: true, verbose: true });
  const validate = ajv.compile(schema);
  if (validate(value)) return [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const e of kept(validate.errors ?? [])) {
    const line = lineOf(e);
    if (!seen.has(line)) lines.push(line);
    seen.add(line);
  }
  return lines;
}
