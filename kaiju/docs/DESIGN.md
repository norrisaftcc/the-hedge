# Kaiju: design for the spike

This is the contract the builders work to. It follows `REQUIREMENTS.md` (IDs in brackets). Where this file gives a number, use it; tuning comes after play.

## 1. Shape of the thing

A static page. Plain JavaScript modules. No build, no packages.

```
kaiju/
  index.html            the page: screens and tiles; loads style.css and src/ui/main.js
  style.css             theme tokens, tile layout, components
  art.html              a gallery of every drawing, for eyes and screenshots
  README.md             run, test, layout
  docs/                 REQUIREMENTS, RESEARCH, DESIGN
  src/
    rng.js              mulberry32, a port of hedge/rng.py
    hex.js              axial hex arithmetic
    rules.js            the rules core: create, step, queries. Pure.
    ai.js               plans for defense units, the rival kaiju and a berserk kaiju
    voice.js            the words: say(kind, data) and headline(result)
    city.js             grows a city from a seed: Sidewinder streets, braided
    data/
      terrain.js        TERRAIN, STRUCTURES
      kaiju.js          KAIJU
      units.js          UNITS
      mutations.js      MUTATIONS, BUDGET
      missions.js       MISSIONS, resolveMission(id, opts)
    art/
      defs.js           shared SVG <defs>: damage patterns
      kaiju.js          portrait, silhouette, figure, token
      units.js          token, figure
      terrain.js        hexTile, structure, backdrop
    ui/
      main.js           boot; setup, play and end screens
      board.js          the hex map as one SVG; taps and highlights
      panels.js         top bar, status, actions, log, inspect, forecast
      cutaway.js        the combat scene
      settings.js       theme and cutaway mode, remembered
  tests/                node --test; *.test.mjs
```

Layering, as in the hedge: `rng`, `hex` and `data` at the bottom (`data/missions.js` and `city.js` are read by the page, which hands `rules.create` a resolved mission); `rules` and `ai` on them; `voice` for words; `art` beside, knowing nothing of rules; `ui` on top. Nothing below `ui` touches the page. Nothing below `ui` imports from `ui` or `art`.

## 2. Dice: `src/rng.js` [PLT-5]

A port of `hedge/rng.py`. Same arithmetic, same numbers.

```js
export class Mulberry32 {
  constructor(seed = 0)   // state = seed >>> 0
  nextU32()               // as Python next_u32; use Math.imul and >>> 0
  roll(sides)             // 1 + nextU32() % sides
  randint(low, high)      // low + nextU32() % (high - low + 1)
}
export function seedFromText(text)  // keep the digits, ignore the rest, 32 bits
```

Test vectors, from the Python:

- `new Mulberry32(7)`, five `nextU32()`: `50271532, 266108690, 4195786334, 3002305430, 2239590375`
- `new Mulberry32(7)`, ten `roll(6)`: `5, 3, 3, 3, 4, 3, 2, 6, 4, 3`
- `seedFromText("a1b2c3")` is `123`

The game keeps the dice state in `state.rng` (a u32) and builds a `Mulberry32` from it whenever it rolls, writing the state back after. d100 is `roll(100)`. 2d6 is `roll(6) + roll(6)`.

## 3. Hexes: `src/hex.js` [MAP-1]

Pointy-top hexes. **Axial** coordinates `{q, r}` inside the game; a hex's key is the string `"q,r"`. Maps are written in **odd-r offset** (`col`, `row`; odd rows shifted right half a hex), because that is how a grid of text reads.

```js
export const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]  // index 0..5
export const DIR_NAMES = ["east","north-east","north-west","west","south-west","south-east"]
export function key(q, r)                 // "q,r"
export function parse(k)                  // {q, r}
export function neighbor(k, d)            // key of the hex in direction d
export function neighbors(k)              // six keys, in DIRS order
export function distance(a, b)            // hex steps between two keys
export function line(a, b)                // keys from a to b inclusive (cube lerp, round; nudge by 1e-6)
export function directionTo(a, b)         // 0..5, the DIRS direction nearest the bearing from a to b; ties to the lower index, except 5/0, which goes to 5
export function ray(k, d, n)              // the n keys stepping from k in direction d (not k itself)
export function cone(k, d, n)             // keys h with 1 <= distance(k,h) <= n and directionTo(k,h) === d
export function ring(k, n), range(k, n)   // ring at exactly n; all within n (k included)
export function offsetToKey(col, row)     // odd-r: q = col - (row - (row & 1)) / 2, r = row
export function keyToOffset(k)            // inverse: {col, row}
export function toPixel(k, size)          // {x: size*√3*(q + r/2), y: size*1.5*r}
export function corners(x, y, size)       // six [x,y] points of a pointy hex, for SVG polygons
export function arc(facing, from, to)     // "front" | "rear": d = (directionTo(to, from) - facing + 6) % 6; rear when d is 2, 3 or 4
```

Each direction owns one boundary bearing (the counter-clockwise one, 30° past it), so every cone has the same shape: a bearing exactly between two directions goes to the lower index, except the one at 330° between 5 and 0, which goes to 5.

`arc(facing, attackerKey, targetKey)` reads: seen from the target, facing `facing`, where does the attacker stand. The front arc is the three sides ahead; the rear arc the three behind [KAI-4].

## 4. Data [NFR-4]

Data files export plain objects. Rules read them; nothing else defines numbers.

### 4.1 Terrain and structures: `src/data/terrain.js`

`TERRAIN[id] = {id, name, glyph, cost, ground, infantryOnly, air, deep, water, blocksLos}`. `cost` is the kaiju's AP to enter. `ground` is a ground unit's AP to enter, or `false` where ground units cannot go; `infantryOnly: true` marks terrain only infantry may enter. Air units pay 1 anywhere. The table's "ground units" column gives both. Only mountains block line of sight [MAP-3]: the kaiju is taller than the city.

| id | glyph | name | cost | ground units | water | blocksLos |
|----|-------|------|------|--------------|-------|-----------|
| open | `.` | Open ground | 1 | yes | no | no |
| road | `=` | Road | 1 | yes | no | no |
| park | `"` | Park | 1 | yes | no | no |
| forest | `f` | Forest | 2 | yes (cost 2) | no | no |
| shore | `,` | Shallows | 1 | yes | shallow | no |
| water | `~` | Deep water | 2 | no | deep | no |
| mountain | `^` | Mountain | 3 | infantry only (cost 3) | no | yes |
| rubble | `:` | Rubble | 1 | yes (cost 2) | no | no |

`STRUCTURES[id] = {id, name, glyph, height, hp, points, populated, solid, power, objective, blast}`. `blast` is `[min, max]` damage for a power structure, `null` for every other. A structure sits on a hex over its terrain. [MAP-4]

| id | glyph | name | height | hp | points | populated | solid | power | blast |
|----|-------|------|--------|----|--------|-----------|-------|-------|-------|
| low | `1` | Low building | 1 | 2 | 10 | yes | | | |
| mid | `2` | Office block | 2 | 4 | 25 | yes | | | |
| tower | `3` | Tower | 3 | 6 | 50 | yes | | | |
| pylon | `T` | Pylon | 1 | 2 | 15 | | | yes | 2–3 |
| plant | `P` | Power plant | 2 | 6 | 150 | | | yes | 6–9 |
| lab | `L` | Research lab | 2 | 8 | 150 | yes | yes | | |
| leyline | `Y` | Ley-line nexus (standing stones) | 1 | 6 | 150 | | yes | | |
| bunker | `B` | Command bunker | 2 | 10 | 200 | | yes | | |
| wall | `W` | Fortress wall | 3 | 8 | 20 | | yes | | |

A destroyed structure leaves its hex as `rubble` terrain and `structure: null`.

### 4.2 Kaiju: `src/data/kaiju.js` [KAI-1, KAI-2]

Every kaiju has the same five part slots: `head`, `arms`, `body`, `legs`, `aux`. Each kaiju names them in its own words.

```js
KAIJU.radiosaur = {
  id, name, epithet, blurb,              // blurb: two sentences, house voice
  ap, armor,
  parts: { head: {name, hp}, arms: {...}, body: {...}, legs: {...}, aux: {...} },
  hitTable: [["legs", 3], ["body", 4], ...],   // weights; roll randint(1, sum)
  energy: { max, start, rule },          // rule: "eat" | "water" | "panic" | "battery"
  hunger: { max, start } | null,         // null: no hunger (the robot)
  attacks: [ {id, name, ap, energy, kind, uses, pattern, range, damage: [min, max], accuracy, effects: {}} ],
  passives: ["reactorBelly", ...],
  forbid: ["regen"],                     // mutation ids this kaiju cannot take
}
```

`kind`: `melee` | `ranged` | `special`. `uses`: the part that powers it; if that part is crippled the attack is unavailable. `pattern`: `single` (one hex at distance 1..range), `line` (`ray` from the kaiju in its facing, `range` long), `cone` (`cone` in its facing, `range` long), `rear` (the three hexes of the rear arc, distance 1), `teleport` (a destination hex within `range`, free of units, kaiju and solid structures; terrain ignored). `line`, `cone` and `rear` attack every unit, kaiju and structure in the pattern [CMB-6]; their target hex is any hex in the pattern, and the player confirms the whole pattern.

`effects` keys: `panic: n` (each unit hit, or in the pattern for zero-damage attacks, takes a panic test with pressure `n`), `pull: true` (a unit hit at distance 2 is moved to the free hex between, if there is one), `waterBonus: n` (+n damage when the kaiju stands in shore or water), `oncePerMission: true`.

