# Content data

Everything the simulation reads lives here. Edit JSON, save, and the dev server reloads. Run `npm test` afterwards; it catches most mistakes (wrong name counts, unknown station types, unknown stats).

| File | Controls |
|---|---|
| `names/<cc>.json` | Neo-Jowo name pools: one file per country |
| `exercises.json` | Exercises, which station they use, starting weights, goal affinity |
| `goals.json` | Training goals: sets, rest, progression speed, how common |
| `traits.json` | Personality traits and how they change event chances |
| `events.json` | Base chances for social events, crew timings |
| `dialogue.json` | Every speech bubble |
| `moments.json` | Moment types: notability, which stat they increment, feed text |
| `titles.json` | Gym Legends titles |
| `progression.json` | Strength curve, experience mix, attendance range |
| `population.json` | Gym sizes and arrival peaks |
| `layout.json` | Zones, stations, station footprints, temporary build slots, obstacles members walk around, lockers, mirror, chalk spots, speakers |
| `appearance.json` | Skin, hair and outfit palettes |
| `aura.json` | Aura colours and duration |

## Add a country (names)

Create `names/xx.json` (`xx` = ISO country code, lowercase):

```json
{
  "code": "XX",
  "country": "Country Name",
  "familyNameFirst": false,
  "male":   ["… exactly 50 unique names …"],
  "female": ["… exactly 50 unique names …"],
  "last":   ["… exactly 50 unique surnames …"]
}
```

It is picked up automatically. Set `familyNameFirst: true` where the family name traditionally comes first; it is only used when the player turns on that display option.

## Add an exercise

```json
{ "id": "leg_press", "name": "Leg Press", "station": "cable", "category": "compound", "body": "lower",
  "weight": [180, 300, 450], "goals": { "hypertrophy": 3, "strength": 1, "generalFitness": 2, "weightLoss": 1, "athletic": 1 } }
```

- `weight` is in lb for [beginner, intermediate, advanced] men; women are scaled by `progression.json → genderFactor`. Use `null` for bodyweight or cardio.
- `goals`: 0 means never picked for that goal; 3 means very likely.
- Optional: `"lift": "bench" | "squat" | "deadlift"` (tracked for PRs and annual titles), `"spot": true`, `"photoOp": true`.
- A brand-new station type also needs entries in `layout.json` (`stations` and `tempSlots`) and a shape in `src/scene/Stations.tsx`.

## Add a title

```json
{ "id": "chalkMonster", "category": "reputation", "name": "Chalk Monster", "stat": "photoOps", "minValue": 5, "rarity": 3, "description": "…" }
```

- `annual`: needs `metric` (`bestBench`, `bestSquat`, `improvement`, `visits`); optional `gender`. `{year}` is filled in.
- `milestone`: needs `stat` + `threshold`. `{value}` shows the live count.
- `reputation`: needs `stat` + `minValue`. One holder; overtaken holders become "Former …".
- Optional `nameFemale` for a gendered variant (e.g. "The Gal Who Never Reracks").
- `rarity` decides which title is featured under a member's name.

Available stats: `visits, prs, flexOffWins, flexOffLosses, spots, overSpots, constructionTriggers, lostBottles, noReracks, photoOps, flirtFails, conversations, streak, bestStreak`, plus `avgRest` (with optional `minCount`).

## Dialogue

Every list is picked from at random. Conversations are arrays of lines that alternate speakers, starting with the member who started the chat. `{name}` and `{title}` work in crew and title lines.
