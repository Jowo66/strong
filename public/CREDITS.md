# Credits

## Art, animation and sound

- **Characters**: [Ultimate Animated Character Pack](https://quaternius.com/packs/ultimatedanimatedcharacter.html) (Nov 2019) by **Quaternius**, CC0 1.0 (public domain). Bodies, faces, hair, clothing and the walk / run / carry / victory animations come from the pack, converted and recoloured by `scripts/build-characters.py` into `public/characters/`. Support the author: https://www.patreon.com/quaternius
- **Equipment, room and props**: built from primitives in `src/scene/` (no downloaded models). Glasses, headphones, afros and buns on the characters are code-built too.
- **Exercise animation**: procedural poses in `src/scene/character/poses.ts`, retargeted onto the pack's skeleton.

Everything else you see and hear is original and made in code for this project:

- **Floor textures, posters, signs and the whiteboard**: drawn on canvas in `src/scene/labels.ts` (original artwork).
- **Icons**: original SVG line icons in `src/ui/Icon.tsx`.
- **Sound effects, ambience and Gym Radio music**: synthesised live with Web Audio in `src/audio/sound.ts` (no recordings).

## Font

- **Nunito** by Vernon Adams, Cyreal and Jacques Le Bailly. SIL Open Font License 1.1. Bundled via `@fontsource-variable/nunito`. https://github.com/googlefonts/nunito

## Libraries

| Library | Licence |
|---|---|
| three.js | MIT |
| React, React DOM | MIT |
| @react-three/fiber, @react-three/drei, @react-three/postprocessing | MIT |
| postprocessing | Zlib |
| N8AO (ambient occlusion) | ISC |
| three-stdlib, maath | MIT |
| zustand | MIT |
| idb-keyval | Apache-2.0 |

## Music service

Spotify is a trademark of Spotify AB. Mini Gym is not affiliated with or endorsed by Spotify. Spotify playback uses the Spotify Web Playback SDK and requires your own Spotify Premium account.
