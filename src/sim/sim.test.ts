import { describe, expect, it } from 'vitest';
import { content as c } from './content';
import { Rng } from './rng';
import { generateName, nameKey } from './names';
import { createNpc } from './npc';
import { generateRoutine } from './routine';
import { progressSession } from './progression';
import { evaluateTitles, awardAnnual, featuredTitle, titleLabel } from './legends';
import { recordMoment, type Chronicle } from './chronicle';
import { SimEngine, STEP } from './engine';
import type { SaveData } from './types';
import { footprint, inside, overlaps } from './footprint';
import { NavGrid, approachPoint } from './nav';
import { migrateSave } from '../store/migrate';

const settings = { dayLength: 600, cap: 25, members: 50, mixChance: 0 };

describe('content', () => {
  it('every name pool has 50 unique male, female and last names', () => {
    expect(c.names.length).toBeGreaterThanOrEqual(12);
    for (const p of c.names) {
      for (const list of [p.male, p.female, p.last]) {
        expect(list).toHaveLength(50);
        expect(new Set(list).size).toBe(50);
      }
    }
  });
  it('every exercise uses a station type that exists in the layout', () => {
    const types = new Set(c.layout.stations.map((s) => s.type));
    for (const e of c.exercises) expect(types.has(e.station), e.id).toBe(true);
  });
  it('dialogue, titles and moments reference known stats', () => {
    for (const t of c.titles) if (t.stat && t.stat !== 'avgRest') expect(['visits','prs','flexOffWins','flexOffLosses','spots','overSpots','constructionTriggers','lostBottles','noReracks','photoOps','flirtFails','conversations','restSeconds','restCount','streak','bestStreak']).toContain(t.stat);
  });
});

describe('layout', () => {
  it('no two stations (including every temporary build slot) overlap, and all fit on the floor', () => {
    const rects = [
      ...c.layout.stations.map((s) => ({ name: `${s.type}@${s.x},${s.z}`, r: footprint(c, s.type, s, s.rot) })),
      ...Object.entries(c.layout.tempSlots).flatMap(([type, slots]) => slots.map((p) => ({ name: `temp ${type}@${p.x},${p.z}`, r: footprint(c, type as never, p, 0) }))),
    ];
    const b = c.layout.bounds;
    for (const { name, r } of rects) {
      expect(r.x0 >= b.x0 && r.x1 <= b.x1 && r.z0 >= b.z0 && r.z1 <= b.z1, `${name} is off the floor`).toBe(true);
      expect(r.x1 <= -9 && r.z0 <= -1.6, `${name} is inside the locker room`).toBe(false);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      expect(overlaps(rects[i].r, rects[j].r), `${rects[i].name} overlaps ${rects[j].name}`).toBe(false);
    }
  });
});

describe('navigation', () => {
  it('every station, build slot, locker, mirror spot, chalk spot and the cooler can be reached from the entrance', () => {
    const nav = new NavGrid(c);
    const eng = new SimEngine(c, saveWith(5), settings, 1);
    nav.setStations(eng.stations);
    const start = nav.nearestFree(c.layout.checkInSpot);
    const L = c.layout;
    const targets = [
      ...eng.stations.map((s) => ({ name: s.label, p: approachPoint(c, s) })),
      ...Object.entries(L.tempSlots).flatMap(([type, slots]) => slots.map((p) => ({ name: `temp ${type}`, p: approachPoint(c, { type: type as never, pos: p, rot: 0 }) }))),
      ...L.lockerSpots.map((p, i) => ({ name: `locker ${i}`, p })),
      ...L.mirrorSpots.map((p, i) => ({ name: `mirror ${i}`, p })),
      ...L.chalkSpots.map((p, i) => ({ name: `chalk ${i}`, p })),
      { name: 'cooler', p: L.coolerSpot }, { name: 'entrance', p: L.entrance },
    ];
    for (const t of targets) {
      expect(nav.isFree(t.p), `${t.name} at ${t.p.x},${t.p.z} is blocked`).toBe(true);
      expect(nav.findPath(start, t.p), `${t.name} is unreachable`).not.toBeNull();
    }
  });
});

