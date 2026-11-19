import { useEngine, usePoll } from '../engineContext';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { clockLabel } from '../sim/calendar';
import { AuraButton } from './AuraButton';
import { Icon } from './Icon';

const SPEEDS = [0, 1, 2, 4];

export function TopBar() {
  const eng = useEngine();
  usePoll(500);
  const speed = useSettings((s) => s.speed);
  const set = useSettings((s) => s.set);
  const openPanel = useUi((s) => s.openPanel);
  const panel = useUi((s) => s.panel);
  return (
    <header className="topbar">
      <nav className="garden-nav" aria-label="Portfolio">
        <a className="gn-tree" href="https://jowo66.github.io/" title="Back to jowo66.github.io" aria-label="Back to jowo66.github.io"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 1 4.2 6h2L3 10.5h3.6L5 13h6l-1.6-2.5H13L9.8 6h2z" fill="currentColor"/><rect x="7" y="13" width="2" height="2" fill="currentColor"/></svg></a>
        <a className="gn-link" href="https://jowo66.github.io/garden.html">Garden</a>
      </nav>
      <div className="brand"><span className="brand-mark"><Icon name="dumbbell" size={20} /></span> Mini Gym</div>
      <div className="clock" aria-live="off">
        <span>{eng.dateLabel()}</span>
        <strong>{clockLabel(eng.save.dayTime, eng.settings.dayLength)}</strong>
        <span className="chip" title="Members in the gym right now"><Icon name="members" size={15} label="Members inside" /> {eng.agents.size}</span>
      </div>
      <div className="speed" role="group" aria-label="Simulation speed">
        {SPEEDS.map((s) => (
          <button key={s} className={speed === s ? 'on' : ''} onClick={() => set({ speed: s })} aria-pressed={speed === s}>
            {s === 0 ? <Icon name="pause" size={14} label="Pause" /> : `${s}×`}
          </button>
        ))}
      </div>
      <nav className="actions">
        <AuraButton />
        <button className={panel === 'player' ? 'on' : ''} onClick={() => openPanel('player')}><Icon name="user" /> <span className="label">You</span></button>
        <button className={panel === 'hall' ? 'on' : ''} onClick={() => openPanel('hall')}><Icon name="trophy" /> <span className="label">Hall of Fame</span></button>
        <button className={panel === 'music' ? 'on' : ''} onClick={() => openPanel('music')} aria-label="Music"><Icon name="speaker" /></button>
        <button className={panel === 'settings' ? 'on' : ''} onClick={() => openPanel('settings')} aria-label="Settings"><Icon name="gear" /></button>
      </nav>
    </header>
  );
}
