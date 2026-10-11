import { createContext, useContext, useEffect, useState } from 'react';
import type { SimEngine } from './sim/engine';

export const EngineContext = createContext<SimEngine | null>(null);

export function useEngine(): SimEngine {
  const e = useContext(EngineContext);
  if (!e) throw new Error('useEngine must be used inside <EngineContext.Provider>');
  return e;
}


/** Re-render every `ms` milliseconds (for UI that reads engine state without subscribing). */
export function usePoll(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}
