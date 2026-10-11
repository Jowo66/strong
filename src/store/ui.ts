import { create } from 'zustand';

export type Panel = 'hall' | 'settings' | 'music' | null;

interface UiState {
  hovered: string | null;
  panel: Panel;
  banner: { text: string; id: number } | null;
  setHovered: (id: string | null) => void;
  openPanel: (p: Panel) => void;
  showBanner: (text: string) => void;
}

export const useUi = create<UiState>()((set) => ({
  hovered: null,
  panel: null,
  banner: null,
  setHovered: (hovered) => set({ hovered }),
  openPanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  showBanner: (text) => set({ banner: { text, id: Date.now() } }),
}));
