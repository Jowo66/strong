# Mini Gym - Living Fitness Diorama

> Product spec. For how it is built see [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md); for the build order see [ROADMAP.md](ROADMAP.md).

**Live site:** https://jowo66.github.io/strong/

## Project Vision

Mini Gym is a living miniature fitness simulation inspired by the presentation style of miniature diorama worlds.

Rather than a workout tracker, the application simulates a functioning gym populated by autonomous members who train, socialize, improve, and leave.

The player is one gym member among many.

---

# Core Philosophy

- The gym exists independently of the player.
- Every NPC has goals.
- Every NPC follows a workout routine.
- Stories emerge naturally.
- Humour is built into the simulation.
- The world feels alive even if the player does nothing.
- The gym remembers. Notable moments become part of its history.

---

# Visual Style

## Inspiration

- Miniature dioramas
- Tilt-shift photography
- Tiny Glade
- Theme park simulations
- Life simulation games

## Camera

- Fixed angled camera
- Slight tilt-shift depth-of-field
- Miniature world scale
- Bright, readable visuals

## Character Style

- Stylized 3D avatars
- Slightly oversized heads
- Expressive body language
- Distinct silhouettes

---

# Gym Layout

## Areas

- Reception (includes the Hall of Fame wall)
- Locker rooms
- Bench zone
- Squat zone
- Free weight zone
- Cable zone
- Cardio zone
- Stretching area
- Social space

---

# Locker System

All NPCs follow:

Enter Gym
↓
Check In
↓
Visit Locker
↓
Change Clothes
↓
Workout
↓
Return To Locker
↓
Leave Gym

This helps maintain realistic gym flow.

---

# Simulation Calendar

The gym runs on an in-game calendar so that history has dates attached.

- The calendar starts on the real-world date of the gym's creation.
- Time scale is configurable (default: 1 in-game day = 10 real minutes).
- Days, months, and years drive progression, attendance stats, and annual Legend titles (e.g. "Bench King of 2027").

---

# NPC System

## Naming System

Uses the Neo-Jowo procedural naming system.

- Each country has a pool of **50 male first names, 50 female first names and 50 last names**.
- A member gets a random first name (matching their gender) and a random last name from the same country.
- Full names are unique within the gym; a clash is simply re-rolled.
- Optional setting: mixed-heritage names (a small chance the last name comes from another country).
- Optional setting: show family name first for countries where that is the custom (Japan, Korea, China).

Starter pools: Nigeria, Ghana, Japan, South Korea, China, India, Philippines, Brazil, Mexico, Italy, Germany, Canada. Adding a country is one JSON file (see `src/data/README.md`).

Examples: Chiamaka Okafor, Kwame Mensah, Haruto Sato, Ji-woo Park, Aarav Sharma, Beatriz Silva, Liam Tremblay.

---

## NPC Attributes

Each NPC stores:

- Name
- Goal
- Experience Level
- Attendance Rating
- Favourite Exercise
- Current Routine
- Familiarity Ratings
- Personality Traits (e.g. Show-Off, Social Butterfly, Forgetful, Rerack Avoider)
- Lifetime Stats (counters used by the Legends system)
- Moment Log (notable events)
- Legend Titles (current and former)

Traits bias behaviour. A Rerack Avoider occasionally leaves plates loaded; a Show-Off is more likely to trigger Flex-Off Events; a Forgetful member is more likely to lose a water bottle.

---

## Training Goals

Examples:

- Hypertrophy
- Strength
- General Fitness
- Weight Loss
- Athletic Performance

---

## Workout Generation

Each gym member receives:

- 6 to 8 exercises
- Randomized exercise order
- Randomized rest periods

No two gym visits should be identical.

---

# Persistent Progression

NPCs improve over time.

Example:

Alek Doran

Month 1:
Bench 135

Month 6:
Bench 185

Month 12:
Bench 225

Regulars become recognizable members of the gym community.

---

# Gym Legends System

## Purpose

Give the gym a persistent history. Members accumulate memorable moments over time and earn titles that make long-running regulars feel like local celebrities.

Fits the Neo-Jowo philosophy: emergent stories and recurring characters.

---

## Moment Tracking

Every simulation event that could be memorable is recorded as a Moment:

- Personal records
- Flex-Off wins and losses
- Successful spots (and overenthusiastic ones)
- Triggering a construction crew build
- Lost water bottle searches
- Attendance streaks
- Leaving equipment unracked
- Witnessed PR reactions (clapping, pretending not to watch)

Each Moment stores: who, what, when (in-game date), where (gym zone), and who witnessed it.