| | Radiosaur | Thalassor | The Squamous One | Dai-Rengō |
|---|---|---|---|---|
| epithet | the atomic tyrannosaurus | the Atlantean colossus | from the City of Angles | the sentai giant robot |
| ap | 6 | 5 | 6 | 5 (+1 while thrusters not crippled) |
| armor | 2 | 2 | 0 | 2 |
| head | Head 6 | Crowned head 6 | Crown 5 | Cockpit 6 |
| arms | Forelimbs 5 | Arms 7 | Feelers 6 | Arms 6 |
| body | Body 16 | Torso 18 | Mantle 18 | Chassis 15 |
| legs | Legs 8 | Legs 10 | Footing 8 | Legs 8 |
| aux | Tail 6 | Trident 5 | The Eye 5 | Thrusters 5 |
| hitTable legs/body/arms/head/aux | 3/4/2/1/2 | 3/5/2/1/1 | 2/4/3/1/2 | 3/4/3/1/1 |
| energy max/start/rule | 10/3/eat | 8/4/water | 10/2/panic | 12/12/battery |
| hunger max/start | 10/3 | 12/2 | 10/4 | none |
| passives | reactorBelly | stoneBody | regen, eldritch | noHunger, thrusters |
| forbid | | | regen | regen, gut |

Attacks (`ap`, `energy`, `kind`, `uses`, `pattern`, `range`, `damage`, `accuracy`, `effects`):

- **Radiosaur.** `bite` Bite: 2, 0, melee, head, single, 1, 3–5, 85. `tail` Tail sweep: 2, 0, melee, aux, rear, 1, 2–3, 80. `breath` Atomic breath: 3, 4, special, head, line, 4, 4–6, 90.
- **Thalassor.** `fist` Fist: 2, 0, melee, arms, single, 1, 3–6, 85. `trident` Trident cast: 2, 1, ranged, aux, single, 3, 3–4, 75. `surge` Tidal surge: 3, 4, special, arms, cone, 3, 3–4, 90, `{waterBonus: 1}`.
- **The Squamous One.** `grab` Tentacle grab: 2, 0, melee, arms, single, 2, 4–6, 85, `{pull: true}`. `gaze` The gaze: 2, 2, special, aux, cone, 3, 0–0, 100, `{panic: 2}`. `angle` Wrong angle: 1, 3, special, legs, teleport, 3.
- **Dai-Rengō.** `punch` Rocket punch: 2, 1, ranged, arms, single, 3, 3–4, 80. `sword` Beam sword: 2, 1, melee, arms, single, 1, 3–5, 85. `finish` Final formation: 4, 6, special, body, single, 1, 9–12, 95, `{oncePerMission: true}`.

The numbers in this section and in 4.4 are the ones after the first balance pass with `tools/sim.mjs` (a greedy bot playing every monster and mission over a run of seeds). Changed from the first draft: Radiosaur armor 1 → 2, legs 9 → 8; Thalassor fist 3–5 → 3–6; the Squamous One mantle 14 → 18, grab 2–4 → 4–6; Dai-Rengō sword 4–6 → 3–5.

Passives:

- `reactorBelly`: a power structure's blast gives the kaiju +5 energy instead of damage [KAI-10]. Eating a power structure is allowed and gives +6 energy.
- `stoneBody`: at phase start, standing on shore or water, heal 1 on the most damaged part.
- `regen`: at phase start, heal 1 on the most damaged part.
- `eldritch`: attacks against this kaiju have −10 accuracy.
- `noHunger`: no hunger track; cannot eat.
- `thrusters`: +1 AP while the aux part is not crippled.

Energy rules [KAI-5]: `eat`: eating gives +3 energy (see eat below). `water`: at phase start, +2 on shore, +3 in deep water. `panic`: +1 for each unit that breaks from any cause. `battery`: −1 at each phase start; +4 at phase start when on or next to an undestroyed power structure; at 0 the kaiju has −2 AP.

### 4.3 Mutations: `src/data/mutations.js` [SET-2, KAI-8]

`BUDGET = 3`. `MUTATIONS[id] = {id, name, cost, text, apply}` where `apply` is data, not code: an object of stat deltas the rules know how to read.

| id | name | cost | apply |
|----|------|------|-------|
| hide | Thick hide | 2 | `{armor: 1}` |
| legs | Long stride | 2 | `{ap: 1}` |
| regen | Regeneration | 2 | `{passive: "regen"}` |
| reach | Long reach | 1 | `{range: 1}`: +1 range to ranged and special attacks with range > 1 |
| voice | Terrible voice | 1 | `{roarRadius: 2, roarPressure: 1}` |
| gut | Iron gut | 1 | `{hungerEvery: 2}`: hunger rises only on even turns |
| reserves | Deep reserves | 1 | `{energyMax: 3, energyStart: 2}` |
| bulk | Bulk | 1 | `{body: 3}` |

Unspent points: +1 body hp each.

### 4.4 Units: `src/data/units.js` [DEF-1, DEF-2]

`UNITS[id] = {id, name, hp, armor, move, range, minRange, attack: [min, max], accuracy, morale, points, air, edible, reload, effect, radio}`. `radio` is a call sign for the log ("GUARD", "ARMOR", "BATTERY", "ROTOR", "FLIGHT", "LAUNCHER", "GUNNERY", "MASER", "DOCTOR").

| id | name | hp | armor | move | range | minRange | attack | acc | morale | points | air | edible (hunger) | reload | effect |
|----|------|----|-------|------|-------|----------|--------|-----|--------|--------|-----|-----------------|--------|--------|
| infantry | National Guard | 2 | 0 | 2 | 1 | 1 | 1–2 | 60 | 5 | 10 | | 4 | | |
| tank | Tank | 4 | 1 | 3 | 2 | 1 | 2–4 | 65 | 7 | 30 | | 1 | | |
| artillery | Artillery | 3 | 0 | 1 | 6 | 2 | 3–5 | 65 | 6 | 40 | | 1 | | indirect (ignores line of sight) |
| helicopter | Attack helicopter | 3 | 0 | 5 | 2 | 1 | 2–4 | 65 | 6 | 40 | yes | | | |
| jet | Jet | 3 | 0 | 8 | 1 | 1 | 3–5 | 70 | 8 | 60 | yes | | | |
| missile | Missile battery | 3 | 1 | 1 | 5 | 2 | 3–5 | 60 | 8 | 50 | | | | indirect |
| gun | Gun emplacement | 5 | 2 | 0 | 4 | 1 | 2–4 | 60 | 10 | 50 | | | | |
| maser | Maser cannon | 8 | 2 | 0 | 6 | 1 | 5–7 | 75 | 99 | 150 | | | 2 | |
| scientist | Mad scientist | 2 | 0 | 6 | 2 | 1 | 1–1 | 70 | 99 | 100 | yes | | | lingering |

`reload: 2`: after firing, the unit skips its next fire. `lingering`: each hit adds 1 to the target kaiju's `lingering`; AP is reduced by `lingering` for the rest of the mission [DEF-9]. Morale 99: never panics. Air units fly over any terrain but may not stop over a solid structure.

Balance pass (see 4.2): tank attack 2–3 → 2–4; artillery range 4 → 6, attack 2–4 → 3–5, accuracy 55 → 65; helicopter attack 2–3 → 2–4; jet attack 3–4 → 3–5.

### 4.5 Missions: `src/data/missions.js` [MIS-1..3]

```js
MISSIONS[id] = {
  id, name, tagline, briefing: [lines], goal,          // goal: one sentence
  turns,                                               // turn limit
  map: { terrain: [14 strings of 12 glyphs], features: [14 strings of 12; "." for none] } | null,
  generator: "city" | undefined,                       // mission 2: grown by city.js
  kaijuStart: {at: [col, row], facing},
  rivalStart: {at: [col, row], facing} | undefined,
  retreat: [[col, row], ...],                          // hexes where the kaiju may withdraw
  rivalRetreat: [[col, row], ...] | undefined,
  units: [{type, at: [col, row]}],
  reinforcements: [{turn, type, at: [col, row]}],
  objective: {kind: "destroy", at: [col, row]} | {kind: "chosen"} | {kind: "rival"},
  targets: {plant: [c, r], lab: [c, r], leyline: [c, r]} | undefined,   // mission 2
  choose: "target" | "rival" | undefined,              // which setup question this mission asks
}
export function resolveMission(id, {seed, target}) // a mission with map filled (grows the city when generator is "city")
```

Map size: 12 columns, 14 rows. Row 0 is the top (north) of the screen.

- **Mission 1, "The Mountain Fortress"** (`fortress`). The kaiju enters at the bottom of a valley. Mountains form the valley walls. A fortress across the upper third: wall hexes, gun emplacements, two missile batteries, the command bunker behind the wall, a maser cannon on a mountain shoulder. Infantry in the valley. Reinforcements: helicopters on turns 3 and 6, a jet on turn 8. Turns: 14. Objective: destroy the bunker. Retreat: the bottom row.
- **Mission 2, "The Swathe"** (`swathe`). The bottom three rows are harbour (deep water, then shallows). The kaiju starts in the water. The city above is grown by `city.js`. The three targets sit in the top third: the power plant with pylons near it, the research lab, and the ley-line nexus inside a park. All three are placed; the chosen one is the objective. Tanks and infantry in the streets, artillery at the top edge, helicopters on turns 2 and 5, the mad scientist on turn 4, a jet on turn 7. Turns: 15. Retreat: the bottom row.
- **Mission 3, "The Coast"** (`coast`). The coast runs diagonally: deep water in one corner, shallows, beach (open), a coastal town of low buildings, a forest and a pylon line. The rival starts across the map. Light forces: four infantry, two tanks, a helicopter on turn 4. Turns: 16. Objective: the rival. Rival retreat: the far edge.

### 4.6 The city: `src/city.js` [MAP-8]

```js
export function growCity({seed, cols = 12, rows = 11, braid = 0.5}) // -> {terrain: [rows strings], features: [rows strings]}
```

A port of MazeBuilder's Sidewinder (`py_port/algorithms/sidewinder.py`) and braid (`py_port/algorithms/braid.py`) to JavaScript, rolling `Mulberry32(seed)`. Grow a maze on a coarse grid of `ceil(cols/2) × ceil(rows/2)` cells. Draw it onto the offset hex grid the classic way: coarse cell `(i, j)` sits at hex `(2i, 2j)` and is a road; a link to the east neighbour makes `(2i+1, 2j)` a road, a link to the south neighbour makes `(2i, 2j+1)` a road; every other hex is a block of building. Braid turns dead-end alleys into loops. Building heights roll 1–3, taller toward the middle. A few blocks become parks. So the streets of the city are a maze, and they leave Sidewinder's tell: one long avenue along the boundary row that Sidewinder always carves. Put that avenue at the top of the city (flip rows if MazeBuilder carves it along the south).

