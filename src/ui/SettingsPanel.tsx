import { useRef, useState } from 'react';
import { useEngine } from '../engineContext';
import { useSettings, type GymSize } from '../store/settings';
import { useUi } from '../store/ui';
import { isValidSave } from '../store/save';

export function SettingsPanel({ onImport, onSave }: { onImport: (json: unknown) => void; onSave: () => void }) {
  const eng = useEngine();
  const s = useSettings();
  const close = useUi((u) => u.openPanel);
  const showBanner = useUi((u) => u.showBanner);
  const [confirm, setConfirm] = useState<'soft' | 'hard' | null>(null);
  const [keepArchive, setKeepArchive] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const sizes = eng.c.population.sizes;

  const exportSave = () => {
    const blob = new Blob([JSON.stringify(eng.snapshot(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mini-gym-${eng.isoToday()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importSave = async (f: File) => {
    try {
      const json = JSON.parse(await f.text());
      if (!isValidSave(json)) throw new Error('bad');
      onImport(json);
      showBanner('Gym imported.');
    } catch {
      showBanner("That file isn't a Mini Gym save.");
    }
  };

  return (
    <section className="panel" aria-label="Settings">
      <header><h2>⚙️ Settings</h2><button onClick={() => close('settings')} aria-label="Close">✕</button></header>

      <h3>Gym</h3>
      <label className="row">Size
        <select value={s.gymSize} onChange={(e) => s.set({ gymSize: e.target.value as GymSize })}>
          {(Object.keys(sizes) as GymSize[]).map((k) => <option key={k} value={k}>{sizes[k].label} ({sizes[k].members} members, up to {sizes[k].cap} at once)</option>)}
        </select>
      </label>
      <label className="row">Length of a gym day
        <select value={s.dayLengthMinutes} onChange={(e) => s.set({ dayLengthMinutes: Number(e.target.value) })}>
          {[5, 10, 20, 30].map((m) => <option key={m} value={m}>{m} real minutes</option>)}
        </select>
      </label>
      <label className="row check"><input type="checkbox" checked={s.mixNationalities} onChange={(e) => s.set({ mixNationalities: e.target.checked })} /> Mixed-heritage names for new members</label>
      <label className="row check"><input type="checkbox" checked={s.nativeNameOrder} onChange={(e) => s.set({ nativeNameOrder: e.target.checked })} /> Family name first where that's the custom (Japan, Korea, China)</label>

      <h3>Display &amp; accessibility</h3>
      <label className="row check"><input type="checkbox" checked={s.tiltShift} onChange={(e) => s.set({ tiltShift: e.target.checked })} /> Tilt-shift blur</label>
      <label className="row check"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => s.set({ reducedMotion: e.target.checked })} /> Reduced motion</label>
      <label className="row check"><input type="checkbox" checked={s.highContrast} onChange={(e) => s.set({ highContrast: e.target.checked })} /> High contrast</label>
      <label className="row">Interface size
        <input type="range" min={0.85} max={1.4} step={0.05} value={s.uiScale} onChange={(e) => s.set({ uiScale: Number(e.target.value) })} />
      </label>

      <h3>🔄 Reshuffle members</h3>
      <p className="muted">Soft refresh keeps regulars (with their titles and stories) and replaces occasional visitors. Hard refresh replaces everyone.</p>
      {!confirm && (
        <div className="btns">
          <button onClick={() => setConfirm('soft')}>Soft refresh</button>
          <button className="danger" onClick={() => setConfirm('hard')}>Hard refresh</button>
        </div>
      )}
      {confirm && (
        <div className="confirm">
          {confirm === 'hard' && (
            <label className="row check"><input type="checkbox" checked={keepArchive} onChange={(e) => setKeepArchive(e.target.checked)} /> Keep Hall of Fame archive</label>
          )}
          <p>{confirm === 'hard' ? 'Everyone leaves, including you. This cannot be undone.' : 'Occasional visitors leave for good.'}</p>
          <div className="btns">
            <button className="danger" onClick={() => { eng.reshuffle(confirm, keepArchive); onSave(); setConfirm(null); }}>Confirm</button>
            <button onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <h3>Backup</h3>
      <p className="muted">Your gym is saved in this browser. Export it to keep a copy or move it to another device.</p>
      <div className="btns">
        <button onClick={exportSave}>Export gym</button>
        <button onClick={() => file.current?.click()}>Import gym</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSave(f); e.target.value = ''; }} />
      </div>
    </section>
  );
}
