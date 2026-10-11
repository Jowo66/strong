// Opened by clicking a wall speaker. Closing the window keeps the music playing.
import { useEffect, useState } from 'react';
import { useUi } from '../store/ui';
import { isLoggedIn, login, logout, spotifyConfigured, REDIRECT_URI } from '../spotify/auth';
import { connectPlayer, disconnectPlayer, getPlaylists, onNowPlaying, playPlaylist, togglePlay, type NowPlaying, type Playlist } from '../spotify/player';

export function MusicWindow() {
  const close = useUi((s) => s.openPanel);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onNowPlaying(setNow), []);
  useEffect(() => {
    if (!loggedIn) return;
    setBusy(true);
    connectPlayer().then(getPlaylists).then(setPlaylists).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  }, [loggedIn]);

  return (
    <section className="panel music" aria-label="Music">
      <header><h2>🔊 Gym Speakers</h2><button onClick={() => close('music')} aria-label="Close">✕</button></header>
      {!spotifyConfigured() && (
        <p className="muted">Spotify isn't set up for this build yet. Add <code>VITE_SPOTIFY_CLIENT_ID</code> (see the README) and register <code>{REDIRECT_URI}</code> as a redirect URI.</p>
      )}
      {spotifyConfigured() && !loggedIn && (
        <>
          <p className="muted">Connect Spotify (Premium) to play your playlists through the gym speakers.</p>
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
            <button className="play" onClick={() => void togglePlay()} aria-label={now?.paused === false ? 'Pause' : 'Play'}>{now?.paused === false ? '⏸' : '▶'}</button>
          </div>
          {error && <p className="error">{error}</p>}
          {busy && <p className="muted">Connecting the speakers…</p>}
          <ul className="playlists">
            {playlists.map((p) => (
              <li key={p.id}>
                <button onClick={() => playPlaylist(p.uri).catch((e: Error) => setError(e.message))}>
                  {p.image ? <img src={p.image} alt="" width={32} height={32} /> : <span className="ph" />} {p.name}
                </button>
              </li>
            ))}
          </ul>
          <button className="link" onClick={() => { disconnectPlayer(); logout(); setLoggedIn(false); setPlaylists([]); setNow(null); }}>Disconnect Spotify</button>
        </>
      )}
    </section>
  );
}