## 5. The game state

Plain JSON. `structuredClone` copies it. The rules never mutate a state they were given.

```js
{
  v: 1, seed, rng,                 // rng: the dice state, u32
  turn, turnLimit,                 // turn starts at 1
  phase: "kaiju" | "over",         // the defense phase runs inside step({t:"end"})
  mission: id, target, goal,       // target: "plant" | "lab" | "leyline" | null
  map: { cols, rows, hexes: { "q,r": {terrain, structure: null | {type, hp, maxHp}} } },
  retreat: [keys], rivalRetreat: [keys],
  objective: {kind, at: key | null},
  kaiju: KaijuState,
  rival: KaijuState | null,
  units: [{id: "u1", type, at, hp, panicked: 0, reload: 0}],
  nextUnit: 2,
  pending: [{turn, type, at}],     // reinforcements yet to come
  tally: {structures: 0, units: 0, destroyed: {structures: [], units: []}},
  result: null | {grade, outcome, score: {destruction, units, objective, time, parts, total}, headline},
}
KaijuState = {
  id, actor: "kaiju" | "rival", at, facing,
  ap, apMax, armor, energy, energyMax, hunger: number | null, hungerMax: number | null,
  parts: {head: {hp, max}, arms: {...}, body: {...}, legs: {...}, aux: {...}},
  passives: [...], mutations: [...], range: 0, roarRadius: 3, roarPressure: 0, hungerEvery: 1,
  lingering: 0, used: {roar: false, finish: false}, berserk: false, withdrawn: false,
}
```

Part state: `crippled` at 0; `bad` at hp ≤ floor(max/3); `hurt` at hp ≤ floor(2·max/3); else `intact`. Export `partState(part)`.

## 6. Commands and `step` [PLT-3]

```js
export function create(setup)          // setup: {kaiju, mutations: [], mission, target, rival, seed}
                                       // mission is a resolved mission object (from resolveMission); rules.js never imports missions.js
export function step(state, cmd)       // -> {state, events}
```

Player commands:

| cmd | does | AP |
|-----|------|----|
| `{t: "move", to}` | walk the cheapest path to `to` (from `reach`); facing becomes the last step's direction | path cost |
| `{t: "face", dir}` | turn in place | 0 |
| `{t: "attack", attack, target}` | use an attack on a target hex (or pattern, or teleport destination) | attack.ap |
| `{t: "stomp", target}` | adjacent hex: 3–4 damage, no roll to hit, to the structure and every ground unit there; unit armor and cover apply as in 6.2. Stomping a power structure flat sets off its blast (6.1) | 1 |
| `{t: "slam", target}` | the hex of the other kaiju, when it is alive and adjacent: `RULES.slamDamage` (2–4) at `RULES.slamAccuracy` (80) to a part by roll, like any kaiju attack. No facing, and arms crippled do not weaken it (§17.3 D) | `RULES.slamAp` (2) |
| `{t: "eat", target}` | adjacent hex: an edible unit, or a populated structure; for a `reactorBelly` kaiju, also a power structure (6.4) | 1 |
| `{t: "roar"}` | once a turn: panic test, pressure `roarPressure`, for every unit within `roarRadius` | 1 |
| `{t: "withdraw"}` | on a retreat hex: leave the map; the mission ends | 0 |
| `{t: "end"}` | end the kaiju phase; run the defense phase; start the next turn | — |

Unit commands (`umove`, `ufire`) come only from `ai.js` inside the defense phase; `step` refuses them from outside.

An illegal command changes nothing and returns one event `{k: "refuse", text}`.

### 6.1 Movement [MAP-3, MAP-7, B1, B2]

The kaiju enters a hex for its terrain cost plus the structure's height. It may not enter a hex holding the other kaiju, an air unit, or a solid structure. Entering a hex with ground units **crushes** them (destroyed, scored, +1 AP). Entering a structure destroys it (scored); a populated one is not food (dead things are not eaten). Entering a power structure sets off its blast [KAI-10]. Paths are cheapest-first (Dijkstra, as in MazeBuilder's `pathfinding/`). `reach(state, actor)` returns `{key: {cost, path}}` for every hex the kaiju can reach with its AP.

### 6.2 Attacks [CMB-1, CMB-2, KAI-3, KAI-4]

For each target in the pattern:

- **Line of sight.** `lineOfSight(a, b)` holds when no hex strictly between `a` and `b` on `hex.line` has `blocksLos` (only mountains do). Single-target attacks beyond distance 1 and cones need it; a line stops after the first mountain hex; attacks at distance 1 never need it.
- **Accuracy** = attack accuracy − head penalty (intact 0, hurt 10, bad 20, crippled 30) − 10 if the target is an `eldritch` kaiju − 10 if the target is a unit in a structure − 5 per hex beyond 1 for `ranged` attacks; clamp to 5..95. Hit when d100 ≤ accuracy. Structures are always hit.
- **Damage** = randint(min, max) + 1 if the target is a kaiju struck in its rear arc + `waterBonus` if it applies − arms penalty for `melee` attacks (intact 0, hurt 0, bad 1, crippled 2) − target armor − 1 if a unit in a structure. At least 1 on a hit, unless the attack's max is 0.
- **Hit location** on a kaiju: roll on its `hitTable`. Damage beyond a part's hp, or to a crippled part, goes to the body.
- **Units fire** by the same rules: accuracy from the unit table (− 10 against `eldritch`), damage from its attack range, the kaiju's armor, the rear-arc bonus, hit location. A unit may fire only when the distance is from its `minRange` to its `range`, inclusive, and it has line of sight or is `indirect` (artillery, missiles). Unit fire has no range penalty.

### 6.3 Parts [KAI-3]

Legs: AP −0/−1/−2/−3 (intact/hurt/bad/crippled). Arms: melee damage as above. Head: accuracy as above. Aux: its attacks fail when crippled. Body at 0: defeat.

### 6.4 Eating, hunger and berserk [KAI-6, KAI-9]

Eat an adjacent edible unit: it is destroyed and scored; hunger falls by its `edible` value. Eat a populated structure: it is destroyed and scored; hunger −3. Eating gives +3 energy to an `eat` kaiju. A `noHunger` kaiju cannot eat. A power structure is food only to a `reactorBelly` kaiju (+6 energy, no blast); to any other kaiju it is not food, and stomping or walking into it sets off the blast.

At each phase start hunger rises by 1 (on even turns only with `hungerEvery: 2`). Hunger ≥ 70% of max: −1 AP. Hunger at max: **berserk**. The rules play that phase with `ai.planBerserk` (go for the nearest food, eat it, stomp anything in the way), then hunger falls to max − 4, and the defense phase follows. The events say so.

### 6.5 Panic [DEF-4, C4]

A panic test: 2d6 + pressure. The unit breaks if the total is above its morale. A broken unit has `panicked: 2`: it flees and does not fire in the next defense phase. `panicked` falls by 1 at the end of each defense phase.

### 6.6 Turn order

`create` sets turn 1 and runs **phase start** for the kaiju. `step({t: "end"})`:

1. Defense phase: reinforcements due this turn arrive (at their hex, or the nearest free hex). The rival (if any) acts by `ai.planRival`. Then each unit, in id order, acts by `ai.planUnit`. Units that cannot see or reach anything hold.
2. `panicked` counters fall.
3. If `turn === turnLimit`: the mission ends (time).
4. `turn += 1`. Phase start: hunger, battery, energy rules, healing passives, then `apMax` = base ap + mutation ap + thrusters − legs penalty − hunger penalty − lingering − battery-empty penalty, minimum 1. `ap = apMax`. Roar resets. If berserk, play it (6.4) and go back to 1.

Win and loss are checked after every resolved action and every unit's fire.

### 6.7 Results [MIS-4..7]

| outcome | when | grade |
|---------|------|-------|
| `goal` | the objective structure falls, or the rival's body reaches 0, or the rival withdraws | `total victory` if the kaiju's body > half, else `victory` |
| `time` | the turn limit passes | `draw` |
| `withdrawn` | the kaiju withdraws | `draw` |
| `fallen` | the kaiju's body reaches 0 | `defeat` |

Score: `destruction` = structure points; `units` = unit points; `objective` = 500 when met; `time` = 20 × turns left, only when met; `parts` = 50 × parts not crippled (0 when fallen). `headline` from `voice.headline(result, state)`.

### 6.8 Queries for the page

```js
export function reach(state, actor = "kaiju")              // {key: {cost, path}}
export function attackTargets(state, attackId, actor)     // [keys] legal targets
export function affected(state, attackId, target, actor)  // [keys] hexes the pattern strikes
export function forecast(state, attackId, target, actor)  // {apCost, energyCost, targets: [{key, kind, id, name, hp, max, hitChance, damage: [min, max]}], returnFire: [{unit, name, hitChance, damage: [min, max]}]}
export function actions(state)                            // [{id, name, ap, energy, enabled, why}] for move, face, each attack, stomp, slam, eat, roar, withdraw, end
export function describeHex(state, key)                   // {terrain, structure, units, kaiju, text}
export function partState(part)                           // "intact" | "hurt" | "bad" | "crippled"
export function replay(setup, commands)                   // final state; for tests [PLT-6]
```

`returnFire` lists what could strike the kaiju next defense phase from where it stands now [CMB-1]: each unit that could move and fire on it, and the other kaiju, if there is one, with its best attack in reach. Each entry is `{unit, type, name, hitChance, damage}`; `unit` is `"rival"` (or `"kaiju"`, seen from the rival) for a kaiju.

## 7. Events

Each event is `{k, text, ...data}`. `text` is the line for the log, from `voice.say(k, data)`. The page may draw from the data and print the text; they cannot disagree.