Moments feed two things: **stat counters** (used to award titles) and the **Moment Log** (used for flavour text in the Hall of Fame).

---

## Title Categories

### Annual Titles

Awarded at the end of each in-game year. One holder per year.

- **Bench King of 2027** / **Bench Queen of 2027** — heaviest bench of the year, awarded separately for men and women
- **Squat Monarch of 2027** — heaviest squat of the year
- **Most Improved of 2027** — largest relative strength gain
- **Most Consistent Member of 2027** — most visits in the year

### Milestone Titles

Awarded when a counter crosses a threshold. The number updates live.

- **Guardian Spotter (25 Successful Spots)**
- **PR Machine (50 Personal Records)**
- **Iron Regular (100 Visits)**: changed from a 100-day streak, which is practically unreachable when the most dedicated members attend ~85% of days
- **Streak Survivor (14-Day Best Streak)**

Mirror Champion is a reputation title (one holder, live count), so it can be taken over: **Mirror Champion (17 Flex-Off Wins)**.

### Reputation Titles

Earned through repeated quirky behaviour. Humorous by design.

- **Mirror Champion (N Flex-Off Wins)**: most Flex-Off wins
- **The Guy Who Never Reracks** / **The Gal Who Never Reracks**
- **Hype Spotter**: most overenthusiastic spots
- **Construction Crew Favourite Customer** — triggered the most temporary station builds
- **Lost & Found Legend** — most water bottle searches
- **Professional Rest-Timer Enthusiast** — longest average rest periods
- **Photo-Op Plate Loader** — most "load plates for the photo, then remove them" moments

Tone stays playful, never mean-spirited.

---

## Title Rules

- Each NPC can hold multiple titles but displays one **featured title** (the rarest).
- Annual titles are permanent: "Bench King of 2027" stays on record forever.
- Reputation titles can be **taken over**. When another member overtakes the record, the previous holder becomes "Former Mirror Champion" (titles that start with "The" read "The Guy Who Never Reracks (former)").
- Title changes are announced subtly: a small banner above the NPC, nearby members react.

---

## Legend Moments In The World

- **Hall of Fame Wall** at reception. Small framed portraits of current title holders. Clicking the wall opens a compact Hall of Fame panel (same pattern as the speaker music window).
- **Annual Awards Ceremony** on the first in-game day of each year. The construction crew builds a tiny podium (possibly backwards at first), winners pose, and the crowd claps.
- **Rivalries.** When two NPCs repeatedly compete for the same title, their Familiarity Rating gains a rivalry flag, making Flex-Offs and side-eye between them more likely.
- **Legend Recognition.** NPCs with titles get more reactions from others: nods, double-takes, imitation.

---

## Hall of Fame Panel

Compact, non-blocking.

Example:

Mirror Champion
Juno Hart — 17 Flex-Off Wins
"Defeated Revo Kane three times in one week."

Bench King of 2027
Alek Doran — 225 lb

Each entry can expand to show that member's top 3 Moments.

---

## Data Model (Sketch)

```ts
type Moment = {
  id: string;
  npcId: string;
  type: 'pr' | 'flexOffWin' | 'flexOffLoss' | 'spot' | 'construction'
      | 'lostBottle' | 'noRerack' | 'streak' | 'photoOp';
  date: string;          // in-game date
  zone: string;
  witnesses: string[];   // npc ids
  detail?: string;       // e.g. "Bench 225"
};

type LegendTitle = {
  id: string;
  name: string;          // "Mirror Champion"
  category: 'annual' | 'milestone' | 'reputation';
  holderId: string;
  value?: number;        // 17
  year?: number;         // 2027
  current: boolean;      // false = "Former"
};
```

Moment Logs are capped per NPC (e.g. the 50 most notable) to keep save data small.

---

# NPC Reshuffle Feature

Settings Button:

🔄 Reshuffle Members

## Purpose

Deletes:

- Membership database
- Attendance history
- Relationships
- Progress records
- Moments and Legend titles

Generates a completely new population.

### Soft Refresh

- Keeps regulars, including their titles and Moments
- Refreshes visitors

### Hard Refresh

- Deletes everyone
- Generates an entirely new gym population
- Optional checkbox: **Keep Hall of Fame archive**. Past legends stay on the wall as "Former Members", so the new population inherits the gym's history.

---

# Dynamic Equipment Expansion

## Problem

All exercise stations are occupied.

## Solution

A miniature construction crew appears.

### Behaviour

- Carries materials
- Builds temporary station
- Creates Bench #7 or Bench #8
- Allows player to continue immediately

### Removal

After the area becomes unused:

- Crew returns
- Temporary station removed
- Floor restored

### Humour

Workers may:

