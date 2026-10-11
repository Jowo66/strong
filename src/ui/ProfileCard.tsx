// Member profile card: click a member (or a name in the Hall of Fame) to see who they are, their lifts,
// titles, rivals and gym friends, and their Moments timeline. Compact and non-blocking like the other panels.
import { useState } from 'react';
import { useEngine, usePoll } from '../engineContext';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import { fullName } from '../sim/names';
import { titleLabel, titlesFor, featuredTitle } from '../sim/legends';
import { momentText } from '../sim/review';
import { formatDate } from '../sim/calendar';
import { lookForNpc } from '../scene/character/look';
import { usePortraitUrl } from '../scene/portraits';
import { Icon, type IconName } from './Icon';

const CAT_ICON: Record<string, IconName> = { annual: 'crown', reputation: 'ribbon', milestone: 'medal' };
const EXPERIENCE = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

export function ProfileCard() {
  const eng = useEngine();
  usePoll(1000);
  const id = useUi((s) => s.profileId);
  const close = useUi((s) => s.openPanel);
  const openProfile = useUi((s) => s.openProfile);
  const native = useSettings((s) => s.nativeNameOrder);
  const [all, setAll] = useState(false);
  const npc = id ? eng.save.members[id] : undefined;
  const url = usePortraitUrl(npc ? lookForNpc(npc) : null);
  if (!npc) {
    return (
      <section className="panel" aria-label="Member profile">
        <header><h2><Icon name="user" size={20} /> Member</h2><button onClick={() => close('profile')} aria-label="Close"><Icon name="close" /></button></header>
        <p className="muted">This member has left the gym.</p>
      </section>
    );
  }
  const c = eng.c;
  const info = eng.info(npc.id);
  const current = titlesFor(eng.save, npc.id);
  const former = eng.save.titles.filter((t) => t.holderId === npc.id && !t.current);
  const ft = featuredTitle(c, eng.save, npc.id);
  const country = c.names.find((p) => p.code === npc.country)?.country ?? npc.country;
  const people = Object.entries(npc.familiarity)
    .filter(([oid]) => eng.save.members[oid])
    .map(([oid, f]) => ({ oid, f, name: fullName(eng.save.members[oid], native) }));
  const rivals = people.filter((p) => p.f.rival).sort((a, b) => b.f.rivalry - a.f.rivalry).slice(0, 3);
  const friends = people.filter((p) => !p.f.rival && p.f.score >= 2).sort((a, b) => b.f.score - a.f.score).slice(0, 3);
  const timeline = npc.moments.slice().sort((a, b) => b.day - a.day || b.notability - a.notability);
  const shown = all ? timeline : timeline.slice(0, 8);
  const lift = (ex: string) => Math.round((npc.weights[ex] ?? 0) / 5) * 5;

  return (
    <section className="panel profile" aria-label={`Profile: ${fullName(npc, native)}`}>
      <header>
        <div className="profile-head">
          {url ? <img className="portrait" src={url} alt="" width={64} height={64} /> : <span className="portrait ph" />}
          <div>
            <h2>{fullName(npc, native)}{npc.isPlayer && <span className="you">YOU</span>}</h2>
            {ft && <div className="tt-title">⭐ {titleLabel(c, ft)}</div>}
            <div className="muted">{country} · member since {formatDate(eng.save.createdAt, npc.joinedDay)}</div>
          </div>
        </div>
        <button onClick={() => close('profile')} aria-label="Close"><Icon name="close" /></button>
      </header>

      <div className="profile-now">{info?.activity}{info?.exercise ? ` · ${info.exercise} (${info.progress})` : ''}</div>

      <div className="stat-grid">
        <div><span>Goal</span>{c.goalById[npc.goal].name}</div>
        <div><span>Level</span>{EXPERIENCE[npc.experience]}</div>
        <div><span>Visits</span>{npc.stats.visits}</div>
        <div><span>Streak</span>{npc.stats.streak} (best {npc.stats.bestStreak})</div>
        <div><span>Comes in</span>{Math.round(npc.attendance * 100)}% of days</div>
        <div><span>PRs</span>{npc.stats.prs}</div>
      </div>
      {npc.traits.length > 0 && <div className="chips">{npc.traits.map((t) => <span key={t} className="chip">{c.traitById[t]?.name ?? t}</span>)}</div>}

      <h3>Lifts</h3>
      <table className="lifts">
        <thead><tr><th /><th>Best</th><th>Working</th></tr></thead>
        <tbody>
          <tr><td>Bench</td><td>{npc.best.bench} lb</td><td>{lift('bench_press')} lb</td></tr>
          <tr><td>Squat</td><td>{npc.best.squat} lb</td><td>{lift('back_squat')} lb</td></tr>
          <tr><td>Deadlift</td><td>{npc.best.deadlift} lb</td><td>{lift('deadlift')} lb</td></tr>
        </tbody>
      </table>

      {(current.length > 0 || former.length > 0) && <h3>Titles</h3>}
      <ul className="titles">
        {current.map((t) => <li key={t.id}><Icon name={CAT_ICON[c.titleById[t.titleId]?.category ?? 'milestone']} size={15} /> {titleLabel(c, t)}</li>)}
        {former.map((t) => <li key={t.id} className="muted"><Icon name={CAT_ICON[c.titleById[t.titleId]?.category ?? 'milestone']} size={15} /> {titleLabel(c, t)}</li>)}
      </ul>

      {(rivals.length > 0 || friends.length > 0) && (
        <>
          <h3>People</h3>
          <div className="people">
            {rivals.map((p) => <button key={p.oid} className="chip rival" onClick={() => openProfile(p.oid)}>⚔ {p.name}</button>)}
            {friends.map((p) => <button key={p.oid} className="chip" onClick={() => openProfile(p.oid)}>🤝 {p.name}</button>)}
          </div>
        </>
      )}

      <h3>Moments</h3>
      {!timeline.length && <p className="muted">Nothing on record yet.</p>}
      <ol className="timeline">
        {shown.map((m) => (
          <li key={m.id} className={m.notability >= 6 ? 'big' : ''}><span className="muted">{m.date}</span> {momentText(c, eng.save, m)}</li>
        ))}
      </ol>
      {timeline.length > 8 && <button className="link" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${timeline.length}`}</button>}
    </section>
  );
}
