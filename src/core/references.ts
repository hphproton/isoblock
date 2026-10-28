import { laneRefId, parseAnchorRef } from "./checks/points";
import { resolvePointer } from "./pointer";
import { partNames } from "./states";
import { hint } from "./suggest";
import type { CheckSpec, PointRef, Scene } from "./types";

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

function relationErrors(scene: Scene, names: Names, pools: Pools): string[] {
  const out: string[] = [];
  for (const r of scene.relations ?? []) {
    const targets = [r.a, r.b, ...(r.ids ?? [])].filter((t): t is string => t !== undefined);
    for (const t of targets) {
      if (!targetExists(names, t)) out.push(`relation "${r.id}" refers to unknown target "${t}"${hint(t, pools.target)}`);
    }
  }
  return out;
}

interface Pools {
  readonly object: readonly string[];
  readonly region: readonly string[];
  readonly strip: readonly string[];
  readonly zone: readonly string[];
  readonly lane: readonly string[];
  /** Object ids, then `zone:`, `lane:` and `strip:` targets, in file order (SPEC section 6). */
  readonly target: readonly string[];
  readonly type: readonly string[];
}

function poolsOf(scene: Scene): Pools {
  const object = scene.objects.map((o) => o.id);
  const region = scene.frame.regions.map((r) => r.id);
  const strip = (scene.strips ?? []).map((s) => s.id);
  const zone = (scene.zones ?? []).map((z) => z.id);
  const lane = (scene.lanes ?? []).map((l) => l.id);
  return {
    object, region, strip, zone, lane, type: Object.keys(scene.types),
    target: [
      ...object,
      ...zone.map((id) => `zone:${id}`),
      ...lane.map((id) => `lane:${id}`),
      ...strip.flatMap((id) => [`strip:${id}.v0`, `strip:${id}.v1`]),
    ],
  };
}

function need(set: ReadonlySet<string>, pool: readonly string[], kind: string, id: string, owner: string): string[] {
  return set.has(id) ? [] : [`${owner} refers to unknown ${kind} "${id}"${hint(id, pool)}`];
}

/** A point parameter: a `[u, v]` point, `lane:<id>` or `anchor:<object id>/<anchor id>` (SPEC section 9.2). */
function pointErrors(scene: Scene, names: Names, pools: Pools, ref: PointRef, owner: string): string[] {
  const lane = laneRefId(ref);
  if (lane !== null) return need(names.lanes, pools.lane, "lane", lane, owner);
  if (typeof ref === "string" && parseAnchorRef(scene, ref) === null) return [`${owner} refers to unknown anchor "${ref}"`];
  return [];
}

function checkErrors(scene: Scene, check: CheckSpec, names: Names, pools: Pools): string[] {
  const owner = `check "${check.id}"`;
  const objects = (ids: readonly string[] | undefined) =>
    (ids ?? []).flatMap((id) => need(names.objects, pools.object, "object", id, owner));
  switch (check.check) {
    case "in_region": {
      const c = check as Extract<CheckSpec, { check: "in_region" }>;
      return [
        ...need(names.regions, pools.region, "region", c.region, owner),
        ...(c.strip === undefined ? [] : need(names.strips, pools.strip, "strip", c.strip, owner)),
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
      return [...need(names.lanes, pools.lane, "lane", c.lane, owner), ...objects(c.ignore)];
    }
    case "lane_reaches": {
      const c = check as Extract<CheckSpec, { check: "lane_reaches" }>;
      return [...need(names.lanes, pools.lane, "lane", c.lane, owner), ...need(names.regions, pools.region, "region", c.region, owner)];
    }
    case "lane_apart": {
      const c = check as Extract<CheckSpec, { check: "lane_apart" }>;
      const zone = c.target.startsWith("zone:");
      const id = c.target.slice(5);
      return [
        ...need(names.lanes, pools.lane, "lane", c.lane, owner),
        ...need(zone ? names.zones : names.lanes, zone ? pools.zone : pools.lane, zone ? "zone" : "lane", id, owner),
      ];
    }
    case "visible": {
      const c = check as Extract<CheckSpec, { check: "visible" }>;
      return objects([c.target]);
    }
    case "reachable": {
      const c = check as Extract<CheckSpec, { check: "reachable" }>;
      return [
        ...pointErrors(scene, names, pools, c.from, owner),
        ...pointErrors(scene, names, pools, c.to, owner),
        ...(c.area === undefined ? [] : need(names.zones, pools.zone, "zone", c.area, owner)),
        ...objects(c.ignore),
      ];
    }
    case "capacity": {
      const c = check as Extract<CheckSpec, { check: "capacity" }>;
      return [...objects(c.ids), ...objects(c.allow)];
    }
    case "min_screen_size": {
      const c = check as Extract<CheckSpec, { check: "min_screen_size" }>;
      return objects([c.target]);
    }
    case "sort_consistency": {
      const c = check as Extract<CheckSpec, { check: "sort_consistency" }>;
      return [...(c.area === undefined ? [] : need(names.zones, pools.zone, "zone", c.area, owner)), ...objects(c.ids)];
    }
    case "visible_share": {
      const c = check as Extract<CheckSpec, { check: "visible_share" }>;
      return [
        ...(c.region === undefined ? [] : need(names.regions, pools.region, "region", c.region, owner)),
        ...objects(c.ids),
      ];
    }
    default:
      return [];
  }
}

/** Reference checks of SPEC section 6. Returns one message per problem. */
export function referenceErrors(scene: Scene): string[] {
  const names = namesOf(scene);
  const pools = poolsOf(scene);
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
    if (!Object.hasOwn(scene.types, o.type)) {
      out.push(`object "${o.id}" uses unknown type "${o.type}"${hint(o.type, pools.type)}`);
    }
  }
  out.push(...relationErrors(scene, names, pools));
  for (const c of scene.checks ?? []) out.push(...checkErrors(scene, c, names, pools));
  for (const [state, def] of Object.entries(scene.states ?? {})) {
    for (const id of def.hide ?? []) {
      if (!names.objects.has(id)) out.push(`state "${state}" hides unknown object "${id}"${hint(id, pools.object)}`);
    }
    for (const [id, parts] of Object.entries(def.hideParts ?? {})) {
      if (!names.objects.has(id)) {
        out.push(`state "${state}" hides parts of unknown object "${id}"${hint(id, pools.object)}`);
        continue;
      }
      const object = scene.objects.find((item) => item.id === id);
      const known = object === undefined ? [] : partNames(scene, object);
      for (const part of parts) {
        if (!known.includes(part)) out.push(`state "${state}" hides unknown part "${part}" of "${id}"${hint(part, known)}`);
      }
    }
    for (const id of def.hideRegions ?? []) {
      if (!names.regions.has(id)) out.push(`state "${state}" hides unknown region "${id}"${hint(id, pools.region)}`);
    }
  }
  for (const a of scene.assumptions ?? []) {
    if (!resolvePointer(scene, a.path).found) out.push(`assumption path "${a.path}" does not resolve in the scene`);
  }
  return out;
}
