import { useCallback, useEffect, useState } from 'react';
import { content } from './sim/content';
import { SimEngine, type EngineSettings } from './sim/engine';
import type { SaveData } from './sim/types';
import { EngineContext } from './engineContext';
import { GymScene } from './scene/GymScene';
import { TopBar } from './ui/TopBar';
import { Tooltip } from './ui/Tooltip';
import { Feed, Banner } from './ui/Feed';
import { HallOfFame } from './ui/HallOfFame';
import { SettingsPanel } from './ui/SettingsPanel';
import { MusicWindow } from './ui/MusicWindow';
import { useSettings } from './store/settings';
import { useSaveStore, waitForHydration } from './store/save';
import { useUi } from './store/ui';
import { handleRedirect } from './spotify/auth';

const SAVE_EVERY_MS = 15_000;

function engineSettings(): EngineSettings {
  const s = useSettings.getState();
  const size = content.population.sizes[s.gymSize];
  return { dayLength: s.dayLengthMinutes * 60, cap: size.cap, members: size.members, mixChance: s.mixNationalities ? 0.15 : 0 };
}

function boot(existing: SaveData | null): SimEngine {
  const settings = engineSettings();
  const save = existing ?? SimEngine.createSave(content, { members: settings.members, mixChance: settings.mixChance });
  const eng = new SimEngine(content, save, settings);
  if (existing) {
    const away = eng.daysAway();
    if (away > 0) eng.catchUp(away);
  }
  eng.configure(settings);
  // Add ?debug to the URL to poke the sim from the browser console: __gym.catchUp(3), __gym.agents, …
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) (window as unknown as { __gym: SimEngine }).__gym = eng;
  return eng;
}

export default function App() {
  const [engine, setEngine] = useState<SimEngine | null>(null);
  const panel = useUi((s) => s.panel);
  const uiScale = useSettings((s) => s.uiScale);
  const highContrast = useSettings((s) => s.highContrast);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  useEffect(() => {
    void handleRedirect().then((justLoggedIn) => { if (justLoggedIn) useUi.getState().openPanel('music'); }).catch(() => undefined);
    void waitForHydration().then(() => setEngine(boot(useSaveStore.getState().save)));
  }, []);

  const save = useCallback(() => { if (engine) useSaveStore.getState().setSave(engine.snapshot()); }, [engine]);

  useEffect(() => {
    if (!engine) return;
    save();
    const id = setInterval(save, SAVE_EVERY_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', save); };
  }, [engine, save]);

  // Apply roster/day-length changes from settings without restarting the sim.
  useEffect(() => {
    if (!engine) return;
    return useSettings.subscribe(() => engine.configure(engineSettings()));
  }, [engine]);

  const onImport = (data: unknown) => {
    useSaveStore.getState().setSave(data as SaveData);
    setEngine(boot(data as SaveData));
  };

  if (!engine) return <div className="loading">Unlocking the gym…</div>;

  return (
    <EngineContext.Provider value={engine}>
      <div className={`app ${highContrast ? 'hc' : ''} ${reducedMotion ? 'rm' : ''}`} style={{ ['--ui-scale' as string]: uiScale }}>
        <div className="stage"><GymScene engine={engine} /></div>
        <TopBar />
        <Feed key={`feed-${engine.save.createdAt}`} />
        <Banner />
        <Tooltip />
        {panel === 'hall' && <HallOfFame />}
        {panel === 'settings' && <SettingsPanel onImport={onImport} onSave={save} />}
        {panel === 'music' && <MusicWindow />}
      </div>
    </EngineContext.Provider>
  );
}
