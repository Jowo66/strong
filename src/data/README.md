# Content data

Everything the simulation reads lives here. Edit JSON, save, and the dev server reloads. Run `npm test` afterwards; it catches most mistakes (wrong name counts, unknown station types, unknown stats).

| File | Controls |
|---|---|
| `names/<cc>.json` | Neo-Jowo name pools: one file per country |
| `exercises.json` | Exercises, which station they use, starting weights, goal affinity |
| `goals.json` | Training goals: sets, rest, progression speed, how common |
| `traits.json` | Personality traits and how they change event chances |
| `events.json` | Chances and timings: social events, crew (and its gags), breaks, rivals, recognition, work-ins, rack curls, phone calls, heavy drops, warm-ups, the awards ceremony |
| `dialogue.json` | Every speech bubble |
| `moments.json` | Moment types: notability, which stat they increment, feed text |
| `titles.json` | Gym Legends titles |
| `progression.json` | Strength curve, experience mix, attendance range |
| `population.json` | Gym sizes and arrival peaks |
| `layout.json` | Zones, stations, station footprints, temporary build slots, obstacles members walk around, lockers, mirror, chalk spots, speakers |
| `appearance.json` | Skin, hair and outfit palettes |
| `aura.json` | Aura colours, duration, and the chance of a golden aura on a PR |

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
- A brand-new station type also needs entries in `layout.json` (`stations`, `footprints` and `tempSlots`), a model in `src/scene/Stations.tsx`, and a pose in `src/scene/character/poses.ts`.

## Move equipment or props

Edit `layout.json`. `footprints` is each station type's box (station-local, before rotation; the member approaches from local +Z). `obstacles` are the props members walk around. `npm test` checks that nothing overlaps, nothing sits off the floor, and every station, build slot, locker, mirror spot, chalk spot and the cooler can be reached from the entrance.

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

Lines are picked least-recently-used: a joke only comes back once the rest of its list has had a turn, so longer lists mean less repetition. (A test checks that a 10-minute watch shows at least 8 kinds of joke with no line more than twice; if you make an event much more frequent, give its list more lines.) Conversations are arrays of lines that alternate speakers, starting with the member who started the chat.

Placeholders (a line is only used when every placeholder in it can be filled):

| Placeholder | Means | Where |
|---|---|---|
| `{you}` | the other person's first name (only once they know each other) | conversations, greetings, rival lines |
| `{me}` | the speaker's first name | conversations |
| `{exercise}` | the speaker's current exercise | conversations |
| `{rival}` | the speaker's rival | conversations |
| `{title}` | the listener's featured title | conversations, title lines |
| `{name}` | a member's first name | crew, recognition |

Some lists are pairs or scripts rather than single lines (`flexOff.mutual`, `flexOff.bothWon`, `crew.backwards`, `crew.plank`).
