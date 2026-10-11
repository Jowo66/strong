# Mini Gym

A living miniature gym. Tiny members arrive, change, train, show off at the mirror, lose their water bottles, get stronger, and slowly become legends.

**Play:** https://jowo66.github.io/strong/

## What's in it

- **A gym that runs itself.** Members with names from 12 countries arrive, change behind their locker doors, walk around the equipment to their stations, queue when it's busy, and train real routines with the right moves (lying bench press, squats, deadlifts, rowing, planks…). Then they go home and come back another day, a little stronger.
- **Stories.** Flex-Offs at the mirror, overenthusiastic spotters, lost water bottles, curls in the squat rack, phone calls on the machine somebody's waiting for, the twenty-minute warm-up, the heavy drop that makes everyone jump, rivals side-eyeing each other, and a construction crew that builds extra benches (sometimes backwards).
- **Gym Legends.** Moments become titles (Bench King of 2027, Mirror Champion, The Guy Who Never Reracks…). There's a Hall of Fame wall with real portraits, profile cards for everyone, an awards ceremony with a podium and confetti every new year, and a year-in-review card.
- **You.** Make your character, then train on autopilot or pick every exercise (click any station to go there). Follow yourself with the camera, track your lifts on a chart, and hit the Aura button.
- **Music.** Click a wall speaker for Gym Radio (built in, no account needed) or your Spotify playlists. Sound effects and gym ambience are all made in the browser.

**Controls:** drag to orbit, scroll or pinch to zoom, hover (or tap) a member to see what they're up to, and click them for their profile. Keyboard: Tab through members, Enter for a profile, Space pause, 1/2/4 speed, A aura, F follow yourself, Y/H/M/S panels, Esc close.

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

Add `?debug` to the URL to get the engine in the browser console as `__gym` (for example `__gym.catchUp(30)` to fast-forward a month). Add `?lineup` to see a close-up line-up of characters in every pose.

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
5. In the gym, click a wall speaker (or the speaker button), connect, and pick a playlist. Closing the window keeps the music playing.

No Premium? Gym Radio in the same window plays three original stations with no account.

In-browser playback works on desktop browsers only (a Spotify SDK limitation).

## Where things live

```
src/data/     content JSON (names, exercises, dialogue, titles, layout, tuning)
src/sim/      the simulation; pure TypeScript, tested headless
src/scene/    3D diorama (React Three Fiber); character/ holds the code-built characters and poses
src/ui/       panels and overlays
src/store/    saved state (IndexedDB) and settings (localStorage)
src/spotify/  Spotify login and player
src/audio/    synthesised sound effects, ambience and Gym Radio
```

Your gym is saved in your browser. Use **Settings → Backup → Export gym** to keep a copy. If a save ever gets damaged, Mini Gym offers to download it, repair it, or start fresh; it never deletes it on its own.
