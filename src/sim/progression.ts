// Strength progression: diminishing returns toward an experience-based ceiling.
import type { Content } from './content';
import type { LiftKey, Npc } from './types';
import { LIFT_KEYS } from './types';
import type { Rng } from './rng';
import { roundTo } from './npc';

export function ceilingFor(c: Content, npc: Npc, exerciseId: string): number {
  return npc.start[exerciseId] * c.progression.ceiling[npc.experience];
}

/** Advance one session of an exercise. Returns a PR {lift, weight} if a tracked lift beat its best. */
export function progressSession(c: Content, npc: Npc, exerciseId: string, rng: Rng | null): { lift: LiftKey; weight: number } | null {
  const ex = c.exerciseById[exerciseId];
  npc.sessions[exerciseId] = (npc.sessions[exerciseId] ?? 0) + 1;
  if (!ex.weight || npc.weights[exerciseId] === undefined) return null;
  const cap = ceilingFor(c, npc, exerciseId);
  const w = npc.weights[exerciseId];
  const jitter = rng ? rng.range(c.progression.jitter[0], c.progression.jitter[1]) : 1;
  const k = c.progression.baseK * c.goalById[npc.goal].progression * jitter;
  npc.weights[exerciseId] = w + (cap - w) * k;
  if (!ex.lift) return null;
  const rounded = roundTo(npc.weights[exerciseId], c.progression.plateRounding);
  if (rounded > npc.best[ex.lift]) {
    npc.best[ex.lift] = rounded;
    return { lift: ex.lift, weight: rounded };
  }
  return null;
}

export function displayWeight(c: Content, npc: Npc, exerciseId: string): number | null {
  const w = npc.weights[exerciseId];
  return w === undefined ? null : roundTo(w, c.progression.plateRounding);
}

export function liftTotal(npc: Npc): number {
  return LIFT_KEYS.reduce((s, k) => s + npc.best[k], 0);
}
