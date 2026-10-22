# Soft body: the other directions, as tried (#24)

DESIGN §18.3 names ways to make the Squamous One last as long as the armored three, by a route of its own. Each was built on its own copy of commit ba639f2 and measured with the bot. **Phase-out at 25% was chosen and is built on the branch** (§18.7), so it has no patch here. The others are kept as patches, so their numbers in the PR can be checked.

| Patch | Direction |
|---|---|
| `armor-2.patch` | The yardstick: `armor: 2` for the Squamous One. One line of data. It makes the monster play like the other three, which is what #24 wants to avoid. |
| `blow-through-cap-2.patch` | Blow-through. No single hit does more than `RULES.blowThroughCap` (2) to it. |
| `phase-out-40.patch` | Phase-out as built, with `RULES.phaseOut` at 40 instead of 25. The only difference from the first cut of the built direction is that number. |
| `unravel-and-reform.patch` | Unravel and reform. A part brought to 0 unravels instead of crippling, and reforms after `RULES.reformTurns` (2) of the monster's phases for `RULES.reformEnergy` (3). It carries its own test, `kaiju/tests/unravel.test.mjs`. |
| `mix-phase-out-and-unravel.patch` | The brainstorm's mix: phase-out at 25 plus unravel and reform. Its phase-out is its own cut, not the built one: it folds the chance into the hit chance the forecast shows. |

All five apply to ba639f2, and only to it. They do not re-pin the tests that move with them (the Coast replay, the playtest 001 blast test): run the suite and expect those to fail, as the PR says.

## Reproduce a direction's numbers

From the repository root, on a branch that has this folder:

```
git worktree add ../exp ba639f2 --detach
git -C ../exp apply "$PWD/kaiju/docs/experiments/soft-body/phase-out-40.patch"
cd ../exp
node kaiju/tools/toughness.mjs 21-60 squamous
node kaiju/tools/sim.mjs 21-60 squamous
node kaiju/tools/sim.mjs 21-60 dairengo coast:squamous
node kaiju/tools/damage.mjs 39724 squamous+gut+reserves+bulk swathe:plant
node kaiju/tools/sim.mjs 1-20 all coast:squamous:hero
```

Run the same commands without a patch for the baseline, and on the branch for the built direction.

- `toughness.mjs` plays 200 bot games (5 missions, 40 seeds) and prints the turns the Squamous One lasted and the damage it took a turn, with the damage a shot for each kind of shooter. It is the measure of durability: the bot sprints, so its win rate says less.
- `sim.mjs 21-60 squamous` is the bot's win rate in the Squamous One on seeds the choosing did not use.
- `sim.mjs 21-60 dairengo coast:squamous` is Dai-Rengō against a Squamous rival on the Coast: playtest 002's case, which must stay a threat and not become a wall.

These are the bot's numbers, simulated. A move under about 15 points of win rate on 20 seeds is noise.

**Plain `coast` leaves the rival to the seed.** For Radiosaur on seeds 1-20 the rival is the Squamous One in 5 games, Dai-Rengō in 8 and Thalassor in 7. So any change to the Squamous One's durability moves the Coast row of the other monsters in `node kaiju/tools/sim.mjs 1-20`, though nothing in their own data changed. The count:

```
node --input-type=module -e 'import { create } from "./kaiju/src/rules.js"; import { resolveMission } from "./kaiju/src/data/missions.js"; const n = {}; for (let seed = 1; seed <= 20; seed++) { const r = create({ kaiju: "radiosaur", seed, mission: resolveMission("coast", { seed }) }).rival.id; n[r] = (n[r] || 0) + 1; } console.log(JSON.stringify(n));'
```
