// SimEngine: the whole living gym. Pure TypeScript, no React or Three.js, so it runs headless in tests.
// Runs on a fixed 0.1 s step. The renderer reads agent/station/crew state every frame.
import type { Content } from './content';
import type {
  Agent, AgentState, CrewJob, CrewMember, FeedItem, Interaction, MomentType, Npc, SaveData, Station,
  StationType, Vec2, ZoneId, Anim,
} from './types';
import { Rng } from './rng';
import { createNpc, isRegular } from './npc';
import { generateRoutine } from './routine';
import { progressSession } from './progression';
import { awardAnnual, ensureYear, evaluateTitles, featuredTitle, titleLabel } from './legends';
import { applyTitleChanges, recordMoment, type Chronicle } from './chronicle';
import { fullName, nameKey } from './names';
import { formatDate, isoForDay, todayIso, yearForDay } from './calendar';

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
  ceremony: { year: number; timer: number } | null = null;
  private acc = 0;
  private quiet = false; // suppresses per-event feed lines during catch-up
  private eventAcc = 0;
  private closing = false;
  private feedListeners = new Set<(f: FeedItem) => void>();
  readonly chronicle: Chronicle;

  constructor(c: Content, save: SaveData, settings: EngineSettings, seed?: number) {
    this.c = c;
    this.save = save;
    this.settings = settings;
    this.rng = new Rng(seed);
    this.chronicle = {
      c, save,
      feed: (item) => this.pushFeed(item),
      onTitle: (change) => {
        const a = this.agents.get(change.record.holderId);
        if (a && change.kind === 'won') {
          this.say(a, `⭐ ${titleLabel(c, change.record)}`, 3.5);
          for (const other of this.agentsNear(a.pos, 6, a.npcId)) if (this.rng.chance(0.4)) this.say(other, this.rng.pick(c.dialogue.title.react));
        }
      },
    };
    this.buildStations();
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
    if (this.ceremony) { this.ceremony.timer -= h; if (this.ceremony.timer <= 0) this.ceremony = null; }
    let removed = false;
    for (const [id, a] of this.agents) {
      if (a.bubble) { a.bubble.ttl -= h; if (a.bubble.ttl <= 0) a.bubble = null; }
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
      if (changes.length) {
        this.save.pendingCeremonyYear = prevYear;
        this.ceremony = { year: prevYear, timer: this.settings.dayLength * 0.25 };
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
      if (npc.isPlayer) frac = 0.02;
      else {
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

  private inLockers(p: Vec2): boolean {
    const z = this.c.layout.zones.lockers;
    return p.x < z.x1 + 0.05 && p.z < z.z1 + 0.3;
  }

  private route(from: Vec2, to: Vec2): Vec2[] {
    const door = this.c.layout.lockerDoor;
    const fromIn = this.inLockers(from), toIn = this.inLockers(to);
    if (fromIn === toIn) return [{ ...to }];
    if (fromIn) {
      const out: Vec2[] = [door.inside, door.outside];
      if (to.x < door.outside.x) out.push({ x: door.outside.x, z: to.z });
      return [...out, { ...to }];
    }
    const pre: Vec2[] = from.x < door.outside.x ? [{ x: door.outside.x, z: from.z }] : [];
    return [...pre, door.outside, door.inside, { ...to }];
  }

  private goTo(a: Agent, target: Vec2, after: AgentState, afterTimer: number | null = null): void {
    a.path = this.route(a.pos, target);
    a.state = 'walking';
    a.after = after;
    a.afterTimer = afterTimer;
    a.anim = 'walk';
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
        const r = this.move(a.pos, a.path, h, WALK_SPEED);
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
        const r = this.move(a.pos, a.path, h, WALK_SPEED * 0.8);
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
        a.timer = 2.5;
        break;
      case 'waiting':
        a.waitTime = 0;
        break;
      case 'lifting': {
        const st = this.station(a.stationId);
        if (!st || !item) { this.enter(a, 'choosing'); return; }
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
      this.goTo(a, st.pos, 'lifting');
      return;
    }
    const z = this.c.layout.zones[this.zoneForType(ex.station)];
    const spot = { x: this.rng.range(z.x0 + 0.4, z.x1 - 0.4), z: z.z1 + 0.5 };
    this.goTo(a, spot, 'waiting');
  }

  private waitForStation(a: Agent): void {
    const ex = this.c.exerciseById[a.routine[a.index].exerciseId];
    const mine = this.stations.find((s) => s.reservedBy === a.npcId && !s.building);
    const st = mine ?? this.stations.find((s) => s.type === ex.station && this.isFree(s));
    if (st) {
      st.reservedBy = a.npcId;
      a.stationId = st.id;
      a.setsDone = 0;
      this.goTo(a, st.pos, 'lifting');
      return;
    }
    const ev = this.c.events.construction;
    const pending = this.stations.some((s) => s.reservedBy === a.npcId && s.building);
    if (!pending && a.waitTime > this.c.events.waitBeforeBuild) this.requestBuild(ex.station, a.npcId);
    if (a.waitTime > ev.waitBeforeSkip) {
      for (const s of this.stations) if (s.reservedBy === a.npcId) s.reservedBy = null;
      this.say(a, 'Skipping it.');
      a.index += 1;
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
    a.stationId = null;
    a.index += 1;
    this.enter(a, 'choosing');
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
    const pts = this.rng.shuffle(this.c.layout.wanderPoints).slice(0, 2);
    const st = this.station(a.stationId);
    const path: Vec2[] = [];
    let from = a.pos;
    for (const p of [...pts, st ? st.pos : a.pos]) { path.push(...this.route(from, p)); from = p; }
    a.path = path;
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

  private available(a: Agent): boolean { return a.state === 'resting' && !a.interactionId && a.timer > 2.5; }

  private rollSocialEvents(): void {
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
    a.interactionId = null;
    const st = this.station(a.stationId);
    if (st && dist(a.pos, st.pos) > 0.3) this.goTo(a, st.pos, p.state, p.timer);
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
    this.goTo(spotter, { x: st.pos.x, z: st.pos.z - 0.9 }, 'interacting');
    spotter.interactionId = it.id;
    it.stage = 'spotting';
  }

  private updateInteraction(it: Interaction, h: number): void {
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
          if (spotter.state === 'interacting' && spotter.anim !== 'idle') spotter.anim = 'idle';
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
    this.save.seq += 1;
    const st: Station = {
      id: `tmp${this.save.seq}`, type, zone: this.zoneForType(type), pos: { ...slot }, rot: 0,
      label: `${STATION_LABEL[type]} #${ofType.length + 1}`, temporary: true,
      occupant: null, reservedBy: npcId, building: true, idle: 0, unracked: 0,
    };
    this.stations.push(st);
    this.startJob('build', st, npcId);
  }

  private startJob(kind: CrewJob['kind'], st: Station, requestedBy: string | null): void {
    this.save.seq += 1;
    const entrance = this.c.layout.entrance;
    const crew: CrewMember[] = [0, 1, 2].map((i) => {
      const target = { x: st.pos.x + (i - 1) * 0.7, z: st.pos.z + 0.9 };
      const start = { x: entrance.x + i * 0.4, z: entrance.z + i * 0.3 };
      return { id: `c${this.save.seq}-${i}`, pos: start, path: [{ x: entrance.x, z: 4.5 }, { x: target.x, z: 4.5 }, target], anim: 'walk', bubble: null };
    });
    crew[0].bubble = { text: this.rng.pick(this.c.dialogue.crew[kind === 'build' ? 'arrive' : 'remove']), ttl: 2.5 };
    this.jobs.push({ id: `job${this.save.seq}`, kind, stationId: st.id, stage: 'arriving', timer: 0, crew, requestedBy, gag: null });
    if (kind === 'remove') st.building = true;
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
          for (const m of job.crew) if (!this.move(m.pos, m.path, h, CREW_SPEED).done) done = false;
          if (!done) break;
          job.stage = 'working';
          job.timer = job.kind === 'build' ? this.c.events.construction.buildSeconds : 3;
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
          if (job.timer > 0) break;
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
            if (st) this.stations = this.stations.filter((s) => s !== st);
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
          for (const m of job.crew) if (!this.move(m.pos, m.path, h, CREW_SPEED).done) done = false;
          if (done) { this.jobs = this.jobs.filter((j) => j !== job); this.version++; }
          break;
        }
      }
    }
  }

  private beginLeaving(job: CrewJob): void {
    job.stage = 'leaving';
    const e = this.c.layout.entrance;
    for (const m of job.crew) { m.anim = 'walk'; m.path = [{ x: m.pos.x, z: 4.5 }, { x: e.x, z: 4.5 }, { ...e }]; }
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
