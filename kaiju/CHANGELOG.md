# Kaiju Dashboard: changes

The version is in `src/version.js`. It shows on the setup page as the edition and at the foot of every copied review, so a playtest names the build it was played on. A PR that changes what a player sees or how the game plays bumps it and adds a line here. `tests/version.test.mjs` checks the two agree.

- **0.1.x** for the spike and fixes, **0.2.x** after Hex and the City, and so on: the middle number moves with each feature PR, the last with each fix.

## 0.5.0: soft body, hits may pass through the Squamous One (#24, from playtest 001)

- **Phase-out**: about one in four of the hits that land on the Squamous One, and on Meow'thprrtep, pass through and do no damage. The rules roll it on the seeded dice after the hit roll. It covers the player's blows, the rival's and the army's. A power structure's blast never phases. The rate is one number, `RULES.phaseOut` (25), in `src/data/kaiju.js`.
- Why: the Squamous One has armor 0, and the heavy guns did about twice to it what they do to the armored three (DESIGN §18.1). Phase-out lasts by luck, not by armor. In the bot's games it takes 6.20 damage a turn where it took 8.58 (`node kaiju/tools/toughness.mjs 21-60 squamous`), and it must not stand and trade blows. The directions not chosen are kept as patches in `docs/experiments/soft-body/`.
- The page: the setup card says it in plain words, and "Eldritch: harder to hit." now says how much. The forecast sheet keeps the hit chance and adds "one in four of the hits pass through" when the target has the passive. Return fire says it too. The cutaway reads a phased hit as THROUGH, and the log tells it: "Bite passes through where The Squamous One's mantle was a moment ago."
- The balance bot counts the phase chance in what a strike is worth.
- Pinned results move. The Coast replay (Squamous One against Dai-Rengō, seed 7) is re-recorded: every landed hit on the Squamous One now rolls once more, so seeded games differ even where no hit phased. On playtest 001's seed the bot now wins on turn 2 after a survivable 9-damage blast (`node kaiju/tools/damage.mjs 39724 squamous+gut+reserves+bulk swathe:plant`), and the blast test pins that the bot takes no lethal blast.
- The other monsters' Coast rows move where the seed gives them a Squamous One as the rival (DESIGN §18.7).

## 0.4.0: rival reach, a body slam for every monster (#27, from playtest 002)

- **Body slam**: any kaiju beside the other can throw its body at it. 2 AP, 2–4 damage, 80% to hit, to a part by roll. The body cannot be crippled, so with any one of arms, legs, head or aux crippled a living monster can still hurt an adjacent rival, at the AP the rules give (two cases are open, below). Dai-Rengō after its finisher, and the Squamous One with its feelers crippled, can still fight. The numbers and the name are in `RULES` (`src/data/kaiju.js`).
- The rival slams by the same rules, so the change is not the player's alone.
- The page: a "Body slam" button on key `8` (last in the list, after Withdraw, so the digits read in order), the adjacent kaiju lit, a forecast sheet, the existing kaiju-against-kaiju cutaway, and new log lines that name the blow from the data, chosen by turn and hex, never by a die.
- The Coast changes: its pinned replay (Squamous One against Dai-Rengō, seed 7) is re-recorded, since Dai-Rengō now slams. The other missions and replays do not move.
- Open, for the owner: two cases, crippled legs plus hunger and crippled legs plus an empty battery, leave a monster with 1 AP, and a slam costs 2 (DESIGN §17.8). The §17.6 criterion that the hero bot's stuck turns fall to 0 is not met: they fall, but `stuck0` is above 0 for Thalassor and Dai-Rengō. Two todo tests, `KAI-11 (open)`, keep it in view.
- The balance bot knows the slam, and gains a hero mode (`coast:<rival>:hero`) and a count of stuck turns (DESIGN §17.4).

## 0.3.1: blast risk (#25, from playtest 001)

- `blastRisk(state, key, actor)` in the rules: what setting off a power structure on a hex would do to the monster (the damage range, or energy for a reactorBelly monster), and whether it could be lethal.
- The bot no longer treats the objective as safe to blast. It never takes a lethal blast, and takes a survivable one on the objective only when no attack could break the objective that turn. Radiosaur and Mekkasaurus Prime are unchanged.
- The page warns before a move, Wrong angle, stomp or eat that would set off power: the hint bar and the forecast sheet say what it would do ("Landing here sets off the power plant: 6–9 damage."), and the lit hexes that would do it carry a triangle. For Radiosaur and Mekkasaurus Prime it is news, not a warning, and carries a circle. A stomp is flagged only when it can bring the structure down, and a walk names every power hex on its path.
- The bot's win rate on swathe:plant moves; the rules and the pinned replays do not.

## 0.3.0: variants, other looks for the same rules (#20)

- Four looks over the four monsters: Meow'thprrtep (the first, cat-headed Squamous drawing), Mekkasaurus Prime (Radiosaur in steel, on a battery), the Alien Colossus and Gekido-Oh (with a preset build).
- Setup shows a row of looks under the cards. The board, cutaway, log, paper and review use the look.
- The copied review's setup line names the look as the bot does: `squamous:meowthprrtep`.
- The bot takes `kaiju:variant`.

## 0.2.0: the 1981 mode and the review (#17, merged 10/21)

- The fourth mission, **Hex and the City** (id `rampage`; first called Rampage): no goal and no clock, waves that grow, five objectives, the Three Deaths.
- The working title, **Kaiju Dashboard**, on the tab and the masthead (#23).
- Every game ends with a review from *Cassette & Disk Monthly*, with **Copy as text**.
- The version on the setup page and at the foot of the copied review (#26, so later playtests name their build).
- The copied review's setup line says whether the Coast's rival was chosen (`coast:squamous`) or left to chance, since the two are different games. The bot takes `coast:<rival>` too, and `tools/damage.mjs` shows one game's damage by turn (#26).
- The review counts only units as kills; a building walked through or eaten is not one (#26, from playtest 002).

## 0.1.0: the spike (#8 to #12, merged 10/21)

- Four kaiju, three missions, the hex map, the army, the cutaway and the newspaper.
