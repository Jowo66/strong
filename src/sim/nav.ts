// Navigation grid + A*. The floor is cut into 0.25-unit cells; walls, partitions, props and station footprints
// (grown by a member's radius) are blocked. Paths are smoothed with line-of-sight checks so members walk in
// straight lines between turns instead of zig-zagging cell by cell.
import type { Content } from './content';
import type { Station, Vec2 } from './types';
import { footprint } from './footprint';

export const CELL = 0.25;
export const AGENT_RADIUS = 0.17;

export class NavGrid {
  readonly x0: number; readonly z0: number; readonly cols: number; readonly rows: number;
  private readonly base: Uint8Array;
  blocked: Uint8Array;
  // A* scratch (reused between searches)
  private g: Float32Array; private from: Int32Array; private closed: Uint8Array; private stamp: Uint32Array;
  private search = 0;

  constructor(private c: Content) {
    const b = c.layout.bounds;
    this.x0 = b.x0; this.z0 = b.z0;
    this.cols = Math.ceil((b.x1 - b.x0) / CELL);
    this.rows = Math.ceil((b.z1 + 1.5 - b.z0) / CELL); // one extra strip in front for the entrance
    const n = this.cols * this.rows;
    this.base = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n); this.from = new Int32Array(n);
    this.closed = new Uint8Array(n); this.stamp = new Uint32Array(n);
    this.buildBase();
    this.blocked.set(this.base);
  }

  private buildBase(): void {
    const L = this.c.layout;
    const ent = L.entrance;
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
      const p = this.centre(i, j);
      // beyond the front edge only the entrance corridor is walkable
      if (p.z > L.bounds.z1 - AGENT_RADIUS && Math.abs(p.x - ent.x) > 1.2) this.base[j * this.cols + i] = 1;
      if (p.x < L.bounds.x0 + AGENT_RADIUS || p.x > L.bounds.x1 - AGENT_RADIUS || p.z < L.bounds.z0 + AGENT_RADIUS) this.base[j * this.cols + i] = 1;
    }
    for (const r of [...L.partitions, ...L.obstacles.rects]) this.markRect(this.base, r.x0, r.x1, r.z0, r.z1, AGENT_RADIUS);
    for (const c of L.obstacles.circles) this.markCircle(this.base, c.x, c.z, c.r + AGENT_RADIUS);
  }

  /** Re-block station footprints. Call whenever a station is added or removed. */
  setStations(stations: Station[], extra: { x0: number; x1: number; z0: number; z1: number }[] = []): void {
    this.blocked.set(this.base);
    for (const r of extra) this.markRect(this.blocked, r.x0, r.x1, r.z0, r.z1, AGENT_RADIUS);
    for (const s of stations) {
      const r = footprint(this.c, s.type, s.pos, s.rot);
      this.markRect(this.blocked, r.x0, r.x1, r.z0, r.z1, AGENT_RADIUS);
    }
  }

  private markRect(arr: Uint8Array, x0: number, x1: number, z0: number, z1: number, pad: number): void {
    const [i0, j0] = this.cell({ x: x0 - pad, z: z0 - pad }), [i1, j1] = this.cell({ x: x1 + pad, z: z1 + pad });
    for (let j = Math.max(0, j0); j <= Math.min(this.rows - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.cols - 1, i1); i++) {
      const p = this.centre(i, j);
      if (p.x >= x0 - pad && p.x <= x1 + pad && p.z >= z0 - pad && p.z <= z1 + pad) arr[j * this.cols + i] = 1;
    }
  }

  private markCircle(arr: Uint8Array, x: number, z: number, r: number): void {
    const [i0, j0] = this.cell({ x: x - r, z: z - r }), [i1, j1] = this.cell({ x: x + r, z: z + r });
    for (let j = Math.max(0, j0); j <= Math.min(this.rows - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.cols - 1, i1); i++) {
      const p = this.centre(i, j);
      if (Math.hypot(p.x - x, p.z - z) <= r) arr[j * this.cols + i] = 1;
    }
  }

  cell(p: Vec2): [number, number] { return [Math.floor((p.x - this.x0) / CELL), Math.floor((p.z - this.z0) / CELL)]; }
  centre(i: number, j: number): Vec2 { return { x: this.x0 + (i + 0.5) * CELL, z: this.z0 + (j + 0.5) * CELL }; }
  private idx(i: number, j: number): number { return i < 0 || j < 0 || i >= this.cols || j >= this.rows ? -1 : j * this.cols + i; }

  isFree(p: Vec2): boolean {
    const [i, j] = this.cell(p);
    const k = this.idx(i, j);
    return k >= 0 && !this.blocked[k];
  }

  /** The closest walkable cell centre to `p` (p itself if it's already walkable). */
  nearestFree(p: Vec2, maxRadius = 12): Vec2 {
    if (this.isFree(p)) return { ...p };
    const [ci, cj] = this.cell(p);
    let best: Vec2 | null = null, bestD = Infinity;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const k = this.idx(ci + di, cj + dj);
        if (k < 0 || this.blocked[k]) continue;
        const q = this.centre(ci + di, cj + dj);
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bestD) { bestD = d; best = q; }
      }
      if (best) return best;
    }
    return { ...p };
  }

  /** True if a member can walk straight from a to b without touching a blocked cell. */
  lineOfSight(a: Vec2, b: Vec2): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / (CELL * 0.4)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (!this.isFree({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }

  /**
   * Walkable waypoints from `a` to `b` (both should be free; use nearestFree first).
   * Returns the smoothed corner points after `a`, ending exactly at `b`; null if unreachable.
   */
  findPath(a: Vec2, b: Vec2): Vec2[] | null {
    if (this.lineOfSight(a, b)) return [{ ...b }];
    const [si, sj] = this.cell(a), [ti, tj] = this.cell(b);
    const start = this.idx(si, sj), goal = this.idx(ti, tj);
    if (start < 0 || goal < 0) return null;
    this.search++;
    const s = this.search;
    const open = new MinHeap();
    const h = (k: number) => {
      const dx = Math.abs((k % this.cols) - ti), dz = Math.abs(Math.floor(k / this.cols) - tj);
      return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    };
    const touch = (k: number) => { if (this.stamp[k] !== s) { this.stamp[k] = s; this.g[k] = Infinity; this.closed[k] = 0; this.from[k] = -1; } };
    touch(start);
    this.g[start] = 0;
    open.push(start, h(start));
    let found = false;
    while (open.size) {
      const k = open.pop();
      if (this.closed[k]) continue;
      this.closed[k] = 1;
      if (k === goal) { found = true; break; }
      const ki = k % this.cols, kj = Math.floor(k / this.cols);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const n = this.idx(ki + di, kj + dj);
        if (n < 0 || (this.blocked[n] && n !== goal)) continue;
        // no corner cutting
        if (di && dj && (this.blocked[this.idx(ki + di, kj)] || this.blocked[this.idx(ki, kj + dj)])) continue;
        touch(n);
        if (this.closed[n]) continue;
        const cost = this.g[k] + (di && dj ? 1.4142 : 1);
        if (cost < this.g[n]) { this.g[n] = cost; this.from[n] = k; open.push(n, cost + h(n)); }
      }
    }
    if (!found) return null;
    const cells: Vec2[] = [];
    for (let k = goal; k !== start && k >= 0; k = this.from[k]) cells.push(this.centre(k % this.cols, Math.floor(k / this.cols)));
    cells.reverse();
    cells[cells.length - 1] = { ...b };
    // string pulling: keep only the corners we can't see past
    const out: Vec2[] = [];
    let anchor = a;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineOfSight(anchor, cells[j])) j--;
      out.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    return out;
  }

  /** Path length helper. */
  static length(from: Vec2, path: Vec2[]): number {
    let d = 0, p = from;
    for (const q of path) { d += Math.hypot(q.x - p.x, q.z - p.z); p = q; }
    return d;
  }
}

