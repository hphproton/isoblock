import { footprint, rotationOf, worldParts, worldPoint, type Box, type Rect } from "../geometry";
import { orderDirection } from "../projection";
import { round } from "../round";
import { sceneSprites, type Sprite } from "../sort/sprites";
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

/** One piece of a sprite: a part id and the piece's box `[u0, v0, h0, u1, v1, h1]` in world units. */
export interface RuntimePiece {
  readonly part: string;
  readonly box: readonly number[];
}

/** A sprite (SPEC 13.4): its sort key, its footprint `[u0, v0, u1, v1]` and its pieces in drawing order. */
export interface RuntimeSprite {
  readonly key: number;
  readonly footprint: readonly number[];
  readonly pieces: readonly RuntimePiece[];
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
  readonly sprites: readonly RuntimeSprite[];
}

/** The runtime file `isoblock-runtime/2` (SPEC 13.7). */
export interface RuntimeFile {
  readonly schema: "isoblock-runtime/2";
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
  readonly states: Readonly<Record<string, { readonly hide: readonly string[] }>>;
}

const DECIMALS = 6;

/** A copy of an entry of the scene file without its `x-` extension keys, in file order. */
function plain<T extends object>(entry: T): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith("x-")));
}

const rectArray = (r: Rect): number[] => [r.u0, r.v0, r.u1, r.v1].map((x) => round(x, DECIMALS));
const boxArray = (b: Box): number[] => [b.u0, b.v0, b.h0, b.u1, b.v1, b.h1].map((x) => round(x, DECIMALS));

/** A sprite as the runtime file writes it (SPEC 13.7). */
export function runtimeSprite(sprite: Sprite): RuntimeSprite {
  return {
    key: round(sprite.key, DECIMALS),
    footprint: rectArray(sprite.footprint),
    pieces: sprite.pieces.map((p) => ({ part: p.part, box: boxArray(p.box) })),
  };
}

function runtimeObject(scene: Scene, object: SceneObject, orders: readonly number[], sprites: readonly Sprite[]): RuntimeObject {
  const f = footprint(scene, object);
  const parts = worldParts(scene, object).map((part, k) => {
    return { id: part.id, box: boxArray(part.box), order: orders[k] as number };
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
    footprint: rectArray(f),
    tags: object.tags ?? [],
    parts,
    anchors,
    sprites: sprites.map(runtimeSprite),
  };
}

/** The reduced copy of a scene that an engine adapter loads (SPEC 13.7). */
export function runtimeFile(scene: Scene): RuntimeFile {
  const camera = scene.camera;
  const orders = partOrders(scene);
  const sprites = sceneSprites(scene);
  return {
    schema: "isoblock-runtime/2",
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
    objects: scene.objects.map((object, i) => runtimeObject(scene, object, orders[i] as readonly number[], sprites[i] as readonly Sprite[])),
    zones: (scene.zones ?? []).map(plain),
    lanes: (scene.lanes ?? []).map(plain),
    states: Object.fromEntries(Object.entries(scene.states ?? {}).map(([name, state]) => [name, { hide: [...(state.hide ?? [])] }])),
  };
}
