// Member creation: name, goal, experience, traits, starting weights and look.
import type { Content } from './content';
import type { Experience, GoalId, Npc, NpcStats, LiftKey } from './types';
import { LIFT_KEYS } from './types';
import type { Rng } from './rng';
import { generateName, nameKey } from './names';

export function emptyStats(): NpcStats {
  return {
    visits: 0, prs: 0, flexOffWins: 0, flexOffLosses: 0, spots: 0, overSpots: 0,
    constructionTriggers: 0, lostBottles: 0, noReracks: 0, photoOps: 0, flirtFails: 0,
    conversations: 0, restSeconds: 0, restCount: 0, streak: 0, bestStreak: 0,
  };
}

export const roundTo = (w: number, step: number) => Math.max(step, Math.round(w / step) * step);

export interface CreateNpcOptions { id: string; day: number; taken: Set<string>; mixChance?: number; countries?: string[]; isPlayer?: boolean }

export function createNpc(c: Content, rng: Rng, o: CreateNpcOptions): Npc {
  const n = generateName(c.names, rng, o.taken, { mixChance: o.mixChance, countries: o.countries });
  o.taken.add(nameKey(n));
  const experience = rng.weightedKey(c.progression.experienceMix) as Experience;
  const goal = rng.weighted(c.goals, (g) => g.weight).id as GoalId;
  const expIdx = c.progression.experienceIndex[experience];
  const gf = c.progression.genderFactor[n.gender];

  const start: Record<string, number> = {};
  for (const ex of c.exercises) {
    if (!ex.weight) continue;
    const factor = ex.body === 'upper' || ex.body === 'lower' || ex.body === 'core' ? gf[ex.body] : 1;
    start[ex.id] = roundTo(ex.weight[expIdx] * factor * rng.range(c.progression.startJitter[0], c.progression.startJitter[1]), c.progression.plateRounding);
  }
  const best = {} as Record<LiftKey, number>;
  for (const k of LIFT_KEYS) {
    const ex = c.exercises.find((e) => e.lift === k)!;
    best[k] = start[ex.id];
  }

  const traitCount = rng.weightedKey({ '0': 0.3, '1': 0.5, '2': 0.2 });
  const traits: string[] = [];
  while (traits.length < Number(traitCount)) {
    const t = rng.weighted(c.traits, (t) => (traits.includes(t.id) ? 0 : t.weight)).id;
    if (!traits.includes(t)) traits.push(t);
  }

  const favourite = rng.weighted(c.exercises, (e) => e.goals[goal] ** 2).id;
  const ap = c.appearance;
  const hairStyles = n.gender === 'male' ? ap.hairStyles.filter((h) => h !== 'ponytail' && h !== 'bun') : ap.hairStyles.filter((h) => h !== 'bald' && h !== 'buzz');

  return {
    id: o.id,
    firstName: n.firstName, lastName: n.lastName, country: n.country, familyNameFirst: n.familyNameFirst,
    gender: n.gender, goal, experience,
    attendance: o.isPlayer ? 1 : rng.range(c.progression.attendance[0], c.progression.attendance[1]),
    favouriteExercise: favourite, traits,
    start, weights: { ...start }, best, sessions: {},
    familiarity: {}, stats: emptyStats(), yearly: {}, moments: [],
    joinedDay: o.day, lastVisitDay: -1, isPlayer: o.isPlayer || undefined,
    appearance: {
      skin: rng.pick(ap.skin), hair: rng.pick(ap.hair), hairStyle: rng.pick(hairStyles),
      shirt: rng.pick(ap.shirt), shorts: rng.pick(ap.shorts), street: rng.pick(ap.street),
      height: rng.range(0.9, 1.1) * (n.gender === 'male' ? 1.03 : 0.97),
      build: rng.range(0.85, 1.25),
    },
  };
}

export function isRegular(c: Content, npc: Npc): boolean {
  return npc.isPlayer === true || npc.attendance >= c.progression.regularThreshold;
}
