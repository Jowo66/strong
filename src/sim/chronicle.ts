// Records Moments, updates counters, re-evaluates titles and writes the gym news feed.
import type { Content } from './content';
import type { FeedItem, Moment, MomentType, SaveData, ZoneId } from './types';
import { evaluateTitles, titleLabel, type TitleChange } from './legends';
import { fullName } from './names';
import { isoForDay } from './calendar';

export interface Chronicle {
  c: Content;
  save: SaveData;
  feed: (item: Omit<FeedItem, 'id'>) => void;
  onTitle?: (change: TitleChange) => void;
}

export interface MomentInput {
  zone: ZoneId;
  witnesses?: string[];
  otherId?: string;
  detail?: string;
  silent?: boolean; // no feed line
}

export function recordMoment(ch: Chronicle, npcId: string, type: MomentType, input: MomentInput): Moment | null {
  const { c, save } = ch;
  const npc = save.members[npcId];
  if (!npc) return null;
  const def = c.moments[type];
  save.seq += 1;
  const m: Moment = {
    id: `m${save.seq}`, npcId, type, day: save.day, date: isoForDay(save.createdAt, save.day),
    zone: input.zone, witnesses: input.witnesses ?? [], otherId: input.otherId, detail: input.detail,
    notability: def.notability,
  };
  if (def.stat) (npc.stats[def.stat] as number) += 1;
  npc.moments.push(m);
  const cap = c.progression.maxMomentsPerMember;
  if (npc.moments.length > cap) {
    // drop the least notable, oldest moment
    let drop = 0;
    for (let i = 1; i < npc.moments.length; i++) {
      const a = npc.moments[i], b = npc.moments[drop];
      if (a.notability < b.notability || (a.notability === b.notability && a.day < b.day)) drop = i;
    }
    npc.moments.splice(drop, 1);
  }
  if (!input.silent) {
    const other = input.otherId ? save.members[input.otherId] : undefined;
    const text = def.feed
      .replaceAll('{name}', fullName(npc))
      .replaceAll('{other}', other ? fullName(other) : 'someone')
      .replaceAll('{detail}', input.detail ?? '');
    ch.feed({ day: save.day, text, npcId, kind: 'moment' });
  }
  if (def.stat) applyTitleChanges(ch, evaluateTitles(c, save, save.day));
  return m;
}

export function applyTitleChanges(ch: Chronicle, changes: TitleChange[]): void {
  for (const change of changes) {
    const npc = ch.save.members[change.record.holderId];
    const label = titleLabel(ch.c, change.record);
    if (npc) {
      recordMoment(ch, npc.id, change.kind === 'won' ? 'titleWon' : 'titleLost', { zone: 'reception', detail: label, silent: true });
    }
    ch.feed({ day: ch.save.day, text: change.kind === 'won' ? `⭐ ${change.record.holderName} is now ${label}!` : `${change.record.holderName} is now ${label}.`, npcId: change.record.holderId, kind: 'title' });
    ch.onTitle?.(change);
  }
}

/** Best stories for a member. If `prefer` is given, moments that fed that stat come first. */
export function topMoments(save: SaveData, npcId: string, n = 3, c?: Content, prefer?: string): Moment[] {
  const npc = save.members[npcId];
  if (!npc) return [];
  const streaky = prefer === 'bestStreak' || prefer === 'streak' || prefer === 'visits';
  const boost = (m: Moment) => (c && prefer && (c.moments[m.type]?.stat === prefer || (streaky && m.type === 'streak')) ? 100 : 0);
  return npc.moments
    .filter((m) => m.type !== 'titleWon' && m.type !== 'titleLost')
    .map((m) => ({ m, score: m.notability + boost(m) }))
    .sort((a, b) => b.score - a.score || b.m.day - a.m.day)
    .map((x) => x.m)
    .slice(0, n);
}
