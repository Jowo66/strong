// "You": autopilot or pick-every-exercise, the up-next list, add an exercise, head home, follow-cam,
// and your progress (chart, streak, titles). Click any station in the gym to train there next.
import { useState } from 'react';
import { useEngine, usePoll } from '../engineContext';
import { useUi } from '../store/ui';
import { fullName } from '../sim/names';
import { titleLabel, titlesFor } from '../sim/legends';
import { lookForNpc } from '../scene/character/look';
import { usePortraitUrl } from '../scene/portraits';
import type { StationType } from '../sim/types';
import { Icon } from './Icon';
import { ProgressChart } from './ProgressChart';

const GROUPS: { label: string; types: StationType[] }[] = [
  { label: 'Bench', types: ['bench'] },
  { label: 'Squat rack & platform', types: ['squatRack', 'platform'] },
  { label: 'Dumbbells', types: ['dumbbells'] },
  { label: 'Cables & pull-ups', types: ['cable', 'pullupBar'] },
  { label: 'Cardio', types: ['treadmill', 'bike', 'rower'] },
  { label: 'Mats', types: ['mat'] },
];

export function PlayerPanel() {
  const eng = useEngine();
  usePoll(500);
  const close = useUi((s) => s.openPanel);
  const follow = useUi((s) => s.follow);
  const setFollow = useUi((s) => s.setFollow);
  const showBanner = useUi((s) => s.showBanner);
  const [adding, setAdding] = useState(false);
  const p = eng.player;
  const url = usePortraitUrl(p ? lookForNpc(p) : null);
  if (!p) return null;
  const a = eng.playerAgent();
  const manual = eng.save.playerMode === 'manual';
  const info = eng.info(p.id);
  const c = eng.c;
  const upcoming = a ? a.routine.map((r, i) => ({ r, i })).filter(({ i }) => i >= a.index) : [];

  return (
    <section className="panel player" aria-label="You">
      <header>
        <div className="profile-head">
          {url ? <img className="portrait" src={url} alt="" width={64} height={64} /> : <span className="portrait ph" />}
          <div>
            <h2>{fullName(p)} <span className="you">YOU</span></h2>
            <div className="muted">{info?.activity}</div>
          </div>
        </div>
        <button onClick={() => close('player')} aria-label="Close"><Icon name="close" /></button>
      </header>

      <div className="seg" role="radiogroup" aria-label="How you train">
        <button role="radio" aria-checked={!manual} className={!manual ? 'on' : ''} onClick={() => eng.setPlayerMode('auto')}>Autopilot</button>
        <button role="radio" aria-checked={manual} className={manual ? 'on' : ''} onClick={() => eng.setPlayerMode('manual')}>I pick every exercise</button>
      </div>
      <p className="muted small">Tip: click any station in the gym to train there next.</p>

      {a ? (
        <>
          <h3>Up next</h3>
          {!upcoming.length && <p className="muted">{manual ? 'Nothing planned. Add an exercise below.' : 'Picking a new routine…'}</p>}
          <ol className="routine">
            {upcoming.map(({ r, i }) => {
              const current = i === a.index && (a.state === 'lifting' || a.state === 'resting' || a.stationId !== null);
              return (
                <li key={`${i}-${r.exerciseId}`} className={current ? 'current' : ''}>
                  <span>{c.exerciseById[r.exerciseId].name}{r.sets > 1 ? ` · ${r.sets} sets` : ''}{current ? ` (set ${Math.min(a.setsDone + 1, r.sets)})` : ''}</span>
                  {!current && <button className="link" onClick={() => eng.playerRemove(i)} aria-label={`Remove ${c.exerciseById[r.exerciseId].name}`}><Icon name="close" size={14} /></button>}
                </li>
              );
            })}
          </ol>
          <div className="btns">
            <button onClick={() => setAdding((x) => !x)} aria-expanded={adding}>{adding ? 'Done' : 'Add exercise'}</button>
            <button onClick={() => setFollow(!follow)} aria-pressed={follow}><Icon name="user" size={15} /> {follow ? 'Stop following' : 'Follow me'}</button>
            <button className="danger" onClick={() => { eng.playerHeadHome(); showBanner('Heading home after this.'); }}>Head home</button>
          </div>
          {adding && (
            <div className="picker">
              {GROUPS.map((g) => (
                <div key={g.label}>
                  <h4>{g.label}</h4>
                  <div className="chips">
                    {c.exercises.filter((e) => g.types.includes(e.station)).map((e) => (
                      <button key={e.id} className={`chip ${e.goals[p.goal] >= 2 ? 'good' : ''}`} title={e.goals[p.goal] >= 2 ? `Good for ${c.goalById[p.goal].name}` : undefined}
                        onClick={() => { eng.playerQueue(e.id, 'end'); showBanner(`Added ${e.name}.`); }}>{e.name}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="muted">You're not in the gym right now. You'll be back first thing tomorrow (in-game).</p>
      )}

      <h3>Progress</h3>
      <div className="stat-grid">
        <div><span>Visits</span>{p.stats.visits}</div>
        <div><span>Streak</span>{p.stats.streak} (best {p.stats.bestStreak})</div>
        <div><span>PRs</span>{p.stats.prs}</div>
        <div><span>Goal</span>{c.goalById[p.goal].name}</div>
      </div>
      <ProgressChart history={eng.save.playerHistory ?? []} />
      {titlesFor(eng.save, p.id).length > 0 && (
        <>
          <h3>Your titles</h3>
          <ul className="titles">{titlesFor(eng.save, p.id).map((t) => <li key={t.id}><Icon name="star" size={15} /> {titleLabel(c, t)}</li>)}</ul>
        </>
      )}
      <div className="btns"><button onClick={() => useUi.getState().openPanel('creator')}>Edit your character</button></div>
    </section>
  );
}
