# Mini Gym — Milestone Roadmap

Each milestone ends with something playable at https://jowo66.github.io/strong/. A milestone is done when its acceptance checks pass and it is deployed.

| # | Milestone | Status |
|---|---|---|
| M0 | Scaffold and deploy | ✅ Done |
| M1 | Living gym core | ✅ Done (placeholder art) |
| M2 | Diorama look | ✅ Done (code-built art; glTF swap optional) |
| M3 | Movement and behaviour polish | ✅ Done |
| M4 | Social and humour depth | ✅ Done |
| M5 | Gym Legends: full presentation | ✅ Done |
| M6 | The player | ✅ Done |
| M7 | Music and sound | ✅ Done |
| M8 | Accessibility, performance, launch | ✅ Done (v1.0.0) |

---

## M0 — Scaffold and deploy ✅

- Vite + React + TypeScript + React Three Fiber + Zustand project, `base: '/strong/'`
- GitHub Actions: test → build → deploy to Pages
- Docs: spec, technical design, art list, roadmap

**Acceptance:** pushing to `main` deploys to jowo66.github.io/strong; `npm test` is green.

## M1 — Living gym core ✅

- Content data: 12 countries of Neo-Jowo names (50/50/50 each), 32 exercises, 5 goals, 9 traits, 16 titles, dialogue, layout
- Simulation engine: calendar, arrival schedule with morning and evening rush, locker flow, 6–8 exercise routines, station reservation and waiting, progression and PRs
- Social events: conversations, failed flirtations, Flex-Offs, spotting, PR reactions, lost bottles, no-reracks, photo-ops
- Construction crew with gags; temporary stations removed when idle
- Gym Legends: Moments, stats, annual / milestone / reputation titles, featured title, archive
- Save in IndexedDB, offline catch-up (up to 30 days), export/import, soft/hard reshuffle
- Placeholder 3D diorama with tilt-shift, hover info terminal, Gym News feed, Hall of Fame panel, settings, aura

**Acceptance:** 12 automated tests pass (names, routines, progression calibration, titles, two simulated days, construction, catch-up across new year, reshuffle).

## M2 — Diorama look ✅

**Goal:** it looks like a miniature you want to keep watching.

**Shipped as code-built art** (no downloaded models yet; see [ART_AND_ASSETS.md](ART_AND_ASSETS.md) §0):
- Characters: a procedural toy figure rigidly skinned to a 15-bone rig, one skinned mesh per outfit (gym / street). Look derived per member: outfit cut (tee, tank, sports top, long sleeve, shorts, leggings, joggers), build and muscle, belly, 9 hair styles, facial hair, glasses, headphones (Headphones-In), lifting belt, wristbands. Crew: hard hat, hi-vis vest, tool belt. Faces blink, talk, grin and frown.
- A pose for every `anim` and every exercise (lying bench press, squats, deadlifts, curls, pull-ups, treadmill, bike, rower, planks…), with barbells loaded to the member's real working weight and dumbbells in hand.
- Equipment E1–E12 and room props P1–P12, each merged into one vertex-coloured mesh. Lockers open while members change, treadmill belts move, bike flywheels spin, bars carry the resting member's plates (and a Rerack Avoider's leftovers), the wall clock shows gym time.
- Lighting: warm key light with soft shadows, cool fill, N8AO ambient occlusion, tuned tilt-shift; a Detail setting (Low = no AO, smaller shadows, 1× pixel ratio).
- Self-hosted Nunito font and an SVG icon set.

**Measured** (headless Chrome, 1920×1080, 40 members + 12 crew): 355 draw calls; ~231k scene triangles (~3.5k per member); sim 0.05 ms per step. Frame rate on a real mid-range laptop still needs a manual check.

- Character base meshes, hair, outfits and crew from [ART_AND_ASSETS.md](ART_AND_ASSETS.md) §2–3, using `useGLTF` + `useAnimations`
- Equipment models (E1–E13) and room props (P1–P12)
- Lighting pass: warm key light, soft shadows, ambient occlusion (`N8AO`), tuned tilt-shift
- Lockers open and close, treadmill belts move, plates show on bars when loaded
- Self-hosted rounded font and icon set

