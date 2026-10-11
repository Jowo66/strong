// Compact, non-blocking Hall of Fame panel.
import { useState } from 'react';
import { useEngine, usePoll } from '../engineContext';
import { titleLabel } from '../sim/legends';
import { topMoments } from '../sim/chronicle';
import { useUi } from '../store/ui';
import type { TitleRecord } from '../sim/types';
import { fullName } from '../sim/names';

const CATEGORY_LABEL = { annual: 'Annual Champions', reputation: 'Gym Reputation', milestone: 'Milestones' } as const;

export function HallOfFame() {
  const eng = useEngine();
  usePoll(2000);
  const close = useUi((s) => s.openPanel);
  const [open, setOpen] = useState<string | null>(null);
  const titles = eng.save.titles;
  const current = titles.filter((t) => t.current && !t.holderLeft);
  const holdsNow = (r: TitleRecord) => current.some((c) => c.titleId === r.titleId && c.holderId === r.holderId);
  const seen = new Set<string>();
  const former = titles.filter((t) => (!t.current || t.holderLeft) && !holdsNow(t)).reverse()
    .filter((t) => { const k = `${t.titleId}|${t.holderId}|${t.year ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 12);
  const byCat = (cat: keyof typeof CATEGORY_LABEL) =>
    current.filter((t) => eng.c.titleById[t.titleId]?.category === cat).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.awardedDay - a.awardedDay);

  const flavour = (r: TitleRecord): string | null => {
    const m = topMoments(eng.save, r.holderId, 1, eng.c, eng.c.titleById[r.titleId]?.stat)[0];
    if (!m) return null;
    const other = m.otherId ? eng.save.members[m.otherId] : undefined;
    const tmpl = eng.c.moments[m.type].feed;
    return tmpl.replaceAll('{name}', r.holderName).replaceAll('{other}', other ? fullName(other) : 'someone').replaceAll('{detail}', m.detail ?? '');
  };

  return (
    <section className="panel" aria-label="Hall of Fame">
      <header><h2>🏆 Hall of Fame</h2><button onClick={() => close('hall')} aria-label="Close">✕</button></header>
      {!titles.length && <p className="muted">No legends yet. Give it a few days: titles appear as members rack up PRs, Flex-Off wins and questionable habits.</p>}
      {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((cat) => {
        const list = byCat(cat);
        if (!list.length) return null;
        return (
          <div key={cat} className="hof-group">
            <h3>{CATEGORY_LABEL[cat]}</h3>
            {list.map((r) => {
              const def = eng.c.titleById[r.titleId];
              const isOpen = open === r.id;
              const f = flavour(r);
              return (
                <div key={r.id} className="hof-entry">
                  <button className="hof-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                    <span className="hof-title">{titleLabel(eng.c, r)}</span>
                    <span className="hof-holder">{r.holderName}{def?.category === 'annual' && r.value !== undefined ? ` · ${r.value}${def.unit === '%' ? '%' : ` ${def.unit}`}` : ''}</span>
                    {f && <span className="hof-flavour">“{f}”</span>}
                  </button>
                  {isOpen && (
                    <ul className="hof-moments">
                      {topMoments(eng.save, r.holderId, 3, eng.c, def?.stat).map((m) => (
                        <li key={m.id}><span className="muted">{m.date}</span> {eng.c.moments[m.type].feed.replaceAll('{name}', r.holderName).replaceAll('{other}', m.otherId && eng.save.members[m.otherId] ? fullName(eng.save.members[m.otherId]) : 'someone').replaceAll('{detail}', m.detail ?? '')}</li>
                      ))}
                      {!topMoments(eng.save, r.holderId, 1).length && <li className="muted">No stories on record.</li>}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {former.length > 0 && (
        <div className="hof-group">
          <h3>From the Archive</h3>
          {former.map((r) => (
            <div key={r.id} className="hof-former">{titleLabel(eng.c, r)} — {r.holderName}{r.holderLeft ? ' (former member)' : ''}</div>
          ))}
        </div>
      )}
    </section>
  );
}
