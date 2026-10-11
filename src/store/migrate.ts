// Save migration and repair. Every save goes through here on load and import:
// 1. version upgrades (SaveData.version), 2. filling fields added since the save was written,
// 3. dropping things that can't be repaired (members missing core data). Returns null if it isn't a save at all.
import type { Npc, SaveData } from '../sim/types';
import { emptyStats } from '../sim/npc';

export const SAVE_VERSION = 1;

export interface MigrationReport { save: SaveData; repaired: string[] }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function migrateSave(raw: unknown): MigrationReport | null {
  if (!isObj(raw)) return null;
  const s = raw as unknown as SaveData;
  if (typeof s.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.createdAt)) return null;
  if (!isObj(s.members)) return null;
  const repaired: string[] = [];
  const fix = (cond: boolean, what: string, apply: () => void) => { if (cond) { apply(); repaired.push(what); } };

  // --- future version upgrades go here: if (s.version === 1) { ...; s.version = 2; } ---
  fix(s.version !== SAVE_VERSION, `version ${String(s.version)} → ${SAVE_VERSION}`, () => { (s as { version: number }).version = SAVE_VERSION; });

  fix(typeof s.day !== 'number' || !Number.isFinite(s.day) || s.day < 0, 'day', () => { s.day = 0; });
  fix(typeof s.dayTime !== 'number' || !Number.isFinite(s.dayTime) || s.dayTime < 0, 'time of day', () => { s.dayTime = 0; });
  fix(typeof s.lastSavedAt !== 'number', 'last saved time', () => { s.lastSavedAt = Date.now(); });
  fix(typeof s.seq !== 'number', 'id counter', () => { s.seq = 100000; });
  fix(!Array.isArray(s.titles), 'titles', () => { s.titles = []; });

  for (const [id, m] of Object.entries(s.members)) {
    const n = m as Npc;
    if (!isObj(n) || typeof n.firstName !== 'string' || typeof n.lastName !== 'string' || !isObj(n.appearance)) {
      delete s.members[id];
      repaired.push(`removed unreadable member ${id}`);
      continue;
    }
    n.id = id;
    const blank = emptyStats();
    if (!isObj(n.stats)) { n.stats = blank; repaired.push(`${n.firstName}: stats`); }
    else for (const k of Object.keys(blank) as (keyof typeof blank)[]) if (typeof n.stats[k] !== 'number' || !Number.isFinite(n.stats[k])) { n.stats[k] = blank[k]; repaired.push(`${n.firstName}: ${k}`); }
    for (const k of ['start', 'weights', 'sessions', 'familiarity', 'yearly'] as const) if (!isObj(n[k])) { (n as unknown as Record<string, unknown>)[k] = {}; repaired.push(`${n.firstName}: ${k}`); }
    if (!isObj(n.best)) { n.best = { bench: 45, squat: 45, deadlift: 45 }; repaired.push(`${n.firstName}: best lifts`); }
    if (!Array.isArray(n.moments)) { n.moments = []; repaired.push(`${n.firstName}: moments`); }
    if (!Array.isArray(n.traits)) { n.traits = []; repaired.push(`${n.firstName}: traits`); }
    if (typeof n.joinedDay !== 'number') n.joinedDay = 0;
    if (typeof n.lastVisitDay !== 'number') n.lastVisitDay = -1;
    if (typeof n.attendance !== 'number') n.attendance = 0.5;
    if (n.gender !== 'male' && n.gender !== 'female') n.gender = 'male';
  }
  // the player must exist
  const players = Object.values(s.members).filter((m) => m.isPlayer);
  fix(players.length === 0, 'player missing', () => { /* the engine re-creates a player on boot (see App) */ });
  for (const p of players.slice(1)) { p.isPlayer = undefined; repaired.push('extra player'); }
  // titles that point at nobody stay as archive entries
  for (const t of s.titles) if (!s.members[t.holderId] && !t.holderLeft) { t.holderLeft = true; repaired.push('archived a title of a member who left'); }
  return { save: s, repaired };
}
