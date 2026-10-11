# Mini Gym — Technical Design

**Live site:** https://jowo66.github.io/strong/ · **Repo:** `jowo66/strong` · **Status:** M0–M1 implemented (see [ROADMAP.md](ROADMAP.md))

This document explains *how* Mini Gym works. For *what* it does, see [SPEC.md](SPEC.md). Every number quoted here comes from a JSON file in `src/data/`, so tuning never needs a code change.

---

## 1. Goals and non-goals

**Goals**
- A gym that runs by itself: members arrive, change, train, socialise, improve, go home, and come back another day.
- Stories that persist. Every notable event is recorded, and the history turns into titles.
- Runs entirely in the browser on GitHub Pages. There is no server, and saves live in the player's browser.
- Smooth with 40 members on screen on a mid-range laptop.
- Content is data: names, exercises, dialogue, titles and the layout are JSON.

**Non-goals (for now)**
- Multiplayer or shared gyms (would need a backend).
- Realistic biomechanics. Animation is stylised and procedural until the art pass.
- Mobile Spotify playback. The Spotify Web Playback SDK only supports desktop browsers.

---

## 2. Architecture

```
            ┌────────────────────────── src/data/*.json ──────────────────────────┐
            │ names/  exercises  goals  traits  titles  dialogue  layout  events  │
            └───────────────────────────────┬─────────────────────────────────────┘
                                            │ content.ts (typed loader)
                                            ▼
┌──────────────────────────── src/sim  (pure TypeScript, no DOM) ────────────────────────────┐
│ SimEngine  ── fixed 0.1 s step ──►  agents · stations · crew jobs · interactions · schedule │
│   ├─ npc.ts / names.ts      member creation (Neo-Jowo names)                               │
│   ├─ routine.ts             6–8 exercise workouts                                          │
│   ├─ progression.ts         strength curve + PRs                                           │
│   ├─ chronicle.ts           Moments → stats → feed                                         │
│   └─ legends.ts             titles (annual / milestone / reputation)                       │
└───────────────┬───────────────────────────────────────────────┬────────────────────────────┘
                │ engine.snapshot() every 15 s                  │ read every frame (no React state)
                ▼                                               ▼
┌──── src/store ─────────────────────┐        ┌──── src/scene (React Three Fiber) ────┐
│ save.ts     zustand persist → IDB  │        │ GymScene · Room · Stations · Avatar   │
│ settings.ts zustand persist → LS   │        └───────────────────────────────────────┘
│ ui.ts       panels, hover, banner  │        ┌──── src/ui (React DOM overlay) ───────┐
└────────────────────────────────────┘        │ TopBar · Tooltip · Feed · HallOfFame  │
                                              │ SettingsPanel · MusicWindow (Spotify) │
                                              └───────────────────────────────────────┘
```

Key decisions:

| Decision | Why |
|---|---|
| The simulation is a plain class with no React or Three.js imports | Headless tests, deterministic seeds, and catch-up of whole days without rendering. |
| The renderer reads `engine` directly inside `useFrame` | 40 agents × 60 fps of React state updates would be far too slow. React only re-renders when `engine.version` changes (someone arrives or leaves, or a station is built or removed). |
| Fixed time step (0.1 s) | Stable timers and identical behaviour at any frame rate and any speed multiplier. |
| Content in JSON | Balancing, writing jokes and adding countries need no code changes. |
| IndexedDB for the save, localStorage for settings | The save grows (members × Moments); IndexedDB has no ~5 MB limit, and settings must load synchronously. |

---

## 3. Repository layout

```
strong/
├─ .github/workflows/deploy.yml   test → build → GitHub Pages
├─ docs/                          SPEC, TECHNICAL_DESIGN, ART_AND_ASSETS, ROADMAP
├─ public/                        static assets served under /strong/ (models/, audio/ later)
├─ src/
│  ├─ data/                       all content (see src/data/README.md)
│  │  └─ names/                   one file per country: 50 male, 50 female, 50 last names
│  ├─ sim/                        simulation (types, engine, legends, …) + sim.test.ts
│  ├─ scene/                      3D: GymScene, Room, Stations, Avatar, labels
│  ├─ ui/                         2D overlay panels
│  ├─ store/                      zustand stores
│  ├─ spotify/                    PKCE auth + Web Playback SDK wrapper
│  ├─ App.tsx  main.tsx  styles.css  engineContext.ts
├─ index.html  vite.config.ts  tsconfig.json  package.json
```