**Acceptance:** 40 members at 60 fps on a mid-range laptop (Chrome, 1080p); under 600 draw calls; screenshot reads as a miniature at a glance.

## M3 — Movement and behaviour polish ✅

Shipped: nav grid + A* + string-pulling + separation steering (`sim/nav.ts`); approach points so members walk to the front of a station, then sit, lie down or grab the bar; queueing in front of busy stations; between-exercise breaks (water cooler, mirror check, chalk, phone); members face their locker while the door screens them. Benches and cable stations now face outward and build slots sit on open floor. Both acceptance checks are automated tests (three seeds, 40 members).


- Nav grid + A* + separation steering (replace `route()`); members no longer walk through equipment
- Station approach: walk to the side of the bench, sit or lie down, grab the bar
- Queueing: a waiting member stands near the station they want and claims it when it frees up
- Idle behaviours between exercises: water cooler, phone scrolling, mirror check, chalk up
- Locker room privacy: changing happens behind locker doors

**Acceptance:** over a full simulated day, no member passes through a station footprint; no member waits more than 30 s without either a crew build or a skip.

## M4 — Social and humour depth ✅

Shipped: 40 conversations (some use names, the speaker's exercise, their rival or the listener's title, and names only once people know each other), 15 flirts, bigger pools everywhere, and least-recently-used line picking so jokes don't repeat until a pool has cycled. Conversations prefer familiar members; regulars greet each other by name. Rivals train next to each other, side-eye each other and never clap for each other's PRs. New events: "Can I work in?", curls in the squat rack, the machine-hogger phone call, the heavy drop that makes the room jump, the 135 lb warm-up that takes twenty minutes. Crew gags: the plank carried sideways that has to pivot, the over-long celebration, and backwards builds with several scripts. Acceptance is an automated test on an established gym (three seeds; eight more checked by hand: 12–16 distinct beats, no line more than twice).


