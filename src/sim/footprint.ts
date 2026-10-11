// Station footprints in world space. Shared by the nav grid (stations block cells), the layout test and the renderer.
import type { Content } from './content';
import type { StationType, Vec2 } from './types';

export interface Rect { x0: number; x1: number; z0: number; z1: number }

/** World-space AABB of a station of `type` at `pos`, rotated by `rot` (radians, about Y). */
export function footprint(c: Content, type: StationType, pos: Vec2, rot: number): Rect {
  const f = c.layout.footprints[type];
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const xs: number[] = [], zs: number[] = [];
  for (const [lx, lz] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]]) {
    // three.js Y rotation: x' = x cos + z sin, z' = -x sin + z cos
    xs.push(pos.x + lx * cos + lz * sin);
    zs.push(pos.z - lx * sin + lz * cos);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

export function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.x0 < b.x1 + margin && b.x0 < a.x1 + margin && a.z0 < b.z1 + margin && b.z0 < a.z1 + margin;
}

export function inside(p: Vec2, r: Rect, pad = 0): boolean {
  return p.x > r.x0 - pad && p.x < r.x1 + pad && p.z > r.z0 - pad && p.z < r.z1 + pad;
}
