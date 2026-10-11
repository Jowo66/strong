// The gym's save (members, Moments, Hall of Fame) lives in IndexedDB via zustand persist + idb-keyval.
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import type { SaveData } from '../sim/types';

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => { await set(name, value); },
  removeItem: async (name) => { await del(name); },
};

interface SaveState {
  save: SaveData | null;
  setSave: (save: SaveData | null) => void;
}

export const useSaveStore = create<SaveState>()(
  persist((setState) => ({ save: null, setSave: (save) => setState({ save }) }), {
    name: 'mini-gym-save',
    version: 1,
    storage: createJSONStorage(() => idbStorage),
    partialize: (s) => ({ save: s.save }),
  }),
);

export function waitForHydration(): Promise<void> {
  if (useSaveStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useSaveStore.persist.onFinishHydration(() => { unsub(); resolve(); });
  });
}

export function isValidSave(x: unknown): x is SaveData {
  const s = x as SaveData;
  return !!s && s.version === 1 && typeof s.createdAt === 'string' && typeof s.day === 'number' && !!s.members && Array.isArray(s.titles);
}
