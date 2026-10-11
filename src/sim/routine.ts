// Workout generation: 6–8 exercises weighted by goal, randomized order and rest.
import type { Content } from './content';
import type { Npc, RoutineItem } from './types';
import type { Rng } from './rng';

export function restMultiplier(c: Content, npc: Npc): number {
  return npc.traits.reduce((m, t) => m * (c.traitById[t]?.restMultiplier ?? 1), 1);
}

export function generateRoutine(c: Content, npc: Npc, rng: Rng): RoutineItem[] {
  const goal = c.goalById[npc.goal];
  const count = rng.int(6, 8);
  const chosen: string[] = [];
  if (rng.chance(0.8)) chosen.push(npc.favouriteExercise);
  const pool = c.exercises.filter((e) => e.goals[npc.goal] > 0);
  while (chosen.length < count && chosen.length < pool.length) {
    const ex = rng.weighted(pool, (e) => (chosen.includes(e.id) ? 0 : e.goals[npc.goal] ** 2));
    if (!chosen.includes(ex.id)) chosen.push(ex.id);
  }
  const restMult = restMultiplier(c, npc);
  return rng.shuffle(chosen).map((id) => {
    const ex = c.exerciseById[id];
    const cardio = ex.category === 'cardio';
    return {
      exerciseId: id,
      sets: cardio ? 1 : rng.int(goal.sets[0], goal.sets[1]),
      restSeconds: rng.range(goal.rest[0], goal.rest[1]) * restMult,
      liftSeconds: cardio
        ? rng.range(c.progression.cardioSeconds[0], c.progression.cardioSeconds[1])
        : rng.range(c.progression.liftSeconds[0], c.progression.liftSeconds[1]),
    };
  });
}
