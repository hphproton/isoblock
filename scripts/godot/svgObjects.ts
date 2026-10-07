/** An object polygon of the SVG written by `isoblock render`: `data-layer="object"`. */
export interface ObjectPolygon {
  readonly ref: string;
  readonly points: readonly (readonly [number, number])[];
}

function unescapeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/** The object polygons of an SVG, in document order (the painter's order of SPEC 13.4). */
export function objectPolygons(svg: string): ObjectPolygon[] {
  const out: ObjectPolygon[] = [];
  for (const m of svg.matchAll(/<polygon data-layer="object" data-ref="([^"]*)" points="([^"]*)"/g)) {
    const points = (m[2] as string)
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number) as [number, number]);
    out.push({ ref: unescapeXml(m[1] as string), points });
  }
  return out;
}
