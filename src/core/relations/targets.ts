import { parseAnchorRef } from "../checks/points";
import type { Anchor, Lane, Scene, Strip, Zone } from "../types";

/** A relation target after resolution (SPEC section 6): object, zone, lane, strip edge or, for `facing`, an anchor. */
export type Target =
  | { readonly kind: "object"; readonly name: string; readonly index: number }
  | { readonly kind: "zone"; readonly name: string; readonly zone: Zone }
  | { readonly kind: "lane"; readonly name: string; readonly lane: Lane }
  | { readonly kind: "strip"; readonly name: string; readonly strip: Strip; readonly bound: number | null }
  | { readonly kind: "anchor"; readonly name: string; readonly index: number; readonly anchor: Anchor }
  | { readonly kind: "none"; readonly name: string };

/** Resolve a target name of a valid scene. An absent name is `none`. */
export function resolveTarget(scene: Scene, name: string | undefined): Target {
  if (name === undefined) return { kind: "none", name: "" };
  if (name.startsWith("anchor:")) {
    const found = parseAnchorRef(scene, name);
    if (found === null) return { kind: "none", name };
    return { kind: "anchor", name, index: scene.objects.indexOf(found.object), anchor: found.anchor };
  }
  if (name.startsWith("zone:")) {
    const zone = (scene.zones ?? []).find((z) => z.id === name.slice(5));
    if (zone) return { kind: "zone", name, zone };
  } else if (name.startsWith("lane:")) {
    const lane = (scene.lanes ?? []).find((l) => l.id === name.slice(5));
    if (lane) return { kind: "lane", name, lane };
  } else {
    const edge = /^strip:(.+)\.v([01])$/.exec(name);
    const strip = edge ? (scene.strips ?? []).find((s) => s.id === edge[1]) : undefined;
    if (edge && strip) return { kind: "strip", name, strip, bound: strip.v[Number(edge[2])] ?? null };
  }
  const index = scene.objects.findIndex((o) => o.id === name);
  return index < 0 ? { kind: "none", name } : { kind: "object", name, index };
}

/** What a target is called in a skip message: `object p1`, `zone:z1`, `nothing`. */
export function targetLabel(t: Target): string {
  if (t.kind === "object") return `object ${t.name}`;
  return t.kind === "none" && t.name === "" ? "nothing" : t.name;
}

const KIND_NAMES: Readonly<Record<Target["kind"], string>> = {
  object: "an object",
  zone: "a zone",
  lane: "a lane",
  strip: "a strip edge",
  anchor: "an anchor",
  none: "nothing",
};

/** Skip reason for a target of the wrong kind: `b must be an object or a lane, not zone:z1`. */
export function wrongTarget(role: "a" | "b", kinds: readonly Target["kind"][], target: Target): string {
  return `${role} must be ${kinds.map((k) => KIND_NAMES[k]).join(" or ")}, not ${targetLabel(target)}`;
}
