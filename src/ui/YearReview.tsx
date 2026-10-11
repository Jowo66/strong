// "Year in review" card: opens itself on 1 January in-game (awards day) and from the Hall of Fame.
import { useEngine } from '../engineContext';
import { useUi } from '../store/ui';
import { Icon } from './Icon';

export function YearReview() {
  const eng = useEngine();
  const year = useUi((s) => s.reviewYear);
  const close = useUi((s) => s.openPanel);
  const openProfile = useUi((s) => s.openProfile);
  const r = year !== null ? eng.save.yearReviews?.[String(year)] : undefined;
  const who = (id: string, name: string) => <button className="link inline" onClick={() => openProfile(id)}>{name}</button>;
  return (
    <section className="panel review" aria-label={`${year} in review`}>
      <header><h2><Icon name="star" size={20} /> {year} in review</h2><button onClick={() => close('review')} aria-label="Close"><Icon name="close" /></button></header>
      {!r && <p className="muted">No review for that year.</p>}
      {r && (
        <>
          <div className="review-totals">
            <div><strong>{r.totals.visits}</strong><span>visits</span></div>
            <div><strong>{r.totals.prs}</strong><span>PRs on record</span></div>
            <div><strong>{r.totals.flexOffs}</strong><span>Flex-Off wins</span></div>
            <div><strong>{r.totals.builds}</strong><span>crew builds</span></div>
          </div>
          <div className="review-cards">
            {r.biggestPr && <div className="rcard"><h4>Biggest PR</h4><p>{who(r.biggestPr.npcId, r.biggestPr.name)} · {r.biggestPr.detail} lb</p></div>}
            {r.flexOffKing && <div className="rcard"><h4>Most Flex-Offs won</h4><p>{who(r.flexOffKing.npcId, r.flexOffKing.name)} · {r.flexOffKing.wins}</p></div>}
            {r.mostVisits && <div className="rcard"><h4>Always here</h4><p>{who(r.mostVisits.npcId, r.mostVisits.name)} · {r.mostVisits.visits} visits</p></div>}
            {r.funniest && <div className="rcard funny"><h4>Funniest Moment</h4><p>“{r.funniest.text}”</p></div>}
          </div>
          {r.legends.length > 0 && (
            <>
              <h3>Legends of {r.year}</h3>
              <ul className="titles">{r.legends.map((l) => <li key={l.titleId}><Icon name="crown" size={15} /> {l.label}: {l.name}</li>)}</ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
