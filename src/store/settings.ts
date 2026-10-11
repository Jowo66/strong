// Small per-device settings, kept in localStorage.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GymSize = 'small' | 'medium' | 'rush';

export interface Settings {
  gymSize: GymSize;
  dayLengthMinutes: number;
  speed: number;            // 0 = paused
  reducedMotion: boolean;
  highContrast: boolean;
  uiScale: number;
  nativeNameOrder: boolean;
  mixNationalities: boolean;
  tiltShift: boolean;
  auraColour: string;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      gymSize: 'medium',
      dayLengthMinutes: 10,
      speed: 1,
      reducedMotion: !!prefersReducedMotion,
      highContrast: false,
      uiScale: 1,
      nativeNameOrder: false,
      mixNationalities: false,
      tiltShift: true,
      auraColour: 'gold',
      set: (patch) => set(patch),
    }),
    { name: 'mini-gym-settings', partialize: ({ set: _set, ...rest }) => rest },
  ),
);
