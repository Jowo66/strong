// Gym Legends: turns member stats into titles (annual, milestone, reputation).
import type { Content, TitleDef } from './content';
import type { Npc, SaveData, TitleRecord, Gender } from './types';
import { fullName } from './names';
import { liftTotal } from './progression';

export interface TitleChange { kind: 'won' | 'lost'; record: TitleRecord; def: TitleDef }

export function statValue(npc: Npc, def: TitleDef): number {
  if (!def.stat) return 0;
  if (def.stat === 'avgRest') {
    if (npc.stats.restCount < (def.minCount ?? 1)) return 0;
    return npc.stats.restSeconds / npc.stats.restCount;
  }
  return npc.stats[def.stat];
}

export function titleLabel(c: Content, r: TitleRecord): string {
  const def = c.titleById[r.titleId];
  if (!def) return r.titleId;
  const base = r.holderGender === 'female' && def.nameFemale ? def.nameFemale : def.name;
  const value = r.value === undefined ? '' : String(Math.round(r.value));
  const name = base.replace('{year}', String(r.year ?? '')).replace('{value}', value);
  if (r.current || def.category === 'annual') return name;
  return name.startsWith('The ') ? `${name} (former)` : `Former ${name}`;
}

function newRecord(save: SaveData, def: TitleDef, npc: Npc, day: number, value?: number, year?: number): TitleRecord {
  save.seq += 1;
  return {
    id: `t${save.seq}`, titleId: def.id, holderId: npc.id, holderName: fullName(npc), holderGender: npc.gender,
    value, year, current: true, awardedDay: day,
  };
}

/** Re-check milestone and reputation titles. Call after stats change. */
export function evaluateTitles(c: Content, save: SaveData, day: number): TitleChange[] {
  const changes: TitleChange[] = [];
  const members = Object.values(save.members);
  for (const def of c.titles) {
    if (def.category === 'milestone') {
      for (const npc of members) {
        const v = statValue(npc, def);
        const existing = save.titles.find((r) => r.titleId === def.id && r.holderId === npc.id && r.current);
        if (existing) existing.value = v;
        else if (v >= (def.threshold ?? Infinity)) {
          const rec = newRecord(save, def, npc, day, v);
          save.titles.push(rec);
          changes.push({ kind: 'won', record: rec, def });
        }
      }
    } else if (def.category === 'reputation') {
      const current = save.titles.find((r) => r.titleId === def.id && r.current);
      const holder = current ? save.members[current.holderId] : undefined;
      const holderValue = holder ? statValue(holder, def) : -Infinity;
      if (current && holder) current.value = holderValue;
      let leader: Npc | null = null; let best = -Infinity;
      for (const npc of members) {
        const v = statValue(npc, def);
        if (v > best) { best = v; leader = npc; }
      }
      if (!leader || best < (def.minValue ?? 1)) continue;
      if (current && current.holderId === leader.id) continue;
      if (current && holder && best <= holderValue) continue; // ties keep the incumbent
      if (current) {
        current.current = false;
        changes.push({ kind: 'lost', record: current, def });
      }
      // a comeback replaces the member's own old "former" entry instead of piling up duplicates
      save.titles = save.titles.filter((r) => !(r.titleId === def.id && r.holderId === leader!.id && !r.current));
      const rec = newRecord(save, def, leader, day, best);
      save.titles.push(rec);
      changes.push({ kind: 'won', record: rec, def });
    }
  }
  return changes;
}

function annualMetric(npc: Npc, def: TitleDef, year: number): number | null {
  const y = npc.yearly[String(year)];
  if (!y || y.visits === 0) return null;
  if (def.gender && npc.gender !== def.gender) return null;
  switch (def.metric) {
    case 'bestBench': return y.best.bench;
    case 'bestSquat': return y.best.squat;
    case 'visits': return y.visits;
    case 'improvement': {
      if (y.visits < (def.minVisits ?? 0) || y.startTotal <= 0) return null;
      const end = y.best.bench + y.best.squat + y.best.deadlift;
      return Math.round(((end - y.startTotal) / y.startTotal) * 100);
    }
    default: return null;
  }
}

/** Award annual titles for a finished year. Annual titles never become "Former". */
export function awardAnnual(c: Content, save: SaveData, year: number, day: number): TitleChange[] {
  const changes: TitleChange[] = [];
  for (const def of c.titles.filter((d) => d.category === 'annual')) {
    if (save.titles.some((r) => r.titleId === def.id && r.year === year)) continue;
    let winner: Npc | null = null; let best = -Infinity;
    for (const npc of Object.values(save.members)) {
      const v = annualMetric(npc, def, year);
      if (v !== null && v > best) { best = v; winner = npc; }
    }
    if (!winner || best <= 0) continue;
    const rec = newRecord(save, def, winner, day, best, year);
    save.titles.push(rec);
    changes.push({ kind: 'won', record: rec, def });
  }
  return changes;
}

export function titlesFor(save: SaveData, npcId: string, currentOnly = true): TitleRecord[] {
  return save.titles.filter((r) => r.holderId === npcId && (!currentOnly || r.current));
}

/** The one title shown under a member's name: rarest current title, newest on ties. */
export function featuredTitle(c: Content, save: SaveData, npcId: string): TitleRecord | null {
  const mine = titlesFor(save, npcId);
  if (!mine.length) return null;
  return mine.slice().sort((a, b) =>
    (c.titleById[b.titleId]?.rarity ?? 0) - (c.titleById[a.titleId]?.rarity ?? 0) || b.awardedDay - a.awardedDay)[0];
}

export function ensureYear(npc: Npc, year: number): void {
  const key = String(year);
  if (!npc.yearly[key]) {
    npc.yearly[key] = { visits: 0, best: { ...npc.best }, startTotal: liftTotal(npc) };
  }
}

export function genderOf(save: SaveData, npcId: string): Gender | undefined { return save.members[npcId]?.gender; }
