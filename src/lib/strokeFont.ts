// Single-line stroke font utilities for laser-friendly SVG labels.
// Generates centerline strokes (no outline contours).

export type Vec2 = [number, number];
export type Stroke = Vec2[];

export interface Glyph {
  width: number;      // glyph width in font units
  strokes: Stroke[];  // each stroke is a polyline
}

/**
 * Minimal single-line digit set in a 0..10 coordinate system.
 * Designed for laser/plotter use.
 */
export const SIMPLE_DIGITS: Record<string, Glyph> = {
  "0": { width: 8, strokes: [
    [[1,1],[7,1],[7,9],[1,9],[1,1]]
  ]},
  "1": { width: 6, strokes: [
    [[3,1],[3,9]]
  ]},
  "2": { width: 8, strokes: [
    [[1,2],[7,2],[7,5],[1,9],[7,9]]
  ]},
  "3": { width: 8, strokes: [
    [[1,2],[7,2],[4,5],[7,5],[4,5],[7,9],[1,9]]
  ]},
  "4": { width: 8, strokes: [
    [[7,9],[7,1]],
    [[1,6],[7,6]],
    [[1,9],[1,6]]
  ]},
  "5": { width: 8, strokes: [
    [[7,2],[1,2],[1,5],[7,5],[7,9],[1,9]]
  ]},
  "6": { width: 8, strokes: [
    [[7,2],[2,2],[1,5],[1,9],[7,9],[7,5],[1,5]]
  ]},
  "7": { width: 8, strokes: [
    [[1,2],[7,2],[3,9]]
  ]},
  "8": { width: 8, strokes: [
    [[1,5],[1,2],[7,2],[7,5],[1,5],[1,9],[7,9],[7,5]]
  ]},
  "9": { width: 8, strokes: [
    [[7,6],[1,6],[1,2],[7,2],[7,9],[2,9]]
  ]},
  " ": { width: 4, strokes: [] },
};

export interface StrokeTextPath {
  d: string;      // SVG path data in font units
  width: number;  // width in font units
  height: number; // height in font units
}

/**
 * Converts a string to SVG path data using a single-line stroke font.
 * Pen-up between strokes: each stroke starts with 'M'.
 */
export function strokeTextToPath(
  text: string,
  letterSpacing: number = 1,
  font: Record<string, Glyph> = SIMPLE_DIGITS
): StrokeTextPath {
  const height = 10;
  let x = 0;
  const parts: string[] = [];

  for (const ch of text) {
    const g = font[ch];
    if (!g) continue;

    for (const stroke of g.strokes) {
      if (stroke.length < 2) continue;
      const [p0x, p0y] = stroke[0];
      parts.push(`M ${x + p0x} ${p0y}`);
      for (let i = 1; i < stroke.length; i++) {
        const [px, py] = stroke[i];
        parts.push(`L ${x + px} ${py}`);
      }
    }

    x += g.width + letterSpacing;
  }

  const width = Math.max(0, x - letterSpacing);
  return { d: parts.join(" "), width, height };
}