- Drop equipment
- Build backwards briefly
- Celebrate completion excessively
- Wave at their Favourite Customer

---

# Social Interaction System

NPCs occasionally interact.

These interactions are designed for humour and atmosphere. Every interaction outcome is recorded as a Moment where relevant.

---

## Casual Conversations

Examples:

"How many sets left?"

"Four. Probably six."

"Respect."

---

## Flex-Off Events

Rare event.

Two gym enthusiasts notice one another.

They approach a mirror and begin posing.

Possible outcomes:

- Mutual approval
- Both think they won
- Nearby NPC laughs

Wins count toward Mirror Champion.

---

## Failed Flirtations

Lighthearted and comedic.

Examples:

NPC:
"Hey."

Response:
"I'm on my rest timer."

NPC walks away dramatically.

---

## Spotting Events

A member requests help with a lift.

Outcomes:

- Successful lift
- Overenthusiastic spotter
- Celebratory fist bump

---

## Personal Records

When a PR occurs:

- Nearby members react
- One may clap
- Another may pretend not to watch

---

## Lost Water Bottle Event

NPC wanders around searching.

Eventually finds the bottle exactly where they left it.

---

# Humour Framework

Humour should be frequent but subtle.

Examples:

- Overdramatic posing
- Tiny victories celebrated like world championships
- Construction crew antics
- Failed attempts to impress others
- NPCs silently comparing physiques
- Someone loading too many plates for a photo before removing them
- Award ceremonies with far too much pomp for a tiny gym

The tone should remain playful rather than mean-spirited.

---

# Information Terminal

Hovering over a character shows a very small information panel.

Example:

Revo Kane
⭐ Mirror Champion (17 Flex-Off Wins)

Goal: Hypertrophy

Current Exercise: Incline Press

Progress: 4/7

No large popups.

No screen-blocking menus.

---

# Spotify Integration

Uses the Spotify system concept from Reverb Worlds.

## Design

Not permanently visible.

Inside the gym are wall speakers.

Clicking a speaker opens a music window.

### Features

- Play
- Pause
- Playlist Selection
- Close Window

Closing the window removes it from the UI.

Music continues.

Note: the Spotify redirect URI must be registered as `https://jowo66.github.io/strong/`.

**Gym Radio.** The same window also offers Gym Radio: three original, synthesised stations that need no account, so the speakers work for everyone.

---

# Aura System

## Purpose

Purely cosmetic.

Inspired by over-the-top anime power-up moments.

---

## Activation

Button:

✨ Aura

---

## Behaviour

- Brief activation
- Swirling energy particles
- Light pulse effect
- Character power-up pose

No gameplay bonuses.

Only visual flair.

---

## Aura Colours

Players can choose:

- Gold
- Blue
- Red
- Purple
- Green
- Cyan
- White
- Pink

Future updates may add custom colours.

---

# Population Targets

Small Gym:
5-10 NPCs

Medium Gym:
10-25 NPCs

Rush Hour:
25-40 NPCs

---

# Accessibility

- Reduced Motion Mode (also tones down aura and ceremony effects)
- High Contrast Mode
- Colourblind Friendly Indicators
- Scalable UI

---

# Technical Stack

## Frontend

- React
- TypeScript
- Vite

## 3D

- Three.js
- React Three Fiber

## State

- Zustand
- Zustand `persist` middleware for saving the gym between visits
- IndexedDB storage (via `idb-keyval`) for members, Moments, and the Hall of Fame; localStorage only for small settings

GitHub Pages is static hosting, so all persistence lives in the player's browser. Add Export / Import Gym (JSON) in settings so a gym's history can be backed up or moved.

## Deployment

GitHub Pages

- **URL:** https://jowo66.github.io/strong/
- **Repository:** `jowo66/strong`
- **Vite base path:** set `base: '/strong/'` in `vite.config.ts`
- **Assets:** reference models, textures, and audio via `import.meta.env.BASE_URL` so they resolve under `/strong/`
- **Routing:** use hash routing (or a copied `404.html`) so refreshes don't 404 on GitHub Pages
- **Build & deploy:** GitHub Actions workflow using `actions/upload-pages-artifact` and `actions/deploy-pages` on push to `main`; Pages source set to "GitHub Actions"

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/strong/',
  plugins: [react()],
});
```

---

# Long-Term Goal

Create a miniature living gym ecosystem where:

- Members have routines
- Members improve over time
- Social stories emerge naturally
- Legends are made and remembered
- Humour keeps the simulation entertaining
- The player feels like part of a functioning gym culture

The experience should feel like watching a tiny animated gym community continuously generate new stories every day, and building a history worth looking back on.