| k | data |
|---|------|
| `refuse` | — |
| `phase` | `turn, phase` ("kaiju" or "defense") |
| `move` | `actor, from, to, path, cost` |
| `face` | `actor, dir` |
| `crush` | `actor, at, what: "unit" \| "structure", type` |
| `attack` | `attacker: {side: "kaiju" \| "rival" \| "unit", id, type}, defender: {side, id, type}, attack: {id, name}, at, terrain, structure, hit, damage, part, rear, before: {hp, max}, after: {hp, max}` — `type` is a kaiju id or a unit type; `before`/`after` are the defender's part hp for a kaiju, its hp for a unit or structure. The cutaway is drawn from this. |
| `destroyed` | `what, type, at, points` |
| `blast` | `actor, at, type, damage, part` (or `energy` for `reactorBelly`) |
| `panic` | `unit, type, at, broke` |
| `eat` | `actor, at, what, type, hunger` |
| `energy` | `actor, energy, change, why` |
| `hunger` | `actor, hunger, max` |
| `part` | `actor, part, state` — a part changed state |
| `berserk` | `actor` |
| `reinforce` | `unit, type, at` |
| `umove` | `unit, type, from, to, path` |
| `withdraw` | `actor` |
| `radio` | `callsign` — flavour only |
| `over` | `result` |

## 8. AI: `src/ai.js` [DEF-3, DEF-6]

Pure functions over a state. They return commands; the rules apply them.

```js
export function planUnit(state, unitId)  // -> [{t: "umove", id, to}, {t: "ufire", id, target: "kaiju" | "rival"}]
export function planRival(state)         // -> [kaiju commands with actor: "rival"]
export function planBerserk(state)       // -> [kaiju commands]
```

- **Unit.** Panicked: move to the reachable hex farthest from every kaiju. Otherwise: choose the nearest kaiju as target (in Mission 3 either kaiju). Score each reachable hex (move points, terrain costs, no entering kaiju or other unit hexes; air units ignore terrain and may cross water): +10 if in range and (line of sight or indirect), +3 if in a structure (infantry), −2 per hex of distance from the ideal range (max range), −5 if adjacent to a kaiju and range > 1. Move to the best; fire if able. Ties to the lowest key so plans are deterministic.
- **Rival.** If body ≤ 25%: walk toward `rivalRetreat`, withdraw on arrival. Otherwise: if a special attack can hit the player kaiju and energy allows, use it; else if a melee or ranged attack reaches, face and use the best expected damage; else, for a `battery` kaiju at 2 energy or less, walk to a hex beside an undestroyed power structure (never through one) and wait there; else move toward the player kaiju (preferring water for a `water` kaiju). Roar if three or more units are near and it has not roared.
- **Berserk.** Move toward the nearest edible unit or populated structure; eat it when adjacent.

## 9. Words: `src/voice.js` [UI-6, NFR-5]

```js
export function say(k, data)            // -> string
export function headline(result, state) // -> string, newspaper caps
```

The house voice is dry B-movie: newsreel captions, terse radio traffic in capitals, the monster spoken of as weather. Short sentences. No exclamation marks. Variety comes from a deterministic pick (`lines[(turn * 7 + n) % lines.length]`, n from the data), never from the game's dice, so text changes never change a replay.

Samples of the register:

- *Tank crushed.* "A tank was in the way. It is now part of the road."
- *Breath, hit.* "Atomic breath. Fourth Street is briefly the brightest place in the state."
- *Radio.* "ARMOR TO CONTROL. TARGET HAS TURNED. REQUEST INSTRUCTIONS."
- *Panic.* "The National Guard recalls urgent business elsewhere."
- *Blast.* "The power plant goes up. The monster is inside the explosion."
- *Headline, total victory.* "BUNKER GONE; GENERAL 'REVIEWING OPTIONS'"
- *Headline, defeat.* "CREATURE DOWN AT HARBOUR; CLEAN-UP TO TAKE YEARS"

## 10. Art: `src/art/` [UI-4, CMB-3]

Every function returns SVG markup as a **string**, so it runs in Node and in the page. No external files. Colours go through CSS custom properties with fallbacks: `style="fill: var(--ink, #1b1712)"`. Kaiju keep their own fixed palettes (they must read on both themes).

```js
// src/art/defs.js
export const DEFS   // '<svg width="0" height="0" style="position:absolute"><defs>…</defs></svg>' with patterns
                    // #pat-hurt (light hatch), #pat-bad (cross-hatch), #pat-crippled (solid dark with a slash)

// src/art/kaiju.js — ids: radiosaur, thalassor, squamous, dairengo
export function portrait(id, {parts} = {})        // <svg viewBox="0 0 120 120">: head and shoulders, three-quarter view
export function silhouette(id, {parts} = {})      // <svg viewBox="0 0 100 160">: full body in outline; one <path data-part="head|arms|body|legs|aux" class="part s-STATE"> per part, filled by state through the DEFS patterns
export function figure(id, {flip = false, parts} = {})  // <svg viewBox="0 0 200 200">: full body for the cutaway, facing right (flip: left)
export function token(id)                         // '<g>…</g>' for the map, inside a circle of radius 18 at 0,0

// src/art/units.js — ids as UNITS
export function token(type)                       // '<g>…</g>' inside radius 14 at 0,0
export function figure(type, {flip = false, count = 1} = {})  // <svg viewBox="0 0 200 200">: count 1..5 figures (shown strength, as Advance Wars shows remaining hp)

// src/art/terrain.js
export function hexTile(terrain, size = 24)       // '<g>…</g>': the hex polygon at 0,0, filled and decorated
export function structure(type, height, {damaged = false} = {})  // '<g>…</g>' at 0,0 inside a hex of size 24
export function backdrop(terrain, {structure} = {}) // <svg viewBox="0 0 400 240">: sky, horizon, ground for the cutaway
```

`parts` is `{head: state, arms: state, ...}` with states as in section 5. Silhouettes are bold, readable at 80 px tall; part boundaries are clear. Portraits carry character: the tyrannosaur's dorsal plates glow; the colossus is green bronze with a crown; the squamous thing has too many eyes and the angles of its head do not agree; the robot has a crested helmet and a visor. Nothing drawn should copy a known film monster or robot.

`art.html` shows every drawing in every state, in both themes.

## 11. The page: `index.html`, `style.css`, `src/ui/` [UI-1..10]

### 11.1 Screens

1. **Setup**: three steps on one screen, each a framed tile: *Monster* (four cards: portrait, silhouette, numbers, attacks; tap to choose), *Mutations* (checkboxes with cost; points left; unspent shown as "+N body"), *Mission* (three cards with briefing; the mission's question below it; seed field). A **Deploy** button.
2. **Play**: the tiles below.
3. **End**: grade, headline as a newspaper masthead, score table, buttons: *Again* (same seed), *New seed*, *Change monster*.

### 11.2 Tiles

Wizardry's frame: each tile has a double rule border and a title in small capitals set into the top border.

```
desktop (≥ 900 px), landscape (≥ 640)   phone portrait (< 900 px)
┌──────────── TOP BAR ────────────┐     ┌──── TOP BAR ────┐
│ turn 3/14 · AP 4/6 · goal …     │     │ T3/14 AP4/6 ⚙   │
├───────────────────┬─────────────┤     ├─────────────────┤
│                   │  STATUS     │     │      MAP        │
│                   │ portrait +  │     │                 │
│       MAP         │ silhouette  │     ├─────────────────┤
│                   ├─────────────┤     │ STATUS (compact)│
│                   │  ACTIONS    │     ├─────────────────┤
│                   ├─────────────┤     │ ACTIONS         │
│                   │  LOG        │     ├─────────────────┤
└───────────────────┴─────────────┘     │ LOG (drawer)    │
                                        └─────────────────┘
```

- **Top bar**: turn and limit, AP, the goal in a few words, settings button, theme button.
- **Map**: one SVG from `board.js`. Hex size 24 in SVG units; the SVG scales to the tile's width. Terrain from `hexTile`, structures from `structure`, units from `units.token`, kaiju from `kaiju.token` with a facing notch. Highlights: reachable hexes (move), legal targets (attack), the affected pattern (preview), the rear arc (three faint edges behind the kaiju), the retreat hexes. Tap a hex: inspect it; with a mode active, choose it.
- **Status**: `portrait` and `silhouette` side by side; bars for AP, energy, hunger (or battery for the robot); armor and lingering; a part list with hp. Under it, *Inspect*: the last tapped hex's `describeHex` text.
- **Actions**: one button per `actions(state)` entry: name, AP cost, energy cost, disabled with its `why` as a title and a visible line. Modes: *Move* (default when nothing else is chosen: reachable hexes lit; tap a hex shows path and cost; tap again or *Confirm* to go), *Face* (six arrows around the kaiju), an attack (targets lit; tap a target opens the *Forecast* sheet with *Confirm* and *Cancel*), *Stomp*, *Body slam* (the adjacent kaiju lit, with the forecast sheet), *Eat* (adjacent targets lit), *Roar*, *Withdraw*, *End turn*. Every button ≥ 44 px; every action has a key, shown on the button (1–9 for attacks and actions: `8` is Body slam; `F` face, `R` roar, `Enter` confirm, `Esc` cancel, `E` end turn).
- **Log**: newest last, each event's `text`; `radio` lines in capitals and monospace; the kaiju's lines in the accent colour. The words come first (REQUIREMENTS section 0): on a phone the log sits directly under the map and shows the last four lines until opened; in two columns it takes the rest of the right column and never shows fewer than four lines. The status tile's portrait, silhouette and bars never scroll away; at laptop heights only its part list scrolls, under them [E1].
- **Forecast sheet** [CMB-1]: target list with hit chance, damage range, and hp after (for a zero-damage panic attack: the pressure and the chance each unit breaks); AP and energy cost; "return fire next phase" summary. On a phone it rises from the bottom with its buttons always in view; in two columns it takes the Status tile's place while it is open. On a phone the portrait and silhouette also sit in the top bar, so they stay in view.

### 11.3 The cutaway [CMB-3..5, UI-9]

An overlay over the map tile. `backdrop(defender's terrain, {structure})` fills it. The attacker's `figure` on the left facing right, the defender's on the right facing left (units with `count` from hp). Name plates and hp bars at the bottom, Fire Emblem fashion. Sequence: 300 ms in; attacker lunges (150 ms); a flash; the number rises over the defender ("MISS" on a miss); the defender's bar falls from `before` to `after`; 600 ms hold; out. About 1.6 s. Tap anywhere skips this scene and the rest of the scenes from the same command or defense phase. With `prefers-reduced-motion`: one still frame with the result, 1.2 s, or tap. Settings: *Cutaways: all / kaiju vs kaiju only / off*. In the defense phase, consecutive attacks on the kaiju by the same unit type are one cutaway with the summed damage [CMB-5]. Kaiju attacks on structures alone do not get a cutaway; the log is enough.

### 11.4 Settings and memory [UI-8]

`localStorage` keys `kaiju-theme` (`system` | `light` | `dark`) and `kaiju-cutaway` (`all` | `kaiju` | `off`), each read and written inside `try`/`catch`, so a private window still plays. Theme tokens on `:root`, the dark set under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and again under `:root[data-theme="dark"]`, as the hedge's page does. Body has an explicit background.

## 12. Tests [G1, G2]

`node --test kaiju/tests/` from the repository root, nothing installed.

- `rng.test.mjs`: the vectors in section 2.
- `hex.test.mjs`: offset ↔ axial round trips; distance; neighbours; line; cone and ray sizes; `arc`.
- `rules.test.mjs`: each command's effects and refusals; part penalties; rear bonus; crush; blast and `reactorBelly`; eat and hunger; berserk; panic; reinforcements; win, loss, time, withdraw; `create` never mutates setup; `step` never mutates its input.
- `ai.test.mjs`: plans are legal and deterministic; panicked units flee; the rival retreats when low.
- `missions.test.mjs`: every mission resolves for seeds 1..20 and every target; maps are 12 × 14; the kaiju can reach a hex adjacent to the objective; units stand on legal hexes.
- `city.test.mjs`: same seed, same city; every road hex is connected; Sidewinder's tell (the boundary row that MazeBuilder's Sidewinder always carves is one unbroken road).
- `art.test.mjs`: every function returns a string that starts with `<svg` or `<g` and has balanced tags; silhouettes have five `data-part` paths.
- `replay.test.mjs`: a fixed seed and command list for each mission gives a fixed final score. If the rules change on purpose, the number changes in the same commit.

