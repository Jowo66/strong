// The "year in review" card shown on 1 January: biggest PR, Flex-Off king, funniest Moment, new legends.
// Built from Moments (capped per member, so counts are "on record") and yearly stats.
import type { Content } from './content';
import type { Moment, SaveData, YearReview } from './types';
import { fullName } from './names';
import { titleLabel } from './legends';

/** How funny each kind of Moment is, for picking the year's funniest. */
const FUNNY: Record<string, number> = { overSpot: 5, photoOp: 5, flirtFail: 4, flexOffDraw: 3, lostBottle: 2, noRerack: 2 };

export function momentText(c: Content, save: SaveData, m: Moment, holderName?: string): string {
  const npc = save.members[m.npcId];
  const other = m.otherId ? save.members[m.otherId] : undefined;
  return c.moments[m.type].feed
    .replaceAll('{name}', holderName ?? (npc ? fullName(npc) : 'Someone'))
    .replaceAll('{other}', other ? fullName(other) : 'someone')
    .replaceAll('{detail}', m.detail ?? '');
}

export function computeYearReview(c: Content, save: SaveData, year: number): YearReview {
  const inYear = (m: Moment) => m.date.startsWith(`${year}-`);
  let biggestPr: YearReview['biggestPr'] = null, prBest = -1;
  let flexOffKing: YearReview['flexOffKing'] = null;
  let funniest: YearReview['funniest'] = null, funBest = -1;
  let mostVisits: YearReview['mostVisits'] = null;
  const totals = { visits: 0, prs: 0, flexOffs: 0, builds: 0 };

  for (const npc of Object.values(save.members)) {
    const name = fullName(npc);
    const y = npc.yearly[String(year)];
    if (y) {
      totals.visits += y.visits;
      if (!mostVisits || y.visits > mostVisits.visits) mostVisits = { npcId: npc.id, name, visits: y.visits };
    }
    let wins = 0;
    for (const m of npc.moments) {
      if (!inYear(m)) continue;
      if (m.type === 'pr') {
        totals.prs++;
        const w = Number(/(\d+)\s*$/.exec(m.detail ?? '')?.[1] ?? 0);
        if (w > prBest) { prBest = w; biggestPr = { npcId: npc.id, name, detail: m.detail ?? '' }; }
      }
      if (m.type === 'flexOffWin') { wins++; totals.flexOffs++; }
      if (m.type === 'construction') totals.builds++;
      if (FUNNY[m.type]) {
        // funniest = the funniest kind, seen by the most people, latest on ties
        const score = FUNNY[m.type] * 10 + Math.min(8, m.witnesses.length) * 3 + m.day / 10000;
        if (score > funBest) { funBest = score; funniest = { npcId: npc.id, name, text: momentText(c, save, m) }; }
      }
    }
    if (wins && (!flexOffKing || wins > flexOffKing.wins)) flexOffKing = { npcId: npc.id, name, wins };
  }

  const legends = save.titles
    .filter((t) => t.year === year && c.titleById[t.titleId]?.category === 'annual')
    .map((t) => ({ titleId: t.titleId, label: titleLabel(c, t), name: t.holderName }));

  return { year, biggestPr, flexOffKing, funniest, mostVisits: mostVisits && mostVisits.visits > 0 ? mostVisits : null, legends, totals };
}
