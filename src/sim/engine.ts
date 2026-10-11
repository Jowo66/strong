// SimEngine: the whole living gym. Pure TypeScript, no React or Three.js, so it runs headless in tests.
// Runs on a fixed 0.1 s step. The renderer reads agent/station/crew state every frame.
import type { Content } from './content';
import type {
  Agent, AgentState, BreakKind, CrewJob, CrewMember, FeedItem, Interaction, MomentType, Npc, SaveData, Station,
  StationType, Vec2, ZoneId, Anim,
} from './types';
import { NavGrid, approachPoint, stationLocal } from './nav';
import { footprint, inside } from './footprint';
import { Rng } from './rng';
import { createNpc, isRegular } from './npc';
import { generateRoutine } from './routine';
import { progressSession } from './progression';
import { awardAnnual, ensureYear, evaluateTitles, featuredTitle, titleLabel } from './legends';
import { applyTitleChanges, recordMoment, type Chronicle } from './chronicle';
import { fullName, nameKey } from './names';
import { formatDate, isoForDay, todayIso, yearForDay } from './calendar';
import { computeYearReview } from './review';
import type { Rect } from './footprint';

export interface EngineSettings {
  dayLength: number;   // real seconds per gym day
  cap: number;         // max members in the gym at once
  members: number;     // roster size
  mixChance: number;   // chance of a cross-country surname
}

export const STEP = 0.1;
const WALK_SPEED = 2.4;
const CREW_SPEED = 2.8;

const STATION_LABEL: Record<StationType, string> = {
  bench: 'Bench', squatRack: 'Squat Rack', platform: 'Platform', dumbbells: 'Dumbbell Spot', cable: 'Cable Station',
  pullupBar: 'Pull-Up Bar', treadmill: 'Treadmill', bike: 'Bike', rower: 'Rower', mat: 'Mat',
};
const LIFT_LABEL = { bench: 'Bench', squat: 'Squat', deadlift: 'Deadlift' } as const;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

export type CeremonyStage = 'waiting' | 'building' | 'gathering' | 'posing' | 'speech' | 'closing';
export interface CeremonyWinner { npcId: string; name: string; labels: string[]; place: number }
export interface Ceremony {
  year: number;
  day: number;
  stage: CeremonyStage;
  timer: number;
  winners: CeremonyWinner[];
  called: string[];          // members pulled in (winners and crowd)
  onStage: string[];         // winners who made it up
  interactionId: string | null;
  podiumUp: boolean;
  podiumRot: number;         // the crew sometimes builds it backwards first
}

/** Podium blocks in podium-local X (1st in the middle) with their heights, plus two spots beside it for extra winners. */
export const PODIUM_SPOTS = [{ x: 0, h: 0.7 }, { x: -1.0, h: 0.48 }, { x: 1.0, h: 0.32 }, { x: -1.85, h: 0 }, { x: 1.85, h: 0 }];

export interface AgentInfo {
  npcId: string; name: string; title: string | null; goal: string; exercise: string | null;
  progress: string; activity: string; isPlayer: boolean; traits: string[];
}

export class SimEngine {
  readonly c: Content;
  save: SaveData;
  settings: EngineSettings;
  rng: Rng;
  agents = new Map<string, Agent>();
  stations: Station[] = [];
  jobs: CrewJob[] = [];
  interactions = new Map<string, Interaction>();
  schedule: { npcId: string; at: number }[] = [];
  feed: FeedItem[] = [];
  /** Bumps whenever the set of agents, stations or crew changes (React re-renders lists on this). */
  version = 0;
  ceremony: Ceremony | null = null;
  /** Seconds of simulated time since this engine started (for cooldowns). */
  simTime = 0;
  private recognitionCooldown = new Map<string, number>();
  private acc = 0;
  private quiet = false; // suppresses per-event feed lines during catch-up
  private eventAcc = 0;
  private closing = false;
  private feedListeners = new Set<(f: FeedItem) => void>();
  readonly chronicle: Chronicle;
  readonly nav: NavGrid;

  constructor(c: Content, save: SaveData, settings: EngineSettings, seed?: number) {
    this.c = c;
    this.save = save;
    this.settings = settings;
    this.rng = new Rng(seed);
    this.nav = new NavGrid(c);
    this.chronicle = {
      c, save,
      feed: (item) => this.pushFeed(item),
      onTitle: (change) => {
        const a = this.agents.get(change.record.holderId);
        if (a && change.kind === 'won') {
          a.banner = { text: `⭐ ${titleLabel(c, change.record)}`, ttl: 5 };
          for (const other of this.agentsNear(a.pos, 6, a.npcId)) if (this.rng.chance(0.4)) this.say(other, this.rng.pick(c.dialogue.title.react));
        }
      },
    };
    this.buildStations();
    // reloaded on awards day before the ceremony finished: run it again
    if (save.pendingCeremonyYear !== undefined && yearForDay(save.createdAt, save.day) === save.pendingCeremonyYear + 1) this.startCeremony(save.pendingCeremonyYear);
    this.buildSchedule(save.dayTime);
  }

  // ---------- Save creation ----------

  static createSave(c: Content, opts: { members: number; mixChance: number; seed?: number; createdAt?: string }): SaveData {
    const save: SaveData = {
      version: 1, createdAt: opts.createdAt ?? todayIso(), day: 0, dayTime: 0, lastSavedAt: Date.now(),
      seq: 0, members: {}, titles: [],
    };
    const rng = new Rng(opts.seed);
    const taken = new Set<string>();
    const player = createNpc(c, rng, { id: 'player', day: 0, taken, mixChance: opts.mixChance, isPlayer: true });
    save.members[player.id] = player;
    for (let i = 1; i < opts.members; i++) {
      save.seq += 1;
      const npc = createNpc(c, rng, { id: `n${save.seq}`, day: 0, taken, mixChance: opts.mixChance });
      save.members[npc.id] = npc;
    }
    return save;
  }

  // ---------- Public API ----------

  update(dt: number): void {
    this.acc += Math.min(dt, 2);
    while (this.acc >= STEP) { this.step(STEP); this.acc -= STEP; }
  }

  subscribeFeed(fn: (f: FeedItem) => void): () => void {
    this.feedListeners.add(fn);
    return () => this.feedListeners.delete(fn);
  }

  snapshot(): SaveData {
    this.save.lastSavedAt = Date.now();
    return structuredClone(this.save);
  }

  get player(): Npc | undefined { return Object.values(this.save.members).find((m) => m.isPlayer); }

  triggerAura(): boolean {
    const p = this.player;
    const a = p && this.agents.get(p.id);
    if (!a || a.state === 'gone') return false;
    a.aura = this.c.aura.durationSeconds;
    a.react = this.c.aura.durationSeconds;
    a.anim = 'powerUp';
    for (const other of this.agentsNear(a.pos, 5, a.npcId)) if (this.rng.chance(0.5)) this.say(other, this.rng.pick(['!?', 'Whoa.', '*shields eyes*']));
    return true;
  }

  info(npcId: string): AgentInfo | null {
    const npc = this.save.members[npcId];
    if (!npc) return null;
    const a = this.agents.get(npcId);
    const item = a && a.index < a.routine.length ? a.routine[a.index] : null;
    const ex = item ? this.c.exerciseById[item.exerciseId] : null;
    const ft = featuredTitle(this.c, this.save, npcId);
    return {
      npcId, name: fullName(npc), title: ft ? titleLabel(this.c, ft) : null,
      goal: this.c.goalById[npc.goal].name, exercise: ex ? ex.name : null,
      progress: a ? `${Math.min(a.index + 1, a.routine.length)}/${a.routine.length}` : '-',
      activity: a ? this.activity(a) : 'Not in the gym', isPlayer: !!npc.isPlayer,
      traits: npc.traits.map((t) => this.c.traitById[t]?.name ?? t),
    };
  }

  dateLabel(): string { return formatDate(this.save.createdAt, this.save.day); }