The page itself is checked in a browser (Playwright, at 375 × 812 and 1280 × 800): load, set up each mission, move, attack with a cutaway, end a turn, reach the end screen.

## 13. Later formats [PLT-7]

- **PWA**: a manifest and a service worker; the files are already static.
- **Through the hedge's hub**: `rules.step` is the same shape as `Game.act`: command in, events out. A Python port of the rules (or a Node sidecar) could put kaiju behind telnet and WebSocket for hot-seat or network play, with the hedge's transports unchanged.
- **Hex topology for the hedge**: `hex.js` is the "Hex" row in `docs/TOPOLOGIES.md`, half done.
- **Native**: Godot, if the art outgrows SVG.

## 14. Rampage and the review [MIS-8, MIS-9]

The game the 1981 review described, and the review the game writes back.

**Name.** The mode is called **Hex and the City** on the page: eat and smash what you like, until the hangover hits. It was first called Rampage, which is also the name of a 1986 arcade game. Its id stays `rampage` in data, setups, tests and pinned replays, so this section still says Rampage. The end stamp reads "Last call". Everything here keeps the rules in section 6; Rampage only changes how a game ends, what it scores, and how the army comes.

### 14.1 The mission: `rampage` in `data/missions.js`

- **The city.** The Swathe's builder, the same seed rule: harbour to the south, a city grown by Sidewinder, the plant with its pylons, the lab and the stones standing as ordinary structures. The kaiju starts in the harbour.
- **No goal.** `objective: {kind: "none"}`. `goalMet` is never true. `turns: null`: there is no turn limit and no `time` outcome.
- **The question.** `choose: "objective"`: before play the player picks one of the five objectives (14.2). `setup.objective` carries it into `create`; `state.objective.weights` holds it.
- **Starting forces.** Lighter than the Swathe: two artillery on the top avenue, two tanks, four Guard squads on the streets above the waterfront.
- **The waves** [MIS-8 "endless reinforcements that grow"]. `mission.waves`, data:

  ```js
  waves: {
    size: { base: 1, growEvery: 3, max: 4 },    // turn t brings min(max, base + floor((t - 1) / growEvery)) units
    mix: [                                       // the types unlocked by turn t; each unit picks one
      { from: 1, types: ["infantry", "tank"] },
      { from: 3, types: ["helicopter", "artillery"] },
      { from: 6, types: ["jet", "missile"] },
    ],
    scientist: { from: 5, every: 6 },            // one mad scientist on turns 5, 11, 17, …
    edges: ["north", "east", "west"],
    cap: 24,                                     // no wave while 24 units stand (NFR-2)
  }
  ```

  In each defense phase, before the units act, the rules roll a wave with the game's dice (`state.rng`). For each unit they roll a type from the unlocked mix, then a hex on a rolled edge where that type can stand (`nearestFree`). Waves are game events (`reinforce`, `radio`), so they are part of a replay.

### 14.2 The objectives: `OBJECTIVES` in `data/missions.js`

The five from the original manual, as weights on what the kaiju destroyed (`tally.destroyed`, which lists each kill) and on the turns it lasted.

| id | name | structures | units | per turn lasted |
|----|------|-----------|-------|-----------------|
| `balanced` | Balanced | points × 1 | points × 1 | 10 |
| `killer` | Killer Monster | populated: points × 2; others × 0 | infantry: points × 3; others × 0.5 | 0 |
| `combat` | Combat Machine | × 0 | points × 2 | 0 |
| `destruction` | Destruction | points × height | × 0 | 0 |
| `survival` | Survival | × 0 | × 0 | 100 |

Each objective also carries `stars: [s2, s3, s4, s5]`, the totals for two to five stars (one star below `s2`). The balance bot sets them (14.6) so that a greedy bot's median game earns three stars.

### 14.3 The endings, and the Three Deaths

- **Outcomes.** A rampage ends `fallen` or `withdrawn`, never `goal` or `time`. `result.grade` is `"rampage"`, so there is no victory, only a score and a rating.
- **Score.** `result.score = {structures, units, survival, total}`, weighted by the objective. A rampage has no objective, time or parts bonus. `result.objective` names the objective. `result.stars` is 1 to 5 from the thresholds.
- **The death.** `result.death` is `"cuts"`, `"sudden"` or `"lingering"`, or `null` for a withdrawal. The kaiju keeps `lastHurt`, set by every blow that reaches it: `"blast"` (a power structure), `"lingering"` (14.4), else `"attack"`. When the body falls, `lastHurt` names the death: blast → *the sudden death*; lingering → *the lingering death*; attack → *a thousand cuts*. Other missions record `result.death` the same way when the kaiju falls; it costs nothing and the review uses it.

### 14.4 The lingering death, in Rampage

The original's mad scientist left "a progressive paralysis that is fatal even if you then kill the scientist". In Rampage only (`mission.lingeringGrows: true`), at each kaiju phase start:

- if `lingering ≥ 1`, it rises by 1;
- when lingering would push AP below 1, the excess falls on the body as damage, with `lastHurt = "lingering"`, and a `hurt` event (`{actor, who, why: "lingering", damage, part: "body"}`) tells it.

Elsewhere lingering stays as in 4.4.

### 14.5 The review: `review(state, events)` in `voice.js`

A pure function of the final state and **every** event of the game, in order. It is deterministic and draws no dice, like the rest of the voice. It works for any mission, not only Rampage.

```js
export function review(state, events) // -> {magazine, issue, title, dek, byline, paragraphs: [3 or 4 strings], quote, stars, ratingText, text}
```

