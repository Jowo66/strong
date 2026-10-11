// Small seeded PRNG (mulberry32) so simulations and tests are reproducible.
export class Rng {
  private s: number;
  constructor(seed: number = Date.now()) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  normal(mean: number, sd: number): number {
    const u = 1 - this.next(); const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
    let r = this.next() * total;
    for (const t of items) { r -= Math.max(0, weight(t)); if (r <= 0) return t; }
    return items[items.length - 1];
  }
  weightedKey(table: Record<string, number>): string {
    return this.weighted(Object.keys(table), (k) => table[k]);
  }
}
