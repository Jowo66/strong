// Loads every content data file into one typed object the simulation reads from.
import exercisesJson from '../data/exercises.json';
import goalsJson from '../data/goals.json';
import traitsJson from '../data/traits.json';
import titlesJson from '../data/titles.json';
import dialogueJson from '../data/dialogue.json';
import progressionJson from '../data/progression.json';
import layoutJson from '../data/layout.json';
import eventsJson from '../data/events.json';
import momentsJson from '../data/moments.json';
import populationJson from '../data/population.json';
import auraJson from '../data/aura.json';
import appearanceJson from '../data/appearance.json';
import type { Experience, GoalId, LiftKey, MomentType, StationType, Vec2, ZoneId, Gender, NpcStats } from './types';
import type { NamePool } from './names';

export interface Exercise {
  id: string; name: string; station: StationType; category: 'compound' | 'isolation' | 'cardio' | 'mobility';
  lift?: LiftKey; body: 'upper' | 'lower' | 'core' | 'cardio' | 'mobility';
  weight: [number, number, number] | null; spot?: boolean; photoOp?: boolean;
  goals: Record<GoalId, number>;
}
export interface Goal { id: GoalId; name: string; weight: number; sets: [number, number]; rest: [number, number]; progression: number }
export interface Trait { id: string; name: string; weight: number; modifiers: Record<string, number>; restMultiplier?: number }
export interface TitleDef {
  id: string; category: 'annual' | 'milestone' | 'reputation'; name: string; nameFemale?: string;
  stat?: keyof NpcStats | 'avgRest'; metric?: 'bestBench' | 'bestSquat' | 'improvement' | 'visits';
  threshold?: number; minValue?: number; minCount?: number; minVisits?: number;
  gender?: Gender; unit?: string; rarity: number; description: string;
}
export interface Zone { label: string; x0: number; x1: number; z0: number; z1: number; colour: string }
export interface Layout {
  bounds: { x0: number; x1: number; z0: number; z1: number };
  entrance: Vec2; receptionDesk: Vec2; checkInSpot: Vec2;
  lockerDoor: { inside: Vec2; outside: Vec2 };
  zones: Record<ZoneId, Zone>;
  stations: { type: StationType; zone: ZoneId; x: number; z: number; rot: number }[];
  tempSlots: Record<StationType, Vec2[]>;
  footprints: Record<StationType, { x0: number; x1: number; z0: number; z1: number }>;
  lockerSpots: Vec2[]; mirrorSpots: Vec2[];
  mirror: { x0: number; x1: number; z: number; height: number };
  speakers: { id: string; x: number; y: number; z: number }[];
  hallOfFame: { x: number; y: number; z: number };
  podium: Vec2; waterCooler: Vec2; wanderPoints: Vec2[];
  obstacles: { rects: { name: string; x0: number; x1: number; z0: number; z1: number }[]; circles: { name: string; x: number; z: number; r: number }[] };
  partitions: { x0: number; x1: number; z0: number; z1: number }[];
  coolerSpot: Vec2; chalkSpots: Vec2[];
}

const namePools = Object.values(
  import.meta.glob<NamePool>('../data/names/*.json', { eager: true, import: 'default' }),
).sort((a, b) => a.code.localeCompare(b.code));

export const content = {
  exercises: exercisesJson.exercises as Exercise[],
  exerciseById: Object.fromEntries((exercisesJson.exercises as Exercise[]).map((e) => [e.id, e])) as Record<string, Exercise>,
  goals: goalsJson.goals as Goal[],
  goalById: Object.fromEntries((goalsJson.goals as Goal[]).map((g) => [g.id, g])) as Record<GoalId, Goal>,
  traits: traitsJson.traits as unknown as Trait[],
  traitById: Object.fromEntries((traitsJson.traits as unknown as Trait[]).map((t) => [t.id, t])) as Record<string, Trait>,
  titles: titlesJson.titles as TitleDef[],
  titleById: Object.fromEntries((titlesJson.titles as TitleDef[]).map((t) => [t.id, t])) as Record<string, TitleDef>,
  dialogue: dialogueJson,
  progression: progressionJson as typeof progressionJson & { experienceIndex: Record<Experience, number> },
  layout: layoutJson as unknown as Layout,
  events: eventsJson,
  moments: momentsJson.types as Record<MomentType, { notability: number; stat?: keyof NpcStats; feed: string }>,
  population: populationJson,
  aura: auraJson,
  appearance: appearanceJson,
  names: namePools,
};

export type Content = typeof content;
