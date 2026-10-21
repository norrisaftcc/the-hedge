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
export function actions(state)                            // [{id, name, ap, energy, enabled, why}] for move, face, each attack, stomp, eat, roar, withdraw, end
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
desktop / landscape (≥ 900 px)          phone portrait (< 900 px)
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
- **Actions**: one button per `actions(state)` entry: name, AP cost, energy cost, disabled with its `why` as a title and a visible line. Modes: *Move* (default when nothing else is chosen: reachable hexes lit; tap a hex shows path and cost; tap again or *Confirm* to go), *Face* (six arrows around the kaiju), an attack (targets lit; tap a target opens the *Forecast* sheet with *Confirm* and *Cancel*), *Stomp*, *Eat* (adjacent targets lit), *Roar*, *Withdraw*, *End turn*. Every button ≥ 44 px; every action has a key, shown on the button (1–9 for attacks and actions, `F` face, `R` roar, `Enter` confirm, `Esc` cancel, `E` end turn).
- **Log**: newest last, each event's `text`; `radio` lines in capitals and monospace; the kaiju's lines in the accent colour. On a phone it is a drawer showing the last two lines until opened.
- **Forecast sheet** [CMB-1]: target list with hit chance, damage range, and hp after; AP and energy cost; "return fire next phase" summary.

### 11.3 The cutaway [CMB-3..5, UI-9]

An overlay over the map tile. `backdrop(defender's terrain, {structure})` fills it. The attacker's `figure` on the left facing right, the defender's on the right facing left (units with `count` from hp). Name plates and hp bars at the bottom, Fire Emblem fashion. Sequence: 300 ms in; attacker lunges (150 ms); a flash; the number rises over the defender ("MISS" on a miss); the defender's bar falls from `before` to `after`; 600 ms hold; out. About 1.6 s. Tap anywhere skips. With `prefers-reduced-motion`: one still frame with the result, 1.2 s, or tap. Settings: *Cutaways: all / kaiju vs kaiju only / off*. In the defense phase, consecutive attacks on the kaiju by the same unit type are one cutaway with the summed damage [CMB-5]. Kaiju attacks on structures alone do not get a cutaway; the log is enough.

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
