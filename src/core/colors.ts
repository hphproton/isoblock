/** Stable 32-bit string hash (FNV-1a). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface FaceColors {
  readonly top: string;
  readonly sideU: string;
  readonly sideV: string;
  readonly edge: string;
}

/** Shades of one hue derived from the type name, so equal types look alike. */
export function typeColors(typeName: string): FaceColors {
  const hue = hash(typeName) % 360;
  return {
    top: `hsl(${hue}, 45%, 76%)`,
    sideU: `hsl(${hue}, 45%, 62%)`,
    sideV: `hsl(${hue}, 45%, 50%)`,
    edge: `hsl(${hue}, 40%, 28%)`,
  };
}

/** The side shade of `typeColors` as red, green and blue, 0 to 255, for a raster tint. */
export function typeRgb(typeName: string): readonly [number, number, number] {
  return hslToRgb(hash(typeName) % 360, 0.45, 0.62);
}

function hslToRgb(h: number, s: number, l: number): readonly [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const rgb = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return rgb.map((channel) => Math.round((channel + m) * 255)) as [number, number, number];
}

const STRIP_FILL: Readonly<Record<string, string>> = { decor: "#ddd5ea", walkable: "#d5e8d0" };
const LANE_FILL: Readonly<Record<string, string>> = { walk: "#f6b26b", vehicle: "#6fa8dc" };

export function stripColor(kind: string | undefined): string {
  return (kind !== undefined && STRIP_FILL[kind]) || "#e4e4e4";
}

export function laneColor(kind: string | undefined): string {
  return (kind !== undefined && LANE_FILL[kind]) || "#b7b7b7";
}

export function zoneColor(kind: string | undefined): string {
  return `hsl(${hash(kind ?? "zone") % 360}, 50%, 70%)`;
}
