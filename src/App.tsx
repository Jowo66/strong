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
import { SceneNav, useShortcuts } from './ui/SceneNav';
import { ErrorBoundary, RecoveryScreen } from './ui/Recovery';
import { migrateSave } from './store/migrate';
import { useSettings } from './store/settings';
import { clearSave, storageBackend, useSaveStore, waitForHydration } from './store/save';
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
  eng.ensurePlayer();
  if (existing) {
    const away = eng.daysAway();
    if (away > 0) eng.catchUp(away);
  }
  eng.configure(settings);
  // Add ?debug to the URL to poke the sim from the browser console: __gym.catchUp(3), __gym.agents, …
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) Object.assign(window, { __gym: eng, __ui: useUi, __audio: { audioState, radioBeat }, __settings: useSettings });
  return eng;
}

/** Wipe the save and reload with a brand-new gym (only ever on the player's say-so).
 *  The ?newgym flag makes the next load ignore whatever is stored, so this works even when storage is broken. */
function startNewGym(): void {
  const go = () => { const u = new URL(location.href); u.searchParams.set('newgym', '1'); location.replace(u.toString()); };
  void Promise.race([clearSave(), new Promise((r) => setTimeout(r, 1500))]).finally(go);
}

function takeNewGymFlag(): boolean {
  const u = new URL(location.href);
  if (!u.searchParams.has('newgym')) return false;
  u.searchParams.delete('newgym');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
  return true;
}

export default function App() {
  return <ErrorBoundary onNewGym={startNewGym}><Gym /></ErrorBoundary>;
}

function Gym() {
  const [engine, setEngine] = useState<SimEngine | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const panel = useUi((s) => s.panel);
  const uiScale = useSettings((s) => s.uiScale);
  const highContrast = useSettings((s) => s.highContrast);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  useEffect(() => {
    void handleRedirect().then((justLoggedIn) => { if (justLoggedIn) useUi.getState().openPanel('music'); }).catch(() => undefined);
    // Canvas textures (floor labels, signs) need the self-hosted font before they are drawn.
    const fonts = document.fonts?.load(`900 32px "Nunito Variable"`).catch(() => undefined) ?? Promise.resolve();
    const fontTimeout = new Promise((r) => setTimeout(r, 2000));
    const fresh = takeNewGymFlag();
    const hydrated = Promise.race([waitForHydration().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 12000))]);
    void Promise.all([hydrated, Promise.race([fonts, fontTimeout])]).then(([ok]) => {
      if (!ok && !fresh) { setProblem('the save could not be read from this browser'); return; }
      const raw = fresh ? null : useSaveStore.getState().save;
      let eng: SimEngine;
      try {
        const m = raw ? migrateSave(raw) : null;
        if (raw && !m) { setProblem("the save is damaged or isn't a Mini Gym save"); return; }
        if (m?.repaired.length) console.info('Mini Gym: repaired the save:', m.repaired);
        eng = boot(m ? m.save : null);
        if (m?.repaired.length) useUi.getState().showBanner(`Your save needed ${m.repaired.length} small repair${m.repaired.length === 1 ? '' : 's'}. All good now.`);
      } catch (e) {
        console.error(e);
        setProblem(`it crashed while opening (${(e as Error).message})`);
        return;
      }
      setEngine(eng);
      if (storageBackend() === 'memory') useUi.getState().showBanner("This browser won't let Mini Gym save (private window or in-app browser?). The gym works, but use Settings → Export to keep it.");
      // first visit: make your character
      if (!eng.save.playerCreated && !new URLSearchParams(location.search).has('lineup')) useUi.getState().openPanel('creator');
    });
  }, []);

  const save = useCallback(() => { if (engine) useSaveStore.getState().setSave(engine.snapshot()); }, [engine]);

  useEffect(() => {
    if (!engine) return;
    save();
    const id = setInterval(save, SAVE_EVERY_MS);
    // a hidden tab stops rendering, so the sim pauses; coming back runs any whole days missed (abstract catch-up)
    const onHide = () => {
      if (document.visibilityState === 'hidden') { save(); return; }
      const away = engine.daysAway();
      if (away > 0) engine.catchUp(away);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', save); };
  }, [engine, save]);

  // Keyboard shortcuts: Space pause, 1/2/4 speed, A aura, H/Y/M/S panels, F follow, Esc close.
  const onKey = useShortcuts(() => { if (engine && !engine.triggerAura()) useUi.getState().showBanner("You're not in the gym right now."); });
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

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

  const onImport = (data: SaveData) => {
    useSaveStore.getState().setSave(data);
    setEngine(boot(data));
  };

  if (problem) return <RecoveryScreen problem={problem} onNewGym={startNewGym} />;
  if (!engine) return <div className="loading" role="status">Unlocking the gym…</div>;
  if (new URLSearchParams(location.search).has('lineup')) return <Lineup engine={engine} />;

  return (
    <EngineContext.Provider value={engine}>
      <div className={`app ${highContrast ? 'hc' : ''} ${reducedMotion ? 'rm' : ''}`} style={{ ['--ui-scale' as string]: uiScale }}>
        <div className="stage"><GymScene engine={engine} /></div>
        <TopBar />
        <Feed key={`feed-${engine.save.createdAt}`} />
        <Banner />
        <SceneNav />
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
