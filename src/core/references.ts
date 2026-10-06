import { resolvePointer } from "./pointer";
import type { CheckSpec, Scene } from "./types";

function duplicates(label: string, ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) out.push(`duplicate ${label} id "${id}"`);
    seen.add(id);
  }
  return out;
}

interface Names {
  readonly objects: ReadonlySet<string>;
  readonly zones: ReadonlySet<string>;
  readonly lanes: ReadonlySet<string>;
  readonly strips: ReadonlySet<string>;
  readonly regions: ReadonlySet<string>;
}

function namesOf(scene: Scene): Names {
  return {
    objects: new Set(scene.objects.map((o) => o.id)),
    zones: new Set((scene.zones ?? []).map((z) => z.id)),
    lanes: new Set((scene.lanes ?? []).map((l) => l.id)),
    strips: new Set((scene.strips ?? []).map((s) => s.id)),
    regions: new Set(scene.frame.regions.map((r) => r.id)),
  };
}

/** A relation target: object id, `zone:<id>`, `lane:<id>` or `strip:<id>.v0|v1`. */
function targetExists(names: Names, target: string): boolean {
  if (target.startsWith("zone:")) return names.zones.has(target.slice(5));
  if (target.startsWith("lane:")) return names.lanes.has(target.slice(5));
  const edge = /^strip:(.+)\.v[01]$/.exec(target);
  if (edge) return names.strips.has(edge[1] as string);
  return names.objects.has(target);
}

function relationErrors(scene: Scene, names: Names): string[] {
  const out: string[] = [];
  for (const r of scene.relations ?? []) {
    const targets = [r.a, r.b, ...(r.ids ?? [])].filter((t): t is string => t !== undefined);
    for (const t of targets) {
      if (!targetExists(names, t)) out.push(`relation "${r.id}" refers to unknown target "${t}"`);
    }
  }
  return out;
}

function need(set: ReadonlySet<string>, kind: string, id: string, owner: string): string[] {
  return set.has(id) ? [] : [`${owner} refers to unknown ${kind} "${id}"`];
}

function checkErrors(check: CheckSpec, names: Names): string[] {
  const owner = `check "${check.id}"`;
  const objects = (ids: readonly string[] | undefined) =>
    (ids ?? []).flatMap((id) => need(names.objects, "object", id, owner));
  switch (check.check) {
    case "in_region": {
      const c = check as Extract<CheckSpec, { check: "in_region" }>;
      return [
        ...need(names.regions, "region", c.region, owner),
        ...(c.strip === undefined ? [] : need(names.strips, "strip", c.strip, owner)),
        ...objects(c.ids),
      ];
    }
    case "no_overlap": {
      const c = check as Extract<CheckSpec, { check: "no_overlap" }>;
      return [...objects(c.ids), ...objects((c.allow ?? []).flat())];
    }
    case "clearance": {
      const c = check as Extract<CheckSpec, { check: "clearance" }>;
      return objects([c.a, c.b]);
    }
    case "lane_clear": {
      const c = check as Extract<CheckSpec, { check: "lane_clear" }>;
      return [...need(names.lanes, "lane", c.lane, owner), ...objects(c.ignore)];
    }
    case "lane_reaches": {
      const c = check as Extract<CheckSpec, { check: "lane_reaches" }>;
      return [...need(names.lanes, "lane", c.lane, owner), ...need(names.regions, "region", c.region, owner)];
    }
    case "visible": {
      const c = check as Extract<CheckSpec, { check: "visible" }>;
      return objects([c.target]);
    }
    default:
      return [];
  }
}

/** Reference checks of SPEC section 6. Returns one message per problem. */
export function referenceErrors(scene: Scene): string[] {
  const names = namesOf(scene);
  const out: string[] = [
    ...duplicates("region", scene.frame.regions.map((r) => r.id)),
    ...duplicates("strip", (scene.strips ?? []).map((s) => s.id)),
    ...duplicates("object", scene.objects.map((o) => o.id)),
    ...duplicates("zone", (scene.zones ?? []).map((z) => z.id)),
    ...duplicates("lane", (scene.lanes ?? []).map((l) => l.id)),
    ...duplicates("relation", (scene.relations ?? []).map((r) => r.id)),
    ...duplicates("check", (scene.checks ?? []).map((c) => c.id)),
  ];
  for (const [name, type] of Object.entries(scene.types)) {
    out.push(...duplicates(`part of type "${name}"`, (type.parts ?? []).map((p) => p.id)));
    out.push(...duplicates(`anchor of type "${name}"`, (type.anchors ?? []).map((a) => a.id)));
  }
  for (const o of scene.objects) {
    if (!Object.hasOwn(scene.types, o.type)) out.push(`object "${o.id}" uses unknown type "${o.type}"`);
  }
  out.push(...relationErrors(scene, names));
  for (const c of scene.checks ?? []) out.push(...checkErrors(c, names));
  for (const [state, def] of Object.entries(scene.states ?? {})) {
    for (const id of def.hide ?? []) {
      if (!names.objects.has(id)) out.push(`state "${state}" hides unknown object "${id}"`);
    }
  }
  for (const a of scene.assumptions ?? []) {
    if (!resolvePointer(scene, a.path).found) out.push(`assumption path "${a.path}" does not resolve in the scene`);
  }
  return out;
}
