// Spotify Authorization Code + PKCE. No client secret: safe for a static GitHub Pages site.
// Register the redirect URI exactly (trailing slash included) in the Spotify developer dashboard.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
export const REDIRECT_URI: string =
  (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ?? `${location.origin}${import.meta.env.BASE_URL}`;
const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state',
  'playlist-read-private', 'playlist-read-collaborative',
];
const TOKEN_KEY = 'mini-gym-spotify-token';
const VERIFIER_KEY = 'mini-gym-spotify-verifier';
const STATE_KEY = 'mini-gym-spotify-state';

interface Token { access_token: string; refresh_token?: string; expires_at: number }

export const spotifyConfigured = () => !!CLIENT_ID;

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function login(): Promise<void> {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set');
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, scope: SCOPES.join(' '), redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256', code_challenge: await challengeFor(verifier), state,
  });
  location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

function storeToken(json: { access_token: string; refresh_token?: string; expires_in: number }, previous?: Token): Token {
  const token: Token = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? previous?.refresh_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);
  return res.json();
}

/** Call once on page load. Finishes a login if Spotify just redirected back with ?code=. */
export async function handleRedirect(): Promise<boolean> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return false;
  const state = url.searchParams.get('state');
  url.searchParams.delete('code'); url.searchParams.delete('state'); url.searchParams.delete('error');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (error || !CLIENT_ID || state !== sessionStorage.getItem(STATE_KEY)) return false;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return false;
  storeToken(await tokenRequest({ client_id: CLIENT_ID, grant_type: 'authorization_code', code: code!, redirect_uri: REDIRECT_URI, code_verifier: verifier }));
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return true;
}

export function isLoggedIn(): boolean { return !!localStorage.getItem(TOKEN_KEY); }

export async function getAccessToken(): Promise<string | null> {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw || !CLIENT_ID) return null;
  const token = JSON.parse(raw) as Token;
  if (Date.now() < token.expires_at) return token.access_token;
  if (!token.refresh_token) { logout(); return null; }
  try {
    return storeToken(await tokenRequest({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: token.refresh_token }), token).access_token;
  } catch {
    logout();
    return null;
  }
}

export function logout(): void { localStorage.removeItem(TOKEN_KEY); }
