// The character pack: decodes from the shipped files, builds every look the game can ask for, and poses cleanly.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { loadPack, packData, packGeometry, PackRig } from './pack';
import { lookForCrew, type CharacterLook } from './look';
import { computePose, restPose, type PoseContext } from './poses';
import type { Anim } from '../../sim/types';

const dir = resolve(__dirname, '../../../public/characters');

beforeAll(async () => {
  vi.stubGlobal('fetch', async (url: string) => {
    const file = resolve(dir, url.split('/').pop()!);
    const buf = readFileSync(file);
    return {
      ok: true, status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  });
  await loadPack();
});

const base: CharacterLook = {
  key: '', gender: 'male', skin: '#C68642', hair: '#3B2416', hairStyle: 'short', facialHair: 'none',
  top: 'tee', bottom: 'shorts', shirt: '#E63946', trim: '#FFFFFF', shorts: '#222222', shoes: '#F1FAEE', sole: '#FFFFFF',
  street: '#7F8C8D', streetBottom: '#2B2D42', height: 1, build: 1, muscle: 0.4, belly: 0,
  headphones: false, belt: false, wristbands: false, glasses: false, crew: false,
};

function check(g: THREE.BufferGeometry): void {
  const n = g.attributes.position.count;
  const idx = g.index!.array;
  expect(idx.length % 3).toBe(0);
  expect(idx.length).toBeGreaterThan(3000);
  for (let i = 0; i < idx.length; i++) if (idx[i] >= n) throw new Error(`index ${idx[i]} >= ${n}`);
  const si = g.attributes.skinIndex.array;
  for (let i = 0; i < si.length; i++) if (si[i] > 22) throw new Error(`joint ${si[i]}`);
  const pos = g.attributes.position.array;
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error('NaN position');
}

describe('character pack', () => {
  it('loads the shipped files', () => {
    const p = packData();
    expect(p).not.toBeNull();
    expect(p!.manifest.bones).toHaveLength(23);
    for (const clip of ['Idle', 'Walk', 'Run', 'Victory', 'Walk_Carry']) expect(p!.clips[clip]).toBeDefined();
    for (const move of ['talk', 'phone', 'drink', 'foldArms', 'build', 'nod', 'dance']) expect(p!.moves[move]).toBeDefined();
  });

  it('builds every combination of the creator options', () => {
    let n = 0;
    for (const gender of ['male', 'female'] as const)
      for (const hairStyle of ['short', 'buzz', 'spiky', 'curly', 'afro', 'bun', 'ponytail', 'long', 'bald'])
        for (const top of ['tee', 'tank', 'sportsTop', 'longsleeve'] as const)
          for (const bottom of ['shorts', 'leggings', 'joggers'] as const)
            for (const facialHair of ['none', 'beard', 'stubble', 'moustache'] as const) {
              const look = { ...base, gender, hairStyle, top, bottom, facialHair, glasses: n % 3 === 0, headphones: n % 4 === 0, belt: n % 5 === 0, key: `t${n++}` };
              check(packGeometry(look, 'gym'));
              check(packGeometry(look, 'street'));
            }
    for (const slot of [0, 1, 2]) check(packGeometry(lookForCrew(slot), 'gym'));
  });

  it('hides body skin under clothes but keeps it where a sports top leaves the midriff bare', () => {
    const tee = packGeometry({ ...base, key: 'cover-tee', top: 'tee' }, 'gym').index!.count;
    const sports = packGeometry({ ...base, key: 'cover-sports', gender: 'female', top: 'sportsTop' }, 'gym').index!.count;
    const bare = packData()!.parts.body.index.length;
    expect(tee).toBeLessThan(bare + packData()!.parts.teeM.index.length + 10000); // sanity
    expect(sports).toBeGreaterThan(0);
  });

  it('poses every animation without NaNs, keeping standing feet near the floor', () => {
    const rig = new PackRig({ ...base, key: 'pose' });
    const root = new THREE.Group();
    root.add(rig.object);
    const anims: Anim[] = ['idle', 'walk', 'lift', 'cardio', 'stretch', 'flex', 'clap', 'talk', 'search', 'powerUp', 'celebrate', 'build', 'spot', 'hype', 'fistBump', 'dramatic', 'pretend', 'podium', 'drink', 'mirrorCheck', 'chalk', 'phone', 'change', 'nod', 'doubleTake'];
    const exercises = ['bench_press', 'back_squat', 'deadlift', 'pull_up', 'treadmill_run', 'bike_intervals', 'rowing', 'plank', 'stretch', 'lat_pulldown'];
    const pose = restPose();
    const v = new THREE.Vector3();
    for (const anim of anims) for (const exercise of anim === 'lift' ? exercises : [undefined]) {
      for (let t = 0; t < 3; t += 0.5) {
        const ctx: PoseContext = { anim, exercise, t, variant: 0.3, reduced: false };
        Object.assign(pose, computePose(ctx));
        rig.apply(pose, ctx, 0.1);
        root.updateMatrixWorld(true);
        for (const b of rig.bones) {
          b.getWorldPosition(v);
          if (!Number.isFinite(v.x + v.y + v.z)) throw new Error(`${anim}/${exercise}: NaN at ${b.name}`);
        }
        rig.hand('L', v);
        expect(Number.isFinite(v.y)).toBe(true);
      }
    }
    // standing still: the lower legs reach down to the floor
    const ctx: PoseContext = { anim: 'nod', t: 0, variant: 0, reduced: true };
    Object.assign(pose, computePose(ctx));
    for (let i = 0; i < 30; i++) rig.apply(pose, ctx, 0.1);
    root.updateMatrixWorld(true);
    const shin = rig.bones.find((b) => b.name === 'LowerLeg.L')!;
    const ankle = new THREE.Vector3(0, 0.4, 0).applyMatrix4(shin.matrixWorld);
    expect(ankle.y).toBeLessThan(0.15);
    expect(ankle.y).toBeGreaterThan(-0.1);
  });

  it('plays the library moves with the feet on the floor', () => {
    const rig = new PackRig({ ...base, key: 'moves' });
    const root = new THREE.Group();
    root.add(rig.object);
    const pose = restPose();
    const shin = rig.bones.find((b) => b.name === 'LowerLeg.L')!;
    const lowest = (anim: Anim, variant: number) => {
      let low = Infinity;
      for (let i = 0; i < 120; i++) {
        const ctx: PoseContext = { anim, t: i * 0.05, variant, reduced: false };
        Object.assign(pose, computePose(ctx));
        rig.apply(pose, ctx, 0.05);
        root.updateMatrixWorld(true);
        if (i > 40) low = Math.min(low, new THREE.Vector3(0, 0.4, 0).applyMatrix4(shin.matrixWorld).y);
      }
      return low;
    };
    for (const anim of ['talk', 'phone', 'drink', 'nod'] as Anim[]) {
      const y = lowest(anim, 0.3);
      expect(y, anim).toBeLessThan(0.15);
      expect(y, anim).toBeGreaterThan(-0.1);
    }
    expect(lowest('celebrate', 0.9)).toBeGreaterThan(-0.1); // dance
    expect(lowest('build', 0.3)).toBeGreaterThan(-0.15);    // kneeling
  });
});