---

## 4. Time model

**Sim step.** `SimEngine.update(dt)` accumulates real time (×speed) and runs `step(0.1)` as many times as needed. Each frame's `dt` is clamped to 0.25 s before the speed multiplier, so a stalled tab doesn't produce a huge jump.

**Gym day.** One gym day covers opening hours 06:00–22:00 and lasts `dayLengthMinutes` of real time (default 10 minutes, so 1 real second ≈ 1.6 gym minutes). The calendar ignores the night, so no screen time is spent on an empty gym.

| Gym-day fraction | Event |
|---|---|
| 0.00 | New day: attendance rolled, arrival schedule built |
| 0.02 | The player member arrives |
| ~0.18 / ~0.68 | Morning and evening rush (normal distributions in `population.json`) |
| 0.92 | Closing: no more arrivals; everyone finishes their current exercise and goes home |
| 1.00 | Day rolls over (members still inside finish their visit) |

**Calendar.** Day 0 is the real-world date the gym was created (`save.createdAt`). Dates are computed in UTC to avoid daylight-saving bugs, and `yearForDay()` drives annual titles.

**Speed.** ⏸ / 1× / 2× / 4×. This is only a multiplier on `dt`, so behaviour is identical at every speed.

**Offline catch-up.** On load, `daysAway = floor((now − lastSavedAt + dayTime) / dayLength)` and the engine resolves up to 30 missed days abstractly. For each day it rolls attendance, registers visits and streaks, runs a generated routine through `progressSession` (so PRs happen), rolls trait events (lost bottles, no-reracks), and handles new-year awards. Feed lines are suppressed during catch-up and replaced by one summary line: *"While you were away: 3 days, 74 visits, 21 PRs, 2 new titles."*

---

## 5. World, layout and movement

The gym is a 30 × 20 unit floor (x −15…15, z −10…10). The back wall (z −10) and left wall (x −15) are solid; the front and right are open towards the camera, like a diorama box.

`layout.json` defines:
- **zones**: rectangles with a label and colour (reception, social, lockers, free weights, squat, cardio, bench, cable, stretching).
- **stations**: type, zone, position and rotation. Labels such as "Bench #3" are generated per type.
- **tempSlots**: free spots, per station type, where the construction crew may build.
- **lockerSpots, mirrorSpots, speakers, hallOfFame, podium, waterCooler, wanderPoints**.
- **lockerDoor**: inside and outside waypoints. The locker room is walled except for the door.

**Footprints.** `layout.json → footprints` gives each station type's local bounding box. `sim/footprint.ts` turns it into a world rectangle; a test checks that no two stations or temporary build slots overlap and that none sits off the floor or inside the locker room.

**Movement (M3).** `sim/nav.ts` cuts the floor into 0.25-unit cells. Walls, partitions (`layout.partitions`), props (`layout.obstacles`) and every station footprint, grown by a member's radius (0.17), are blocked; the grid is rebuilt whenever a temporary station appears or goes. `engine.plan(from, to, via?)` builds a route:
1. A member standing on a station first steps off to its **approach point** (just in front of the footprint, in station-local +Z).
2. A* (8-way, no corner cutting, octile heuristic) to the goal, then string-pulling with line-of-sight checks so paths are straight lines between corners.
3. With `via`, the path ends at the target station's approach point and then steps onto the station (to sit, lie down or grab the bar).

Walking members are nudged apart by simple separation steering, but never onto a blocked cell. When stations change, anyone whose remaining path is now blocked is re-routed. Crew members use the same planner.

**Queueing.** If every station of the type is taken, a member queues in front of the nearest one (up to three abreast, then a row behind), faces it, and claims it (or any other) the moment it frees up. After 3 s they ask the crew; after 30 s they skip the exercise.

