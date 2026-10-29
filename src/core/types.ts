export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Box6 = readonly [number, number, number, number, number, number];
export type Rot = 0 | 90 | 180 | 270;

export interface Units {
  readonly name: string;
  readonly note?: string;
  readonly perMeter?: number | null;
}

/** Axes form of the camera (SPEC section 5): two ground axes and a vertical scale. */
export interface AxesCamera {
  readonly angleU: number;
  readonly angleV: number;
  readonly pxPerUnit: number;
  readonly verticalScale?: number;
  readonly origin: Vec2;
}

/** View form of the camera (SPEC section 5): an orthographic view from an elevation and a direction. */
export interface ViewCamera {
  readonly elevation: number;
  /** Degrees from +u toward +v. Default 45. */
  readonly direction?: number;
  readonly scale: number;
  readonly origin: Vec2;
}

export type Camera = AxesCamera | ViewCamera;

/** A ground position, with an optional base height (SPEC section 6). */
export type Pos = Vec2 | Vec3;

export interface Region {
  readonly id: string;
  readonly rect: readonly [number, number, number, number];
  readonly blocksScene?: boolean;
}

export interface Frame {
  readonly w: number;
  readonly h: number;
  readonly regions: readonly Region[];
}

export interface Strip {
  readonly id: string;
  readonly v: readonly [number | null, number | null];
  readonly kind?: string;
  readonly scale?: string;
}

export interface Part {
  readonly id: string;
  readonly box: Box6;
}

export interface Anchor {
  readonly id: string;
  readonly at: Vec3;
  readonly facing?: string;
  /** Side the anchor faces in type coordinates (SPEC section 6). It turns with `rot`. */
  readonly front?: "+u" | "-u" | "+v" | "-v";
  readonly kind?: string;
}

export interface ObjectType {
  readonly size: Vec3;
  readonly parts?: readonly Part[];
  readonly anchors?: readonly Anchor[];
  /** Side the type faces in type coordinates (SPEC section 6). It turns with the object's `rot`. */
  readonly front?: "+u" | "-u" | "+v" | "-v";
  readonly genHint?: string;
}

export interface SceneObject {
  readonly id: string;
  readonly type: string;
  readonly pos: Pos;
  readonly rot?: Rot;
  readonly locks?: readonly string[];
  readonly tags?: readonly string[];
}

export interface Zone {
  readonly id: string;
  readonly kind?: string;
  readonly points?: readonly Vec2[];
  /** Height of the polygon. Default 0 (SPEC section 6). */
  readonly h?: number;
}

export interface Lane {
  readonly id: string;
  readonly kind?: string;
  readonly width: number;
  readonly dir?: string;
  /** Each point is `[u, v]` or `[u, v, h]` (SPEC section 6). */
  readonly points: readonly (Vec2 | Vec3)[];
  /** Height of a point that does not give its own. Default 0. */
  readonly h?: number;
}

export interface Relation {
  readonly id: string;
  readonly rel: string;
  readonly a?: string;
  readonly b?: string;
  readonly ids?: readonly string[];
  readonly gap?: readonly [number, number];
  readonly min?: number;
  readonly axis?: string;
  readonly t?: readonly [number, number];
  /** Allowed angle of `facing`, in degrees. Default 45 (SPEC section 7). */
  readonly angle?: number;
  readonly hard?: boolean;
  readonly weight?: number;
  readonly source?: string;
}

export interface InRegionCheck {
  readonly id: string;
  readonly check: "in_region";
  readonly region: string;
  readonly strip?: string;
  readonly ids?: readonly string[];
  /** `"footprint"` (default) or `"drawn"` (SPEC 9.4). */
  readonly measure?: "footprint" | "drawn";
  /** Allowed share of the drawn box outside the region. Only with `measure: "drawn"`. Default 0. */
  readonly maxOutside?: number;
}

export interface NoOverlapCheck {
  readonly id: string;
  readonly check: "no_overlap";
  readonly ids?: readonly string[];
  readonly allow?: readonly (readonly [string, string])[];
}

export interface ClearanceCheck {
  readonly id: string;
  readonly check: "clearance";
  readonly a: string;
  readonly b: string;
  readonly min: number;
  /** Margin on the passing side of `min`, in scene units (SPEC 9.7). */
  readonly warn?: number;
}

export interface LaneClearCheck {
  readonly id: string;
  readonly check: "lane_clear";
  readonly lane: string;
  readonly ignore?: readonly string[];
  /** Clear height above the lane. Absent means no upper bound (SPEC 9.5). */
  readonly height?: number;
}

export interface LaneReachesCheck {
  readonly id: string;
  readonly check: "lane_reaches";
  readonly lane: string;
  readonly edge: "right" | "left" | "top" | "bottom";
  readonly region: string;
}

export interface LaneApartCheck {
  readonly id: string;
  readonly check: "lane_apart";
  readonly lane: string;
  /** `lane:<id>` or `zone:<id>`. */
  readonly target: string;
  /** Minimum distance. Default 0. */
  readonly min?: number;
  /** Margin on the passing side of `min`, in scene units (SPEC 9.7). */
  readonly warn?: number;
}

export interface VisibleCheck {
  readonly id: string;
  readonly check: "visible";
  readonly target: string;
  readonly from?: number;
  readonly maxOccluded: number;
  /** Margin on the passing side of `maxOccluded`, a fraction from 0 to 1 (SPEC 9.7). */
  readonly warn?: number;
}

/** A ground point: `[u, v]`, `lane:<id>` or `anchor:<object id>/<anchor id>` (SPEC section 9.2). */
export type PointRef = Vec2 | string;

