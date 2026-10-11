import { useEngine, usePoll } from '../engineContext';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { clockLabel } from '../sim/calendar';
import { AuraButton } from './AuraButton';

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
      <div className="brand"><span className="brand-mark">🏋️</span> Mini Gym</div>
      <div className="clock" aria-live="off">
        <span>{eng.dateLabel()}</span>
        <strong>{clockLabel(eng.save.dayTime, eng.settings.dayLength)}</strong>
        <span className="chip" title="Members in the gym right now">👟 {eng.agents.size}</span>
      </div>
      <div className="speed" role="group" aria-label="Simulation speed">
        {SPEEDS.map((s) => (
          <button key={s} className={speed === s ? 'on' : ''} onClick={() => set({ speed: s })} aria-pressed={speed === s}>
            {s === 0 ? '⏸' : `${s}×`}
          </button>
        ))}
      </div>
      <nav className="actions">
        <AuraButton />
        <button className={panel === 'hall' ? 'on' : ''} onClick={() => openPanel('hall')}>🏆 Hall of Fame</button>
        <button className={panel === 'music' ? 'on' : ''} onClick={() => openPanel('music')} aria-label="Music">🔊</button>
        <button className={panel === 'settings' ? 'on' : ''} onClick={() => openPanel('settings')} aria-label="Settings">⚙️</button>
      </nav>
    </header>
  );
}