**Breaks.** After an exercise there's a 30% chance of a short break (`events.json → breaks`): water at the cooler (members there can strike up a conversation), a mirror check, chalk at a platform's chalk bowl before a heavy lift, or a phone scroll on the spot.

**Locker privacy.** Members face their locker while changing; its door swings out on the camera side and screens them.

**Acceptance (tested).** Over a full busy day (40 inside, three seeds) no member's centre enters a station footprint that isn't theirs (own, just left, walking onto, or spotting at) or a wall, partition or prop, and nobody waits more than 30 s unless the crew is building for them. Every station, build slot, locker, mirror spot, chalk spot and the cooler is reachable from the entrance.

---

## 6. Members

### 6.1 Data model (persisted)

`Npc` in `src/sim/types.ts`. Highlights:

| Field | Meaning |
|---|---|
| `firstName`, `lastName`, `country`, `familyNameFirst`, `gender` | Neo-Jowo name |
| `goal`, `experience`, `attendance` (0–1 chance to visit on a given day) | Who they are as a lifter |
| `favouriteExercise`, `traits[]` | Personality |
| `start`, `weights`, `best` | Starting and current working weight per exercise; best rounded bench/squat/deadlift |
| `sessions` | Count of sessions per exercise |
| `familiarity[otherId]` | `{ score, rivalry, rival }` |
| `stats` | Counters that drive titles (visits, prs, flexOffWins, spots, noReracks, …) |
| `yearly[year]` | Visits, best lifts and starting total for that year (annual titles) |
| `moments[]` | Up to 50 notable events, ranked by notability |
| `appearance` | Skin, hair, outfit colours, height and build |

### 6.2 Neo-Jowo naming

- `src/data/names/<cc>.json` holds `{ code, country, familyNameFirst, male[50], female[50], last[50] }`. Twelve starter countries ship (NG, GH, JP, KR, CN, IN, PH, BR, MX, IT, DE, CA). A test enforces exactly 50 unique entries per list.
- `generateName()` picks a country, a gender, a matching first name and a last name from the same pool. If the full name is already in the gym it re-rolls (up to 40 tries); with 12 × 5,000 combinations a clash is rare.
- With `mixNationalities` on, 15% of new members take their surname from another country.
- `familyNameFirst` affects display only, and only when the player enables "native order".

### 6.3 Generation

`createNpc()`:
- experience ~ 45% beginner / 40% intermediate / 15% advanced;
- goal weighted by `goals.json`;
- attendance uniform 0.20–0.85;
- 0–2 traits (30% / 50% / 20%) weighted by `traits.json`;
- favourite exercise weighted by goal affinity²;
- starting weights = exercise base for that experience × gender factor (women: upper 0.55, lower 0.70) × jitter 0.8–1.15, rounded to 5 lb.

The **player** is a normal member (`id: "player"`, `isPlayer: true`, attendance 1). They arrive first, and after finishing a routine they roll a new one, staying until closing so the Aura button usually has someone to power up.

### 6.4 Traits

Traits multiply event chances (`modifiers`) and rest length (`restMultiplier`):

| Trait | Effect |
|---|---|
| Show-Off | Flex-Off ×3, Photo-Op ×4 |
| Social Butterfly | Conversation ×2.5, Flirt ×1.5 |
| Forgetful | Lost bottle ×6 |
| Rerack Avoider | Leaves plates on ×10 |
| Rest-Timer Enthusiast | Rest ×1.7, Conversation ×1.5 |
| Helpful | Volunteers to spot ×3 |
| Hopeless Romantic | Flirt ×4 |
| Headphones-In | Conversation ×0.25, Flirt ×0.2, Spot ×0.5, Rest ×0.85 |
| Grunter | Grunts on 50% of sets |

---

## 7. The visit: agent state machine

```
 (entrance) ─walk─► checkIn ─walk─► changing ─► choosing ◄────────────────────┐
                                                   │                          │
                          free station? ──yes──► walk ─► lifting ⇄ resting     │
                                │no                     │  (sets)   │        │
                                ▼                       │           ├─ searching (lost bottle)
                             waiting ─(3 s)─► request construction  └─ interacting (talk / flex-off)
                                │(30 s) skip exercise   │last set
                                └───────────────────────┴─► finishExercise ──┘
 choosing with routine done ─walk─► changingOut ─walk─► gone (removed)
```

