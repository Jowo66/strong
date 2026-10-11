// The tiny information terminal shown when hovering a member.
import { useEffect, useState } from 'react';
import { useEngine, usePoll } from '../engineContext';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import { fullName } from '../sim/names';

export function Tooltip() {
  const eng = useEngine();
  const hovered = useUi((s) => s.hovered);
  const keyboard = useUi((s) => s.keyboardFocus);
  const native = useSettings((s) => s.nativeNameOrder);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  usePoll(250);
  useEffect(() => {
    const onMove = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  if (!hovered) return null;
  const info = eng.info(hovered);
  const npc = eng.save.members[hovered];
  if (!info || !npc) return null;
  return (
    <div className={`tooltip${keyboard ? ' kb' : ''}`} style={keyboard ? undefined : { left: pos.x + 16, top: pos.y + 16 }} role="tooltip">
      <div className="tt-name">{fullName(npc, native)}{info.isPlayer && <span className="you">YOU</span>}</div>
      {info.title && <div className="tt-title">⭐ {info.title}</div>}
      <div className="tt-row"><span>Goal</span>{info.goal}</div>
      {info.exercise && <div className="tt-row"><span>Exercise</span>{info.exercise}</div>}
      <div className="tt-row"><span>Progress</span>{info.progress}</div>
      <div className="tt-act">{info.activity}</div>
    </div>
  );
}