  /** Run whole days without animation (used when the app was closed for a while). */
  catchUp(days: number): { days: number; visits: number; prs: number } {
    const n = Math.min(Math.max(0, Math.floor(days)), this.c.progression.catchUpMaxDays);
    let visits = 0, prs = 0;
    const titlesBefore = this.save.titles.filter((t) => t.current).length;
    this.quiet = true;
    for (let d = 0; d < n; d++) {
      for (const npc of Object.values(this.save.members)) {
        if (!npc.isPlayer && !this.rng.chance(npc.attendance)) continue;
        visits++;
        this.registerVisit(npc, true);
        const silent = { zone: 'bench' as ZoneId, silent: true };
        for (const item of generateRoutine(this.c, npc, this.rng)) {
          const pr = progressSession(this.c, npc, item.exerciseId, this.rng);
          if (pr) { prs++; this.notePr(npc, pr.lift, pr.weight); recordMoment(this.chronicle, npc.id, 'pr', { ...silent, detail: `${LIFT_LABEL[pr.lift]} ${pr.weight}` }); }
          if (this.rng.chance(this.c.events.lostBottle.perTrigger * this.mod(npc, 'lostBottle'))) recordMoment(this.chronicle, npc.id, 'lostBottle', silent);
          if (this.rng.chance(this.c.events.noRerack.perTrigger * this.mod(npc, 'noRerack'))) recordMoment(this.chronicle, npc.id, 'noRerack', silent);
        }
      }
      this.advanceDay();
    }
    this.quiet = false;
    this.save.dayTime = 0;
    if (this.ceremony && this.ceremony.day !== this.save.day) { this.ceremony = null; this.save.pendingCeremonyYear = undefined; }
    this.buildSchedule(0);
    const newTitles = Math.max(0, this.save.titles.filter((t) => t.current).length - titlesBefore);
    if (n > 0) this.pushFeed({ day: this.save.day, kind: 'info', text: `While you were away: ${n} day${n === 1 ? '' : 's'}, ${visits} visits, ${prs} PRs${newTitles ? `, ${newTitles} new title${newTitles === 1 ? '' : 's'}` : ''}. Check the Hall of Fame.` });
    return { days: n, visits, prs };
  }

  /** Change roster size / cap without wiping history. */
  configure(settings: Partial<EngineSettings>): void {
    this.settings = { ...this.settings, ...settings };
    const members = Object.values(this.save.members);
    if (members.length < this.settings.members) this.addMembers(this.settings.members - members.length);
    else if (members.length > this.settings.members) {
      const removable = members
        .filter((m) => !m.isPlayer && !this.agents.has(m.id) && !this.save.titles.some((t) => t.holderId === m.id && t.current))
        .sort((a, b) => a.attendance - b.attendance)
        .slice(0, members.length - this.settings.members);
      this.removeMembers(removable.map((m) => m.id));
    }
  }

  reshuffle(mode: 'soft' | 'hard', keepArchive: boolean): void {
    this.clearRuntime();
    const members = Object.values(this.save.members);
    const leaving = mode === 'hard' ? members : members.filter((m) => !isRegular(this.c, m));
    this.removeMembers(leaving.map((m) => m.id));
    if (mode === 'hard' && !keepArchive) this.save.titles = [];
    if (mode === 'hard') {
      const taken = new Set<string>();
      const player = createNpc(this.c, this.rng, { id: 'player', day: this.save.day, taken, mixChance: this.settings.mixChance, isPlayer: true });
      this.save.members.player = player;
    }
    this.addMembers(this.settings.members - Object.keys(this.save.members).length);
    this.buildSchedule(this.save.dayTime);
    this.pushFeed({ day: this.save.day, kind: 'info', text: mode === 'hard' ? 'A whole new crowd signed up today.' : 'Some new faces at reception today.' });
  }

  // ---------- Main loop ----------

  step(h: number): void {
    const L = this.settings.dayLength;
    this.save.dayTime += h;
    if (this.save.dayTime >= L) {
      this.save.dayTime -= L;
      this.advanceDay();
      this.buildSchedule(0);
    }
    this.spawnArrivals();
    for (const a of this.agents.values()) this.updateAgent(a, h);
    for (const it of [...this.interactions.values()]) this.updateInteraction(it, h);
    this.updateJobs(h);
    this.updateStations(h);
    this.eventAcc += h;
    if (this.eventAcc >= 1) { this.eventAcc -= 1; this.rollSocialEvents(); }
    this.simTime += h;
    if (this.ceremony) this.updateCeremony(h);
    let removed = false;
    for (const [id, a] of this.agents) {
      if (a.bubble) { a.bubble.ttl -= h; if (a.bubble.ttl <= 0) a.bubble = null; }
      if (a.banner) { a.banner.ttl -= h; if (a.banner.ttl <= 0) a.banner = null; }
      if (a.aura > 0) a.aura = Math.max(0, a.aura - h);
      if (a.react > 0) { a.react -= h; if (a.react <= 0) a.anim = this.stateAnim(a); }
      if (a.state === 'gone') { this.agents.delete(id); removed = true; }
    }
    for (const j of this.jobs) for (const m of j.crew) if (m.bubble) { m.bubble.ttl -= h; if (m.bubble.ttl <= 0) m.bubble = null; }
    if (removed) this.version++;
  }

  // ---------- Days, schedule, arrivals ----------

  private advanceDay(): void {
    const prevYear = yearForDay(this.save.createdAt, this.save.day);
    this.save.day += 1;
    this.closing = false;
    const year = yearForDay(this.save.createdAt, this.save.day);
    if (year !== prevYear) {
      const changes = awardAnnual(this.c, this.save, prevYear, this.save.day);
      applyTitleChanges(this.chronicle, changes);
      (this.save.yearReviews ??= {})[String(prevYear)] = computeYearReview(this.c, this.save, prevYear);
      if (changes.length) {
        this.save.pendingCeremonyYear = prevYear;
        this.startCeremony(prevYear);
        this.pushFeed({ day: this.save.day, kind: 'ceremony', text: `🏆 The ${prevYear} Gym Legends Awards are on today!` });
      }
    }
  }

  private buildSchedule(fromTime: number): void {
    const L = this.settings.dayLength;
    const arr = this.c.population.arrival;
    this.schedule = [];
    for (const npc of Object.values(this.save.members)) {
      if (this.agents.has(npc.id)) continue;
      let frac: number;
      const cer = this.ceremony;
      if (npc.isPlayer) frac = 0.02;
      else if (cer && cer.stage === 'waiting' && cer.winners.some((w) => w.npcId === npc.id)) {
        frac = this.rng.range(this.c.events.ceremony.winnersArrive[0], this.c.events.ceremony.winnersArrive[1]); // winners turn up for the awards
      } else {
        if (!this.rng.chance(npc.attendance)) continue;
        const k = this.rng.weightedKey({ morning: arr.morning.share, evening: arr.evening.share, uniform: arr.uniform.share });
        frac = k === 'uniform' ? this.rng.range(arr.uniform.from, arr.uniform.to)
          : this.rng.normal(arr[k as 'morning' | 'evening'].mean, arr[k as 'morning' | 'evening'].sd);
      }
      frac = Math.min(0.88, Math.max(0.01, frac));
      const at = frac * L;
      if (at >= fromTime || npc.isPlayer) this.schedule.push({ npcId: npc.id, at: Math.max(at, fromTime) });
    }
    this.schedule.sort((a, b) => a.at - b.at);
  }

  private spawnArrivals(): void {
    const L = this.settings.dayLength;
    if (!this.closing && this.save.dayTime >= this.c.population.closingAt * L) {
      this.closing = true;
      this.schedule = [];
      for (const a of this.agents.values()) a.routine = a.routine.slice(0, a.index + 1); // finish current exercise, then go home
      this.pushFeed({ day: this.save.day, kind: 'info', text: 'Closing time. The lights dim a little.' });
    }
    while (this.schedule.length && this.schedule[0].at <= this.save.dayTime && this.agents.size < this.settings.cap) {
      const { npcId } = this.schedule.shift()!;
      const npc = this.save.members[npcId];
      if (npc && !this.agents.has(npcId)) this.spawn(npc);
    }
  }

  private registerVisit(npc: Npc, silent: boolean): void {
    const year = yearForDay(this.save.createdAt, this.save.day);
    ensureYear(npc, year);
    npc.stats.streak = npc.lastVisitDay === this.save.day - 1 ? npc.stats.streak + 1 : 1;
    npc.stats.bestStreak = Math.max(npc.stats.bestStreak, npc.stats.streak);
    npc.lastVisitDay = this.save.day;
    npc.stats.visits += 1;
    npc.yearly[String(year)].visits += 1;
    if (this.c.progression.streakMoments.includes(npc.stats.streak)) {
      recordMoment(this.chronicle, npc.id, 'streak', { zone: 'reception', detail: String(npc.stats.streak), silent });
    }
    applyTitleChanges(this.chronicle, evaluateTitles(this.c, this.save, this.save.day));
  }

  private spawn(npc: Npc): void {
    this.registerVisit(npc, false);
    const L = this.c.layout;
    const a: Agent = {
      npcId: npc.id, state: 'walking', pos: { ...L.entrance }, facing: Math.PI, path: [], after: null, afterTimer: null,
      timer: 0, routine: generateRoutine(this.c, npc, this.rng), index: 0, setsDone: 0, stationId: null, waitTime: 0,
      lockerSpot: this.freeLocker(), outfit: 'street', anim: 'walk', bubble: null, interactionId: null,
      paused: null, aura: 0, react: 0,
    };
    this.agents.set(npc.id, a);
    this.goTo(a, L.checkInSpot, 'checkIn');
    this.version++;
  }

