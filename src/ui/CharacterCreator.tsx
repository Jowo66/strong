// Character creator: name, country, look, goal and level, with a live 3D preview. Opens on first visit and
// from the "You" panel. Changing level only changes starting weights for a player who hasn't trained yet.
import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { packData } from '../scene/character/pack';
import { useEngine } from '../engineContext';
import { EngineContext } from '../engineContext';
import { useUi } from '../store/ui';
import { Avatar, type AvatarSource } from '../scene/Avatar';
import { lookForNpc } from '../scene/character/look';
import type { Appearance, Experience, Gender, GoalId, Npc } from '../sim/types';
import { Rng } from '../sim/rng';
import { Icon } from './Icon';

const TOPS = [['tee', 'T-shirt'], ['tank', 'Tank'], ['sportsTop', 'Sports top'], ['longsleeve', 'Long sleeve']] as const;
const BOTTOMS = [['shorts', 'Shorts'], ['leggings', 'Leggings'], ['joggers', 'Joggers']] as const;
const FACIAL = [['none', 'None'], ['stubble', 'Stubble'], ['beard', 'Beard'], ['moustache', 'Moustache']] as const;
const HAIR = ['short', 'buzz', 'spiky', 'curly', 'afro', 'bun', 'ponytail', 'long', 'bald'];
const SHOES = ['#F1FAEE', '#222222', '#E63946', '#3A86FF', '#FFBE0B', '#8D99AE', '#06D6A0'];
const POSES: AvatarSource['anim'][] = ['idle', 'flex', 'celebrate', 'idle', 'walk'];

