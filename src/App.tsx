import { useCallback, useEffect, useState } from 'react';
import { content } from './sim/content';
import { SimEngine, type EngineSettings } from './sim/engine';
import type { SaveData } from './sim/types';
import { EngineContext } from './engineContext';
import { GymScene } from './scene/GymScene';
import { Lineup } from './scene/Lineup';
import { TopBar } from './ui/TopBar';
import { Tooltip } from './ui/Tooltip';
import { Feed, Banner } from './ui/Feed';
import { HallOfFame } from './ui/HallOfFame';
import { SettingsPanel } from './ui/SettingsPanel';
import { MusicWindow } from './ui/MusicWindow';
import { ProfileCard } from './ui/ProfileCard';
import { YearReview } from './ui/YearReview';
import { PlayerPanel } from './ui/PlayerPanel';
import { CharacterCreator } from './ui/CharacterCreator';
import { useSettings } from './store/settings';
import { useSaveStore, waitForHydration } from './store/save';
import { useUi } from './store/ui';
import { handleRedirect } from './spotify/auth';
import { applySettings, audioState, playSfx, radioBeat, setCrowd, unlockAudio, type Sfx } from './audio/sound';
import { useMusic, musicPlaying } from './store/music';
import { onNowPlaying } from './spotify/player';

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
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) Object.assign(window, { __gym: eng, __ui: useUi, __audio: { audioState, radioBeat }, __settings: useSettings });
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
    // Canvas textures (floor labels, signs) need the self-hosted font before they are drawn.
    const fonts = document.fonts?.load(`900 32px "Nunito Variable"`).catch(() => undefined) ?? Promise.resolve();
    const fontTimeout = new Promise((r) => setTimeout(r, 2000));
    void Promise.all([waitForHydration(), Promise.race([fonts, fontTimeout])]).then(() => {
      const eng = boot(useSaveStore.getState().save);
      setEngine(eng);
      // first visit: make your character
      if (!eng.save.playerCreated && !new URLSearchParams(location.search).has('lineup')) useUi.getState().openPanel('creator');
    });
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

  // Sound: engine events become synthesised effects; the first click unlocks audio.
  useEffect(() => {
    if (!engine) return;
    const off = engine.onSfx((kind, pos) => playSfx(kind as Sfx, pos));
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const crowd = setInterval(() => setCrowd(engine.agents.size), 2000);
    const offMusic = useMusic.subscribe(() => { engine.music = musicPlaying(); });
    const offSpotify = onNowPlaying((np) => useMusic.getState().set({ spotifyPlaying: !!np && !np.paused }));
    return () => { off(); offMusic(); offSpotify(); clearInterval(crowd); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [engine]);
  useEffect(() => {
    const push = () => applySettings(useSettings.getState());
    push();
    return useSettings.subscribe(push);
  }, []);

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
  if (new URLSearchParams(location.search).has('lineup')) return <Lineup engine={engine} />;

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
        {panel === 'profile' && <ProfileCard />}
        {panel === 'review' && <YearReview />}
        {panel === 'player' && <PlayerPanel />}
        {panel === 'creator' && <CharacterCreator />}
      </div>
    </EngineContext.Provider>
  );
}
