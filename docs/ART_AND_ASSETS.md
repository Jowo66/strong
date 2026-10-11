# Mini Gym — Art & Asset List

Everything visible in the gym today is a **procedural placeholder**: boxes, capsules and spheres built in code (`src/scene/`). The game is fully playable that way. This list covers what is needed to replace them with real art in milestone M2, without changing the simulation.

**Style target:** a miniature diorama. Soft, warm light; chunky, slightly toy-like proportions; matte materials; strong, readable silhouettes from a high three-quarter camera. Think tilt-shift photo of a tabletop model, not a realistic gym.

---

## 1. Technical specs

| Item | Spec |
|---|---|
| Format | glTF 2.0 binary (`.glb`), Y-up, 1 unit = 1 metre-ish (a member is ~1.7 units tall after the 1.25 scale) |
| Compression | Meshopt or Draco geometry; KTX2 or WebP textures |
| Textures | Shared atlas per category (characters, equipment, props), 1024² max; mostly flat colour + light gradient. Avoid detailed PBR maps. |
| Materials | `MeshStandardMaterial`, roughness 0.7–0.9, metalness 0 (chrome bars ≈ 0.6) |
| Poly budgets | Member 1.5–3k tris · Crew 2k · Large equipment 800–2k · Small props 100–500 · Whole room shell < 15k |
| Rig | One shared humanoid skeleton (≤ 30 bones) for all members and crew, so animations retarget across every body |
| Pivot | Feet at origin, facing +Z |
| Location | `public/models/…`, `public/audio/…`, loaded via `` `${import.meta.env.BASE_URL}models/x.glb` `` |
| Naming | `kebab-case`, e.g. `member-base-f.glb`, `eq-bench.glb`, `prop-water-cooler.glb`, `sfx-plate-drop.ogg` |

---

## 2. Characters

| ID | Asset | Notes | Priority |
|---|---|---|---|
| C1 | `member-base-m.glb` | Stylised body, oversized head (~1/4 of height), neutral pose, shared rig | M2 must |
| C2 | `member-base-f.glb` | Same rig and proportions language | M2 must |
| C3 | Body build blend shapes | `slim`, `muscular`, `heavy`: drives `appearance.build` | M2 should |
| C4 | Hair set (6) | short, buzz, bun, ponytail, curly, bald (none): matches `appearance.json` hairStyles | M2 must |
| C5 | Gym outfit | T-shirt / tank + shorts / leggings; colour via vertex colour or material tint (palette in `appearance.json`) | M2 must |
| C6 | Street outfit | Hoodie / jacket + trousers, worn on arrival and departure | M2 should |
| C7 | Accessories | Headphones (Headphones-In trait), water bottle (Forgetful trait), lifting belt, wristbands | M3 nice |
| C8 | Crew member | Hard hat, hi-vis orange vest, tool belt; uses the member rig | M2 must |
| C9 | Face set | 4–6 eye/brow/mouth combos as texture swaps: neutral, focused, proud, confused, laughing | M3 should |

Skin tones: eight from `appearance.json`, applied as a material tint so one texture serves everyone.

---

## 3. Animations (shared rig)

Every clip maps to an `Anim` value the simulation already emits. Loops unless marked **once**.

| Clip | Sim `anim` / use | Priority |
|---|---|---|
| `idle` (2 variants) | Standing, resting between sets | must |
| `walk` | Moving | must |
| `walk-search` | Lost-bottle search: walk while looking around | should |
| `bench-press`, `incline-press` | `lift` on a bench station | must |
| `squat`, `overhead-press` | `lift` in a squat rack | must |
| `deadlift`, `barbell-row` | `lift` on a platform | must |
| `db-curl`, `lateral-raise`, `goblet-squat`, `lunge` | `lift` at dumbbells | should |
| `cable-pull`, `pull-up` | `lift` at cable / pull-up bar | should |
| `treadmill-run`, `cycle`, `row-machine` | `cardio` | must |
| `stretch`, `plank`, `push-up` | `stretch` on mats | should |
| `talk` (2 variants) | Conversation | must |
| `flex-front`, `flex-side`, `flex-back` | Flex-Off poses | must |
| `clap` | PR reaction | must |
| `celebrate` **once** | PR, Flex-Off win, crew finish | must |
| `fist-bump` **once** | Successful spot | should |
| `spot-hover` | Spotter stance behind bench | should |
| `hype` | Overenthusiastic spotter | nice |
| `walk-away-dramatic` | Failed flirtation exit | nice |
| `pretend-not-watching` | PR reaction (shoelace / ceiling) | nice |
| `power-up` | Aura (arms out, crouch → rise) | must |
| `change-clothes` | Locker (hidden behind a door swing is fine) | nice |
| `check-in` (tap card) | Reception | nice |
| `build-hammer`, `carry-plank` | Construction crew | must |
| `podium-pose` | Awards ceremony | should |

Sources: Mixamo (free with an Adobe account, royalty-free in projects) covers most of the locomotion and gestures. Retarget to the shared rig in Blender. Lifting clips are thin on Mixamo and are worth hand-keying or commissioning.

---

## 4. Equipment

Counts come from `layout.json` (+ temporary slots the crew can fill).