describe('saves', () => {
  it('a healthy save migrates untouched and survives a JSON round trip', () => {
    const save = saveWith(10);
    const m = migrateSave(JSON.parse(JSON.stringify(save)))!;
    expect(m.repaired).toEqual([]);
    expect(Object.keys(m.save.members)).toHaveLength(10);
  });
  it('repairs missing or broken fields, drops unreadable members, and rejects things that are not saves', () => {
    const save = JSON.parse(JSON.stringify(saveWith(6)));
    const [a, b] = Object.keys(save.members).filter((k) => k !== 'player');
    delete save.members[a].stats.flexOffWins;
    save.members[a].moments = 'oops';
    save.members[b] = { nonsense: true };
    save.day = -3;
    delete save.titles;
    const m = migrateSave(save)!;
    expect(m.repaired.length).toBeGreaterThanOrEqual(4);
    expect(m.save.members[a].stats.flexOffWins).toBe(0);
    expect(m.save.members[a].moments).toEqual([]);
    expect(m.save.members[b]).toBeUndefined();
    expect(m.save.day).toBe(0);
    expect(m.save.titles).toEqual([]);
    // and the engine runs on it
    const eng = new SimEngine(c, m.save, settings, 3);
    for (let i = 0; i < 1000; i++) eng.step(STEP);
    expect(migrateSave(null)).toBeNull();
    expect(migrateSave({ hello: 'world' })).toBeNull();
    expect(migrateSave([1, 2, 3])).toBeNull();
  });
  it('a save without a player gets one back', () => {
    const save = saveWith(5);
    delete save.members.player;
    const eng = new SimEngine(c, migrateSave(save)!.save, settings, 2);
    eng.ensurePlayer();
    expect(eng.player).toBeDefined();
  });
});

describe('names', () => {
  it('generates unique full names from the same country', () => {
    const rng = new Rng(1);
    const taken = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const n = generateName(c.names, rng, taken);
      const pool = c.names.find((p) => p.code === n.country)!;
      expect((n.gender === 'male' ? pool.male : pool.female)).toContain(n.firstName);
      expect(pool.last).toContain(n.lastName);
      expect(taken.has(nameKey(n))).toBe(false);
      taken.add(nameKey(n));
    }
  });
});

describe('routines', () => {
  it('gives 6-8 unique exercises suited to the goal', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 200; i++) {
      const npc = createNpc(c, rng, { id: 'x', day: 0, taken: new Set() });
      const r = generateRoutine(c, npc, rng);
      expect(r.length).toBeGreaterThanOrEqual(6);
      expect(r.length).toBeLessThanOrEqual(8);
      expect(new Set(r.map((x) => x.exerciseId)).size).toBe(r.length);
      for (const item of r) expect(c.exerciseById[item.exerciseId].goals[npc.goal]).toBeGreaterThan(0);
    }
  });
});

describe('progression', () => {
  it('matches the spec example: bench 135 -> ~185-195 at 6 months -> ~225 at 12 months', () => {
    const npc = createNpc(c, new Rng(3), { id: 'alek', day: 0, taken: new Set() });
    npc.experience = 'beginner'; npc.goal = 'hypertrophy';
    npc.start.bench_press = 135; npc.weights.bench_press = 135; npc.best.bench = 135;
    let six = 0;
    for (let s = 1; s <= 75; s++) { progressSession(c, npc, 'bench_press', null); if (s === 38) six = npc.best.bench; }
    expect(six).toBeGreaterThanOrEqual(180);
    expect(six).toBeLessThanOrEqual(200);
    expect(npc.best.bench).toBeGreaterThanOrEqual(220);
    expect(npc.best.bench).toBeLessThanOrEqual(230);
  });
});

function saveWith(n: number): SaveData {
  return SimEngine.createSave(c, { members: n, mixChance: 0, seed: 5, createdAt: '2026-12-20' });
}

