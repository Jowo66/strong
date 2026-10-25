// The furniture models: decode from the shipped files and merge with the room's primitive geometry.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadProps, propsData } from './props';
import { Kit } from './kit';

const dir = resolve(__dirname, '../../public/props');

beforeAll(async () => {
  vi.stubGlobal('fetch', async (url: string) => {
    const buf = readFileSync(resolve(dir, url.split('/').pop()!));
    return {
      ok: true, status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  });
  await loadProps();
});

describe('props', () => {
  it('loads every prop the room places, sitting on the floor', () => {
    const P = propsData()!;
    for (const id of ['plantPalm', 'plantMonstera', 'plantSnake', 'plantCactus', 'plantLeafy', 'plantTiny', 'couch', 'coffeeTable', 'stool', 'trophy']) {
      const m = P[id];
      expect(m, id).toBeDefined();
      m.geo.computeBoundingBox();
      const b = m.geo.boundingBox!;
      expect(b.min.y).toBeCloseTo(0, 2);
      expect(b.max.y).toBeCloseTo(m.size[1], 2);
      expect(Math.abs(b.min.x + b.max.x)).toBeLessThan(0.01);
      const pos = m.geo.attributes.position.array;
      for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error(`${id}: NaN`);
    }
  });

  it('merges with primitive shapes in one geometry', () => {
    const P = propsData()!;
    const g = new Kit().box(1, 1, 1, '#FF0000', 0, 0, 0).model(P.couch.geo, 2, 0, 0, Math.PI / 2, 0.5).build();
    expect(g.attributes.position.count).toBe(36 + P.couch.geo.attributes.position.count);
    expect(g.attributes.color).toBeDefined();
  });
});
