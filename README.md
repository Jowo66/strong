# Mini Gym 🏋️

A living miniature gym. Tiny members arrive, change, train, show off at the mirror, lose their water bottles, get stronger, and slowly become legends.

**Play:** https://jowo66.github.io/strong/

| Doc | What's in it |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | What the game is |
| [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) | How it works |
| [docs/ART_AND_ASSETS.md](docs/ART_AND_ASSETS.md) | Models, animations, sounds needed for the art pass |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and what's done |
| [src/data/README.md](src/data/README.md) | Editing names, exercises, dialogue and titles |

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev        # http://127.0.0.1:5173/strong/
npm test           # simulation tests (~1 s)
npm run build      # production build in dist/
```

Add `?debug` to the URL to get the engine in the browser console as `__gym` (for example `__gym.catchUp(30)` to fast-forward a month).

## Deploy to GitHub Pages (one-time setup)

1. Create the repo **jowo66/strong** and push this folder to `main`.
2. In the repo, open **Settings → Pages** and set **Source: GitHub Actions**.
3. Every push to `main` now runs the tests, builds, and deploys to https://jowo66.github.io/strong/.

## Spotify setup (optional; you need Premium)

1. Go to https://developer.spotify.com/dashboard → **Create app**. Tick *Web API* and *Web Playback SDK*.
2. Add both redirect URIs exactly, including the trailing slash:
   - `https://jowo66.github.io/strong/`
   - `http://127.0.0.1:5173/strong/` (for local dev; Spotify does not accept `localhost`)
3. Under **User Management**, add the email of your Spotify account (apps in Development Mode only allow listed users).
4. Copy the **Client ID** (there is no secret; the app uses PKCE):
   - Production: repo **Settings → Secrets and variables → Actions → Variables → New variable**, `VITE_SPOTIFY_CLIENT_ID`.
   - Local: copy `.env.example` to `.env.local` and fill it in.
5. In the gym, click a wall speaker (or 🔊), connect, and pick a playlist. Closing the window keeps the music playing.

In-browser playback works on desktop browsers only (a Spotify SDK limitation).

## Where things live

```
src/data/     content JSON (names, exercises, dialogue, titles, layout, tuning)
src/sim/      the simulation; pure TypeScript, tested headless
src/scene/    3D diorama (React Three Fiber)
src/ui/       panels and overlays
src/store/    saved state (IndexedDB) and settings (localStorage)
src/spotify/  Spotify login and player
```

Your gym is saved in your browser. Use **Settings → Backup → Export gym** to keep a copy.
