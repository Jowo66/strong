// The gym's save (members, Moments, Hall of Fame) lives in IndexedDB via zustand persist + idb-keyval.
// Some browsers block or stall IndexedDB (iOS Safari quirks, private windows, in-app browsers like Instagram).
// The storage below never hangs and never throws: IndexedDB → localStorage → memory, in that order.
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import type { SaveData } from '../sim/types';

export type StorageBackend = 'indexeddb' | 'localstorage' | 'memory';

const IDB_TIMEOUT_MS = 4000;
const memory = new Map<string, string>();
let idbBroken = false;
let backend: StorageBackend = 'indexeddb';

/** Where the gym is actually being saved in this browser. 'memory' means it won't survive a reload. */
export const storageBackend = (): StorageBackend => backend;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('storage timed out')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Run an IndexedDB call; on any failure, remember that IndexedDB is unusable and return `fallback`. */
async function tryIdb<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  if (idbBroken) return { ok: false };
  try {
    return { ok: true, value: await withTimeout(Promise.resolve().then(fn), IDB_TIMEOUT_MS) };
  } catch (e) {
    console.warn('Mini Gym: IndexedDB unavailable, falling back.', e);
    idbBroken = true;
    return { ok: false };
  }
}

function local(): Storage | null {
  try {
    const k = '__mini_gym_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

const safeStorage: StateStorage = {
  getItem: async (name) => {
    const r = await tryIdb(() => get<string>(name));
    if (r.ok) { backend = 'indexeddb'; return r.value ?? null; }
    const ls = local();
    backend = ls ? 'localstorage' : 'memory';
    return ls ? ls.getItem(name) : memory.get(name) ?? null;
  },
  setItem: async (name, value) => {
    const r = await tryIdb(() => set(name, value));
    if (r.ok) { backend = 'indexeddb'; return; }
    const ls = local();
    if (ls) {
      try { ls.setItem(name, value); backend = 'localstorage'; return; } catch { /* full */ }
    }
    backend = 'memory';
    memory.set(name, value);
  },
  removeItem: async (name) => {
    await tryIdb(() => del(name));
    try { localStorage.removeItem(name); } catch { /* blocked */ }
    memory.delete(name);
  },
};

interface SaveState {
  save: SaveData | null;
  setSave: (save: SaveData | null) => void;
}

export const useSaveStore = create<SaveState>()(
  persist((setState) => ({ save: null, setSave: (save) => setState({ save }) }), {
    name: 'mini-gym-save',
    version: 1,
    storage: createJSONStorage(() => safeStorage),
    partialize: (s) => ({ save: s.save }),
  }),
);

/** Resolves once the stored save has been read (or found unreadable). Never hangs. */
export function waitForHydration(): Promise<void> {
  if (useSaveStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useSaveStore.persist.onFinishHydration(() => { unsub(); resolve(); });
  });
}

/** Delete the stored save everywhere it could be. Never throws or hangs. */
export async function clearSave(): Promise<void> {
  useSaveStore.setState({ save: null });
  await safeStorage.removeItem('mini-gym-save');
}