- **The magazine** is invented: *Cassette & Disk Monthly*. No real magazine, writer or company is named, apart from the game it imagines reviewing, *Crush, Crumble and Chomp!*, named once as the model.
- **Paragraph 1, the setup:** the monster, its epithet and mutations, the mission (and the objective in a rampage).
- **Paragraph 2, what it did:** structures destroyed by kind (with the tallest), units by kind, how many were crushed underfoot and how many eaten, the biggest single blow (the player's attack event with the most damage), and the attack used most.
- **Paragraph 3, what stopped it:** the death by name, or the withdrawal, the goal or the clock. The unit type that did the kaiju most harm, and the turns it lasted.
- **Paragraph 4, the verdict:** the quote, a line from the game's own log, verbatim, in quotation marks. It is the `text` of the player's biggest blow, or, if there was none, the last `radio` line. Then the rating.
- **Rating:** stars as `★★★☆☆`, and a one-line verdict per star count. In the other missions, stars come from the grade: total victory 5, victory 4, draw 3, defeat with a score above 500: 2, else 1.
- **`text`** is the whole review as plain text, ready to copy.
- **Voice:** a 1981 games column: earnest, specific, a little dry. The house rules still hold: short sentences, concrete nouns, no exclamation marks.

### 14.6 The page, the bot and the tests

- **Setup.** A fourth mission card, *Hex and the City* (id `rampage`). Its question is the objective: five choices, each with a one-line description.
- **Top bar.** "Turn 7" with no limit. The goal reads "No goal but the score: Destruction", naming the objective.
- **End screen.** The front page as now, with the death named in the deck line. Below it, *The review*: the column set as a magazine page, with **Copy as text**. The copy uses `navigator.clipboard.writeText` inside `try`/`catch`, and falls back to selecting a read-only `<textarea>`. Every mission gets the review.
- **The event record.** The page keeps every event of the game in order, cleared on Deploy, Again or New seed. `review` reads it.
- **`rules.replayEvents(setup, commands) -> {state, events}`.** The same as `replay`, plus every event, for tests and the bot.
- **The bot.** `tools/sim.mjs` plays `rampage` to the end (it withdraws never; a guard ends a run at turn 60). It prints, per objective, the median total and turns lasted. Those set the `stars` thresholds.
- **Tests** (`tests/rampage.test.mjs`, `tests/review.test.mjs`):
  - Rampage resolves for seeds 1–20.
  - It never ends on time.
  - Waves grow and stop at the cap.
  - Each objective weighs a hand-made tally as the table says.
  - Each of the Three Deaths is reachable and named.
  - Lingering grows in Rampage and not elsewhere.
  - The review is deterministic for a replay, has three or four paragraphs and no exclamation marks, and quotes a line that is in the events.
  - The `text` holds every paragraph.
  - A rampage replay pins its score and death.
  - NFR-1's weight test still passes.

## 15. Variants [VAR-1..7]

### 15.1 Data: `src/data/variants.js`

```js
export const VARIANTS = {
  meowthprrtep: {
    id: "meowthprrtep", of: "squamous",
    name, epithet, blurb,                   // shown on the card, in the log, the paper and the review
    parts: { head: { name: "Ears" }, … },   // names only; a part not listed keeps its base name
    attacks: { grab: { name: "Paw grab" }, … },  // names, and numbers if VAR-4 (see below)
    change: { … },                          // optional: the numbers this variant changes (15.2)
    preset: ["hide"],                       // optional: the mutation build it starts with (VAR-5)
  },
  …
};
export const LOOKS = { radiosaur: ["radiosaur", "mekkasaurus"], … };  // per kaiju, base first, at most four
export function kaijuDef(id, variant = null)  // the base def, or the base with the variant laid over it
```

- `kaijuDef` returns a frozen object with the same shape as `KAIJU[id]`, plus `look` (the art id: the variant id, or the base id) and `variant` (or `null`). It caches by `id:variant`.
- It throws for an unknown variant, an inherited name (`Object.hasOwn`), or a variant that is not `of` this kaiju.
- `kaijuDef(id)` with no variant returns a def deep-equal to `KAIJU[id]`, plus `look: id, variant: null`.

### 15.2 What a variant may change

`change` lays over the base, field by field:

- `ap`, `armor`;
- `parts.<slot>.hp`;
- `energy` (whole object: `max`, `start`, `rule`), `hunger` (an object, or `null` for no hunger);
- `attacks.<id>`: any of `ap`, `energy`, `range`, `damage`, `accuracy`, `effects`. Attack ids, patterns, kinds and the parts they use do not change, so the AI and the page need no new cases;
- `passives`, `forbid` (whole arrays).

It may not add or remove a part or an attack. The rules already key the battery, the tide and panic from `energy.rule`, so a robot tyrannosaurus is a data change.

### 15.3 The rules

- `create(setup)` reads `setup.variant` (optional, default `null`) and `setup.rivalVariant` (optional). It stores `variant` on the kaiju and the rival.
- Every read of `KAIJU[x.id]` in `rules.js`, `ai.js`, `voice.js`, `ui/` and `tools/sim.mjs` goes through `kaijuDef(x.id, x.variant)`. A grep for `KAIJU[` outside `data/` finds none afterwards.
- A variant's `preset` is used when `setup.mutations` is absent. The budget and `forbid` apply to it as to any build.
- Events keep carrying the base `id` (so the AI and tests stay simple) and gain `variant` where they carry `id`. Text uses the variant's names.

### 15.4 The first four [VAR-6]

| Look | Of | Names | Numbers |
|---|---|---|---|
| **Meow'thprrtep**, *the first drawing* | squamous | Ears (head), Paws (arms), Coat (body), Footing (legs), The Eye (aux). Paw grab, The stare, Wrong angle. | None. |
| **Mekkasaurus Prime**, *the atomic tyrannosaurus, rebuilt* | radiosaur | Sensor head, Grapples, Hull, Legs, Tail. Steel jaw, Tail flail, Reactor beam. | Armor 3, AP 5. Energy on a battery: `{max: 12, start: 12, rule: "battery"}`, no hunger. Passives `reactorBelly`, `noHunger`. Forbid `regen`, `gut`. |
| **The Alien Colossus**, *from the stars* | thalassor | Crowned dome, Arms, Shell, Legs, Energy flail. Fist, Flail cast, Ion surge. | None. It still draws its energy from water: coolant, as the blurb says. |
| **Gekido-Oh**, *the empire's iron general* | dairengo | Helm, Arms, Chassis, Legs, Thrusters. Iron fist, Dark blade, Total conquest. | Preset build `hide`, `bulk` (or the nearest two allowed mutations that cost 3 points between them; the engine builder checks). |

- **Meow'thprrtep's blurb** quotes the art department's note, which is true: the first Squamous head was drawn, and the agent drawing it wrote *"The Squamous head reads as a cat (two ear spikes)."* It was redrawn. This look restores it, with paws at the ends of the feelers.
- Nothing copies a known film monster or robot. Mekkasaurus Prime is a machine copy of *our* tyrannosaurus, and its art says so: the same stance and plates, in riveted steel.

### 15.5 Art

- `src/art/kaiju.js`'s exported functions take a **look** id as well as a kaiju id: `portrait(look, {parts})`, `silhouette`, `figure`, `token`. `KAIJU_IDS` is unchanged; `LOOK_IDS` lists all eight.
- The variants' drawings live in `src/art/variants.js`, built with the same helpers (export what is shared from `kaiju.js`). Each has its own palette that reads on both themes.
- **Meow'thprrtep** starts from the first Squamous drawing, recovered from the art agent's work: the head with two ear spikes. Add paws at the feelers' tips. Keep the eyes that do not agree.
- **Mekkasaurus Prime**: Radiosaur's outline in steel plates, rivets, a visor where the eyes were, the dorsal plates as vents with a glow.
- **The Alien Colossus**: Thalassor's stance; a domed head, a shell in place of bronze armour, a flail on a chain of light in place of the trident; a chrome and violet palette.
- **Gekido-Oh**: a sentai robot of the other side: a horned helm, a red visor slit, black and gunmetal with gold trim.
- Silhouettes keep the base's part layout (`data-part` paths in the same places), so the damage patterns read the same way.
- `art.html` shows every look in every state.

### 15.6 The page

- **Look swatches.** Under the chosen kaiju's card: a row of up to four buttons, each a small portrait, with `aria-pressed` and the look's name as its label. Arrow keys move between them. Choosing one redraws the card and fills a preset build, if the look has one, when the player has not yet chosen mutations.
- The summary line names the look. Deploy passes `variant` in the setup. The choice is remembered with the kaiju for Again and New seed.
- The status tile, the board token, the cutaway, the paper and the review all draw and name the look.
- The rival in the Coast mission keeps its base look in this change.

### 15.7 The bot and the tests

- `tools/sim.mjs` takes `kaiju:variant` wherever it takes a kaiju id: `node kaiju/tools/sim.mjs 1-20 radiosaur:mekkasaurus`.
- `tests/variants.test.mjs`:
  - `kaijuDef` with no variant equals the base; with each variant it has the base's shape, ids and patterns.
  - Unknown, inherited and wrong-kaiju variants throw.
  - **VAR-3:** for each variant with no `change`, a bot game on seeds 1–5 gives the same event kinds and numbers as its base; only text differs.
  - Mekkasaurus Prime has no hunger, drains its battery and charges beside power.
  - A preset build is used when `mutations` is absent, and obeys the budget and `forbid`.
  - The log, the paper's headline and the review name the variant, and never the base, for a variant game.
  - Every look draws: portrait, silhouette (with five `data-part` paths), figure and token, as well-formed SVG.
- The pinned replays do not move. NFR-1's weight test still passes.

## 16. Blast risk: the bot weighs it, the page warns first [KAI-10; issue #25]

### 16.1 What playtest 001 showed

The bot already avoided power structures, with one exception: the mission's **objective**. `moveCommand` and `strikes` in `tools/sim.mjs` both let the bot enter, teleport onto or stomp `state.objective.at`. On the Swathe with the power plant as the target, the bot's Squamous One teleported onto the plant with Wrong angle, broke it and died of the blast (playtest 001, seed 39724). Any attack but a stomp breaks a power structure safely (§6, `strikeStructure`), so the bot had a safe way it did not take.

The rules stay as they are: entering, stomping or eating a power structure sets it off.

### 16.2 The rules: `blastRisk(state, key, actor = "kaiju")`

A new query in `rules.js`. For a hex holding a power structure it returns what setting it off would do to this actor; otherwise `null`.

```js
{ type: "plant", name: "Power plant", damage: [6, 9] }        // most monsters
{ type: "plant", name: "Power plant", energy: 5 }             // a monster with reactorBelly
```

- `damage` is `STRUCTURES[type].blast`; `energy` is `RULES.reactorBlastEnergy`. Both come from the data the rules use, so the warning cannot disagree with the result.
- `lethal: true` is added when the top of the blast range could finish the monster: it is at least the body's hit points. A blast hits a rolled part and can spill to the body, so this is the cautious reading.

### 16.3 The bot

- **The objective is no longer exempt.** Before it enters, teleports onto or stomps a power structure, the bot asks `blastRisk`:
  - a lethal blast is never taken;
  - a survivable blast on the objective is taken only when no safe way to break the objective is in reach this turn. A safe way is any attack, not a stomp, whose forecast can reach the objective.
- **Safe first.** When the objective is a power structure, the bot values attacks on it above entering or stomping it.
- **A monster with `reactorBelly` (Radiosaur, Mekkasaurus Prime) is unchanged.** It wants the blast.
- Eating a power structure follows the same rule (`eatCommand` already refuses non-objective power).

### 16.4 The page

- When the player picks a **move, Wrong angle, stomp or eat** target that would set off a power structure, the hint bar and the forecast sheet (where one shows) say so before the player confirms. The words come from `voice.js`:
  - most monsters: "Landing here sets off the power plant: 6–9 damage.", or "Stomping it sets off…" and "Eating it sets off…" for the other verbs;
  - lethal: the same, plus "It could be the last thing the monster does.";
  - `reactorBelly`: "Landing here sets off the power plant: +5 energy." This is good news, so it is not styled as a warning.
- As built, from reading `rules.js`: a stomp sets off a power structure only when it brings the structure down (§6.1), so the page says nothing for a stomp on a whole plant (3–4 damage against 6 hp), and says "may set off" when only the top of the forecast fells it. A walk sets off every power hex on its path, so the words name all of them ("Walking there sets off the pylon and the power plant: 8–12 damage in all."). Eating a power structure is not a blast: a `reactorBelly` monster is told "+6 energy" (`RULES.reactorEatEnergy`), and no other monster can eat one.
- Lit target hexes that would blast carry a small mark, so a player sees the risk before tapping.
- The words and marks also read with no colour (UI-4).

### 16.5 Tests and numbers

- `blastRisk` for a plant, a pylon, a plain hex, a `reactorBelly` monster, and the lethal threshold.
- **The bot, playtest 001's setup:** on seed 39724, Squamous with gut, reserves and bulk on swathe:plant, the bot does not take the blast. Run `node kaiju/tools/damage.mjs 39724 squamous+gut+reserves+bulk swathe:plant` before and after.
- **The bot still feeds Radiosaur:** it still enters power structures when that pays.
- **The page:** the forecast for a move or stomp onto a power hex reports the range, and the result then matches it.
- **Balance, before and after:** `node kaiju/tools/sim.mjs 1-20` and `node kaiju/tools/sim.mjs 21-60 squamous swathe:plant`. The pinned replays use recorded commands, so they do not move. The bot's numbers do.
- **Version** 0.3.1, with a CHANGELOG entry.

## 17. Rival reach: no living monster is left unable to fight [KAI-11; issue #27]

### 17.1 What playtest 002 showed

Playtest 002 was Dai-Rengō against the Squamous One on the Coast, seed 39724. The player fought the rival and left the army alone. Dai-Rengō used Final formation on turn 3. Its arms were crippled after that, and it fell on turn 8 with nothing it could do to the rival.

The cause is the data, not the dice. A crippled part's attacks are refused (`attackBlocked`), and `stompTargets` allows structures and ground units only. Damaging attacks by part (`src/data/kaiju.js`):

| Kaiju | Damaging attacks |
|---|---|
| Radiosaur | head (Bite, Atomic breath), aux (Tail sweep) |
| Thalassor | arms (Fist, Tidal surge), aux (Trident cast) |
| The Squamous One | arms only (Tentacle grab) |
| Dai-Rengō | arms (Rocket punch, Beam sword), body (Final formation, once a mission) |

So the Squamous One with its feelers crippled, or Dai-Rengō with its arms crippled after its finisher, is alive and cannot hurt the rival. On the Coast the rival is the objective. KAI-3 says a crippled part is "at its worst", not that the monster stops playing.

### 17.2 The test [KAI-11]

For every kaiju and every variant (`kaijuDef(id, variant)`):
- with any one of head, arms, legs or aux crippled (hp 0);
- with its once-a-mission attacks spent;
- with full energy, and the AP the rules give with that part crippled: the kaiju's AP less the legs' penalty (`RULES.legsAp`), never below 1, and no hunger or empty battery (§17.8 reads this);
- with the rival in an adjacent hex, in any of the six directions;

there is a legal command, or a free turn followed by one, that can damage the rival: a forecast with a hit chance above 0 and a top damage above 0. The body is not in the list, since a body at 0 ends the mission. The test is `kaiju/tests/reach.test.mjs`.

**Narrowed in the build.** This section first said "with full AP and full energy". The slam costs 2 AP, and the AP rules can leave a kaiju with 1, so that reading was dropped for the one above: the AP the rules give with the one part crippled, and no hunger and no empty battery. That is a weaker test than the one first written. §17.8 says what it leaves open.

### 17.3 Four directions, tried as data

Each direction was built on its own copy of 87bad43 and measured with the bot. Only the one recommended goes into this PR. The other three are kept as patches in `kaiju/docs/experiments/rival-reach/`, whose README gives the commands, so the owner can check their numbers and choose another.

- **A. Stomp a kaiju.** `stompTargets` also offers an adjacent kaiju. A stomp on a kaiju is a kick or body check: `RULES.stompDamage` (3–4), 1 AP, and `kaijuAccuracy` (head damage, eldritch and cover apply). Crippled legs cannot stomp a kaiju. A stomp on a unit or structure is unchanged, so the pinned replays hold.
- **B. A crippled part still swings, badly.** `attackBlocked` no longer refuses a crippled part. Its attacks take `RULES.crippledAccuracy` (−30) and do half damage (`RULES.crippledDamage`, rounded down, at least 1). This is the plainest reading of KAI-3.
- **C. A second damaging part for the two that lack one.** This is data only:
  - Dai-Rengō gains a thruster ram (aux, melee, 2 AP, 1 energy, 2–4).
  - The Squamous One's gaze does 1–2 damage as well as its panic.
  - This changes each monster's character.
- **D. A body slam for everyone.** A rules-level action like stomp, using the body: 2 AP, 2–4 damage, accuracy 80, an adjacent kaiju only. The body cannot be crippled, so the slam is always there.

The rival plays by the same rules. For A and D, `planRival` (`src/ai.js`) learns the new action, so the change is not the player's alone.

### 17.4 The bot: a hero mode

The bot attacks whatever pays best, the army included. That is not how a person played playtest 002. So `tools/sim.mjs` gains a hero mode, set by the cell `coast:<rival>:hero`:
- it strikes only what damages the rival;
- it moves toward the rival;
- it still eats when hungry, since hunger costs AP;
- it never targets units or structures for their own sake.

The bot also counts **stuck turns**: turns in which the player's monster was next to the rival with AP left and had no legal damaging action against it. Before this change, stuck turns are what playtest 002 felt like. After it, the KAI-11 test says they cannot happen, bar the two open cases in §17.8 (crippled legs with hunger, and crippled legs with an empty battery).

### 17.5 Measuring

For each direction, and for the code before any of them:
- `node kaiju/tools/sim.mjs 1-20 all coast:<rival>` and `node kaiju/tools/sim.mjs 1-20 all coast:<rival>:hero`, for each of the four rivals;
- the same on seeds 21–60, held out;
- `node kaiju/tools/sim.mjs 1-20` for the other missions, which should barely move.

These are the bot's numbers, a floor rather than a forecast.

### 17.6 Choosing

1. It passes the §17.2 test for every kaiju and variant.
2. It changes the four characters least. A rule shared by all is better than new attacks for two.
3. It moves the non-Coast numbers least.
4. It brings the hero bot's stuck turns to 0.

### 17.7 The page, motion and version

- **The page:** a stomp on a kaiju (A) or a slam (D) shows in the forecast sheet like any attack. A crippled attack (B) is no longer greyed out. Its button says "crippled" and the sheet shows the penalty.
- **Motion:** a slam on a kaiju plays the existing kaiju-against-kaiju cutaway (`src/ui/cutaway.js`), titled by `RULES.slamName`. It needs nothing new. `kaiju/tests/slam-page.test.mjs` checks that `planScenes` and `buildScene` give it a scene in the "all" and "kaiju" modes. Run the smoke script with the cutaway on (the default) as well as off.
- **Version:** 0.4.0, since this is a balance change with a feature behind it. It gets a CHANGELOG entry.

### 17.8 As built and measured

**D was built**: a body slam for every kaiju. The four directions are compared in the PR (#27); this is the reason for the choice, by the §17.6 rules.
- **It passes the test as narrowed in §17.2, and no more.** `node --test kaiju/tests/reach.test.mjs` runs §17.2 for every kaiju and look, in the six directions, with the AP the rules give, no hunger and no empty battery: no failing case there. It does not pass for crippled legs plus hunger or an empty battery (below): the same command reports 48 and 72 failing cases in two todo tests, 120 in all.
- **It changes the four characters least.** No monster gains or loses an attack. The slam is one rule that all of them share, and it takes the body, which cannot be crippled.
- **It moves the non-Coast numbers least.** The slam needs a rival, and only the Coast has one. The fortress, swathe and rampage cells and their replays do not move.
- **The hero bot's stuck turns fall, but not to 0. Criterion 4 of §17.6 is not met.** `stuck0` is the column that counts the KAI-11 case: turns beside the rival with no damaging command even at the AP the rules gave. In the worst cell of `node kaiju/tools/sim.mjs 1-20 all coast:<rival>:hero` it is 3.15 a game before the slam (at 87bad43) and 0.80 after (Thalassor against Thalassor). Across the sixteen cells it is 30 turns in 320 games after (26 Thalassor, 4 Dai-Rengō; the column is a mean over 20 games, so a mean of 0.30 is 6 turns). On the held-out seeds, `node kaiju/tools/sim.mjs 21-60 all coast:<rival>:hero`, it is 52 turns in 640 games (31 Thalassor, 21 Dai-Rengō), and 0.63 a game in the worst cell. These are the bot's numbers, simulated. `stuck` still counts turns that end with 1 AP left, which a slam (2 AP) cannot use; it is not the KAI-11 measure.
- **The win rates are not evidence for the slam.** A move under about 15 points on 20 seeds is noise. The hero bot's mean win rate over the four monsters, by rival, at 87bad43 and now: the Squamous One 54% to 65%, Radiosaur 49% to 53%, Thalassor 35% to 35%, Dai-Rengō 29% to 34% (`node kaiju/tools/sim.mjs 1-20 all coast:<rival>:hero`). Only `stuck0` supports the change. One classic cell does move beyond the band: the Squamous One as the player's monster on the Coast, rival left to chance, falls from 55% to 40% (`node kaiju/tools/sim.mjs 1-20 squamous coast`). The rival slams too.

What is built:
- `RULES.slamName` ("Body slam"), `slamAp` (2), `slamDamage` (2–4) and `slamAccuracy` (80) in `src/data/kaiju.js`. The rules code holds none of them.
- `slamTargets`, the `{t: "slam", target}` command (§6), `forecast(state, "slam", hex)`, and a "Body slam" row in `actions(state)`.
- It strikes a part of the other kaiju by roll, as any kaiju attack does. Head damage and eldritch skin change its accuracy; crippled arms do not weaken it, since it is not a melee attack of the arms.
- The rival plans it (`planRival`), and `otherKaijuThreat`, which the forecast's return fire reads, counts it.
- The page: a button on key 8, the adjacent kaiju lit, a forecast sheet like any attack's, and a log line in `voice.js`, chosen by turn and hex, never by a die.

**The AP reading.** The KAI-11 test gives a kaiju the AP the rules give it with the one part crippled and the legs' penalty taken, with no hunger and no empty battery. A slam costs 2.

**Open question for the owner: crippled legs and a second AP penalty.** The AP rules are not changed in this PR. Crippled legs take 3 AP (`RULES.legsAp`). One more penalty (hunger at 70% or more, `RULES.hungryAp`; an empty battery, `RULES.batteryEmptyAp`) leaves the 1 AP of the floor in `computeAp`, and a slam costs 2. So the monster can stand beside the rival and do nothing, as in playtest 002, one level down. Two todo tests in `kaiju/tests/reach.test.mjs` hold it open; `node --test kaiju/tests/reach.test.mjs` reports them:
- "KAI-11 (open): crippled legs and hunger…": 48 failing cases, Thalassor and the Alien Colossus, each against four rivals in six directions;
- "KAI-11 (open): crippled legs and an empty battery…": 72 failing cases, Dai-Rengō, Gekido-Oh and Mekkasaurus Prime, the same way.

The hero bot meets both: the `stuck0` column of `node kaiju/tools/sim.mjs 1-20 all coast:<rival>:hero` is above 0 only for Thalassor and Dai-Rengō. The choice is the owner's:
- slam costs 1 when the kaiju has 1 AP left (a data change, `slamAp`, and a rule);
- hunger never takes the last AP;
- leave it, since a starving monster with crippled legs is meant to be in trouble, and say so in KAI-11.

## 18. Soft body: the Squamous One lasts by another route [KAI-12; issue #24]

### 18.1 What playtest 001 showed

Playtest 001 was the Squamous One with iron gut, deep reserves and bulk, on the Swathe, seed 39724. It took 39 damage and fell on turn 2. The other three monsters last by **armor**: each hit loses points. The Squamous One has armor 0. It has **eldritch**, −10 accuracy for anything that shoots at it, and **regen**, 1 hit point a turn on its worst part. Expected damage per shot, by the computation in #24 (hit chance × mean of `max(1, roll − armor)`, from `src/data/units.js` and §6.2):

| Shooter (damage, accuracy) | Squamous today | Armor 2 |
|---|---|---|
| Tank (2–4, 65) | 1.65 | 0.87 |
| Artillery (3–5, 65) | 2.20 | 1.30 |
| Infantry (1–2, 60) | 0.75 | 0.60 |

The heavy guns do about twice as much to it. The bot hides this because it sprints with Wrong angle and avoids fights (#24). A person fights.

### 18.2 The aim

A soft, regrowing horror lasts as long as bronze, steel or scales, by a different route. Its weakness is one a player can learn. It is not a trap. Meow'thprrtep, the variant, plays by the same rules (§15).

### 18.3 Directions, tried as data

Each is a passive in `src/data/kaiju.js`, with its numbers in `RULES`. Each is built on its own copy of the branch and measured. The ones not chosen are kept as patches in `kaiju/docs/experiments/soft-body/`, as for §17.

- **Armor under another name (the yardstick).** Armor 1, then armor 2. It makes the monster play like the other three, which is what #24 wants to avoid. It is measured only to give the others a target.
- **Blow-through.** No single hit does more than `RULES.blowThroughCap` (2) to it. Armor blunts many small hits; this blunts a few big ones. The heavy guns become the weak answer to a blob.
- **Phase-out.** A hit that lands still has `RULES.phaseOut` (25%, and 40% as a second try) to pass through. The rules roll it on the seeded dice, after the hit roll. The event says so (`phased: true`), and the log tells it: "The shell passes through where the Crown was a moment ago." A power structure's blast does not phase out, so §16's warnings stay true.
- **Unravel and reform.** A part other than the body brought to 0 does not cripple. It **unravels**: it is gone, with its attacks and effects, and a hit on it goes to the body, as a hit on a crippled part does now. At the start of the monster's phase, a part that has been unravelled for `RULES.reformTurns` (2) of its phases reforms at half its hit points, rounded up, for `RULES.reformEnergy` (3) energy. With too little energy it waits. Its energy comes from panic, so the army that breaks feeds its comeback. Regen does not heal an unravelled part; it heals the worst of the others.
- **The mix the brainstorm suggests:** phase-out at 25% plus unravel and reform.

### 18.4 Measuring

For each direction and for the code before any of them. These are bot numbers, a floor rather than a forecast.
- `node kaiju/tools/sim.mjs 1-20 squamous` and `node kaiju/tools/sim.mjs 21-60 squamous`: every mission.
- `node kaiju/tools/damage.mjs 39724 squamous+gut+reserves+bulk swathe:plant`: playtest 001's setup.
- `node kaiju/tools/sim.mjs 21-60 dairengo coast:squamous`: playtest 002's rival must stay a threat.
- `node kaiju/tools/sim.mjs 1-20 all coast:squamous:hero`: the rival again, fought monster to monster (§17.4).
- Damage taken per turn survived, from `damage.mjs` over the same seeds. The bot sprints, so turns survived matter more than its win rate.

### 18.5 Choosing

1. It is not armor by another name.
2. Against the army, it lasts about as long per turn as an armor-2 monster.
3. As the Coast rival it is still a threat. Playtest 002 was close.
4. It tells the player what happened, in the log, so the weakness can be learned.
5. It moves no other monster.

### 18.6 The page, the voice and the version

- **The setup card** says the monster must not stand and trade blows, and names the passive in plain words. "Eldritch: harder to hit." undersells it, and gets plainer words.
- **The voice:** every phase-out is a log line, chosen by a hash. An unravelling and a reform are log lines.
- **The silhouette:** an unravelled part shows like a crippled one, with its own mark.
- **Version:** 0.5.0, with a CHANGELOG entry.

### 18.7 As built and measured

**Phase-out at 25%, alone, was built.** The table of directions is in the PR (#24); the others are patches in `kaiju/docs/experiments/soft-body/`, with the commands. Bot numbers, simulated, so a floor and not a forecast. Seeds 21-60 unless said. The built numbers are from `node kaiju/tools/toughness.mjs 21-60 squamous`, `node kaiju/tools/sim.mjs 21-60 squamous` and `node kaiju/tools/sim.mjs 21-60 dairengo coast:squamous`, and the same commands on ba639f2 for the "before".
- **It lasts longer by luck, which is not armor (§18.5 item 1).** It takes 6.20 damage a turn and lasts 4.3 turns, against 8.58 and 3.9 before. Armor 2 takes 4.12 and lasts 4.3, and it lets the bot win 99% of its games. The log says every phase-out (item 4).
- **Item 2 is met on turns, not on damage a turn.** The turns match armor 2. The damage a turn is 6.20, not 4.12: it is softer than armor, and it must not stand and trade blows (KAI-12), which is what the card says.
- **The rival stays a threat, not a wall (item 3).** Dai-Rengō wins 35% against a Squamous rival on the Coast, from 53%. Armor 2 leaves 5%, blow-through 0%.
- **Why not the others.** Unravel and reform leave the damage a turn at 8.58, and only make the rival harder (25%). The mix takes 6.12 a turn, as phase-out alone does, with a harder rival (23%) and a second rule to learn. 40% takes 4.77 a turn and the bot wins 90%.
- **The bot's Squamous One is now the strongest of the four,** 81% on `node kaiju/tools/sim.mjs 1-20`, against 57% to 65% for the others. The bot plays greedy, and its numbers are a floor for a careless player, not a forecast for a good one. If the owner finds it too strong, the rate below is the lever. Playtest it before judging it.
- **Playtest 001's seed:** the bot's Squamous One now wins on turn 2 with 28 damage taken, where it fell on turn 3 with 40 (`node kaiju/tools/damage.mjs 39724 squamous+gut+reserves+bulk swathe:plant`). One game, and not the human's.

**The forecast keeps the hit chance and reports the phase beside it.** `forecast(...)` rows (targets, the slam, return fire) carry `hitChance`, the chance to land, and `phase`, the percent of landed hits that pass through. The sheet shows "75% to hit, and one in four of the hits pass through". The figure "About N damage" in the return fire counts the phase and says so. The bot's expected value scales by `1 − phase`. Folding the two into one hit chance was tried in the mix patch. It hides what the player is deciding: how often a blow lands, and how often a landed blow is wasted.

**What the event carries.** A phased hit is `hit: true, phased: true, damage: 0`, with the part it crossed. Choosing that part is one more roll, so the log can name it from data and the voice rolls nothing. A kaiju with the passive rolls the phase die for every landed hit, so a seeded game moves even when no hit in it phased. The Coast replay is re-recorded for that (`replay.test.mjs`), and the playtest 001 blast test now pins what it meant: the bot takes no lethal blast (a survivable one on the objective is allowed by §16.3). A blast never phases.

**The other monsters move only through the Coast.** Plain `coast` picks the rival by seed, and for Radiosaur it is the Squamous One in 5 of seeds 1-20 (the command is in the experiments README). Their Coast rows in `node kaiju/tools/sim.mjs 1-20` move for that reason, and no other row does. §18.5 item 5 holds for stats and rules, not for that row.

**The rate is one number, for the owner to tune.** `RULES.phaseOut` (25) in `src/data/kaiju.js`. The card, the sheet, the bot, the forecast and the tests read it. The phase and rules tests pass at 10, 25, 40 and 60; the Coast replay is pinned at 25 and moves with it, as it should. 40 was measured (above); nothing between 25 and 40 was.
