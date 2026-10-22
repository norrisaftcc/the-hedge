# Rival reach: the four directions, as tried (#27)

DESIGN §17.3 names four ways to make sure no living monster is left unable to hurt the rival. Each one was built on its own copy of commit 87bad43 and measured with the bot. Direction D was chosen and built on the branch. The other three are kept here as patches, so their numbers in PR #30 can be checked.

| Patch | Direction |
|---|---|
| `A-stomp-a-kaiju.patch` | A. Stomp can target an adjacent kaiju. |
| `B-crippled-swings.patch` | B. A crippled part's attacks still work, at −30 accuracy and half damage. |
| `C-second-part.patch` | C. Dai-Rengō gains a thruster ram; the Squamous One's gaze does 1–2 damage. |
| `D-body-slam.patch` | D. A body slam for every kaiju: 2 AP, 2–4 damage, 80 accuracy, an adjacent kaiju only. The first cut of what is now on the branch. |

## Reproduce a direction's numbers

From the repository root, on a branch that has this folder:

```
git worktree add ../exp 87bad43 --detach
git -C ../exp apply "$PWD/kaiju/docs/experiments/rival-reach/B-crippled-swings.patch"
cd ../exp && node kaiju/tools/sim.mjs 1-20 all coast:squamous:hero
```

The cell `coast:<rival>:hero` runs the hero bot, which fights only the rival. It prints two counts of stuck turns: `stuck` and `stuck0`.
- `stuck` counts turns in which the monster was next to the rival with AP left and nothing it could do to hurt it.
- `stuck0` counts the same, but only where a fresh monster with full AP and energy would also be helpless, which is what KAI-11 asks.

Run without a patch for the baseline.

These are the bot's numbers, simulated, on 20 or 40 seeds a cell. One game is 5 or 2.5 points. Treat a move under about 15 points as noise.