- Dialogue ×3 (about 40 conversations, 15 flirts, more crew lines); lines can use names and context (current exercise, rival's name, title)
- Conversations prefer familiar members; regulars greet each other by name
- Rival storylines: rivals glance at each other, choose neighbouring stations, and react to each other's PRs
- New events: "Can I work in?", the person who curls in the squat rack, machine-hogger phone call, heavy drop with a startled room, warm-up set of 135 lb that takes 20 minutes
- Crew gags: carrying a plank through a doorway sideways, celebrating a little too long

**Acceptance:** in a 10-minute watch at 1×, at least 8 distinct humour beats appear and none repeats more than twice.

## M5 — Gym Legends: full presentation ✅

Shipped: a staged awards ceremony (winners turn up early; the crew builds the podium, sometimes backwards; winners walk up and stand on their blocks with gold banners; a crowd gathers and claps; confetti; a speech; the crew packs up), real portraits on the Hall of Fame wall and in the panels (render-to-texture), member profile cards (click anyone), title banners for 5 s after winning, legend recognition (nods, double takes, copying the Mirror Champion), and a year-in-review card that opens on awards day and stays in the Hall of Fame. The acceptance check is an automated test.


Systems shipped in M1; this milestone makes them *felt*.

- Awards ceremony choreography: crew builds the podium (sometimes backwards), present winners walk up and pose, the crowd claps, confetti, and a speech line
- Hall of Fame wall shows real member portraits (render-to-texture head shots)
- Member profile card: click a member to see their stats, titles, rivals and Moments timeline
- Title banner above a member's head for 5 s after winning
- Legend recognition: members with titles get double-takes, nods and occasional imitation (someone copies the Mirror Champion's pose)
- Year-in-review card on 1 January in-game: biggest PR, most Flex-Offs, funniest Moment

**Acceptance:** a test gym run for a simulated year shows a ceremony with at least 3 winners; profile cards show at least 3 Moments for regulars.

## M6 — The player ✅

Shipped: a character creator with a live 3D preview (name with a random-name button per country, country, King/Queen title style, goal, level for a new player, skin, hair, facial hair, glasses, top, bottoms, colours, shoes, hoodie, height, build), opening on first visit. Autopilot or "I pick every exercise" (the player waits for your pick), an up-next list, add/remove exercises, click any station to train there next, Head home, and a follow-cam. A progress panel with a lifts-over-time chart (validated palette, legend, end labels, crosshair tooltip, table view), streak, PRs and titles. Auras now move differently per colour (flames, spirals, orbits, leaves, shockwaves, glow, bubbles, sparkles), and a PR has a 25% chance of a golden aura with a `goldenPr` Moment. The acceptance check is an automated test.


- Character creator (name, look, goal), replacing the random player
- Player control options: choose the next exercise; click a station to go there; follow-cam toggle
- Player progress panel (lifts over time, titles, streak)
- Aura polish: power-up animation, particles reacting to colour, rare "gold aura on PR" moment

**Acceptance:** a new player can create a character, train a full routine by choice, and see their progress chart after three in-game days.

## M7 — Music and sound ✅

Shipped: all audio is synthesised in the browser (`src/audio/sound.ts`), so there are no sound files or licences to track. **Gym Radio** has three original looping stations (Lo-fi Lifts 86 bpm, Pump FM 124, Cardio Bounce 140) through the wall speakers, for anyone without Spotify. Spotify gains previous/next, shuffle and volume. The speaker cones pulse on the beat (Spotify assumes 120 bpm, since its tempo data isn't available); idle members nod along, and the odd member says "This song 🔥". Sound effects come from sim events: plate clanks, dumbbell set-downs, card-reader beeps, lockers, grunts, claps, crew hammering, fanfares for titles and ceremonies, the aura whoosh, a record scratch for failed flirts, the heavy-drop boom and chalk. They're panned and attenuated around the camera, with a limiter on the output. Settings has master volume, mute, effects on/off and volume, and gym ambience (murmur and distant clanks that grow with the crowd; off by default). **Checked in headless Chrome:** start a station, close the window, and the radio keeps playing with the speakers pulsing; switching effects off mutes only the effects bus. Spotify sign-in itself needs a real Premium account to check.


Spotify playback via the wall speakers is already implemented (PKCE + Web Playback SDK, playlists, play/pause; the music continues when the window closes).

- Volume slider, next/previous, shuffle
- Speakers pulse in time while playing; NPCs nod along; occasional "this song 🔥" bubble
- Ambient gym soundscape and SFX from the asset list, with a master volume and mute in Settings

**Acceptance:** sign in, pick a playlist, close the window: music continues and the speakers animate. SFX can be muted independently.

## M8 — Accessibility, performance, launch ✅

Shipped: keyboard navigation of the 3D scene (Tab through members, Enter for their profile, single-key shortcuts), a screen-reader "Right now in the gym" summary, a phone layout (icon-only top bar, bottom-sheet panels, rotated portrait camera, tap to inspect, Low detail by default), adaptive pixel ratio, lazily loaded post-processing, catch-up after a hidden tab, save migration and repair, a recovery screen for damaged saves, a social card, a credits page and the version in Settings. **Measured:** Lighthouse (mobile emulation) Accessibility 100, Best Practices 100, SEO 100; initial JS 366 KB gzip; the 30-minute run at 4× is reported in the launch notes below. A real phone still needs a hands-on try.


- Full keyboard navigation of the 3D scene (Tab cycles through members, Enter opens the profile)
- Screen-reader summary of the gym ("12 members inside; Juno Hart is doing Bench Press, set 2 of 4")
- Mobile layout pass, touch hover alternative (tap to inspect), lower-detail mode
- Performance: instancing, merged statics, adaptive DPR, pause the sim when the tab is hidden (catch-up handles it)
- Save migration tooling and a corrupted-save recovery screen
- Social card, credits page, version number in Settings

**Acceptance:** Lighthouse accessibility ≥ 90; playable on a recent phone; no console errors over 30 minutes at 4×.

---

## Suggested order of work

M2 → M3 → M5 → M4 → M6 → M7 → M8. Looks first, because it decides whether the gym is fun to watch. Then believable movement, then making Legends visible (the feature that keeps people coming back), then more jokes.