export interface ReachableCheck {
  readonly id: string;
  readonly check: "reachable";
  readonly from: PointRef;
  readonly to: PointRef;
  readonly area?: string;
  readonly radius?: number;
  readonly step?: number;
  readonly ignore?: readonly string[];
  readonly max?: number;
  /** Margin on the passing side of `max`, in scene units. Requires `max` (SPEC 9.7). */
  readonly warn?: number;
  /** Walkable level. Default 0 (SPEC 9.5). */
  readonly level?: number;
  /** Clear height above `level`. Absent means no upper bound. */
  readonly height?: number;
  /** Level the path may climb to. With it, the path may cross levels (SPEC 9.8). */
  readonly toLevel?: number;
}

export interface CapacityCheck {
  readonly id: string;
  readonly check: "capacity";
  readonly kind: string;
  readonly min: number;
  /** Margin on the passing side of `min`, in anchors (SPEC 9.7). */
  readonly warn?: number;
  readonly body?: Vec2;
  readonly ids?: readonly string[];
  readonly allow?: readonly string[];
}

export interface MinScreenSizeCheck {
  readonly id: string;
  readonly check: "min_screen_size";
  readonly target: string;
  readonly min: number;
  /** Margin on the passing side of `min`, in pixels (SPEC 9.7). */
  readonly warn?: number;
  readonly screenWidth?: number;
  /** `"bounds"` (default) or `"height"` (SPEC 9.4). */
  readonly measure?: "bounds" | "height";
}

export interface SortConsistencyCheck {
  readonly id: string;
  readonly check: "sort_consistency";
  readonly actor: Vec3;
  readonly step?: number;
  readonly reach?: number;
  readonly maxPixels?: number;
  readonly area?: string;
  readonly ids?: readonly string[];
  /** Height the test actor stands on. Default 0 (SPEC 9.5). */
  readonly level?: number;
}

/** Share of an object's own pixels that stay visible in a frame region (SPEC 9.6). */
export interface VisibleShareCheck {
  readonly id: string;
  readonly check: "visible_share";
  /** Object ids. Exactly one of `ids` and `tag` is set. */
  readonly ids?: readonly string[];
  /** A tag. Exactly one of `ids` and `tag` is set. */
  readonly tag?: string;
  /** Frame region. Absent means the whole raster. */
  readonly region?: string;
  /** Minimum share, from 0 to 1. */
  readonly min: number;
  /** Margin on the passing side of `min`, a share from 0 to 1 (SPEC 9.7). */
  readonly warn?: number;
}

/** What one state hides (SPEC section 6). */
export interface SceneState {
  readonly hide?: readonly string[];
  /** Object id to the part ids it hides. */
  readonly hideParts?: Readonly<Record<string, readonly string[]>>;
  readonly hideRegions?: readonly string[];
}

export type ImplementedCheck =
  | InRegionCheck
  | NoOverlapCheck
  | ClearanceCheck
  | LaneClearCheck
  | LaneReachesCheck
  | LaneApartCheck
  | VisibleCheck
  | ReachableCheck
  | CapacityCheck
  | MinScreenSizeCheck
  | SortConsistencyCheck
  | VisibleShareCheck;

/** A check from the catalog that the current stage does not evaluate. */
export interface OtherCheck {
  readonly id: string;
  readonly check: string;
}

export type CheckSpec = ImplementedCheck | OtherCheck;

export interface Assumption {
  readonly path: string;
  readonly value: unknown;
  readonly note?: string;
  readonly origin?: string;
  readonly owner?: string;
}

export interface Meta {
  readonly version?: number;
  readonly status?: string;
  readonly approvedBy?: string | null;
  readonly approvedAt?: string | null;
}

export interface Scene {
  readonly schema: string;
  readonly id: string;
  readonly units: Units;
  readonly camera: Camera;
  readonly frame: Frame;
  readonly strips?: readonly Strip[];
  readonly types: Readonly<Record<string, ObjectType>>;
  readonly objects: readonly SceneObject[];
  readonly zones?: readonly Zone[];
  readonly lanes?: readonly Lane[];
  readonly relations?: readonly Relation[];
  readonly checks?: readonly CheckSpec[];
  readonly states?: Readonly<Record<string, SceneState>>;
  readonly assumptions?: readonly Assumption[];
  readonly meta?: Meta;
  /** Parts hidden in the state being evaluated, by object id. Not stored in the file. */
  readonly hiddenParts?: Readonly<Record<string, readonly string[]>>;
  /** Frame regions hidden in the state being evaluated. Not stored in the file. */
  readonly hiddenRegions?: readonly string[];
  /** Name of the state being evaluated, for messages. Not stored in the file. */
  readonly activeState?: string;
}

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface CheckResult {
  readonly id: string;
  readonly check: string;
  readonly status: CheckStatus;
  readonly value: number | null;
  readonly threshold: number | readonly [number, number] | null;
  readonly ids: readonly string[];
  readonly pairs?: readonly (readonly [string, string])[];
  readonly occluders?: readonly string[];
  /** `capacity`: labels `<object id>/<anchor id>` of the usable and of the blocked anchors. */
  readonly accepted?: readonly string[];
  readonly rejected?: readonly string[];
  /** `sort_consistency`: the largest area (px squared, 2 decimals) drawn in the wrong order, and the number of actor positions used. */
  readonly worst?: number;
  readonly positions?: number;
  /** `in_region` with `measure: "drawn"`: share of each failing object's drawn box that lies outside the region. */
  readonly outside?: readonly number[];
  /** `lane_apart`: area of the overlap between the lane and its target. Absent when the check is skipped. */
  readonly overlap?: number;
  /** `visible_share`: the share of each failing object, or of each object in the margin when the status is `warn`, in the order of `ids`. Absent when the check is skipped. */
  readonly shares?: readonly number[];
  readonly message: string;
}
