import Ajv, { type ErrorObject } from "ajv";
import schema from "../../schema/isoblock-1.json";
import { IsoblockError } from "./errors";
import { referenceErrors } from "./references";
import type { Scene } from "./types";

const MAX_DETAILS = 20;

function describeError(e: ErrorObject): string {
  const where = e.instancePath === "" ? "/" : e.instancePath;
  if (e.keyword === "const") return `${where}: must be ${JSON.stringify(e.params.allowedValue)}`;
  if (e.keyword === "enum") return `${where}: must be one of ${(e.params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ")}`;
  const extra = typeof e.params.additionalProperty === "string" ? `: "${e.params.additionalProperty}"` : "";
  return `${where}: ${e.message ?? "invalid"}${extra}`;
}

function capped(lines: readonly string[]): string[] {
  if (lines.length <= MAX_DETAILS) return [...lines];
  return [...lines.slice(0, MAX_DETAILS), `... and ${lines.length - MAX_DETAILS} more`];
}

function schemaErrors(value: unknown): string[] {
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, discriminator: true });
  const validate = ajv.compile(schema);
  if (validate(value)) return [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const e of validate.errors ?? []) {
    const line = describeError(e);
    if (!seen.has(line)) lines.push(line);
    seen.add(line);
  }
  return lines;
}

function degenerateCamera(scene: Scene): boolean {
  const diff = (scene.camera.angleU - scene.camera.angleV) % 180;
  return Math.abs(diff) < 1e-9 || Math.abs(Math.abs(diff) - 180) < 1e-9;
}

/** Schema and reference validation (SPEC section 6). Throws `E_SCHEMA` or `E_REF`. */
export function validateScene(value: unknown): Scene {
  const problems = schemaErrors(value);
  if (problems.length > 0) {
    throw new IsoblockError("E_SCHEMA", `scene does not match schema isoblock/1 (${problems.length} problems)`, capped(problems));
  }
  const scene = value as Scene;
  if (degenerateCamera(scene)) {
    throw new IsoblockError("E_SCHEMA", "scene does not match schema isoblock/1 (1 problem)", [
      "/camera: angleU and angleV must differ, otherwise the ground axes are parallel",
    ]);
  }
  const refs = referenceErrors(scene);
  if (refs.length > 0) {
    throw new IsoblockError("E_REF", `scene has unresolved references (${refs.length} problems)`, capped(refs));
  }
  return scene;
}

/** Parse JSON text, then validate. Throws `E_JSON_PARSE`, `E_SCHEMA` or `E_REF`. */
export function parseScene(text: string): Scene {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new IsoblockError("E_JSON_PARSE", `malformed JSON: ${(e as Error).message}`);
  }
  return validateScene(value);
}
