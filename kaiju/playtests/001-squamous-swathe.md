# 001: The Squamous One, The Swathe, defeat

- **Build:** before 0.2.0. Main after #17, before the version was shown. The setup below is read from the review.
- **Setup:** squamous + gut+reserves+bulk, swathe:plant, seed 39724.
- **Played:** 10/21
- **By:** the maintainer

## The review

```
CASSETTE & DISK MONTHLY. Issue 24, July 1981.

A Thousand Cuts
The Squamous One, from the City of Angles, comes ashore at Port Halloran, and falls to a thousand cuts on turn 2.
By Ned Pellow

The model is plainly Crush, Crumble and Chomp!, and it shows in the best way: a monster, a city, and a great many people in its way. I chose The Squamous One, from the City of Angles, with iron gut, deep reserves and bulk. The mission was The Swathe: ashore at Port Halloran and across the city to the power plant. The city grew from seed 39724, for anyone who wants the same streets.

The army lost two Guard squads to it. Of its kills, two went into its mouth. The army lost its nerve twice.

The army got it in the end, by a thousand cuts. Of the 39 points of damage it took, the tanks dealt 20. The army sent one more unit. It lasted two of the 15 turns.

The last word on the radio was the army's: "BATTERY. ENGAGING." It scored 20, a defeat. Rating: ★☆☆☆☆ The army will hardly need to file a report.
```

## Notes

The monster fought: two Guard squads destroyed, two eaten. It fell on turn 2.

## Follow-up

- **The review identifies the game.** "Issue 24, July 1981" follows from seed 39724 on turn 2, and `tests/playtest.test.mjs` checks it.
- **The Squamous One is fragile in a fight.**
  - It has armor 0. "Eldritch" is −10 accuracy for anything shooting at it, not damage reduction, and regen heals 1 a turn.
  - Against tanks and artillery it takes about 1.7–1.9× the damage of an armor-2 monster, per shot. This is computed in #24 from `src/data/units.js`: hit chance × mean damage.
  - The bot's game on this setup took 20 on turn 1 and fell on turn 3: `node kaiju/tools/damage.mjs 39724 squamous+gut+reserves+bulk swathe:plant`.
  - Radiosaur with no mutations took 11 on turn 1 on the same seed: `node kaiju/tools/damage.mjs 39724 radiosaur swathe:plant`.
  - Issue #24.
- **The bot and a person disagree.**
  - The bot wins this matchup 60% of the time in 2.9 turns on average (`node kaiju/tools/sim.mjs 21-60 squamous swathe:plant`), by sprinting and teleporting. Radiosaur gets 65% in 4.0 turns.
  - A person fights. This is the first data point on that gap.
- **The bot found a trap.** On this seed the bot's Squamous died the sudden death: Wrong angle landed it on the power plant. Issue #25: the bot should weigh blast risk, and the page should warn first.
