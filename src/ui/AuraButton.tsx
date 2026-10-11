import { useState } from 'react';
import { useEngine } from '../engineContext';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';

export function AuraButton() {
  const eng = useEngine();
  const colour = useSettings((s) => s.auraColour);
  const set = useSettings((s) => s.set);
  const showBanner = useUi((s) => s.showBanner);
  const [open, setOpen] = useState(false);
  const hex = eng.c.aura.colours.find((c) => c.id === colour)?.hex;
  return (
    <div className="aura">
      <button className="aura-go" style={{ ['--aura' as string]: hex }}
        onClick={() => { if (!eng.triggerAura()) showBanner("You're not in the gym right now."); }}>✨ Aura</button>
      <button className="aura-pick" aria-label="Aura colour" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="swatch" style={{ background: hex }} />
      </button>
      {open && (
        <div className="aura-menu" role="menu">
          {eng.c.aura.colours.map((c) => (
            <button key={c.id} role="menuitemradio" aria-checked={c.id === colour} title={c.name}
              onClick={() => { set({ auraColour: c.id }); setOpen(false); }}>
              <span className="swatch" style={{ background: c.hex }} /> {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
