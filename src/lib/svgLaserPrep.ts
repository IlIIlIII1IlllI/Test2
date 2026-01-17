// Prepare SVG for laser engraving: keep strokes (borders + single-line labels), remove fills.

export interface LaserPrepOptions {
  removeFills?: boolean;
  forceStrokeColor?: string;
  removeText?: boolean;
}

function isNone(v: string | null | undefined): boolean {
  if (v == null) return true;
  const t = v.trim().toLowerCase();
  return t === "" || t === "none";
}

function numAttr(el: Element, name: string, fallback: number): number {
  const v = el.getAttribute(name);
  if (v == null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function prepareSvgForLaser(svgMarkup: string, options: LaserPrepOptions = {}): string {
  const opts: Required<LaserPrepOptions> = {
    removeFills: options.removeFills ?? true,
    forceStrokeColor: options.forceStrokeColor ?? "",
    removeText: options.removeText ?? true,
  };

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svgEl = doc.documentElement;

  if (opts.removeText) {
    const texts = Array.from(svgEl.getElementsByTagName("text"));
    for (const t of texts) t.parentNode?.removeChild(t);
  }

  const candidates = Array.from(svgEl.querySelectorAll("path, rect, circle, ellipse, polygon, polyline"));

  for (const el of candidates) {
    const fill = el.getAttribute("fill");
    const stroke = el.getAttribute("stroke");
    const strokeWidth = numAttr(el, "stroke-width", 1);

    const hasStroke = !isNone(stroke) && strokeWidth > 0;
    const hasFill = !isNone(fill);

    if (opts.removeFills && hasFill) {
      if (!hasStroke) {
        el.parentNode?.removeChild(el);
        continue;
      }
      el.setAttribute("fill", "none");
    }

    if (opts.forceStrokeColor && hasStroke) {
      el.setAttribute("stroke", opts.forceStrokeColor);
    }
  }

  svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgEl);
}
