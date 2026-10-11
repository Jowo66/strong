// Plate maths shared by held bars and racked bars: a 45 lb bar plus plates per side, heaviest first.
export type PlateSize = 45 | 25 | 10 | 5;
const SIZES: PlateSize[] = [45, 25, 10, 5];

/** Plates for ONE side of a 45 lb barbell loaded to `weight` (rounded down to what plates can make). */
export function platesFor(weight: number): PlateSize[] {
  let side = Math.max(0, (weight - 45) / 2);
  const out: PlateSize[] = [];
  for (const s of SIZES) while (side >= s - 0.01 && out.length < 6) { out.push(s); side -= s; }
  return out;
}

/** Toy-coloured bumpers so loads read at a glance (and differ by size, not only colour). */
export const PLATE_COLOURS: Record<PlateSize, string> = { 45: '#2B4C7E', 25: '#2A9D8F', 10: '#E9C46A', 5: '#E76F51' };
export const PLATE_RADIUS: Record<PlateSize, number> = { 45: 0.23, 25: 0.18, 10: 0.13, 5: 0.1 };
