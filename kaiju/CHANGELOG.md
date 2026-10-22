# Kaiju Dashboard: changes

The version is in `src/version.js`. It shows on the setup page ("Edition 0.2.0") and at the foot of every copied review, so a playtest names the build it was played on. A PR that changes what a player sees or how the game plays bumps it and adds a line here. `tests/version.test.mjs` checks the two agree.

- **0.1.x** for the spike and fixes, **0.2.x** after Rampage (now Hex and the City), and so on: the middle number moves with each feature PR, the last with each fix.

## 0.2.0: the 1981 mode and the review (#17, merged 10/21)

- The fourth mission (id `rampage`): no goal and no clock, waves that grow, five objectives, the Three Deaths.
- Every game ends with a review from *Cassette & Disk Monthly*, with **Copy as text**.
- The version on the setup page and at the foot of the copied review (#26, so later playtests name their build).
- The review counts only units as kills; a building walked through or eaten is not one (#26, from playtest 002).

## 0.1.0: the spike (#8 to #12, merged 10/21)

- Four kaiju, three missions, the hex map, the army, the cutaway and the newspaper.