| State | Ends when |
|---|---|
| `walking` | Path finished → enters `after` (with `afterTimer` if given) |
| `checkIn` | 1.2 s; 35% chance of a greeting bubble |
| `changing` / `changingOut` | 2.5 s; outfit switches street ↔ gym |
| `choosing` | Immediately: reserves the nearest free station of the right type and walks there, or walks to the zone edge to wait |
| `waiting` | Queued in front of a busy station. A matching station frees up (or one is built for them); after 3 s asks the crew; after 30 s skips the exercise |
| `break` | Between exercises: water, mirror, chalk or phone for 2–4.5 s, then `choosing` |
| `lifting` | `liftSeconds` (4–7 s; cardio 18–32 s, one set) |
| `resting` | `restSeconds` from the goal (e.g. strength 11–18 s) × trait multiplier |
| `searching` | Walked two wander points and back: "…it was here the whole time." |
| `interacting` | The interaction ends and calls `resume()` |

**Station reservation.** A station has `occupant` (someone using it), `reservedBy` (someone walking to it) and `building`. Members keep their station while resting, and even during a Flex-Off, which is realistic.

**Workout generation** (`routine.ts`): 6–8 exercises; favourite included 80% of the time; the rest weighted by goal affinity² from `exercises.json` (affinity 0 = never picked for that goal); order shuffled; sets, rest and lift time randomised per exercise. No two visits are identical.

---

## 8. Progression

After the last set of an exercise:

```
w_next = w + (cap − w) × baseK × goalMultiplier × jitter(0.6–1.4)
cap    = start × ceiling[experience]      (beginner 2.0, intermediate 1.45, advanced 1.15)
```

`baseK = 0.0146` is calibrated to the spec: a beginner benching 135 reaches about 190 after 38 sessions (≈6 months) and about 225 after 75 (≈12 months). A unit test checks this. The goal multiplier is 1.2 for strength, 1.0 hypertrophy, 0.9 athletic, 0.7 general fitness and 0.5 weight loss.

Working weights are stored as floats and displayed rounded to 5 lb. A **PR** happens when the rounded weight of a tracked lift (bench, squat or deadlift) beats `best`. The PR is recorded, the lifter celebrates, and members within 7 units react: 40% clap, 25% *"definitely not watching"*.

---

## 9. Social interaction system

Every simulated second, each **available** member (resting, more than 2.5 s of rest left, not already busy) rolls for events. The chances are in `events.json` and are multiplied by trait modifiers.

| Event | Base chance | Partner | Choreography | Outcome → Moment |
|---|---|---|---|---|
| Conversation | 1.2%/s | available within 4 u | face each other, alternate lines every 1.8 s | familiarity +1 |
| Failed flirtation | 0.25%/s | available within 5 u | opener → "I'm on my rest timer." → *walks away dramatically* | `flirtFail` |
| Flex-Off | 0.4%/s (rivals ×4) | available within 7 u | both walk to adjacent mirror spots, pose 5 s | winner 45% (`flexOffWin` / `flexOffLoss`) · mutual 25% · both think they won 20% · nearby member laughs 10% (`flexOffDraw`) |
| Spot | 10% per heavy set start (bench, incline, squat) | available within 6 u, weighted by Helpful | spotter walks behind the bench and watches until the set ends | success 65% (`spot`, 👊) · overenthusiastic 35% (`overSpot`, "ALL YOU!" … "you had the whole bar") |
| Photo-Op | 4% on first set of eligible lifts | — | 📸 bubble | `photoOp` (detail: "loaded 215 lb") |
| Lost bottle | 1.2% per rest | — | `searching` walk loop | `lostBottle` |
| No rerack | 2% per weighted exercise | — | plates stay visibly loaded for 20 s | `noRerack` |

