import { footprint, rotationOf, worldParts, worldPoint } from "../geometry";
import { orderDirection } from "../projection";
import { round } from "../round";
import type { Scene, SceneObject } from "../types";
import { partOrders } from "./partOrder";

export interface RuntimePart {
  readonly id: string;
  /** `[u0, v0, h0, u1, v1, h1]` in world units after rotation. */
  readonly box: readonly number[];
  /** Position in the painter's order of SPEC 13.4; 0 is drawn first. */
  readonly order: number;
}

export interface RuntimeAnchor {
  readonly id: string;
  readonly at: readonly number[];
  readonly facing?: string;
  readonly kind?: string;
}

export interface RuntimeObject {
  readonly id: string;
  readonly type: string;
  readonly pos: readonly number[];
  readonly rot: number;
  /** `[u0, v0, u1, v1]` after rotation. */
  readonly footprint: readonly number[];
  readonly tags: readonly string[];
  readonly parts: readonly RuntimePart[];
  readonly anchors: readonly RuntimeAnchor[];
}

/** The runtime file `isoblock-runtime/1` (SPEC 13.7). */
export interface RuntimeFile {
  readonly schema: "isoblock-runtime/1";
  readonly scene: string;
  readonly meta: { readonly version: number | null; readonly status: string | null };
  readonly units: Readonly<Record<string, unknown>>;
  readonly camera: {
    readonly angleU: number;
    readonly angleV: number;
    readonly pxPerUnit: number;
    readonly verticalScale: number;
    readonly origin: readonly number[];
  };
  readonly cameraDir: readonly number[];
  readonly frame: {
    readonly w: number;
    readonly h: number;
    readonly regions: readonly { readonly id: string; readonly rect: readonly number[]; readonly blocksScene: boolean }[];
  };
  readonly strips: readonly Readonly<Record<string, unknown>>[];
  readonly objects: readonly RuntimeObject[];
  readonly zones: readonly Readonly<Record<string, unknown>>[];
  readonly lanes: readonly Readonly<Record<string, unknown>>[];
}

const DECIMALS = 6;

/** A copy of an entry of the scene file without its `x-` extension keys, in file order. */
function plain<T extends object>(entry: T): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith("x-")));
}

function runtimeObject(scene: Scene, object: SceneObject, orders: readonly number[]): RuntimeObject {
  const f = footprint(scene, object);
  const parts = worldParts(scene, object).map((part, k) => {
    const b = part.box;
    return {
      id: part.id,
      box: [b.u0, b.v0, b.h0, b.u1, b.v1, b.h1].map((x) => round(x, DECIMALS)),
      order: orders[k] as number,
    };
  });
  const anchors = (scene.types[object.type]?.anchors ?? []).map((anchor) => {
    const [u, v] = worldPoint(scene, object, anchor.at[0], anchor.at[1]);
    return {
      id: anchor.id,
      at: [u, v, anchor.at[2]].map((x) => round(x, DECIMALS)),
      ...(anchor.facing === undefined ? {} : { facing: anchor.facing }),
      ...(anchor.kind === undefined ? {} : { kind: anchor.kind }),
    };
  });
  return {
    id: object.id,
    type: object.type,
    pos: object.pos,
    rot: rotationOf(object),
    footprint: [f.u0, f.v0, f.u1, f.v1].map((x) => round(x, DECIMALS)),
    tags: object.tags ?? [],
    parts,
    anchors,
  };
}

/** The reduced copy of a scene that an engine adapter loads (SPEC 13.7). */
export function runtimeFile(scene: Scene): RuntimeFile {
  const camera = scene.camera;
  const orders = partOrders(scene);
  return {
    schema: "isoblock-runtime/1",
    scene: scene.id,
    meta: { version: scene.meta?.version ?? null, status: scene.meta?.status ?? null },
    units: plain(scene.units),
    camera: {
      angleU: camera.angleU,
      angleV: camera.angleV,
      pxPerUnit: camera.pxPerUnit,
      verticalScale: camera.verticalScale ?? 1,
      origin: camera.origin,
    },
    cameraDir: orderDirection(camera),
    frame: {
      w: scene.frame.w,
      h: scene.frame.h,
      regions: scene.frame.regions.map((r) => ({ id: r.id, rect: r.rect, blocksScene: r.blocksScene ?? false })),
    },
    strips: (scene.strips ?? []).map(plain),
    objects: scene.objects.map((object, i) => runtimeObject(scene, object, orders[i] as readonly number[])),
    zones: (scene.zones ?? []).map(plain),
    lanes: (scene.lanes ?? []).map(plain),
  };
}