function Swatches({ label, colours, value, onPick }: { label: string; colours: readonly string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="row">
      <span>{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {colours.map((c) => <button key={c} role="radio" aria-checked={c === value} aria-label={c} className={c === value ? 'on' : ''} style={{ background: c }} onClick={() => onPick(c)} />)}
      </div>
    </div>
  );
}

export function CharacterCreator() {
  const eng = useEngine();
  const close = useUi((s) => s.openPanel);
  const showBanner = useUi((s) => s.showBanner);
  const p = eng.player!;
  const c = eng.c;
  const fresh = p.stats.visits === 0;
  const [d, setD] = useState({
    firstName: p.firstName, lastName: p.lastName, country: p.country, gender: p.gender as Gender,
    goal: p.goal as GoalId, experience: p.experience as Experience,
    appearance: { ...p.appearance, top: p.appearance.top ?? lookForNpc(p).top as Appearance['top'], bottom: p.appearance.bottom ?? lookForNpc(p).bottom, facialHair: p.appearance.facialHair ?? lookForNpc(p).facialHair, shoes: p.appearance.shoes ?? lookForNpc(p).shoes, glasses: p.appearance.glasses ?? lookForNpc(p).glasses } as Appearance,
  });
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const setAp = (patch: Partial<Appearance>) => setD((x) => ({ ...x, appearance: { ...x.appearance, ...patch } }));
  const preview: Npc = useMemo(() => ({ ...p, id: 'preview', ...d, traits: [] }), [p, d]);
  const look = lookForNpc(preview, 'player');
  const [poseIdx, setPoseIdx] = useState(0);
  const source = useMemo<AvatarSource>(() => ({ pos: { x: 0, z: 0 }, facing: 0.35, anim: POSES[poseIdx], bubble: null, outfit: 'gym' }), [poseIdx]);

  const randomName = () => {
    const pool = c.names.find((n) => n.code === d.country) ?? c.names[0];
    const r = new Rng(Date.now());
    set({ firstName: r.pick(d.gender === 'male' ? pool.male : pool.female), lastName: r.pick(pool.last) });
  };
  const save = () => {
    if (!d.firstName.trim() || !d.lastName.trim()) { showBanner('Your character needs a first and last name.'); return; }
    eng.updatePlayer({ ...d, firstName: d.firstName.trim().slice(0, 24), lastName: d.lastName.trim().slice(0, 24) });
    showBanner(`Welcome to Mini Gym, ${d.firstName.trim()}!`);
    close('creator');
  };

  return (
    <section className="panel creator" aria-label="Your character">
      <header><h2><Icon name="user" size={20} /> Your character</h2><button onClick={() => { eng.save.playerCreated = true; close('creator'); }} aria-label="Close"><Icon name="close" /></button></header>
      <div className="preview" onClick={() => setPoseIdx((i) => (i + 1) % POSES.length)} title="Click to change pose">
        <Canvas camera={packData() ? { position: [0.35, 1.5, 4.3], fov: 30 } : { position: [0.3, 1.45, 3.1], fov: 30 }} dpr={[1, 2]} onCreated={({ camera }) => camera.lookAt(0, packData() ? 1.12 : 0.95, 0)}>
          <EngineContext.Provider value={eng}>
            <color attach="background" args={['#FFF4DE']} />
            <hemisphereLight args={['#FFF8EE', '#B9A58C', 1.3]} />
            <directionalLight position={[2, 4, 3]} intensity={1.8} />
            <Avatar key={look.key} id="preview" look={look} source={() => source} hoverable={false} />
          </EngineContext.Provider>
        </Canvas>
      </div>

      <h3>Name</h3>
      <div className="name-row">
        <input aria-label="First name" value={d.firstName} maxLength={24} onChange={(e) => set({ firstName: e.target.value })} />
        <input aria-label="Last name" value={d.lastName} maxLength={24} onChange={(e) => set({ lastName: e.target.value })} />
        <button onClick={randomName} title="Random name from your country">🎲</button>
      </div>
      <label className="row">Country (names and name order)
        <select value={d.country} onChange={(e) => set({ country: e.target.value })}>
          {c.names.map((n) => <option key={n.code} value={n.code}>{n.country}</option>)}
        </select>
      </label>
      <label className="row">Title style (Bench King / Queen)
        <select value={d.gender} onChange={(e) => set({ gender: e.target.value as Gender })}>
          <option value="male">King</option><option value="female">Queen</option>
        </select>
      </label>

      <h3>Training</h3>
      <label className="row">Goal
        <select value={d.goal} onChange={(e) => set({ goal: e.target.value as GoalId })}>
          {c.goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <label className="row">Level{!fresh && <span className="muted small"> (set by your training now)</span>}
        <select value={d.experience} disabled={!fresh} onChange={(e) => set({ experience: e.target.value as Experience })}>
          <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
        </select>
      </label>

      <h3>Look</h3>
      <Swatches label="Skin" colours={c.appearance.skin} value={d.appearance.skin} onPick={(v) => setAp({ skin: v })} />
      <label className="row">Hair
        <select value={d.appearance.hairStyle} onChange={(e) => setAp({ hairStyle: e.target.value })}>
          {HAIR.map((h) => <option key={h} value={h}>{h[0].toUpperCase() + h.slice(1)}</option>)}
        </select>
      </label>
      <Swatches label="Hair colour" colours={c.appearance.hair} value={d.appearance.hair} onPick={(v) => setAp({ hair: v })} />
      <label className="row">Facial hair
        <select value={d.appearance.facialHair} onChange={(e) => setAp({ facialHair: e.target.value as Appearance['facialHair'] })}>
          {FACIAL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="row check"><input type="checkbox" checked={!!d.appearance.glasses} onChange={(e) => setAp({ glasses: e.target.checked })} /> Glasses</label>
      <label className="row">Top
        <select value={d.appearance.top} onChange={(e) => setAp({ top: e.target.value as Appearance['top'] })}>
          {TOPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <Swatches label="Top colour" colours={c.appearance.shirt} value={d.appearance.shirt} onPick={(v) => setAp({ shirt: v })} />
      <label className="row">Bottoms
        <select value={d.appearance.bottom} onChange={(e) => setAp({ bottom: e.target.value as Appearance['bottom'] })}>
          {BOTTOMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <Swatches label="Bottoms colour" colours={c.appearance.shorts} value={d.appearance.shorts} onPick={(v) => setAp({ shorts: v })} />
      <Swatches label="Shoes" colours={SHOES} value={d.appearance.shoes ?? SHOES[0]} onPick={(v) => setAp({ shoes: v })} />
      <Swatches label="Hoodie" colours={c.appearance.street} value={d.appearance.street} onPick={(v) => setAp({ street: v })} />
      <label className="row">Height
        <input type="range" min={0.9} max={1.1} step={0.01} value={d.appearance.height} onChange={(e) => setAp({ height: Number(e.target.value) })} />
      </label>
      <label className="row">Build
        <input type="range" min={0.85} max={1.25} step={0.01} value={d.appearance.build} onChange={(e) => setAp({ build: Number(e.target.value) })} />
      </label>

      <div className="btns sticky"><button className="cta" onClick={save}>Save character</button></div>
    </section>
  );
}