**Interaction framework.** An `Interaction` has `participants`, `stage`, `timer` and `lines`. Starting one calls `pause(agent)` (saving the state and remaining timer); ending it calls `resume(agent)`, which walks the member back to their station if needed and restores the exact rest timer. Adding a new interaction type means one start function and one case in `updateInteraction()`.

**Familiarity and rivalry.** Each conversation adds 1 to familiarity (a flirt adds 0.5). Each Flex-Off adds 1 to `rivalry`, and at 3 the pair become **rivals**, making Flex-Offs between them 4× more likely. This is the hook for future rivalry storylines (M5).

---

## 10. Construction crew

1. A member has been `waiting` for 3 s and every station of the type is occupied or reserved.
2. If the type has fewer than 2 temporary stations and a free `tempSlot` exists, a `building` station is created, reserved for that member, and labelled with the next number ("Bench #7").
3. Three crew members (hard hats, orange vests) walk in from the entrance.
4. They work for 6 s. 50% of builds include a gag: *backwards* (the station spins 180°, "Hmm." … "Other way!") or *drop* ("Oops." / "Nobody saw that.").
5. The crew celebrates for 2 s ("WE DID IT!"). If the **Construction Crew Favourite Customer** is in the gym, one waves at them by name.
6. The requester gets the station, and a `construction` Moment is recorded.
7. A temporary station unused for 45 s triggers a removal job (3 s, "Packing up!").

Temporary stations show a yellow hazard outline and a label tag, so they are recognisable without relying on colour alone.

---

## 11. Gym Legends

### 11.1 Moments

`recordMoment(chronicle, npcId, type, { zone, witnesses, otherId, detail })`:
1. Builds the Moment (id, in-game day and ISO date, zone, witnesses, notability from `moments.json`).
2. Increments the linked stat counter (e.g. `flexOffWin` → `stats.flexOffWins`).
3. Appends it to the member's log; above 50, the least notable (then oldest) Moment is dropped.
4. Writes a feed line from the template ("{name} spotted {other} with far too much enthusiasm.").
5. Re-evaluates milestone and reputation titles.

### 11.2 Titles (`titles.json`)

| Category | Rule | Examples |
|---|---|---|
| **annual** | At the first day of a new in-game year, the top member by `metric` for the previous year wins. Permanent. Optional gender filter. | Bench King/Queen of {year}, Squat Monarch, Most Improved (≥15 visits; % gain in bench+squat+deadlift), Most Consistent Member |
| **milestone** | Anyone whose stat reaches `threshold`. The `{value}` updates live. | Guardian Spotter (25 spots), PR Machine (50 PRs), Iron Regular (100 visits), Streak Survivor (14-day streak) |
| **reputation** | One current holder: the leader, once above `minValue`. Ties keep the incumbent. Overtaken → `current: false` ("Former …"). | Mirror Champion (N Flex-Off Wins), The Guy/Gal Who Never Reracks, Construction Crew Favourite Customer, Lost & Found Legend, Professional Rest-Timer Enthusiast (avg rest, ≥30 rests), Photo-Op Plate Loader, Hype Spotter |

`TitleRecord` stores `holderName` and `holderGender`, so archived titles still display after the member leaves (`holderLeft: true`).

**Featured title** (shown on hover and in the info terminal) = the current title with the highest `rarity`, newest on ties.

**Announcements.** When a title is won, the holder gets a ⭐ bubble, nearby members may react ("Legend.", *nods respectfully*), and a gold feed line appears. A banner shows when the player wins one or a ceremony starts.

### 11.3 Awards ceremony

When the year rolls over and at least one annual title was awarded, `engine.ceremony` runs on the first day of the new year (`events.json → ceremony`):

| Stage | What happens |
|---|---|
| `waiting` | The winners are scheduled to arrive early (4–9% into the day). |
| `building` | At 12% of the day the crew builds the podium in the social space; half the time it goes up facing the wall first ("Hmm." … "Other way!"). The podium blocks the nav grid. |
| `gathering` | Winners who are resting, on a break, waiting or choosing are pulled out (an `Interaction` of type `ceremony` pauses them) and walk onto their block: 1st in the middle, 2nd and 3rd either side, 4th and 5th beside it. Up to 8 other free members form the crowd. Ends when every winner in the gym is up, or after 45 s if at least one is. |
| `posing` | Winners stand on their blocks (`agent.elev`) in the `podium` pose with a gold banner; the crowd claps; the host crew member says a line; confetti (off in Reduced Motion). Each winner gets a `ceremony` Moment. |
| `speech` | The top winner gives a speech; more clapping. |
| `closing` | A feed line, everyone resumes exactly what they were doing, and the crew packs the podium away. |

