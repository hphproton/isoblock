import type { DisplayItem, DisplayLabel, DisplayList, DisplayPolygon } from "../core/displayList";

function num(x: number): string {
  return String(Number(x.toFixed(2)));
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function polygonElement(p: DisplayPolygon): string {
  const points = p.points.map(([x, y]) => `${num(x)},${num(y)}`).join(" ");
  const opacity = p.opacity === 1 ? "" : ` opacity="${num(p.opacity)}"`;
  const dash = p.dashed ? ' stroke-dasharray="6 4"' : "";
  return (
    `<polygon data-layer="${p.layer}" data-ref="${esc(p.ref)}" points="${points}" fill="${esc(p.fill)}" ` +
    `stroke="${esc(p.stroke)}" stroke-width="${num(p.strokeWidth)}" stroke-linejoin="round"${opacity}${dash}/>`
  );
}

function labelElement(l: DisplayLabel): string {
  const anchor = l.align;
  const size = l.target === "object" ? 12 : 11;
  return (
    `<text data-layer="label" data-ref="${esc(l.ref)}" x="${num(l.x)}" y="${num(l.y)}" font-size="${size}" ` +
    `text-anchor="${anchor}" fill="#222222" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(l.text)}</text>`
  );
}

function element(item: DisplayItem): string {
  return item.kind === "polygon" ? polygonElement(item) : labelElement(item);
}

/** Write a display list as one standalone SVG document. */
export function toSvg(list: DisplayList): string {
  const { width, height } = list;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}">`,
    `<defs><clipPath id="frame"><rect width="${num(width)}" height="${num(height)}"/></clipPath></defs>`,
    `<g clip-path="url(#frame)" font-family="sans-serif">`,
    ...list.items.map(element),
    "</g>",
    "</svg>",
    "",
  ].join("\n");
}