| ID | Asset | Count | Notes |
|---|---|---|---|
| E1 | `eq-bench.glb` (flat bench + rack + bar) | 6 (+2 temp) | Bar as a separate node so plates can be added |
| E2 | `eq-squat-rack.glb` | 3 (+2) | Power rack, J-hooks, bar |
| E3 | `eq-platform.glb` | 2 (+2) | Wood platform with rubber inserts, loaded bar |
| E4 | `eq-dumbbell-rack.glb` + `eq-dumbbell.glb` | 6 (+2) | Rack + adjustable bench |
| E5 | `eq-cable-station.glb` | 4 (+2) | Tower + seat |
| E6 | `eq-pullup-bar.glb` | 2 (+2) | |
| E7 | `eq-treadmill.glb` | 4 (+2) | Belt texture scroll when in use |
| E8 | `eq-bike.glb` | 3 (+2) | Flywheel spins |
| E9 | `eq-rower.glb` | 2 (+2) | Seat slides |
| E10 | `eq-mat.glb` | 5 (+3) | 3 colour variants |
| E11 | `eq-plate.glb` (45 / 25 / 10) | — | Instanced; used for "never reracks" and Photo-Op loads |
| E12 | Temporary-station kit | — | Hazard-tape base, scaffolding frame, sawhorse, plank pile |
| E13 | Barbell (loose) | — | For the crew to carry, and for drop gags |

---

## 5. Environment and props

| ID | Asset | Notes |
|---|---|---|
| P1 | Room shell | Back + left walls with skirting, floor tiles per zone (rubber in lifting zones, wood in stretching, tile in lockers), board edge |
| P2 | Locker bank (×9) | Doors that open during `changing` |
| P3 | Locker bench, partition walls with door | |
| P4 | Reception desk | Card reader, small monitor, a plant |
| P5 | Gym sign | "MINI GYM" logo on the wall |
| P6 | Hall of Fame wall | Frame + 8 portrait slots (render-to-texture member heads in M5) + brass plaque |
| P7 | Mirror wall | Reflective-looking material (no real reflections needed) |
| P8 | Wall speakers (×2) | Clickable; cone pulses with music in M7 |
| P9 | Social space | Couch, coffee table, water cooler, protein-shake bar |
| P10 | Plants (3 variants), towel bin, chalk bowl, whiteboard ("LEG DAY"), wall clock | Set dressing |
| P11 | Awards podium (1st/2nd/3rd) + confetti cannon | Ceremony |
| P12 | Motivational posters (4) | Original artwork only, e.g. "RERACK YOUR WEIGHTS" with a tiny cartoon bar |

---

## 6. VFX

| ID | Effect | Notes |
|---|---|---|
| V1 | Aura | Swirling particles + light pulse in the chosen colour (8 colours in `aura.json`); reduced-motion version is a static glow |
| V2 | PR burst | Small star sparkle above the lifter |
| V3 | Title won | Gold ⭐ pop + short light shaft |
| V4 | Construction | Dust puffs, little hammer sparks, "poof" when removed |
| V5 | Chalk puff | On deadlift start |
| V6 | Sweat drops | Cardio, rare, comedic |
| V7 | Confetti | Ceremony (off in reduced motion) |
| V8 | Tilt-shift | Already implemented (`TiltShift2` post-process) |

---

## 7. UI

| ID | Asset | Notes |
|---|---|---|
| U1 | Icon set (24 px, rounded) | aura, trophy, speaker, gear, pause/play, 1×/2×/4×, members, close, star, crown, dumbbell. Emoji are placeholders today. |
| U2 | Title badges | One per title category (annual crown, milestone medal, reputation ribbon) |
| U3 | Speech bubble style | Already CSS. Optional tail variants for shouting (spotter hype) and thinking (italic). |
| U4 | Font | A rounded sans with good digits (e.g. Nunito, OFL licence) self-hosted in `public/fonts/` |
| U5 | Favicon / social card | `og-image.png` 1200×630 diorama shot for link previews |

---

## 8. Audio

All optional and off by default for ambient; SFX volume in Settings (M7).

| ID | Sound | Trigger |
|---|---|---|
| A1 | Gym ambience loop | Distant clanks, murmurs; volume scales with members inside |
| A2 | Plate clank (×3) | Set end on barbells |
| A3 | Dumbbell set-down | Dumbbell exercises |
| A4 | Treadmill hum | Cardio |
| A5 | Card-reader beep | Check-in |
| A6 | Locker door | Changing |
| A7 | Grunt (×4, cartoonish) | Grunter trait |
| A8 | Clap / small cheer | PR reaction |
| A9 | Hammer taps, saw, "ta-da" | Construction crew |
| A10 | Fanfare (short) | Title won, ceremony |
| A11 | Aura whoosh | Aura activation |
| A12 | Record scratch (tiny) | Failed flirtation |

Sources: Freesound (check each licence; prefer CC0), Kenney audio packs (CC0), or a commissioned set.

---

## 9. Free or low-cost sources to prototype with

| Source | What | Licence |
|---|---|---|
| Kenney.nl | Furniture, props, UI icons, audio | CC0 |
| Quaternius | Stylised characters with rigs and animations, props | CC0 |
| Poly Pizza | Low-poly models (check per model) | CC0 / CC-BY |
| Mixamo | Humanoid animations | Free, royalty-free use |
| Freesound | SFX | Varies (prefer CC0) |
| Synty "POLYGON" packs | Consistent low-poly gym and city sets | Paid, commercial licence |

Keep a `public/CREDITS.md` with author, licence and link for anything that needs attribution.

---

## 10. Integration checklist (M2)

1. Load models with drei `useGLTF` and preload them in `GymScene`.
2. `Avatar`: replace the primitive meshes with the skinned model and map `source().anim` to a clip with `useAnimations`, cross-fading 0.2 s. Keep the per-frame lerp and bubble code.
3. `StationMesh`: replace `shape(type)` with the model for the type; keep the scaffold, hazard ring and plates toggles.
4. Room: swap primitive props for models; merge static meshes.
5. Check budgets: 40 members + full gym under 600 draw calls and 60 fps on a mid-range laptop.