  private freeLocker(): Vec2 {
    const L = this.c.layout.lockerSpots;
    const use = L.map((p) => [...this.agents.values()].filter((a) => a.lockerSpot.x === p.x && a.lockerSpot.z === p.z).length);
    const min = Math.min(...use);
    return this.rng.pick(L.filter((_, i) => use[i] === min));
  }

  // ---------- Movement ----------

  /** The station whose footprint contains `p` (own station first), if any. */
  private stationAt(p: Vec2, prefer?: string | null): Station | undefined {
    const own = prefer ? this.station(prefer) : undefined;
    if (own && inside(p, footprint(this.c, own.type, own.pos, own.rot), 0.2)) return own;
    return this.stations.find((st) => inside(p, footprint(this.c, st.type, st.pos, st.rot), 0.05));
  }

  /**
   * Waypoints from `from` to `to` on the nav grid. Members standing on a station first step off to its
   * approach point; with `via`, the path ends at that station's approach point and then steps onto `to`.
   */
  private plan(from: Vec2, to: Vec2, via?: Station | null, own?: string | null, stepOn = false): Vec2[] {
    const out: Vec2[] = [];
    let start = from;
    if (!this.nav.isFree(from)) {
      const st = this.stationAt(from, own);
      start = this.nav.nearestFree(st ? approachPoint(this.c, st) : from);
      out.push(start);
    }
    const goal = via ? this.nav.nearestFree(approachPoint(this.c, via)) : this.nav.nearestFree(to);
    const mid = this.nav.findPath(start, goal) ?? [goal];
    out.push(...mid);
    if (via || stepOn) out.push({ ...to });
    return out;
  }

  private goTo(a: Agent, target: Vec2, after: AgentState, afterTimer: number | null = null, via: Station | null = null, stepOn = false): void {
    if (!this.nav.isFree(a.pos)) {
      const leaving = this.stationAt(a.pos, a.stationId ?? a.lastStationId);
      if (leaving && leaving.id !== a.stationId) a.lastStationId = leaving.id;
    }
    a.path = this.plan(a.pos, target, via, a.stationId ?? a.lastStationId, stepOn);
    a.dest = { to: { ...target }, viaId: via?.id ?? null };
    a.state = 'walking';
    a.after = after;
    a.afterTimer = afterTimer;
    a.anim = 'walk';
  }

  /** After stations change (a build starts or a temporary station goes), re-route anyone whose path is now blocked. */
  private refreshNav(): void {
    this.nav.setStations(this.stations, this.ceremony && (this.ceremony.podiumUp || this.ceremony.stage === 'building') ? [this.podiumRect()] : []);
    for (const a of this.agents.values()) {
      if ((a.state !== 'walking' && a.state !== 'searching') || !a.dest) continue;
      let prev = a.pos, blocked = false;
      const n = a.dest.viaId ? a.path.length - 1 : a.path.length;
      for (let i = 0; i < n && !blocked; i++) { if (!this.nav.lineOfSight(prev, a.path[i]) && this.nav.isFree(prev)) blocked = true; prev = a.path[i]; }
      if (blocked) a.path = this.plan(a.pos, a.dest.to, a.dest.viaId ? this.station(a.dest.viaId) : null, a.stationId ?? a.lastStationId);
    }
  }