class MinHeap {
  private k: number[] = []; private p: number[] = [];
  get size() { return this.k.length; }
  push(key: number, pri: number): void {
    this.k.push(key); this.p.push(pri);
    let i = this.k.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.p[up] <= this.p[i]) break;
      [this.k[up], this.k[i]] = [this.k[i], this.k[up]]; [this.p[up], this.p[i]] = [this.p[i], this.p[up]];
      i = up;
    }
  }
  pop(): number {
    const top = this.k[0];
    const lk = this.k.pop()!, lp = this.p.pop()!;
    if (this.k.length) {
      this.k[0] = lk; this.p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && this.p[l] < this.p[m]) m = l;
        if (r < this.k.length && this.p[r] < this.p[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]]; [this.p[m], this.p[i]] = [this.p[i], this.p[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Where a member stands before stepping onto a station: just in front of its footprint, in station-local +Z. */
export function approachPoint(c: Content, s: { type: Station['type']; pos: Vec2; rot: number }): Vec2 {
  const lz = c.layout.footprints[s.type].z1 + 0.38;
  return { x: s.pos.x + lz * Math.sin(s.rot), z: s.pos.z + lz * Math.cos(s.rot) };
}

/** A point in station-local coordinates, in world space. */
export function stationLocal(s: { pos: Vec2; rot: number }, lx: number, lz: number): Vec2 {
  const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
  return { x: s.pos.x + lx * cos + lz * sin, z: s.pos.z - lx * sin + lz * cos };
}
