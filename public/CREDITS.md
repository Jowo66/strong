# Credits

## Art, animation and sound

- **Characters**: [Ultimate Animated Character Pack](https://quaternius.com/packs/ultimatedanimatedcharacter.html) (Nov 2019) by **Quaternius**, CC0 1.0 (public domain). Bodies, faces, hair, clothing and the walk / run / carry / victory animations come from the pack, converted and recoloured by `scripts/build-characters.py` into `public/characters/`. Support the author: https://www.patreon.com/quaternius
- **Extra moves** (talking, phone calls, drinking, folded arms, kneeling to build, nodding, dancing): [Universal Animation Library](https://quaternius.com) 1 and 2 (Standard) by **Quaternius**, CC0 1.0, converted by `scripts/build-moves.py` into `public/characters/moves.*`.
- **Plants, couch, coffee table, bar stools, lamps, rug, sideboard, fridge, wall shelf, washbasin, mirror, towel rails, bins**: [Ultimate House Interior Pack](https://quaternius.com) (June 2020) by **Quaternius**, CC0 1.0. **Reception trophy**: [Ultimate RPG Items Pack](https://quaternius.com) (Aug 2019). **Water bottles, phone, radio**: [Survival Pack](https://quaternius.com) (Sept 2020). **Fruit, plate, protein tubs**: [Ultimate Food Pack](https://quaternius.com) (Oct 2019). All by **Quaternius**, CC0 1.0, converted by `scripts/build-props.py` (Blender) into `public/props/`.
- **Animals**: the Shiba Inu and Husky from [Ultimate Animated Animals](https://quaternius.com) (July 2021), the pug from [Farm Animals](https://quaternius.com), and the aquarium's goldfish, clownfish, blue tang and betta from [Cute Fish Pack](https://quaternius.com) (Feb 2020). All by **Quaternius**, CC0 1.0, trimmed to the clips the gym uses by `scripts/build-animals.py` (Blender) into `public/animals/`.
- **Equipment, the rest of the room and props**: built from primitives in `src/scene/`. Glasses, headphones, afros and buns on the characters are code-built too.
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
