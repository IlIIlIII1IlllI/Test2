// Converts SVG <text> numeric labels into single-line <path> strokes.
// Tuned for paint-by-numbers labels 0–50 (multi-digit): tighter spacing for 2-digit.

import { strokeTextToPath } from "./strokeFont";

export interface SingleLineLabelOptions {
  strokeWidth?: number;          // SVG user units
  strokeColor?: string;          // optional override
  preserveOriginalColor?: boolean;
  letterSpacing?: number;        // font units
}

function numAttr(el: Element, name: string, fallback: number): number {
  const v = el.getAttribute(name);
  if (v == null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Replace all <text> elements that contain only digits with single-line <path>.
 */
export function convertSvgTextToSingleLine(svgMarkup: string, options: SingleLineLabelOptions = {}): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svgEl = doc.documentElement;

  const texts = Array.from(svgEl.getElementsByTagName("text"));

  for (const t of texts) {
    const label = (t.textContent ?? "").trim();
    if (!label) continue;
    if (!/^\d+$/.test(label)) continue;

    const x = numAttr(t, "x", 0);
    const y = numAttr(t, "y", 0);

    const fontSize = numAttr(t, "font-size", 12);
    const fill = t.getAttribute("fill") || "black";

    // default: tighter spacing for 2+ digits, looser for 1 digit
    const defaultSpacing = label.length > 1 ? 1 : 2;
    const letterSpacing = options.letterSpacing ?? defaultSpacing;

    const { d, width, height } = strokeTextToPath(label, letterSpacing);
    if (!d) continue;

    // Scale so that glyph height equals fontSize.
    const scale = fontSize / height;

    // Keep horizontal alignment similar to <text>.
    const anchor = (t.getAttribute("text-anchor") || "start").toLowerCase();
    let xOffset = 0;
    const scaledW = width * scale;
    if (anchor === "middle") xOffset = -scaledW / 2;
    else if (anchor === "end") xOffset = -scaledW;

    // Approximate vertical baseline.
    const dominant = (t.getAttribute("dominant-baseline") || "").toLowerCase();
    let yOffset = 0;
    const scaledH = height * scale;
    if (dominant.includes("middle") || dominant.includes("central")) yOffset = -scaledH / 2;
    else yOffset = -scaledH * 0.8;

    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");

    const stroke = (options.preserveOriginalColor ?? true) ? fill : (options.strokeColor || fill);
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(options.strokeWidth ?? 0.4));

    // Keep stroke width constant even when scaled.
    path.setAttribute("vector-effect", "non-scaling-stroke");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");

    path.setAttribute("transform", `translate(${x + xOffset},${y + yOffset}) scale(${scale})`);

    t.parentNode?.replaceChild(path, t);
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgEl);
}
