export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Box6 = readonly [number, number, number, number, number, number];
export type Rot = 0 | 90 | 180 | 270;

export interface Units {
  readonly name: string;
  readonly note?: string;
  readonly perMeter?: number | null;
}

export interface Camera {
  readonly angleU: number;
  readonly angleV: number;
  readonly pxPerUnit: number;
  readonly verticalScale?: number;
  readonly origin: Vec2;
}

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
  readonly kind?: string;
}

export interface ObjectType {
  readonly size: Vec3;
  readonly parts?: readonly Part[];
  readonly anchors?: readonly Anchor[];
  readonly genHint?: string;
}

export interface SceneObject {
  readonly id: string;
  readonly type: string;
  readonly pos: Vec2;
  readonly rot?: Rot;
  readonly locks?: readonly string[];
  readonly tags?: readonly string[];
}

export interface Zone {
  readonly id: string;
  readonly kind?: string;
  readonly points?: readonly Vec2[];
}

export interface Lane {
  readonly id: string;
  readonly kind?: string;
  readonly width: number;
  readonly dir?: string;
  readonly points: readonly Vec2[];
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
}

export interface LaneClearCheck {
  readonly id: string;
  readonly check: "lane_clear";
  readonly lane: string;
  readonly ignore?: readonly string[];
}

export interface LaneReachesCheck {
  readonly id: string;
  readonly check: "lane_reaches";
  readonly lane: string;
  readonly edge: "right" | "left" | "top" | "bottom";
  readonly region: string;
}

export interface VisibleCheck {
  readonly id: string;
  readonly check: "visible";
  readonly target: string;
  readonly from?: number;
  readonly maxOccluded: number;
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
}

export interface CapacityCheck {
  readonly id: string;
  readonly check: "capacity";
  readonly kind: string;
  readonly min: number;
  readonly body?: Vec2;
  readonly ids?: readonly string[];
  readonly allow?: readonly string[];
}

export interface MinScreenSizeCheck {
  readonly id: string;
  readonly check: "min_screen_size";
  readonly target: string;
  readonly min: number;
  readonly screenWidth?: number;
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
}

export type ImplementedCheck =
  | InRegionCheck
  | NoOverlapCheck
  | ClearanceCheck
  | LaneClearCheck
  | LaneReachesCheck
  | VisibleCheck
  | ReachableCheck
  | CapacityCheck
  | MinScreenSizeCheck
  | SortConsistencyCheck;

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
  readonly states?: Readonly<Record<string, { readonly hide?: readonly string[] }>>;
  readonly assumptions?: readonly Assumption[];
  readonly meta?: Meta;
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
  readonly message: string;
}