If the gym is reloaded on awards day before the ceremony finished (`save.pendingCeremonyYear`), it runs again.

**Year in review.** `sim/review.ts` builds a card when the year rolls over and stores it in `save.yearReviews[year]`: totals, biggest PR, most Flex-Off wins, most visits, the funniest Moment (funniest kind, most witnesses) and the year's legends. It opens itself on awards day and is linked from the Hall of Fame.

**Recognition.** Once a second, members resting or on a break within 3.5 units of a title holder may react (5%/s, once a minute per pair): a nod, a double take ("Wait, is that Juno?"), or, for the Mirror Champion, copying the pose.

**Title banner.** Winning a title puts a gold banner over the member's head for 5 s.

### 11.4 Hall of Fame

- **In the world:** a frame wall at reception with up to 8 portraits of current holders, rendered from their actual character (`scene/portraits.ts` renders head shots into render targets and PNGs, a couple per frame). Click it to open the panel.
- **Profile card:** click any member (or a portrait in the panel) for their portrait, live activity, goal, level, visits, streak, traits, lifts, current and former titles, rivals and gym friends, and their Moments timeline.
- **Panel:** grouped Annual / Reputation / Milestones, each with the holder's portrait. Each entry shows a flavour line chosen from the holder's Moments that fed that title's stat, and expands to their top 3 Moments. "From the Archive" lists former holders and members who left.

---

## 12. Reshuffle

| Mode | Members | Titles |
|---|---|---|
| Soft | Keep regulars (attendance ≥ 0.55, plus the player); replace everyone else | Leavers' titles: `holderLeft`, non-annual become former |
| Hard + keep archive | Everyone replaced, including a new player | All kept as archive (`holderLeft`) |
| Hard, no archive | Everyone replaced | Cleared |

Runtime state (agents, crew, temporary stations) is cleared, the roster is refilled to the gym size, and the schedule is rebuilt from the current time of day.

---

## 13. Persistence

**Save shape** (`SaveData`, version 1): `createdAt, day, dayTime, lastSavedAt, seq, members{}, titles[], pendingCeremonyYear?`. Runtime-only state (members inside the gym, stations, crew, interactions) is not saved. On reload the gym is empty and members arrive on a fresh schedule from the current time.

**Where.**
- `useSaveStore` uses zustand `persist` with a `createJSONStorage` adapter over `idb-keyval`, under the key `mini-gym-save`.
- `useSettings` uses localStorage, under `mini-gym-settings`.

**When.** At boot, every 15 s, on `visibilitychange → hidden`, and on `pagehide`.

**Size.** About 6–8 KB per member with a full Moment log, so a 90-member gym is roughly 0.7 MB. IndexedDB handles this easily.

**Versioning.** `SaveData.version` and the zustand persist `version` are both 1. Future schema changes add a `migrate(persisted, fromVersion)` to the persist options, and `isValidSave()` gates imports.

**Export / Import.** Settings → Backup downloads `mini-gym-YYYY-MM-DD.json` (the full snapshot). Import validates the file, replaces the save and reboots the engine.

---

## 14. Rendering

**Scene graph.**
```
<Canvas shadows camera={fov 30, (18,26,33)}>
  lights: hemisphere + 1 directional with 2048² shadow map
  <SimDriver/>                    useFrame → engine.update(min(dt,0.25) × speed)
  <Room/>                         floor zones, walls, lockers, desk, mirror, speakers, Hall of Fame, props
  <Equipment/>                    StationMesh per station (re-renders on engine.version)
  <Members/>                      Avatar per agent       (re-renders on engine.version)
  <Crew/>                         Avatar (hard hat) per crew member
  <Podium/>                       during ceremonies
  <OrbitControls/>                pan off, limited tilt, rotation and zoom: "fixed angled camera" with a little freedom
  <EffectComposer><TiltShift2/>   miniature depth-of-field (toggleable)
```

