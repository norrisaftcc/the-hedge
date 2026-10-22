# Soft body: the other directions, as tried (#24)

DESIGN §18.3 names ways to make the Squamous One last as long as the armored three, by a route of its own. Each was built on its own copy of commit ba639f2 and measured with the bot. **Phase-out at 25% was chosen and is built on the branch** (§18.7), so it has no patch here. The others are kept as patches, so their numbers in the PR can be checked.

| Patch | Direction |
|---|---|
| `armor-2.patch` | The yardstick: `armor: 2` for the Squamous One. One line of data. It makes the monster play like the other three, which is what #24 wants to avoid. |
| `blow-through-cap-2.patch` | Blow-through. No single hit does more than `RULES.blowThroughCap` (2) to it. |
| `phase-out-40.patch` | Phase-out at 40, as a **first cut**, not the built code. A phased hit has `part: null` and there is no hit-location roll, so it rolls one die less per landed hit than the built rules do and its seeded games differ from them. Its rates are not comparable with the built 25 at the Dai-Rengō and hero rows (`grep -n 'phased: true' kaiju/docs/experiments/soft-body/phase-out-40.patch` shows the `part: null`). For the built rules at 40, see the last section. |
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

These are the bot's numbers, simulated. A move under about 15 points of win rate on 20 seeds is noise: that is a rule of thumb, one standard error of the difference between two win rates near 50%, each from 20 games (`node -e 'console.log(100 * Math.sqrt(2 * 0.25 / 20))'` prints 15.8).

**Plain `coast` leaves the rival to the seed.** For Radiosaur on seeds 1-20 the rival is the Squamous One in 5 games, Dai-Rengō in 8 and Thalassor in 7. So any change to the Squamous One's durability moves the Coast row of the other monsters in `node kaiju/tools/sim.mjs 1-20`, though nothing in their own data changed. The count:

```
node --input-type=module -e 'import { create } from "./kaiju/src/rules.js"; import { resolveMission } from "./kaiju/src/data/missions.js"; const n = {}; for (let seed = 1; seed <= 20; seed++) { const r = create({ kaiju: "radiosaur", seed, mission: resolveMission("coast", { seed }) }).rival.id; n[r] = (n[r] || 0) + 1; } console.log(JSON.stringify(n));'
```

## The built rules at 40

The patch above is a first cut. The built code at 40 is the branch with one number changed, on a scratch copy:

```
d=$(mktemp -d) && cp -r kaiju "$d" && sed -i 's/phaseOut: 25,/phaseOut: 40,/' "$d/kaiju/src/data/kaiju.js"
cd "$d" && node kaiju/tools/toughness.mjs 21-60 squamous
```

then the other commands above, run in `$d`. Simulated, the bot's games, seeds 21-60 unless said:

| | built 25 | built 40 | first cut 40 (patch) |
|---|---|---|---|
| damage taken a turn (`toughness.mjs 21-60 squamous`) | 6.20 | 5.01 | 4.77 |
| the Squamous One's win rate (`sim.mjs 21-60 squamous`) | 77% | 87% | 90% |
| Dai-Rengō against a Squamous rival (`sim.mjs 21-60 dairengo coast:squamous`) | 35% | 20% | 20% |
| all four, hero bot, seeds 1-20 (`sim.mjs 1-20 all coast:squamous:hero`) | 48% | 21% | 29% |

The first cut's column is the patch applied to ba639f2 and run with the same commands. It is within 3 points of the built 40 on the Squamous One's win rate and the Dai-Rengō row, and 0.24 off on damage a turn. The hero row differs by 8 points (29% against 21%), which is inside the noise band above, so a difference of that size is not evidence of anything. But the dice differ between the two, so set the built column beside the built 25, not the patch.
