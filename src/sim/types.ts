// Core data types for the Mini Gym simulation.
// Everything under SaveData is persisted; everything else is runtime-only.

export type Gender = 'male' | 'female';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type GoalId = 'hypertrophy' | 'strength' | 'generalFitness' | 'weightLoss' | 'athletic';
export type ZoneId =
  | 'reception' | 'social' | 'lockers' | 'freeWeights' | 'squat'
  | 'cardio' | 'bench' | 'cable' | 'stretching';
export type StationType =
  | 'bench' | 'squatRack' | 'platform' | 'dumbbells' | 'cable'
  | 'pullupBar' | 'treadmill' | 'bike' | 'rower' | 'mat';
export type LiftKey = 'bench' | 'squat' | 'deadlift';
export const LIFT_KEYS: LiftKey[] = ['bench', 'squat', 'deadlift'];

export interface Vec2 { x: number; z: number }

// ---------- Persistent ----------

export type MomentType =
  | 'pr' | 'flexOffWin' | 'flexOffLoss' | 'flexOffDraw' | 'spot' | 'overSpot'
  | 'construction' | 'lostBottle' | 'noRerack' | 'photoOp' | 'flirtFail'
  | 'streak' | 'titleWon' | 'titleLost';

export interface Moment {
  id: string;
  npcId: string;
  type: MomentType;
  day: number;            // in-game day index (0 = creation day)
  date: string;           // ISO date, for display
  zone: ZoneId;
  witnesses: string[];    // npc ids
  otherId?: string;       // the other party (flex-off opponent, spotted lifter…)
  detail?: string;        // e.g. "Bench 225"
  notability: number;
}

export interface NpcStats {
  visits: number;
  prs: number;
  flexOffWins: number;
  flexOffLosses: number;
  spots: number;
  overSpots: number;
  constructionTriggers: number;
  lostBottles: number;
  noReracks: number;
  photoOps: number;
  flirtFails: number;
  conversations: number;
  restSeconds: number;
  restCount: number;
  streak: number;
  bestStreak: number;
}

export interface YearStats {
  visits: number;
  best: Record<LiftKey, number>;
  startTotal: number;     // bench+squat+deadlift when the year began
}

export interface Familiarity { score: number; rivalry: number; rival: boolean }

export interface Appearance {
  skin: string; hair: string; hairStyle: string;
  shirt: string; shorts: string; street: string;
  height: number;         // 0.9 – 1.1 scale
  build: number;          // 0.85 – 1.25 width scale
}

export interface Npc {
  id: string;
  firstName: string;
  lastName: string;
  country: string;        // ISO code of the name pool
  familyNameFirst: boolean;
  gender: Gender;
  goal: GoalId;
  experience: Experience;
  attendance: number;     // 0..1 chance of visiting on a given day
  favouriteExercise: string;
  traits: string[];
  start: Record<string, number>;   // starting working weight per exercise
  weights: Record<string, number>; // current working weight (float)
  best: Record<LiftKey, number>;   // best rounded weight on tracked lifts
  sessions: Record<string, number>;
  familiarity: Record<string, Familiarity>;
  stats: NpcStats;
  yearly: Record<string, YearStats>;
  moments: Moment[];
  joinedDay: number;
  lastVisitDay: number;   // -1 = never
  isPlayer?: boolean;
  appearance: Appearance;
}

export interface TitleRecord {
  id: string;
  titleId: string;
  holderId: string;
  holderName: string;     // kept so the archive survives a hard refresh
  holderGender: Gender;
  value?: number;
  year?: number;
  current: boolean;       // false = "Former …" (annual titles stay current forever)
  awardedDay: number;
  holderLeft?: boolean;   // member no longer in the roster
}

export interface SaveData {
  version: 1;
  createdAt: string;      // ISO date of gym creation (calendar day 0)
  day: number;
  dayTime: number;        // seconds into the current gym day
  lastSavedAt: number;    // epoch ms, used for offline catch-up
  seq: number;            // id counter
  members: Record<string, Npc>;
  titles: TitleRecord[];
  pendingCeremonyYear?: number;
}

// ---------- Runtime ----------

export type AgentState =
  | 'walking' | 'checkIn' | 'changing' | 'choosing' | 'waiting'
  | 'lifting' | 'resting' | 'searching' | 'interacting'
  | 'changingOut' | 'gone';

export type Anim = 'idle' | 'walk' | 'lift' | 'cardio' | 'stretch' | 'flex' | 'clap' | 'talk' | 'search' | 'powerUp' | 'celebrate' | 'build';

export interface RoutineItem {
  exerciseId: string;
  sets: number;
  restSeconds: number;
  liftSeconds: number;
}

export interface Bubble { text: string; ttl: number }

export interface Agent {
  npcId: string;
  state: AgentState;
  pos: Vec2;
  facing: number;
  path: Vec2[];
  after: AgentState | null;
  afterTimer: number | null;
  timer: number;
  routine: RoutineItem[];
  index: number;
  setsDone: number;
  stationId: string | null;
  waitTime: number;
  lockerSpot: Vec2;
  outfit: 'street' | 'gym';
  anim: Anim;
  bubble: Bubble | null;
  interactionId: string | null;
  paused: { state: AgentState; timer: number } | null;
  aura: number;           // seconds of aura remaining
  react: number;          // seconds left on a reaction animation (clap, celebrate)
}

export interface Station {
  id: string;
  type: StationType;
  zone: ZoneId;
  pos: Vec2;
  rot: number;
  label: string;
  temporary: boolean;
  occupant: string | null;
  reservedBy: string | null;
  building: boolean;
  idle: number;           // seconds unused (temporary stations only)
  unracked: number;       // seconds the plates stay visibly loaded
}

export interface CrewMember { id: string; pos: Vec2; path: Vec2[]; anim: Anim; bubble: Bubble | null }

export interface CrewJob {
  id: string;
  kind: 'build' | 'remove';
  stationId: string;
  stage: 'arriving' | 'working' | 'celebrating' | 'leaving';
  timer: number;
  crew: CrewMember[];
  requestedBy: string | null;
  gag: 'backwards' | 'drop' | null;
}

export type InteractionType = 'conversation' | 'flirt' | 'flexOff' | 'spot';

export interface Interaction {
  id: string;
  type: InteractionType;
  participants: string[];
  stage: string;
  timer: number;
  lines: { who: number; text: string }[];
  lineIndex: number;
  data: Record<string, unknown>;
}

export interface FeedItem { id: string; day: number; text: string; npcId?: string; kind: 'moment' | 'title' | 'ceremony' | 'info' }