**Per-frame contract.** `Avatar` takes a `source()` function returning `{pos, facing, anim, bubble, outfit, aura, exercise, resting, stationType, weight}`. Each frame it lerps position and rotation, computes the target pose for `anim` (and the exercise while lifting), blends the 15 bones towards it, shows the gym or street mesh, places props (barbell with plates for the member's working weight, dumbbells, phone) between the hands, and writes the bubble text straight into a DOM node (drei `<Html>`). There are no React updates. A glTF character could use the same contract: swap the meshes and map `anim` to clips.

**Animations (procedural, M1):** idle, walk, search, lift, cardio, stretch, flex, clap, celebrate, talk, build, powerUp. Reduced Motion scales amplitudes to 35% and disables the aura spin and pulse.

**Labels.** Floor zone labels and signs use canvas textures (no font downloads). Speech bubbles and temporary-station tags are DOM elements, so they stay sharp and accessible.

**Performance budget.**

| Item | Budget | Current |
|---|---|---|
| Members on screen | 40 | Each avatar ≈ 14 meshes. Fine to 40 on desktop. |
| Draw calls | < 600 | ~250 empty gym + 14/avatar |
| Triangles | < 300k | ~60k |
| Sim cost | < 1 ms/frame | 40 agents ≈ 0.1 ms per step |
| JS bundle | < 400 KB gzip | ~330 KB gzip |

Each member is one `SkinnedMesh` with vertex colours (rigidly skinned primitives merged into one geometry), each station type one merged geometry, and the static room a single mesh, so 40 members + 12 crew measure 355 draw calls and ~231k scene triangles.

---

## 15. UI and accessibility

The UI is all DOM over the canvas and never blocks the scene: panels sit on the right, the feed on the bottom-left, and the tooltip follows the cursor.

| Element | Notes |
|---|---|
| Top bar | Date, clock, members inside, speed, ✨ Aura + colour picker (8 colours), 🏆, 🔊, ⚙️ |
| Info terminal (hover) | Name (+ YOU tag), featured title, goal, current exercise, progress n/m, live activity ("Set 2/4", "Flex-Off!", "Looking for water bottle") |
| Gym News feed | Last 5 events; titles in gold, ceremonies highlighted |
| Panels | Hall of Fame, Settings, Music. One at a time, ✕ to close; music keeps playing |

| Requirement | Implementation |
|---|---|
| Reduced Motion | Defaults to the OS `prefers-reduced-motion`. Smaller animations, no bubble pop, no aura spin. |
| High Contrast | White floor, black borders on all UI, thicker bubble outlines |
| Colourblind-friendly indicators | Zones carry text labels; temporary stations have a shape outline and a label tag; titles use ⭐ and text, never colour alone |
| Scalable UI | 0.85–1.4× slider (`--ui-scale`) |
| Keyboard | All controls are real buttons, selects and inputs with visible focus rings |
| Screen readers | The feed is an `aria-live="polite"` region; panels are labelled regions; banner `role="status"` |

---

## 16. Spotify integration

The flow is **Authorization Code with PKCE**, so no client secret is needed and it is safe on a static site.

1. The user clicks a wall speaker, opens the Music window and chooses **Connect Spotify**.
2. `login()` creates a verifier and challenge plus a random `state`, and redirects to `accounts.spotify.com/authorize` with these scopes: `streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative`.
3. Spotify redirects back to `https://jowo66.github.io/strong/?code=…`. `handleRedirect()` checks `state`, exchanges the code for tokens, strips the query string, and reopens the Music window.
4. Tokens are stored in localStorage and refreshed automatically.
5. `connectPlayer()` loads the Web Playback SDK and registers a device called **"Mini Gym Speakers"**.
6. Playlists come from `GET /me/playlists`. Choosing one calls `PUT /me/player/play?device_id=…` with `context_uri`, after `activateElement()` inside the click (browser autoplay rules).
7. Closing the window does not disconnect the player, so the music continues.

**Setup** (README has the steps):
- Create an app at developer.spotify.com.
- Add the redirect URIs `https://jowo66.github.io/strong/` and `http://127.0.0.1:5173/strong/` (Spotify rejects `localhost`).
- Add your Spotify account under *User Management* (Development Mode only allows listed users).
- Set the `VITE_SPOTIFY_CLIENT_ID` repo variable.

**Limits.** Playback requires Premium (you have it). The Web Playback SDK does not run in mobile browsers; there the window shows an error and the rest of the gym is unaffected. **Future:** speakers pulse to playback state; NPCs nod along when music plays.

---

## 17. Deployment

- `vite.config.ts`: `base: '/strong/'`.
- Asset URLs inside code use `import.meta.env.BASE_URL` (e.g. `` `${import.meta.env.BASE_URL}models/bench.glb` ``).
- No client-side router is needed (single page, panels are state), so refreshes never 404. If routes are added later, use hash routing.
- `.github/workflows/deploy.yml`: on push to `main`, it runs `npm ci` → `npm test` → `npm run build` (with the `VITE_SPOTIFY_CLIENT_ID` repo variable) → `upload-pages-artifact` → `deploy-pages`.
- One-time step: repo **Settings → Pages → Source: GitHub Actions**.

---

## 18. Testing

`npm test` (Vitest, Node, ~1 s):

| Test | Checks |
|---|---|
| content | Every name list is exactly 50 unique entries; every exercise's station type exists in the layout; title stats are real counters |
| names | 500 generated names are unique and come from the right pools |
| routines | 6–8 unique exercises, all valid for the goal |
| progression | Bench 135 → 180–200 at 38 sessions → 220–230 at 75 |
| legends | Milestone award; reputation takeover with "Former …" and "(former)" labels; annual Bench King with gendered name; idempotent annual awards |
| engine | Two full headless days: visits, sessions, cap respected, station occupancy consistent; construction builds "Bench #7" and records the Moment; 20-day catch-up crosses new year and awards 2026 titles; soft and hard reshuffle rules |

**Manual / visual:** add `?debug` to the URL to expose the engine as `window.__gym` (for example `__gym.catchUp(30)`, `__gym.triggerAura()`, or `__gym.say(__gym.agents.values().next().value, "hi", 5)`).

---

## 19. Tuning cheat-sheet

| Want… | Edit |
|---|---|
| Busier / quieter gym | `population.json` sizes (`members`, `cap`), arrival peaks |
| Longer workouts | `goals.json` `sets`, `rest`; `progression.json` `liftSeconds` |
| Faster strength gains | `progression.json` `baseK`, `ceiling` |
| More Flex-Offs, fewer spots | `events.json` |
| More (or fewer) water-cooler breaks | `events.json` `breaks` |
| Move equipment or props | `layout.json` `stations`, `tempSlots`, `obstacles`; `npm test` checks nothing overlaps and everything is reachable |
| Funnier lines | `dialogue.json` (arrays; one is picked at random) |
| New title | Add to `titles.json` (category + stat/metric + threshold/minValue + rarity) |
| New country | Add `src/data/names/<cc>.json` with 50/50/50 names |
| New equipment | `layout.json` stations + `tempSlots`, `exercises.json`, a shape in `scene/Stations.tsx` |

---

## 20. Open questions and risks

| Topic | Note |
|---|---|
| Gender model | Name pools and Bench King/Queen are binary today. Non-binary members would need a name strategy (e.g. pick from both lists) and a neutral annual title. |
| Player agency | The player is currently an autonomous member with an aura. M6 decides how much control to add: choose routine, click to move, or follow cam. |
| Catch-up fairness | Abstract days skip Flex-Offs, spots and construction, so reputation titles for those only move while the tab is open. That may be fine ("you had to be there"), or add light statistical rolls. |
| Long-term save growth | Moments are capped per member, but `titles[]` and archives grow forever. Consider compacting archive entries older than five years. |
| Spotify policy | Spotify's developer terms change occasionally; keep the integration optional and isolated in `src/spotify/`. |
