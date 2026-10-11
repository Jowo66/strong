// Spotify Web Playback SDK: turns the browser tab into a Spotify device called "Mini Gym Speakers".
// Requires Spotify Premium.
import { getAccessToken } from './auth';

/* Minimal typings for the SDK (https://developer.spotify.com/documentation/web-playback-sdk/reference) */
interface SpotifyPlayerState { paused: boolean; shuffle: boolean; track_window: { current_track: { name: string; artists: { name: string }[]; album: { images: { url: string }[] } } } }
interface SpotifyPlayer {
  connect(): Promise<boolean>; disconnect(): void;
  addListener(event: string, cb: (arg: any) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  togglePlay(): Promise<void>; pause(): Promise<void>; resume(): Promise<void>;
  activateElement(): Promise<void>; setVolume(v: number): Promise<void>;
  nextTrack(): Promise<void>; previousTrack(): Promise<void>;
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (opts: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume?: number }) => SpotifyPlayer };
  }
}

export interface NowPlaying { track: string; artist: string; art?: string; paused: boolean; shuffle: boolean }
export interface Playlist { id: string; name: string; uri: string; image?: string }

let player: SpotifyPlayer | null = null;
let deviceId: string | null = null;
const listeners = new Set<(np: NowPlaying | null) => void>();

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.onerror = () => reject(new Error('Could not load the Spotify SDK'));
    document.head.appendChild(s);
  });
}

export async function connectPlayer(): Promise<void> {
  if (player && deviceId) return;
  await loadSdk();
  player = new window.Spotify!.Player({
    name: 'Mini Gym Speakers',
    volume: 0.6,
    getOAuthToken: (cb) => { void getAccessToken().then((t) => t && cb(t)); },
  });
  const ready = new Promise<void>((resolve, reject) => {
    player!.addListener('ready', ({ device_id }: { device_id: string }) => { deviceId = device_id; resolve(); });
    player!.addListener('initialization_error', ({ message }: { message: string }) => reject(new Error(message)));
    player!.addListener('authentication_error', ({ message }: { message: string }) => reject(new Error(message)));
    player!.addListener('account_error', () => reject(new Error('Spotify Premium is required for in-browser playback.')));
  });
  player.addListener('player_state_changed', (state: SpotifyPlayerState | null) => {
    const t = state?.track_window.current_track;
    const np = state && t ? { track: t.name, artist: t.artists.map((a) => a.name).join(', '), art: t.album.images[0]?.url, paused: state.paused, shuffle: state.shuffle } : null;
    listeners.forEach((fn) => fn(np));
  });
  await player.connect();
  await ready;
}

export function onNowPlaying(fn: (np: NowPlaying | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in to Spotify');
  return fetch(`https://api.spotify.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
}

export async function getPlaylists(): Promise<Playlist[]> {
  const res = await api('/me/playlists?limit=50');
  if (!res.ok) throw new Error(`Could not load playlists (${res.status})`);
  const json = await res.json();
  return (json.items ?? []).filter(Boolean).map((p: { id: string; name: string; uri: string; images?: { url: string }[] }) => ({ id: p.id, name: p.name, uri: p.uri, image: p.images?.[0]?.url }));
}

export async function playPlaylist(uri: string): Promise<void> {
  await connectPlayer();
  await player!.activateElement(); // must run inside a click handler for autoplay rules
  const res = await api(`/me/player/play?device_id=${encodeURIComponent(deviceId!)}`, { method: 'PUT', body: JSON.stringify({ context_uri: uri }) });
  if (!res.ok && res.status !== 204) throw new Error(`Playback failed (${res.status})`);
}

export async function togglePlay(): Promise<void> { await player?.togglePlay(); }
export async function setVolume(v: number): Promise<void> { await player?.setVolume(v); }
export async function nextTrack(): Promise<void> { await player?.nextTrack(); }
export async function previousTrack(): Promise<void> { await player?.previousTrack(); }
export async function setShuffle(on: boolean): Promise<void> {
  if (!deviceId) return;
  const res = await api(`/me/player/shuffle?state=${on}&device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' });
  if (!res.ok && res.status !== 204) throw new Error(`Shuffle failed (${res.status})`);
}

export function disconnectPlayer(): void {
  player?.disconnect();
  player = null; deviceId = null;
  listeners.forEach((fn) => fn(null));
}
