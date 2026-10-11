// Opened by clicking a wall speaker. Closing the window keeps the music playing.
// Two sources: Gym Radio (built in, synthesised, always available) and Spotify (Premium, desktop browsers).
import { useEffect, useState } from 'react';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import { useMusic } from '../store/music';
import { isLoggedIn, login, logout, spotifyConfigured, REDIRECT_URI } from '../spotify/auth';
import {
  connectPlayer, disconnectPlayer, getPlaylists, nextTrack, onNowPlaying, playPlaylist, previousTrack, setShuffle, setVolume,
  togglePlay, type NowPlaying, type Playlist,
} from '../spotify/player';
import { STATIONS, onRadio, playRadio, radioPlaying, stopRadio } from '../audio/sound';
import { Icon } from './Icon';

export function MusicWindow() {
  const close = useUi((s) => s.openPanel);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spotifyVol, setSpotifyVol] = useState(0.6);
  const [radio, setRadio] = useState(radioPlaying());
  const radioVolume = useSettings((s) => s.radioVolume);
  const setSettings = useSettings((s) => s.set);

  useEffect(() => onNowPlaying(setNow), []);
  useEffect(() => onRadio(setRadio), []);
  useEffect(() => {
    if (!loggedIn) return;
    setBusy(true);
    connectPlayer().then(getPlaylists).then(setPlaylists).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  }, [loggedIn]);

  const startRadio = (id: string) => {
    if (now && !now.paused) void togglePlay(); // one source at a time
    playRadio(id);
    useMusic.getState().set({ radio: id });
  };
  const offRadio = () => { stopRadio(); useMusic.getState().set({ radio: null }); };
  const spotifyAction = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { setError((e as Error).message); } };

  return (
    <section className="panel music" aria-label="Music">
      <header><h2><Icon name="speaker" size={20} /> Gym Speakers</h2><button onClick={() => close('music')} aria-label="Close"><Icon name="close" /></button></header>

      <h3>Gym Radio</h3>
      <p className="muted small">Original loops made right here in your browser. No account needed.</p>
      <div className="stations">
        {STATIONS.map((s) => (
          <button key={s.id} className={radio === s.id ? 'on' : ''} aria-pressed={radio === s.id} onClick={() => (radio === s.id ? offRadio() : startRadio(s.id))}>
            <Icon name={radio === s.id ? 'pause' : 'play'} size={15} /> {s.name} <span className="muted small">{s.bpm} bpm</span>
          </button>
        ))}
      </div>
      <label className="row">Radio volume
        <input type="range" min={0} max={1} step={0.05} value={radioVolume} onChange={(e) => setSettings({ radioVolume: Number(e.target.value) })} />
      </label>

      <h3>Spotify</h3>
      {!spotifyConfigured() && (
        <p className="muted">Spotify isn't set up for this build yet. Add <code>VITE_SPOTIFY_CLIENT_ID</code> (see the README) and register <code>{REDIRECT_URI}</code> as a redirect URI.</p>
      )}
      {spotifyConfigured() && !loggedIn && (
        <>
          <p className="muted">Connect Spotify (Premium, desktop browser) to play your playlists through the gym speakers.</p>
          <button className="primary" onClick={() => void login()}>Connect Spotify</button>
        </>
      )}
      {loggedIn && (
        <>
          <div className="now">
            {now?.art && <img src={now.art} alt="" width={56} height={56} />}
            <div>
              <div className="now-track">{now ? now.track : 'Nothing playing'}</div>
              <div className="muted">{now?.artist ?? 'Pick a playlist'}</div>
            </div>
          </div>
          <div className="transport" role="group" aria-label="Playback">
            <button onClick={() => void spotifyAction(previousTrack)} aria-label="Previous track"><Icon name="prev" /></button>
            <button className="play" onClick={() => { if (radio) offRadio(); void spotifyAction(togglePlay); }} aria-label={now?.paused === false ? 'Pause' : 'Play'}><Icon name={now?.paused === false ? 'pause' : 'play'} /></button>
            <button onClick={() => void spotifyAction(nextTrack)} aria-label="Next track"><Icon name="next" /></button>
            <button className={now?.shuffle ? 'on' : ''} aria-pressed={!!now?.shuffle} onClick={() => void spotifyAction(() => setShuffle(!now?.shuffle))} aria-label="Shuffle"><Icon name="shuffle" /></button>
          </div>
          <label className="row">Spotify volume
            <input type="range" min={0} max={1} step={0.05} value={spotifyVol} onChange={(e) => { const v = Number(e.target.value); setSpotifyVol(v); void setVolume(v); }} />
          </label>
          {error && <p className="error">{error}</p>}
          {busy && <p className="muted">Connecting the speakers…</p>}
          <ul className="playlists">
            {playlists.map((p) => (
              <li key={p.id}>
                <button onClick={() => { if (radio) offRadio(); playPlaylist(p.uri).catch((e: Error) => setError(e.message)); }}>
                  {p.image ? <img src={p.image} alt="" width={32} height={32} /> : <span className="ph" />} {p.name}
                </button>
              </li>
            ))}
          </ul>
          <button className="link" onClick={() => { disconnectPlayer(); logout(); setLoggedIn(false); setPlaylists([]); setNow(null); useMusic.getState().set({ spotifyPlaying: false }); }}>Disconnect Spotify</button>
        </>
      )}
      <p className="muted small">Closing this window keeps the music playing. Sound effects and ambience are in Settings.</p>
    </section>
  );
}
