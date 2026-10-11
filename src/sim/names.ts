// Neo-Jowo naming system: per country, 50 male + 50 female first names and 50 last names.
// A member is a random first name (matching gender) + random last name from the same country.
import type { Gender } from './types';
import type { Rng } from './rng';

export interface NamePool {
  code: string;
  country: string;
  familyNameFirst: boolean;
  male: string[];
  female: string[];
  last: string[];
}

export interface GeneratedName {
  firstName: string;
  lastName: string;
  country: string;
  familyNameFirst: boolean;
  gender: Gender;
}

export interface NameOptions {
  gender?: Gender;
  countries?: string[];      // restrict to these ISO codes
  mixChance?: number;        // chance the last name comes from a different country
}

export function fullName(n: { firstName: string; lastName: string; familyNameFirst: boolean }, nativeOrder = false): string {
  return nativeOrder && n.familyNameFirst ? `${n.lastName} ${n.firstName}` : `${n.firstName} ${n.lastName}`;
}

export function generateName(pools: NamePool[], rng: Rng, taken: Set<string>, opts: NameOptions = {}): GeneratedName {
  const usable = opts.countries?.length ? pools.filter((p) => opts.countries!.includes(p.code)) : pools;
  if (!usable.length) throw new Error('No name pools available');
  let last: GeneratedName | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const gender: Gender = opts.gender ?? (rng.chance(0.5) ? 'male' : 'female');
    const pool = rng.pick(usable);
    const surnamePool = opts.mixChance && rng.chance(opts.mixChance) ? rng.pick(usable) : pool;
    const candidate: GeneratedName = {
      firstName: rng.pick(gender === 'male' ? pool.male : pool.female),
      lastName: rng.pick(surnamePool.last),
      country: pool.code,
      familyNameFirst: pool.familyNameFirst && surnamePool === pool,
      gender,
    };
    last = candidate;
    if (!taken.has(`${candidate.firstName} ${candidate.lastName}`)) return candidate;
  }
  return last!; // pool exhausted: 12 countries x 5,000 combinations makes this practically unreachable
}

export function nameKey(n: { firstName: string; lastName: string }): string {
  return `${n.firstName} ${n.lastName}`;
}