describe('legends', () => {
  it('awards milestones, hands reputation titles over, and keeps former holders', () => {
    const save = saveWith(5);
    const feed: string[] = [];
    const ch: Chronicle = { c, save, feed: (f) => feed.push(f.text) };
    const [a, b] = Object.values(save.members).filter((m) => !m.isPlayer);
    for (let i = 0; i < 3; i++) recordMoment(ch, a.id, 'flexOffWin', { zone: 'freeWeights' });
    let champ = save.titles.find((t) => t.titleId === 'mirrorChampion' && t.current)!;
    expect(champ.holderId).toBe(a.id);
    expect(titleLabel(c, champ)).toBe('Mirror Champion (3 Flex-Off Wins)');
    for (let i = 0; i < 4; i++) recordMoment(ch, b.id, 'flexOffWin', { zone: 'freeWeights' });
    champ = save.titles.find((t) => t.titleId === 'mirrorChampion' && t.current)!;
    expect(champ.holderId).toBe(b.id);
    const former = save.titles.find((t) => t.titleId === 'mirrorChampion' && !t.current)!;
    expect(titleLabel(c, former)).toBe('Former Mirror Champion (3 Flex-Off Wins)');
    a.stats.noReracks = 6; evaluateTitles(c, save, 1); b.stats.noReracks = 7; evaluateTitles(c, save, 1);
    const oldRerack = save.titles.find((t) => t.titleId === 'neverReracks' && !t.current)!;
    expect(titleLabel(c, oldRerack)).toMatch(/Never Reracks \(former\)$/);
    expect(featuredTitle(c, save, b.id)?.titleId).toBe('mirrorChampion');
    expect(feed.some((t) => t.includes('Mirror Champion'))).toBe(true);
    a.stats.spots = 25;
    expect(evaluateTitles(c, save, 0).some((ch) => ch.def.id === 'guardianSpotter')).toBe(true);
  });

  it('awards annual titles per year with gendered names', () => {
    const save = saveWith(10);
    const men = Object.values(save.members).filter((m) => m.gender === 'male');
    for (const m of Object.values(save.members)) m.yearly['2026'] = { visits: 10, best: { ...m.best }, startTotal: 1 };
    const king = men.reduce((x, y) => (y.best.bench > x.best.bench ? y : x));
    const changes = awardAnnual(c, save, 2026, 12);
    const rec = changes.find((ch) => ch.def.id === 'benchKing')!.record;
    expect(rec.holderId).toBe(king.id);
    expect(titleLabel(c, rec)).toBe('Bench King of 2026');
    expect(awardAnnual(c, save, 2026, 12)).toHaveLength(0); // idempotent
  });
});

