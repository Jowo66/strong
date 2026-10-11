// Turns a member (or a crew worker) into a full character look: outfit cut, colours, hair, facial hair, accessories.
// Everything not stored in the save is derived from a hash of the member id, so a member always looks the same.
import type { Appearance, Gender, Npc } from '../../sim/types';

export type TopCut = 'tee' | 'tank' | 'sportsTop' | 'longsleeve' | 'vest';
export type BottomCut = 'shorts' | 'leggings' | 'joggers';
export type FacialHair = 'none' | 'beard' | 'stubble' | 'moustache';

export interface CharacterLook {
  key: string;
  gender: Gender;
  skin: string;
  hair: string;
  hairStyle: string;
  facialHair: FacialHair;
  top: TopCut;
  bottom: BottomCut;
  shirt: string;
  trim: string;
  shorts: string;
  shoes: string;
  sole: string;
  street: string;
  streetBottom: string;
  height: number;
  build: number;        // width 0.85 – 1.25
  muscle: number;       // 0 – 1, broader shoulders and bigger arms
  belly: number;        // 0 – 1
  headphones: boolean;
  belt: boolean;
  wristbands: boolean;
  glasses: boolean;
  crew: boolean;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Small deterministic generator for look details. */
function picker(seed: number) {
  let x = seed || 1;
  const next = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; };
  return {
    next,
    chance: (p: number) => next() < p,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length) % arr.length],
  };
}

const SHOES = ['#F1FAEE', '#222222', '#E63946', '#3A86FF', '#FFBE0B', '#8D99AE', '#06D6A0'];
const TRIMS = ['#FFFFFF', '#1B1B1B', '#FFD166', '#EF476F', '#118AB2'];
const STREET_BOTTOMS = ['#2B2D42', '#3D405B', '#5C677D', '#6B705C', '#264653'];

const npcLooks = new Map<string, { sig: string; look: CharacterLook }>();

/** Memoised: the same member always gets the same look object (so its rig isn't rebuilt on re-render). */
export function lookForNpc(npc: Npc): CharacterLook {
  const sig = `${JSON.stringify(npc.appearance)}|${npc.traits.join(',')}|${npc.goal}|${npc.experience}|${npc.firstName}${npc.lastName}`;
  const hit = npcLooks.get(npc.id);
  if (hit && hit.sig === sig) return hit.look;
  const look = buildNpcLook(npc);
  npcLooks.set(npc.id, { sig, look });
  return look;
}

function buildNpcLook(npc: Npc): CharacterLook {
  const ap: Appearance = npc.appearance;
  const r = picker(hashString(npc.id + npc.firstName + npc.lastName));
  const female = npc.gender === 'female';
  const top: TopCut = female
    ? r.pick(['tee', 'tank', 'sportsTop', 'sportsTop', 'longsleeve'] as const)
    : r.pick(['tee', 'tee', 'tank', 'longsleeve'] as const);
  const bottom: BottomCut = female ? r.pick(['leggings', 'leggings', 'shorts', 'joggers'] as const) : r.pick(['shorts', 'shorts', 'joggers'] as const);
  const muscleBase = { beginner: 0.1, intermediate: 0.4, advanced: 0.75 }[npc.experience];
  const goalBoost = npc.goal === 'strength' || npc.goal === 'hypertrophy' ? 0.2 : npc.goal === 'weightLoss' ? -0.15 : 0;
  const muscle = Math.max(0, Math.min(1, muscleBase + goalBoost + (r.next() - 0.5) * 0.2));
  const belly = ap.build > 1.12 && muscle < 0.6 ? Math.min(1, (ap.build - 1.1) * 6) : 0;
  const facialHair: FacialHair = female ? 'none' : r.pick(['none', 'none', 'none', 'beard', 'stubble', 'moustache'] as const);
  return {
    key: `m:${npc.id}:${npc.experience}:${npc.goal}:${npc.traits.join(',')}:${JSON.stringify(ap)}`,
    gender: npc.gender,
    skin: ap.skin, hair: ap.hair, hairStyle: ap.hairStyle, facialHair,
    top, bottom,
    shirt: ap.shirt, trim: r.pick(TRIMS), shorts: ap.shorts,
    shoes: r.pick(SHOES), sole: '#F8F9FA',
    street: ap.street, streetBottom: r.pick(STREET_BOTTOMS),
    height: ap.height, build: ap.build, muscle, belly,
    headphones: npc.traits.includes('focused'),
    belt: npc.goal === 'strength' && npc.experience !== 'beginner',
    wristbands: r.chance(0.2),
    glasses: r.chance(0.12),
    crew: false,
  };
}

const CREW_SKINS = ['#8D5524', '#C68642', '#F1C27D', '#5C3A21', '#E0AC69'];
const CREW_HAIR = ['#1B1B1B', '#3B2416', '#8C8C8C'];

/** Crew workers: hi-vis vest, hard hat, tool belt. Three regular faces, picked by slot. */
export function lookForCrew(slot: number): CharacterLook {
  const r = picker(hashString(`crew-${slot}`));
  return {
    key: `crew:${slot}`,
    gender: slot === 1 ? 'female' : 'male',
    skin: CREW_SKINS[slot % CREW_SKINS.length], hair: r.pick(CREW_HAIR), hairStyle: slot === 1 ? 'ponytail' : 'short',
    facialHair: slot === 2 ? 'moustache' : slot === 0 ? 'stubble' : 'none',
    top: 'vest', bottom: 'joggers',
    shirt: '#FB8500', trim: '#FFE66D', shorts: '#3D405B', shoes: '#6F4E37', sole: '#3B2416',
    street: '#FB8500', streetBottom: '#3D405B',
    height: slot === 1 ? 0.97 : 1.02, build: slot === 2 ? 1.2 : 1.08, muscle: 0.45, belly: slot === 2 ? 0.7 : 0,
    headphones: false, belt: false, wristbands: false, glasses: slot === 0, crew: true,
  };
}
