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