  /** Walk an agent along its path, gently steering away from other members on open floor. */
  private moveAgent(a: Agent, h: number, speed: number): { done: boolean; facing?: number } {
    const r = this.move(a.pos, a.path, h, speed);
    if (r.done || !this.nav.isFree(a.pos)) return r;
    let px = 0, pz = 0;
    for (const o of this.agents.values()) {
      if (o === a || o.state === 'gone') continue;
      const dx = a.pos.x - o.pos.x, dz = a.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5 && d > 1e-4) { px += (dx / d) * (0.5 - d); pz += (dz / d) * (0.5 - d); }
    }
    if (px || pz) {
      const nx = a.pos.x + px * h * 3, nz = a.pos.z + pz * h * 3;
      if (this.nav.isFree({ x: nx, z: nz })) { a.pos.x = nx; a.pos.z = nz; }
    }
    return r;
  }

  /** Moves along a path. Returns true when the path is finished. */
  private move(pos: Vec2, path: Vec2[], h: number, speed: number): { done: boolean; facing?: number } {
    let budget = speed * h;
    let facing: number | undefined;
    while (path.length && budget > 0) {
      const t = path[0];
      const dx = t.x - pos.x, dz = t.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) facing = Math.atan2(dx, dz);
      if (d <= budget) { pos.x = t.x; pos.z = t.z; path.shift(); budget -= d; }
      else { pos.x += (dx / d) * budget; pos.z += (dz / d) * budget; budget = 0; }
    }
    return { done: path.length === 0, facing };
  }

  // ---------- Agent state machine ----------

  private updateAgent(a: Agent, h: number): void {
    switch (a.state) {
      case 'walking': {
        const r = this.moveAgent(a, h, WALK_SPEED);
        if (r.facing !== undefined) a.facing = r.facing;
        if (r.done) {
          const next = a.after ?? 'choosing';
          const t = a.afterTimer;
          a.after = null; a.afterTimer = null;
          this.enter(a, next, t);
        }
        break;
      }
      case 'searching': {
        const r = this.moveAgent(a, h, WALK_SPEED * 0.8);
        if (r.facing !== undefined) a.facing = r.facing;
        if (r.done) {
          this.say(a, this.rng.pick(this.c.dialogue.lostBottle.found), 2.6);
          recordMoment(this.chronicle, a.npcId, 'lostBottle', { zone: this.zoneAt(a.pos) });
          const p = a.paused; a.paused = null;
          this.faceStation(a);
          this.enter(a, p?.state ?? 'resting', p?.timer ?? 2);
        }
        break;
      }
      case 'checkIn':
        a.timer -= h;
        if (a.timer <= 0) this.goTo(a, a.lockerSpot, 'changing');
        break;
      case 'changing':
        a.timer -= h;
        if (a.timer <= 0) { a.outfit = 'gym'; this.enter(a, 'choosing'); }
        break;
      case 'choosing':
        this.chooseStation(a);
        break;
      case 'waiting':
        a.waitTime += h;
        this.waitForStation(a);
        break;
      case 'lifting':
        a.timer -= h;
        if (a.timer <= 0) this.completeSet(a);
        break;
      case 'resting':
        a.timer -= h;
        if (a.timer <= 0) this.enter(a, 'lifting');
        break;
      case 'changingOut':
        a.timer -= h;
        if (a.timer <= 0) { a.outfit = 'street'; this.goTo(a, this.c.layout.entrance, 'gone'); }
        break;
      case 'break':
        a.timer -= h;
        if (a.timer <= 0) { a.breakKind = null; this.enter(a, 'choosing'); }
        break;
      case 'interacting':
      case 'gone':
        break;
    }
  }

  private enter(a: Agent, state: AgentState, timer: number | null = null): void {
    a.state = state;
    const item = a.routine[a.index];
    switch (state) {
      case 'checkIn':
        a.timer = 1.2;
        a.facing = Math.PI;
        if (this.rng.chance(0.35)) this.say(a, this.rng.pick(this.c.dialogue.checkIn));
        break;
      case 'changing':
      case 'changingOut':
        // face the locker: the open door screens the member from the room while they change
        a.timer = 2.5;
        a.facing = a.lockerSpot.x < -13.5 ? -Math.PI / 2 : Math.PI;
        a.lastStationId = null;
        break;
      case 'waiting': {
        a.waitTime = 0;
        const q = this.station(a.queueFor ?? null);
        if (q) a.facing = Math.atan2(q.pos.x - a.pos.x, q.pos.z - a.pos.z);
        break;
      }
      case 'break': {
        a.timer = timer ?? 3;
        const L = this.c.layout;
        const look = a.breakKind === 'water' ? L.waterCooler : a.breakKind === 'mirror' ? { x: a.pos.x, z: L.mirror.z } : a.breakKind === 'chalk' ? { x: a.pos.x - 0.1, z: a.pos.z - 1 } : null;
        if (look) a.facing = Math.atan2(look.x - a.pos.x, look.z - a.pos.z);
        break;
      }
      case 'lifting': {
        const st = this.station(a.stationId);
        if (!st || !item) { this.enter(a, 'choosing'); return; }
        a.queueFor = null;
        st.occupant = a.npcId;
        if (st.reservedBy === a.npcId) st.reservedBy = null;
        a.pos = { ...st.pos };
        a.facing = st.rot + Math.PI;
        a.timer = timer ?? item.liftSeconds;
        this.onSetStart(a, st);
        break;
      }
      case 'resting':
        a.timer = timer ?? item?.restSeconds ?? 5;
        break;
      case 'gone':
        break;
      default:
        if (timer !== null) a.timer = timer;
    }
    if (a.react <= 0) a.anim = this.stateAnim(a);
  }

  private stateAnim(a: Agent): Anim {
    switch (a.state) {
      case 'walking': return 'walk';
      case 'searching': return 'search';
      case 'lifting': {
        const ex = this.c.exerciseById[a.routine[a.index]?.exerciseId];
        return ex?.category === 'cardio' ? 'cardio' : ex?.category === 'mobility' || ex?.station === 'mat' ? 'stretch' : 'lift';
      }
      case 'interacting': return a.anim;
      case 'changing': case 'changingOut': return 'change';
      case 'break': return a.breakKind === 'water' ? 'drink' : a.breakKind === 'mirror' ? 'mirrorCheck' : a.breakKind === 'chalk' ? 'chalk' : 'phone';
      default: return 'idle';
    }
  }

  private activity(a: Agent): string {
    switch (a.state) {
      case 'walking': return a.after === 'gone' ? 'Heading home' : a.after === 'interacting' ? 'On a mission' : 'Walking';
      case 'checkIn': return 'Checking in';
      case 'changing': return 'Getting changed';
      case 'changingOut': return 'Changing to go home';
      case 'waiting': return 'Waiting for a station';
      case 'lifting': return `Set ${a.setsDone + 1}/${a.routine[a.index]?.sets ?? 1}`;
      case 'resting': return 'Resting';
      case 'break': return a.breakKind === 'water' ? 'Grabbing some water' : a.breakKind === 'mirror' ? 'Checking the mirror' : a.breakKind === 'chalk' ? 'Chalking up' : 'Scrolling on their phone';
      case 'searching': return 'Looking for water bottle';
      case 'interacting': {
        const it = a.interactionId ? this.interactions.get(a.interactionId) : undefined;
        return it?.type === 'flexOff' ? 'Flex-Off!' : it?.type === 'spot' ? 'Spotting' : 'Chatting';
      }
      default: return '';
    }
  }

  private station(id: string | null): Station | undefined {
    return id ? this.stations.find((s) => s.id === id) : undefined;
  }

  private isFree(s: Station): boolean { return !s.occupant && !s.reservedBy && !s.building; }

  private chooseStation(a: Agent): void {
    if (a.index >= a.routine.length) { this.finishVisit(a); return; }
    const ex = this.c.exerciseById[a.routine[a.index].exerciseId];
    const free = this.stations.filter((s) => s.type === ex.station && this.isFree(s));
    if (free.length) {
      const st = free.reduce((b, s) => (dist(s.pos, a.pos) < dist(b.pos, a.pos) ? s : b));
      st.reservedBy = a.npcId;
      a.stationId = st.id;
      a.setsDone = 0;
      this.goTo(a, st.pos, 'lifting', null, st);
      return;
    }
    // queue next to the nearest station of the right type and claim the first one that frees up
    const all = this.stations.filter((s) => s.type === ex.station && !s.building);
    const target = all.length ? all.reduce((b, s) => (dist(s.pos, a.pos) < dist(b.pos, a.pos) ? s : b)) : undefined;
    a.queueFor = target?.id ?? null;
    this.goTo(a, target ? this.queueSpot(target, a) : this.nav.nearestFree(this.c.layout.wanderPoints[0]), 'waiting');
  }

  /** A free spot in front of a busy station, fanning out sideways as more members queue there. */
  private queueSpot(st: Station, a: Agent): Vec2 {
    const n = [...this.agents.values()].filter((o) => o !== a && o.queueFor === st.id).length;
    const ap = approachPoint(this.c, st);
    const f = this.c.layout.footprints[st.type];
    const lz = f.z1 + 0.38 + 0.45 + Math.floor(n / 3) * 0.55;
    const want = stationLocal(st, [0, 0.6, -0.6][n % 3], lz);
    return this.nav.isFree(want) ? want : this.nav.nearestFree(this.nav.isFree(ap) ? want : ap);
  }

  private waitForStation(a: Agent): void {
    const ex = this.c.exerciseById[a.routine[a.index].exerciseId];
    const mine = this.stations.find((s) => s.reservedBy === a.npcId && !s.building);
    const queued = this.station(a.queueFor ?? null);
    const st = mine ?? (queued && this.isFree(queued) ? queued : this.stations.find((s) => s.type === ex.station && this.isFree(s)));
    if (st) {
      st.reservedBy = a.npcId;
      a.stationId = st.id;
      a.setsDone = 0;
      this.goTo(a, st.pos, 'lifting', null, st);
      return;
    }
    const ev = this.c.events.construction;
    const pending = this.stations.some((s) => s.reservedBy === a.npcId && s.building);
    if (!pending && a.waitTime > this.c.events.waitBeforeBuild) this.requestBuild(ex.station, a.npcId);
    if (a.waitTime > ev.waitBeforeSkip) {
      for (const s of this.stations) if (s.reservedBy === a.npcId) s.reservedBy = null;
      this.say(a, 'Skipping it.');
      a.index += 1;
      a.queueFor = null;
      this.enter(a, 'choosing');
    }
  }

  private onSetStart(a: Agent, st: Station): void {
    const npc = this.save.members[a.npcId];
    const ex = this.c.exerciseById[a.routine[a.index].exerciseId];
    const ev = this.c.events;
    if (this.rng.chance(ev.grunt.perTrigger * (npc.traits.includes('grunter') ? 1 : 0))) this.say(a, this.rng.pick(this.c.dialogue.grunt), 1.2);
    if (a.setsDone === 0 && ex.photoOp && ex.weight && this.rng.chance(ev.photoOp.perTrigger * this.mod(npc, 'photoOp'))) {
      const w = Math.round(((npc.weights[ex.id] ?? 0) * 1.6) / 5) * 5;
      this.say(a, this.rng.pick(this.c.dialogue.photoOp), 2.5);
      recordMoment(this.chronicle, a.npcId, 'photoOp', { zone: st.zone, detail: `${w} lb`, witnesses: this.witnesses(a) });
    }
    if (ex.spot) this.maybeStartSpot(a, st);
  }

  private completeSet(a: Agent): void {
    const item = a.routine[a.index];
    a.setsDone += 1;
    if (a.setsDone < item.sets) {
      const npc = this.save.members[a.npcId];
      npc.stats.restSeconds += item.restSeconds;
      npc.stats.restCount += 1;
      this.enter(a, 'resting', item.restSeconds);
      if (this.rng.chance(this.c.events.lostBottle.perTrigger * this.mod(npc, 'lostBottle'))) this.startSearch(a);
      return;
    }
    this.finishExercise(a);
  }

  private finishExercise(a: Agent): void {
    const npc = this.save.members[a.npcId];
    const item = a.routine[a.index];
    const st = this.station(a.stationId);
    const zone = st?.zone ?? this.zoneAt(a.pos);
    const pr = progressSession(this.c, npc, item.exerciseId, this.rng);
    if (pr) {
      this.notePr(npc, pr.lift, pr.weight);
      this.say(a, this.rng.pick(this.c.dialogue.pr.lifter), 2.8);
      a.anim = 'celebrate'; a.react = 2;
      const witnesses: string[] = [];
      for (const other of this.agentsNear(a.pos, this.c.events.prReaction.radius, a.npcId)) {
        if (other.state === 'interacting') continue;
        witnesses.push(other.npcId);
        const r = this.rng.next();
        if (r < this.c.events.prReaction.clap) { this.say(other, this.rng.pick(this.c.dialogue.pr.clap)); other.anim = 'clap'; other.react = 1.6; }
        else if (r < this.c.events.prReaction.clap + this.c.events.prReaction.pretend) this.say(other, this.rng.pick(this.c.dialogue.pr.pretend), 2.4);
      }
      recordMoment(this.chronicle, a.npcId, 'pr', { zone, witnesses, detail: `${LIFT_LABEL[pr.lift]} ${pr.weight}` });
    }
    if (st) {
      const ex = this.c.exerciseById[item.exerciseId];
      if (ex.weight && this.rng.chance(this.c.events.noRerack.perTrigger * this.mod(npc, 'noRerack'))) {
        st.unracked = this.c.events.noRerack.plateSeconds;
        this.say(a, this.rng.pick(this.c.dialogue.noRerack));
        recordMoment(this.chronicle, a.npcId, 'noRerack', { zone, witnesses: this.witnesses(a) });
      }
      st.occupant = null;
      if (st.reservedBy === a.npcId) st.reservedBy = null;
    }
    a.lastStationId = a.stationId;
    a.stationId = null;
    a.index += 1;
    if (!this.startBreak(a, st)) this.enter(a, 'choosing');
  }

  /** Between exercises: maybe a sip at the cooler, a mirror check, chalk before a heavy lift, or a phone scroll. */
  private startBreak(a: Agent, left: Station | undefined): boolean {
    const b = this.c.events.breaks;
    if (this.closing || a.index >= a.routine.length || !this.rng.chance(b.chance)) return false;
    const L = this.c.layout;
    const next = this.c.exerciseById[a.routine[a.index].exerciseId];
    let kind = this.rng.weightedKey(b.kinds) as BreakKind;
    if (kind === 'chalk' && !['platform', 'squatRack', 'pullupBar'].includes(next.station)) kind = 'water';
    let target: Vec2;
    switch (kind) {
      case 'water': target = this.nav.nearestFree({ x: L.coolerSpot.x + this.rng.range(-0.5, 0.5), z: L.coolerSpot.z }); break;
      case 'mirror': {
        const freeSpots = L.mirrorSpots.filter((p) => ![...this.agents.values()].some((o) => o !== a && dist(o.pos, p) < 0.5));
        if (!freeSpots.length) return false;
        target = this.rng.pick(freeSpots);
        break;
      }
      case 'chalk': target = L.chalkSpots.reduce((best, p) => (dist(p, a.pos) < dist(best, a.pos) ? p : best)); break;
      default: target = this.nav.nearestFree(left ? approachPoint(this.c, left) : a.pos);
    }
    a.breakKind = kind;
    this.goTo(a, target, 'break', b.seconds[kind]);
    return true;
  }

  private finishVisit(a: Agent): void {
    const npc = this.save.members[a.npcId];
    if (npc.isPlayer && !this.closing) {
      a.routine = generateRoutine(this.c, npc, this.rng);
      a.index = 0;
      this.goTo(a, this.rng.pick(this.c.layout.wanderPoints), 'choosing');
      return;
    }
    this.goTo(a, a.lockerSpot, 'changingOut');
  }

  private notePr(npc: Npc, lift: 'bench' | 'squat' | 'deadlift', weight: number): void {
    const year = yearForDay(this.save.createdAt, this.save.day);
    ensureYear(npc, year);
    const y = npc.yearly[String(year)];
    y.best[lift] = Math.max(y.best[lift], weight);
  }

  private startSearch(a: Agent): void {
    a.paused = { state: 'resting', timer: a.timer };
    this.say(a, this.rng.pick(this.c.dialogue.lostBottle.start), 2.4);
    const pts = this.rng.shuffle(this.c.layout.wanderPoints).slice(0, 2).map((p) => this.nav.nearestFree(p));
    const st = this.station(a.stationId);
    const path: Vec2[] = [];
    let from = a.pos;
    for (const p of pts) { path.push(...this.plan(from, p, null, a.stationId)); from = path[path.length - 1]; }
    path.push(...(st ? this.plan(from, st.pos, st) : this.plan(from, a.pos)));
    a.path = path;
    a.dest = st ? { to: { ...st.pos }, viaId: st.id } : null;
    a.state = 'searching';
    a.anim = 'search';
  }

  private faceStation(a: Agent): void {
    const st = this.station(a.stationId);
    if (st) a.facing = st.rot + Math.PI;
  }

  // ---------- Social events ----------

  private mod(npc: Npc, key: string): number {
    return npc.traits.reduce((m, t) => m * (this.c.traitById[t]?.modifiers[key] ?? 1), 1);
  }

  private agentsNear(p: Vec2, r: number, except?: string): Agent[] {
    const out: Agent[] = [];
    for (const a of this.agents.values()) if (a.npcId !== except && a.state !== 'gone' && dist(a.pos, p) <= r) out.push(a);
    return out;
  }

  private witnesses(a: Agent): string[] { return this.agentsNear(a.pos, 6, a.npcId).map((o) => o.npcId); }

  private available(a: Agent): boolean {
    return (a.state === 'resting' || (a.state === 'break' && (a.breakKind === 'water' || a.breakKind === 'phone'))) && !a.interactionId && a.timer > 2.5;
  }

  private rollSocialEvents(): void {
    this.rollRecognition();
    const ev = this.c.events;
    const resting = [...this.agents.values()].filter((a) => this.available(a));
    for (const a of resting) {
      if (!this.available(a)) continue;
      const npc = this.save.members[a.npcId];
      const near = (r: number) => resting.filter((b) => b !== a && this.available(b) && dist(a.pos, b.pos) <= r);
      if (this.rng.chance(ev.flexOff.perSecond * this.mod(npc, 'flexOff'))) {
        const cands = near(ev.flexOff.radius);
        if (cands.length && ![...this.interactions.values()].some((i) => i.type === 'flexOff')) {
          const b = this.rng.weighted(cands, (o) => (npc.familiarity[o.npcId]?.rival ? ev.flexOff.rivalBonus : 1) * this.mod(this.save.members[o.npcId], 'flexOff'));
          this.startFlexOff(a, b);
          continue;
        }
      }
      if (this.rng.chance(ev.flirt.perSecond * this.mod(npc, 'flirt'))) {
        const cands = near(ev.flirt.radius);
        if (cands.length) { this.startTalk(a, this.rng.pick(cands), 'flirt'); continue; }
      }
      if (this.rng.chance(ev.conversation.perSecond * this.mod(npc, 'conversation'))) {
        const cands = near(ev.conversation.radius);
        if (cands.length) { this.startTalk(a, this.rng.pick(cands), 'conversation'); continue; }
      }
    }
  }

  private newInteraction(type: Interaction['type'], participants: string[]): Interaction {
    this.save.seq += 1;
    const it: Interaction = { id: `i${this.save.seq}`, type, participants, stage: 'start', timer: 0, lines: [], lineIndex: 0, data: {} };
    this.interactions.set(it.id, it);
    return it;
  }

  private pause(a: Agent, it: Interaction): void {
    a.paused = { state: a.state, timer: a.timer };
    a.state = 'interacting';
    a.interactionId = it.id;
  }

  private resume(a: Agent): void {
    const p = a.paused ?? { state: 'choosing' as AgentState, timer: 0 };
    a.paused = null;
    a.elev = 0;
    a.interactionId = null;
    const st = this.station(a.stationId);
    if (st && dist(a.pos, st.pos) > 0.3) this.goTo(a, st.pos, p.state, p.timer, st);
    else { this.faceStation(a); this.enter(a, p.state, p.timer); }
  }

  private familiarity(aId: string, bId: string, score: number, rivalry = 0): void {
    for (const [x, y] of [[aId, bId], [bId, aId]]) {
      const npc = this.save.members[x];
      if (!npc) continue;
      const f = (npc.familiarity[y] ??= { score: 0, rivalry: 0, rival: false });
      f.score += score;
      f.rivalry += rivalry;
      if (f.rivalry >= this.c.events.flexOff.rivalryThreshold) f.rival = true;
    }
  }

  private startTalk(a: Agent, b: Agent, type: 'conversation' | 'flirt'): void {
    const it = this.newInteraction(type, [a.npcId, b.npcId]);
    this.pause(a, it); this.pause(b, it);
    a.facing = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    b.facing = Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    a.anim = 'talk'; b.anim = 'talk';
    const d = this.c.dialogue;
    if (type === 'conversation') it.lines = this.rng.pick(d.conversations).map((text, i) => ({ who: i % 2, text }));
    else {
      const [open, reply] = this.rng.pick(d.flirt);
      it.lines = [{ who: 0, text: open }, { who: 1, text: reply }, { who: 0, text: this.rng.pick(d.flirtExit) }];
    }
    it.timer = 0.2;
  }

  private startFlexOff(a: Agent, b: Agent): void {
    const it = this.newInteraction('flexOff', [a.npcId, b.npcId]);
    this.pause(a, it); this.pause(b, it);
    const spots = this.c.layout.mirrorSpots;
    const i = this.rng.int(0, spots.length - 2);
    this.say(a, this.rng.pick(this.c.dialogue.flexOff.start));
    this.goTo(a, spots[i], 'interacting');
    this.goTo(b, spots[i + 1], 'interacting');
    a.interactionId = it.id; b.interactionId = it.id;
    it.stage = 'gathering';
  }

  private maybeStartSpot(lifter: Agent, st: Station): void {
    const ev = this.c.events.spot;
    const cands = this.agentsNear(lifter.pos, ev.radius, lifter.npcId).filter((o) => this.available(o));
    if (!cands.length) return;
    const spotter = this.rng.weighted(cands, (o) => this.mod(this.save.members[o.npcId], 'spot'));
    if (!this.rng.chance(ev.perTrigger * this.mod(this.save.members[spotter.npcId], 'spot'))) return;
    const it = this.newInteraction('spot', [lifter.npcId, spotter.npcId]);
    it.data.setsDone = lifter.setsDone;
    this.pause(spotter, it);
    this.say(lifter, this.rng.pick(this.c.dialogue.spot.ask));
    // bench: behind the lifter's head; squat rack: right behind the lifter, inside the rack
    const spotAt = st.type === 'bench' ? stationLocal(st, 0, -1.0) : stationLocal(st, 0, 0.45);
    it.data.stationId = st.id;
    this.goTo(spotter, spotAt, 'interacting', null, this.nav.isFree(spotAt) ? null : st);
    spotter.interactionId = it.id;
    it.stage = 'spotting';
  }

  private updateInteraction(it: Interaction, h: number): void {
    if (it.type === 'ceremony') return; // driven by updateCeremony
    const [a, b] = it.participants.map((id) => this.agents.get(id));
    if (!a || !b) { this.endInteraction(it); return; }
    const d = this.c.dialogue;
    switch (it.type) {
      case 'conversation':
      case 'flirt': {
        it.timer -= h;
        if (it.timer > 0) return;
        if (it.lineIndex < it.lines.length) {
          const line = it.lines[it.lineIndex++];
          this.say(line.who === 0 ? a : b, line.text, this.c.events.conversation.lineSeconds + 0.4);
          it.timer = this.c.events.conversation.lineSeconds;
          return;
        }
        if (it.type === 'conversation') {
          this.familiarity(a.npcId, b.npcId, 1);
          this.save.members[a.npcId].stats.conversations += 1;
          this.save.members[b.npcId].stats.conversations += 1;
        } else {
          this.familiarity(a.npcId, b.npcId, 0.5);
          recordMoment(this.chronicle, a.npcId, 'flirtFail', { zone: this.zoneAt(a.pos), otherId: b.npcId, witnesses: this.witnesses(a) });
        }
        this.endInteraction(it);
        return;
      }
      case 'flexOff': {
        if (it.stage === 'gathering') {
          if (a.state === 'interacting' && b.state === 'interacting') {
            it.stage = 'posing';
            it.timer = this.c.events.flexOff.poseSeconds;
            a.facing = Math.PI; b.facing = Math.PI;
            a.anim = 'flex'; b.anim = 'flex';
            this.familiarity(a.npcId, b.npcId, 0.5, 1);
          }
          return;
        }
        it.timer -= h;
        if (it.timer > 0) return;
        if (it.stage === 'posing') {
          const outcome = this.rng.weightedKey(this.c.events.flexOff.outcomes);
          const zone: ZoneId = 'freeWeights';
          const witnesses = this.witnesses(a).filter((w) => w !== b.npcId);
          if (outcome === 'winner') {
            const [w, l] = this.rng.chance(0.5) ? [a, b] : [b, a];
            this.say(w, this.rng.pick(d.flexOff.winner), 2.6); w.anim = 'celebrate';
            this.say(l, this.rng.pick(d.flexOff.loser), 2.6); l.anim = 'idle';
            recordMoment(this.chronicle, w.npcId, 'flexOffWin', { zone, otherId: l.npcId, witnesses });
            recordMoment(this.chronicle, l.npcId, 'flexOffLoss', { zone, otherId: w.npcId, witnesses, silent: true });
          } else {
            const lines = outcome === 'mutual' ? d.flexOff.mutual : outcome === 'bothWon' ? d.flexOff.bothWon : ['...', '...'];
            this.say(a, lines[0], 2.6); this.say(b, lines[1], 2.6);
            if (outcome === 'laugh') {
              const near = this.agentsNear(a.pos, 8).filter((o) => o !== a && o !== b);
              if (near.length) this.say(this.rng.pick(near), this.rng.pick(d.flexOff.laugh), 2.4);
            }
            recordMoment(this.chronicle, a.npcId, 'flexOffDraw', { zone, otherId: b.npcId, witnesses });
          }
          it.stage = 'result';
          it.timer = 2.6;
          return;
        }
        this.endInteraction(it);
        return;
      }
      case 'spot': {
        const spotter = b;
        if (it.stage === 'spotting') {
          if (spotter.state === 'interacting' && spotter.anim !== 'spot') {
            spotter.anim = 'spot';
            const lst = this.station(a.stationId);
            if (lst) spotter.facing = Math.atan2(lst.pos.x - spotter.pos.x, lst.pos.z - spotter.pos.z);
          }
          const finished = a.state !== 'lifting' || a.setsDone !== it.data.setsDone;
          if (!finished) return;
          const over = this.rng.weightedKey(this.c.events.spot.outcomes) === 'overenthusiastic';
          if (over) {
            this.say(spotter, this.rng.pick(d.spot.overenthusiastic), 2.4);
            it.data.reply = this.rng.pick(d.spot.overReply);
            recordMoment(this.chronicle, spotter.npcId, 'overSpot', { zone: this.zoneAt(a.pos), otherId: a.npcId, witnesses: this.witnesses(a) });
          } else {
            this.say(spotter, d.spot.success[0], 2);
            this.say(a, d.spot.success[1], 2);
            recordMoment(this.chronicle, spotter.npcId, 'spot', { zone: this.zoneAt(a.pos), otherId: a.npcId, witnesses: this.witnesses(a) });
          }
          this.familiarity(a.npcId, spotter.npcId, 1);
          it.stage = 'after';
          it.timer = 1.6;
          return;
        }
        it.timer -= h;
        if (it.timer > 0) return;
        if (typeof it.data.reply === 'string') { this.say(a, it.data.reply, 2.2); it.data.reply = undefined; it.timer = 1.2; return; }
        this.interactions.delete(it.id);
        if (spotter.interactionId === it.id) this.resume(spotter);
        return;
      }
    }
  }

  private endInteraction(it: Interaction): void {
    this.interactions.delete(it.id);
    for (const id of it.participants) {
      const ag = this.agents.get(id);
      if (ag && ag.interactionId === it.id) this.resume(ag);
    }
  }

  // ---------- Stations & construction crew ----------

  private buildStations(): void {
    this.buildStationList();
    this.refreshNav();
  }

  private buildStationList(): void {
    const counts: Partial<Record<StationType, number>> = {};
    this.stations = this.c.layout.stations.map((s, i) => {
      counts[s.type] = (counts[s.type] ?? 0) + 1;
      return {
        id: `s${i}`, type: s.type, zone: s.zone, pos: { x: s.x, z: s.z }, rot: s.rot,
        label: `${STATION_LABEL[s.type]} #${counts[s.type]}`, temporary: false,
        occupant: null, reservedBy: null, building: false, idle: 0, unracked: 0,
      };
    });
  }

  private zoneForType(t: StationType): ZoneId {
    return this.c.layout.stations.find((s) => s.type === t)!.zone;
  }

  zoneAt(p: Vec2): ZoneId {
    for (const [id, z] of Object.entries(this.c.layout.zones)) {
      if (p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1) return id as ZoneId;
    }
    return 'social';
  }

  private requestBuild(type: StationType, npcId: string): void {
    const ev = this.c.events.construction;
    const ofType = this.stations.filter((s) => s.type === type);
    if (ofType.some((s) => s.building)) return;
    if (ofType.filter((s) => s.temporary).length >= ev.maxTemporaryPerType) return;
    const slot = (this.c.layout.tempSlots[type] ?? []).find((p) => !this.stations.some((s) => dist(s.pos, p) < 0.3));
    if (!slot) return;
    // don't build on top of someone
    const fp = footprint(this.c, type, slot, 0);
    if ([...this.agents.values()].some((a) => inside(a.pos, fp, 0.3))) return;
    this.save.seq += 1;
    const st: Station = {
      id: `tmp${this.save.seq}`, type, zone: this.zoneForType(type), pos: { ...slot }, rot: 0,
      label: `${STATION_LABEL[type]} #${ofType.length + 1}`, temporary: true,
      occupant: null, reservedBy: npcId, building: true, idle: 0, unracked: 0,
    };
    this.stations.push(st);
    this.refreshNav();
    this.startJob('build', st, npcId);
  }

  private startJob(kind: CrewJob['kind'], st: Station, requestedBy: string | null): void {
    const f = this.c.layout.footprints[st.type];
    const targets = [0, 1, 2].map((i) => stationLocal(st, (i - 1) * 0.65, f.z1 + 0.45));
    this.startCrew(kind, st.id, targets, requestedBy, this.rng.pick(this.c.dialogue.crew[kind === 'build' ? 'arrive' : 'remove']));
    if (kind === 'remove') st.building = true;
  }

  private startCrew(kind: CrewJob['kind'], stationId: string, targets: Vec2[], requestedBy: string | null, line: string): void {
    this.save.seq += 1;
    const entrance = this.c.layout.entrance;
    const crew: CrewMember[] = targets.map((t, i) => {
      const target = this.nav.nearestFree(t);
      const start = { x: entrance.x + (i - 1) * 0.4, z: entrance.z };
      return { id: `c${this.save.seq}-${i}`, slot: i, pos: start, facing: Math.PI, path: this.plan(start, target), anim: 'walk', bubble: null };
    });
    crew[0].bubble = { text: line, ttl: 2.5 };
    this.jobs.push({ id: `job${this.save.seq}`, kind, stationId, stage: 'arriving', timer: 0, crew, requestedBy, gag: null });
    this.version++;
  }

  private crewSay(m: CrewMember, text: string, ttl = 2.2): void { m.bubble = { text, ttl }; }

  private updateJobs(h: number): void {
    const d = this.c.dialogue.crew;
    for (const job of [...this.jobs]) {
      const st = this.station(job.stationId);
      switch (job.stage) {
        case 'arriving': {
          let done = true;
          for (const m of job.crew) if (!this.moveCrew(m, h)) done = false;
          if (!done) break;
          job.stage = 'working';
          const focus = st?.pos ?? (job.kind === 'podium' || job.kind === 'podiumRemove' ? this.c.layout.podium : null);
          if (focus) for (const m of job.crew) m.facing = Math.atan2(focus.x - m.pos.x, focus.z - m.pos.z);
          job.timer = job.kind === 'build' || job.kind === 'podium' ? this.c.events.construction.buildSeconds : 3;
          if (job.kind === 'podium' && this.ceremony && this.rng.chance(this.c.events.construction.gagChance)) {
            job.gag = 'backwards';
            this.ceremony.podiumRot = Math.PI;
            this.crewSay(job.crew[1], d.backwards[0]);
          }
          for (const m of job.crew) m.anim = 'build';
          if (job.kind === 'build' && st && this.rng.chance(this.c.events.construction.gagChance)) {
            job.gag = this.rng.chance(0.5) ? 'backwards' : 'drop';
            if (job.gag === 'backwards') { st.rot += Math.PI; this.crewSay(job.crew[1], d.backwards[0]); }
            else this.crewSay(job.crew[2], this.rng.pick(d.drop));
          }
          break;
        }
        case 'working': {
          const before = job.timer;
          job.timer -= h;
          if (job.gag === 'backwards' && st && before > 3 && job.timer <= 3) { st.rot -= Math.PI; this.crewSay(job.crew[0], d.backwards[1]); }
          if (job.gag === 'backwards' && job.kind === 'podium' && this.ceremony && before > 3 && job.timer <= 3) { this.ceremony.podiumRot = 0; this.crewSay(job.crew[0], d.backwards[1]); }
          if (job.timer > 0) break;
          if (job.kind === 'podium') {
            job.stage = 'celebrating';
            job.timer = 2;
            for (const m of job.crew) m.anim = 'celebrate';
            this.crewSay(job.crew[2], this.rng.pick(d.celebrate));
            if (this.ceremony) { this.ceremony.podiumUp = true; this.ceremony.stage = 'gathering'; this.ceremony.timer = this.c.events.ceremony.gatherSeconds; }
            this.refreshNav();
            break;
          }
          if (job.kind === 'podiumRemove') {
            this.ceremony = null;
            this.refreshNav();
            this.version++;
            this.beginLeaving(job);
            break;
          }
          if (job.kind === 'build' && st) {
            st.building = false;
            job.stage = 'celebrating';
            job.timer = 2;
            for (const m of job.crew) { m.anim = 'celebrate'; }
            this.crewSay(job.crew[this.rng.int(0, 2)], this.rng.pick(d.celebrate));
            const fav = this.save.titles.find((t) => t.titleId === 'crewFavourite' && t.current);
            if (fav && this.agents.has(fav.holderId)) {
              const npc = this.save.members[fav.holderId];
              this.crewSay(job.crew[0], this.rng.pick(d.wave).replace('{name}', npc.firstName), 2.8);
            }
            const req = job.requestedBy && this.agents.get(job.requestedBy);
            if (req && st.reservedBy === job.requestedBy) {
              recordMoment(this.chronicle, job.requestedBy!, 'construction', { zone: st.zone, detail: st.label, witnesses: this.witnesses(req) });
            } else if (st.reservedBy === job.requestedBy) st.reservedBy = null;
          } else {
            if (st) { this.stations = this.stations.filter((s) => s !== st); this.refreshNav(); }
            this.version++;
            this.beginLeaving(job);
          }
          break;
        }
        case 'celebrating':
          job.timer -= h;
          if (job.timer <= 0) this.beginLeaving(job);
          break;
        case 'leaving': {
          let done = true;
          for (const m of job.crew) if (!this.moveCrew(m, h)) done = false;
          if (done) { this.jobs = this.jobs.filter((j) => j !== job); this.version++; }
          break;
        }
      }
    }
  }

  private moveCrew(m: CrewMember, h: number): boolean {
    const r = this.move(m.pos, m.path, h, CREW_SPEED);
    if (r.facing !== undefined) m.facing = r.facing;
    return r.done;
  }

  private beginLeaving(job: CrewJob): void {
    job.stage = 'leaving';
    const e = this.c.layout.entrance;
    for (const m of job.crew) { m.anim = 'walk'; m.path = this.plan(m.pos, e); }
  }

  private updateStations(h: number): void {
    for (const s of this.stations) {
      if (s.unracked > 0) s.unracked = Math.max(0, s.unracked - h);
      if (!s.temporary) continue;
      if (s.occupant || s.reservedBy || s.building) { s.idle = 0; continue; }
      s.idle += h;
      if (s.idle > this.c.events.construction.removeAfterIdle && !this.jobs.some((j) => j.stationId === s.id)) this.startJob('remove', s, null);
    }
  }

  // ---------- Gym Legends: awards ceremony and recognition ----------

  private podiumRect(): Rect {
    const p = this.c.layout.podium;
    return { x0: p.x - 0.55, x1: p.x + 0.55, z0: p.z - 1.95, z1: p.z + 1.95 };
  }

  /** Where winner number `i` stands (on a block, or beside the podium for 4th and 5th). The podium faces +X. */
  podiumSpot(i: number): { pos: Vec2; h: number } {
    const p = this.c.layout.podium, s = PODIUM_SPOTS[Math.min(i, PODIUM_SPOTS.length - 1)];
    return { pos: { x: s.h ? p.x : p.x + 0.85, z: p.z - s.x }, h: s.h };
  }

  private startCeremony(year: number): void {
    const winners: CeremonyWinner[] = [];
    const order = ['benchKing', 'benchQueen', 'squatMonarch', 'mostImproved', 'mostConsistent'];
    const recs = this.save.titles.filter((t) => t.year === year && this.c.titleById[t.titleId]?.category === 'annual' && this.save.members[t.holderId])
      .sort((a, b) => order.indexOf(a.titleId) - order.indexOf(b.titleId));
    for (const r of recs) {
      const w = winners.find((x) => x.npcId === r.holderId);
      const label = titleLabel(this.c, r);
      if (w) w.labels.push(label);
      else winners.push({ npcId: r.holderId, name: r.holderName, labels: [label], place: winners.length });
    }
    this.ceremony = { year, day: this.save.day, stage: 'waiting', timer: 0, winners, called: [], onStage: [], interactionId: null, podiumUp: false, podiumRot: 0 };
  }

  private interruptible(a: Agent): boolean {
    return !a.interactionId && (a.state === 'resting' || a.state === 'break' || a.state === 'waiting' || a.state === 'choosing');
  }

  private updateCeremony(h: number): void {
    const cer = this.ceremony!;
    const cfg = this.c.events.ceremony;
    const L = this.settings.dayLength;
    const d = this.c.dialogue.ceremony;
    const isWinner = (id: string) => cer.winners.some((w) => w.npcId === id);
    const callIn = (a: Agent, to: Vec2, stepOn: boolean) => {
      let inter = cer.interactionId ? this.interactions.get(cer.interactionId) : undefined;
      if (!inter) { inter = this.newInteraction('ceremony', []); cer.interactionId = inter.id; }
      inter.participants.push(a.npcId);
      cer.called.push(a.npcId);
      this.pause(a, inter);
      this.goTo(a, to, 'interacting', null, null, stepOn);
      a.interactionId = inter.id;
    };
    const arrived = (id: string) => { const a = this.agents.get(id); return !!a && a.state === 'interacting' && a.path.length === 0; };
    switch (cer.stage) {
      case 'waiting':
        if (this.save.dayTime >= cfg.startAt * L) {
          cer.stage = 'building';
          const p = this.c.layout.podium;
          this.refreshNav();
          this.startCrew('podium', '', [{ x: p.x + 0.95, z: p.z - 0.9 }, { x: p.x + 0.95, z: p.z }, { x: p.x + 0.95, z: p.z + 0.9 }], null, this.rng.pick(d.podium));
          this.pushFeed({ day: this.save.day, kind: 'ceremony', text: `🏆 ${d.announce[0].replace('{year}', String(cer.year))} The crew is building the podium.` });
        }
        return;
      case 'building':
        return;
      case 'gathering': {
        cer.timer -= h;
        for (const w of cer.winners) {
          const a = this.agents.get(w.npcId);
          if (!a || cer.called.includes(a.npcId) || !this.interruptible(a)) continue;
          const spot = this.podiumSpot(w.place);
          callIn(a, spot.pos, spot.h > 0);
          this.say(a, "Oh! That's me!", 2);
        }
        const p = this.c.layout.podium;
        for (const a of this.agents.values()) {
          if (cer.called.filter((id) => !isWinner(id)).length >= cfg.crowd) break;
          if (cer.called.includes(a.npcId) || isWinner(a.npcId) || !this.interruptible(a)) continue;
          const n = cer.called.filter((id) => !isWinner(id)).length;
          const spot = this.nav.nearestFree({ x: p.x + 2.1 + (n % 2) * 0.75, z: p.z - 1.5 + (Math.floor(n / 2) % 4) * 1.0 });
          callIn(a, spot, false);
        }
        const present = cer.winners.filter((w) => this.agents.has(w.npcId));
        const winnersUp = present.filter((w) => cer.called.includes(w.npcId) && arrived(w.npcId));
        const everyoneHere = present.length > 0 && winnersUp.length === present.length;
        if (everyoneHere || (cer.timer <= 0 && (winnersUp.length > 0 || cer.timer <= -20))) this.startPosing(cer, winnersUp.map((w) => w.npcId));
        return;
      }
      case 'posing':
        cer.timer -= h;
        if (cer.timer <= 0) {
          cer.stage = 'speech';
          cer.timer = cfg.speechSeconds;
          const first = cer.onStage.map((id) => this.agents.get(id)).find(Boolean);
          if (first) this.say(first, this.rng.pick(d.winner), cfg.speechSeconds);
          for (const id of cer.called) {
            const a = this.agents.get(id);
            if (a && !cer.onStage.includes(id) && a.state === 'interacting') { a.anim = 'clap'; if (this.rng.chance(0.3)) this.say(a, this.rng.pick(d.crowd), 2); }
          }
        }
        return;
      case 'speech':
        cer.timer -= h;
        if (cer.timer <= 0) this.closeCeremony(cer);
        return;
      case 'closing':
        return;
    }
  }

  private startPosing(cer: Ceremony, onStage: string[]): void {
    const cfg = this.c.events.ceremony;
    const d = this.c.dialogue.ceremony;
    cer.stage = 'posing';
    cer.timer = cfg.poseSeconds;
    cer.onStage = onStage;
    const p = this.c.layout.podium;
    for (const id of cer.called) {
      const a = this.agents.get(id);
      if (!a || a.state !== 'interacting' || a.path.length) continue;
      const w = cer.winners.find((x) => x.npcId === id);
      if (w && onStage.includes(id)) {
        a.facing = Math.PI / 2;
        a.elev = this.podiumSpot(w.place).h;
        a.anim = 'podium';
        a.banner = { text: `🏆 ${w.labels.join(' · ')}`, ttl: cfg.poseSeconds + cfg.speechSeconds };
        recordMoment(this.chronicle, id, 'ceremony', { zone: 'social', detail: w.labels.join(' & '), witnesses: cer.called.filter((x) => x !== id), silent: true });
      } else {
        a.facing = Math.atan2(p.x - a.pos.x, p.z - a.pos.z);
        a.anim = 'clap';
        if (this.rng.chance(0.4)) this.say(a, this.rng.pick(d.crowd), 2.5);
      }
    }
    const host = this.jobs.find((j) => j.kind === 'podium')?.crew[0];
    if (host) this.crewSay(host, this.rng.pick(d.host), 3);
  }

  private closeCeremony(cer: Ceremony): void {
    cer.stage = 'closing';
    const names = cer.onStage.map((id) => this.save.members[id]).filter((n): n is Npc => !!n).map((n) => fullName(n));
    this.pushFeed({
      day: this.save.day, kind: 'ceremony',
      text: names.length ? `🏆 ${names.join(', ')} took a bow at the ${cer.year} Gym Legends Awards.` : `🏆 Nobody turned up to collect a trophy at the ${cer.year} Awards. The crew clapped anyway.`,
    });
    this.save.pendingCeremonyYear = undefined;
    const inter = cer.interactionId ? this.interactions.get(cer.interactionId) : undefined;
    if (inter) this.endInteraction(inter);
    cer.interactionId = null;
    const p = this.c.layout.podium;
    this.startCrew('podiumRemove', '', [{ x: p.x + 0.95, z: p.z - 0.9 }, { x: p.x + 0.95, z: p.z }, { x: p.x + 0.95, z: p.z + 0.9 }], null, this.rng.pick(this.c.dialogue.crew.remove));
  }

  /** Members near a title holder sometimes nod, do a double take, or copy the Mirror Champion's pose. */
  private rollRecognition(): void {
    const ev = this.c.events.recognition;
    const d = this.c.dialogue.recognition;
    for (const t of this.agents.values()) {
      if (t.interactionId || t.state === 'gone') continue;
      const ft = featuredTitle(this.c, this.save, t.npcId);
      if (!ft) continue;
      const holder = this.save.members[t.npcId];
      for (const o of this.agentsNear(t.pos, ev.radius, t.npcId)) {
        if (o.interactionId || o.react > 0 || !(o.state === 'resting' || o.state === 'break' || o.state === 'waiting')) continue;
        const key = `${t.npcId}|${o.npcId}`;
        if ((this.recognitionCooldown.get(key) ?? -Infinity) > this.simTime - ev.cooldown) continue;
        if (!this.rng.chance(ev.perSecond)) continue;
        this.recognitionCooldown.set(key, this.simTime);
        let kind = this.rng.weightedKey(ev.kinds) as 'nod' | 'doubleTake' | 'imitate';
        if (kind === 'imitate' && ft.titleId !== 'mirrorChampion') kind = 'nod';
        o.facing = Math.atan2(t.pos.x - o.pos.x, t.pos.z - o.pos.z);
        o.anim = kind === 'nod' ? 'nod' : kind === 'doubleTake' ? 'doubleTake' : 'flex';
        o.react = kind === 'imitate' ? 2.5 : 1.6;
        this.say(o, this.rng.pick(d[kind]).replace('{name}', holder.firstName), 2.4);
      }
    }
  }

  // ---------- Helpers ----------

  say(a: Agent, text: string, ttl = 2.2): void { a.bubble = { text, ttl }; }

  private pushFeed(item: Omit<FeedItem, 'id'>): void {
    if (this.quiet && item.kind !== 'ceremony') return;
    this.save.seq += 1;
    const f: FeedItem = { ...item, id: `f${this.save.seq}` };
    this.feed.push(f);
    if (this.feed.length > 60) this.feed.shift();
    for (const fn of this.feedListeners) fn(f);
  }

  private addMembers(n: number): void {
    const taken = new Set(Object.values(this.save.members).map(nameKey));
    for (let i = 0; i < n; i++) {
      this.save.seq += 1;
      const npc = createNpc(this.c, this.rng, { id: `n${this.save.seq}`, day: this.save.day, taken, mixChance: this.settings.mixChance });
      this.save.members[npc.id] = npc;
    }
  }

  private removeMembers(ids: string[]): void {
    const set = new Set(ids);
    for (const t of this.save.titles) {
      if (!set.has(t.holderId)) continue;
      t.holderLeft = true;
      if (this.c.titleById[t.titleId]?.category !== 'annual') t.current = false;
    }
    for (const id of ids) {
      delete this.save.members[id];
      this.agents.delete(id);
    }
    for (const npc of Object.values(this.save.members)) for (const id of ids) delete npc.familiarity[id];
    this.version++;
  }

  private clearRuntime(): void {
    this.agents.clear();
    this.interactions.clear();
    this.jobs = [];
    this.buildStations();
    this.version++;
  }

  /** Days of real time that passed since the last save, in gym days. */
  daysAway(now = Date.now()): number {
    const seconds = (now - this.save.lastSavedAt) / 1000;
    return Math.floor((seconds + this.save.dayTime) / this.settings.dayLength);
  }

  isoToday(): string { return isoForDay(this.save.createdAt, this.save.day); }

  // Used by tests / debugging
  debugRecord(npcId: string, type: MomentType): void { recordMoment(this.chronicle, npcId, type, { zone: 'bench' }); }
}
