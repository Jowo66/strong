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