describe('engine', () => {
  it('runs two full gym days: members visit, train, leave, and stations are released', () => {
    const eng = new SimEngine(c, saveWith(50), settings, 42);
    let maxInGym = 0;
    const steps = Math.round((settings.dayLength * 2) / STEP);
    for (let i = 0; i < steps; i++) { eng.step(STEP); maxInGym = Math.max(maxInGym, eng.agents.size); }
    expect(eng.save.day).toBe(2);
    expect(maxInGym).toBeGreaterThan(5);
    expect(maxInGym).toBeLessThanOrEqual(settings.cap);
    const visits = Object.values(eng.save.members).reduce((s, m) => s + m.stats.visits, 0);
    expect(visits).toBeGreaterThan(20);
    const sessions = Object.values(eng.save.members).reduce((s, m) => s + Object.values(m.sessions).reduce((x, y) => x + y, 0), 0);
    expect(sessions).toBeGreaterThan(50);
    for (const s of eng.stations) {
      if (s.occupant) expect(eng.agents.get(s.occupant)?.stationId).toBe(s.id);
    }
    expect(eng.feed.length).toBeGreaterThan(0);
  });

  it('builds a temporary station when every bench is taken', () => {
    const eng = new SimEngine(c, saveWith(30), { ...settings, cap: 30 }, 7);
    const benches = eng.stations.filter((s) => s.type === 'bench');
    for (const s of benches) s.occupant = 'blocker';
    const npc = Object.values(eng.save.members).find((m) => !m.isPlayer)!;
    eng.schedule = [];
    eng.save.dayTime = 50;
    (eng as unknown as { spawn: (n: typeof npc) => void }).spawn(npc);
    const a = eng.agents.get(npc.id)!;
    a.routine = [{ exerciseId: 'bench_press', sets: 1, restSeconds: 1, liftSeconds: 1 }];
    let built = false;
    for (let i = 0; i < 600 && !built; i++) {
      eng.step(STEP);
      built = eng.stations.some((s) => s.temporary && !s.building && s.label === 'Bench #7');
    }
    expect(built).toBe(true);
    for (let i = 0; i < 200; i++) eng.step(STEP);
    expect(npc.stats.constructionTriggers).toBe(1);
  });

  it.each([5, 17, 99])('over a full busy day (seed %i) nobody walks through a station that is not theirs, and nobody waits more than 30 s without a build', (seed) => {
    const eng = new SimEngine(c, saveWith(90), { dayLength: 600, cap: 40, members: 90, mixChance: 0 }, seed);
    const fps = () => eng.stations.map((s) => ({ s, r: footprint(c, s.type, s.pos, s.rot) }));
    let rects = fps();
    let longestWaitWithoutBuild = 0, checks = 0;
    const steps = Math.round(600 / STEP);
    for (let i = 0; i < steps; i++) {
      eng.step(STEP);
      rects = fps(); // temporary stations come and go
      for (const a of eng.agents.values()) {
        // allowed: their own station, the one they just stepped off, the one they're walking onto, the one they're spotting at
        const spotOf = [...eng.interactions.values()].find((it) => it.type === 'spot' && it.participants[1] === a.npcId)?.data.stationId;
        for (const { s, r } of rects) {
          if (s.id === a.stationId || s.id === a.lastStationId || s.id === a.dest?.viaId || s.id === spotOf || s.reservedBy === a.npcId) continue;
          checks++;
          if (inside(a.pos, r, -0.05)) expect.fail(`${a.npcId} (${a.state}) is inside ${s.label} at ${a.pos.x.toFixed(2)},${a.pos.z.toFixed(2)}`);
        }
        for (const o of [...c.layout.partitions, ...c.layout.obstacles.rects]) if (inside(a.pos, o, -0.05)) expect.fail(`${a.npcId} walked into ${'name' in o ? o.name : 'a partition'}`);
        for (const o of c.layout.obstacles.circles) if (Math.hypot(a.pos.x - o.x, a.pos.z - o.z) < o.r - 0.05) expect.fail(`${a.npcId} walked into the ${o.name}`);
        if (a.state === 'waiting' && !eng.stations.some((s) => s.temporary && s.reservedBy === a.npcId)) {
          longestWaitWithoutBuild = Math.max(longestWaitWithoutBuild, a.waitTime);
        }
      }
    }
    expect(checks).toBeGreaterThan(10000);
    expect(longestWaitWithoutBuild).toBeLessThanOrEqual(c.events.construction.waitBeforeSkip + STEP + 1e-6);
  });

  it('runs a simulated year, then stages the awards ceremony with at least 3 winners on the podium', () => {
    const save = SimEngine.createSave(c, { members: 50, mixChance: 0, seed: 21, createdAt: '2026-01-01' });
    const eng = new SimEngine(c, save, settings, 21);
    while (eng.isoToday() < '2026-12-31') eng.catchUp(Math.min(30, 364 - eng.save.day));
    expect(eng.isoToday()).toBe('2026-12-31');
    let maxOnStage = 0, sawPosing = false, sawBuild = false, crowd = 0;
    const stages = new Set<string>();
    for (let i = 0; i < Math.round((settings.dayLength * 1.6) / STEP); i++) {
      eng.step(STEP);
      const cer = eng.ceremony;
      if (!cer) continue;
      stages.add(cer.stage);
      if (cer.stage === 'building') sawBuild = true;
      if (cer.stage === 'posing') {
        sawPosing = true;
        maxOnStage = Math.max(maxOnStage, cer.onStage.length);
        crowd = Math.max(crowd, cer.called.length - cer.onStage.length);
        for (const id of cer.onStage) {
          const place = cer.winners.find((w) => w.npcId === id)!.place;
          if (place < 3) expect(eng.agents.get(id)?.elev, 'podium winners stand on their block').toBeGreaterThan(0);
        }
      }
    }
    expect(sawBuild).toBe(true);
    expect(sawPosing).toBe(true);
    expect(maxOnStage).toBeGreaterThanOrEqual(3);
    expect(crowd).toBeGreaterThan(0);
    expect(eng.ceremony).toBeNull(); // the crew packed the podium away
    expect(eng.save.pendingCeremonyYear).toBeUndefined();
    const review = eng.save.yearReviews?.['2026'];
    expect(review?.legends.length).toBeGreaterThanOrEqual(3);
    expect(review?.biggestPr).not.toBeNull();
    // profile cards: regulars have a timeline of at least 3 moments
    const regulars = Object.values(eng.save.members).filter((m) => m.attendance >= c.progression.regularThreshold);
    expect(regulars.length).toBeGreaterThan(5);
    for (const r of regulars) expect(r.moments.length, `${r.firstName} has too few moments`).toBeGreaterThanOrEqual(3);
  });

  it.each([3, 8, 13])('a 10-minute watch at 1x (seed %i) has at least 8 distinct humour beats and no joke more than twice', (seed) => {
    // an established gym (people know each other, there are rivals and titles), default settings, watched for one 10-minute day
    const save = SimEngine.createSave(c, { members: 50, mixChance: 0, seed, createdAt: '2026-03-02' });
    const eng = new SimEngine(c, save, { dayLength: 600, cap: 25, members: 50, mixChance: 0 }, seed);
    for (let i = 0; i < Math.round((600 * 3) / STEP); i++) eng.step(STEP);
    const start = eng.simTime;
    for (let i = 0; i < Math.round(600 / STEP); i++) eng.step(STEP);
    const watched = eng.beats.filter((b) => b.at >= start);
    const cats = new Set(watched.map((b) => b.cat));
    const counts = new Map<string, number>();
    for (const b of watched) counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
    const worst = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
    expect(cats.size, [...cats].join(', ')).toBeGreaterThanOrEqual(8);
    expect(worst[1], `"${worst[0]}" repeated ${worst[1]} times`).toBeLessThanOrEqual(2);
  });

  it('a new player creates a character, trains a full routine by choice, and has a progress chart after three days', () => {
    const save = SimEngine.createSave(c, { members: 30, mixChance: 0, seed: 4, createdAt: '2026-04-01' });
    const eng = new SimEngine(c, save, { dayLength: 600, cap: 25, members: 30, mixChance: 0 }, 4);
    eng.updatePlayer({ firstName: 'Ada', lastName: 'Okafor', country: 'NG', gender: 'female', goal: 'strength', experience: 'beginner', appearance: { top: 'tank', hairStyle: 'bun' } });
    eng.setPlayerMode('manual');
    const p = eng.player!;
    expect(p.firstName).toBe('Ada');
    expect(eng.save.playerCreated).toBe(true);
    const plan = ['back_squat', 'bench_press', 'deadlift', 'lat_pulldown', 'db_curl', 'plank'];
    const picked: string[] = [];
    let i = 0;
    for (; i < 6000 && picked.length < plan.length; i++) {
      eng.step(STEP);
      const a = eng.playerAgent();
      if (a?.awaitingPick) { eng.playerQueue(plan[picked.length]); picked.push(plan[picked.length]); }
    }
    expect(picked).toEqual(plan);
    // finish the last pick, then the player waits for more instead of following a generated routine
    for (let k = 0; k < 2000 && !eng.playerAgent()?.awaitingPick; k++) eng.step(STEP);
    expect(eng.playerAgent()?.awaitingPick).toBe(true);
    for (const ex of plan) expect(p.sessions[ex] ?? 0, `${ex} was trained`).toBeGreaterThanOrEqual(1);
    expect(Object.keys(p.sessions).sort()).toEqual([...plan].sort()); // nothing the player didn't choose
    // clicking a station sends the player there
    const bench = eng.stations.find((s) => s.type === 'bench' && !s.occupant && !s.reservedBy)!;
    expect(eng.playerGoToStation(bench.id)).not.toBeNull();
    let atBench = false;
    for (let k = 0; k < 600 && !atBench; k++) { eng.step(STEP); atBench = eng.playerAgent()?.stationId === bench.id && eng.playerAgent()?.state === 'lifting'; }
    expect(atBench).toBe(true);
    // three in-game days later there is a chart to draw
    eng.setPlayerMode('auto');
    for (let k = 0; k < Math.round((600 * 3) / STEP); k++) eng.step(STEP);
    expect(eng.save.playerHistory!.length, `day ${eng.save.day}, visits ${p.stats.visits}`).toBeGreaterThanOrEqual(3);
    expect(p.stats.visits).toBeGreaterThanOrEqual(3);
  });

  it('catches up missed days and hands out annual titles at new year', () => {
    const eng = new SimEngine(c, saveWith(40), settings, 9);
    const r = eng.catchUp(20);
    expect(r.days).toBe(20);
    expect(eng.isoToday()).toBe('2027-01-09');
    expect(eng.save.titles.some((t) => t.titleId === 'mostConsistent' && t.year === 2026)).toBe(true);
  });

  it('soft reshuffle keeps regulars; hard reshuffle can keep the Hall of Fame archive', () => {
    const eng = new SimEngine(c, saveWith(40), { ...settings, members: 40 }, 11);
    eng.catchUp(15);
    const regulars = Object.values(eng.save.members).filter((m) => m.attendance >= c.progression.regularThreshold).map((m) => m.id);
    eng.reshuffle('soft', true);
    for (const id of regulars) expect(eng.save.members[id]).toBeDefined();
    expect(Object.keys(eng.save.members)).toHaveLength(40);
    const titleCount = eng.save.titles.length;
    eng.reshuffle('hard', true);
    expect(eng.save.titles.length).toBe(titleCount);
    expect(eng.save.titles.every((t) => t.holderLeft)).toBe(true);
    eng.reshuffle('hard', false);
    expect(eng.save.titles).toHaveLength(0);
  });
});
