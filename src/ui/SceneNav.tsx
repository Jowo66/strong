// Keyboard and screen-reader access to the 3D scene.
// A visually hidden list of everyone in the gym: Tab moves through members (the camera glides to them, a ring
// appears at their feet and their info card shows), Enter opens their profile. The same list plus a one-line
// summary is what a screen reader reads as "Right now in the gym".
import { useEngine, usePoll } from '../engineContext';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import { fullName } from '../sim/names';

export function SceneNav() {
  const eng = useEngine();
  usePoll(1500);
  const setHovered = useUi((s) => s.setHovered);
  const setKeyboardFocus = useUi((s) => s.setKeyboardFocus);
  const openProfile = useUi((s) => s.openProfile);
  const native = useSettings((s) => s.nativeNameOrder);
  const people = [...eng.agents.keys()]
    .map((id) => ({ id, npc: eng.save.members[id], info: eng.info(id) }))
    .filter((p) => p.npc && p.info)
    .sort((a, b) => Number(!!b.npc.isPlayer) - Number(!!a.npc.isPlayer) || a.npc.firstName.localeCompare(b.npc.firstName));
  const describe = (p: (typeof people)[number]) => {
    const name = fullName(p.npc, native);
    const i = p.info!;
    return i.exercise && (i.activity.startsWith('Set') || i.activity === 'Resting') ? `${name} is doing ${i.exercise}, ${i.activity.toLowerCase().replace('set ', 'set ').replace('/', ' of ')}` : `${name}: ${i.activity.toLowerCase()}`;
  };
  const summary = people.length
    ? `${people.length} member${people.length === 1 ? '' : 's'} inside. ${people.slice(0, 3).map(describe).join('. ')}.`
    : 'The gym is empty right now.';

  return (
    <nav className="scene-nav" aria-label="Members in the gym">
      <h2 className="sr-only">Right now in the gym</h2>
      <p className="sr-only" role="status" aria-live="off">{eng.dateLabel()}. {summary}</p>
      <ul>
        {people.map((p) => (
          <li key={p.id}>
            <button className="member-btn"
              onFocus={() => { setHovered(p.id); setKeyboardFocus(p.id); }}
              onBlur={() => { setHovered(null); setKeyboardFocus(null); }}
              onClick={() => openProfile(p.id)}>
              {describe(p)}{p.npc.isPlayer ? ' (you)' : ''} <span className="kbd-hint">Enter: profile</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Global single-key shortcuts (ignored while typing in a field). */
export function useShortcuts(onAura: () => void): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const ui = useUi.getState();
    const s = useSettings.getState();
    switch (e.key) {
      case ' ': if (el?.tagName === 'BUTTON') return; e.preventDefault(); s.set({ speed: s.speed === 0 ? 1 : 0 }); break;
      case '1': s.set({ speed: 1 }); break;
      case '2': s.set({ speed: 2 }); break;
      case '4': s.set({ speed: 4 }); break;
      case 'a': case 'A': onAura(); break;
      case 'h': case 'H': ui.openPanel('hall'); break;
      case 'y': case 'Y': ui.openPanel('player'); break;
      case 'm': case 'M': ui.openPanel('music'); break;
      case 's': case 'S': ui.openPanel('settings'); break;
      case 'f': case 'F': ui.setFollow(!ui.follow); break;
      case 'Escape': if (ui.panel) ui.openPanel(ui.panel); break;
      default: return;
    }
  };
}
