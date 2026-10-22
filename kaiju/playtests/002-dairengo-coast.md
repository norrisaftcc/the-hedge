# 002: Dai-Rengō against the Squamous One, The Coast, defeat

- **Build:** before 0.2.0. Main after #17, before the version was shown. The setup below is read from the review.
- **Setup:** dairengo + reserves+bulk (one point unspent), coast vs squamous, seed 39724.
- **Played:** 10/21
- **By:** the maintainer

## The review

```
CASSETTE & DISK MONTHLY. Issue 24, January 1981.

Dai-Rengō Against the Army
Dai-Rengō, the sentai giant robot, meets The Squamous One at Gull Point, and falls to a thousand cuts on turn 8.
By R. J. Quillon

This is a monster game in the line of Crush, Crumble and Chomp!, played a turn at a time on a map of hexes, with the log doing most of the talking. I took Dai-Rengō, the sentai giant robot, with deep reserves and bulk, and one point left over for its chassis. The mission was The Coast: Gull Point, one beach, and The Squamous One, from the City of Angles, coming the other way. The seed was 39724, for anyone who wants the same dice.

A low building came down. Of its kills, one went under its feet. The hardest it hit anything was twelve, a final formation on The Squamous One's mantle on turn 3. The army lost its nerve 14 times.

It died the death of a thousand cuts. No one shot did it; all of them did. Of the 40 points of damage it took, The Squamous One dealt 24. The army sent one more unit. It lasted eight of the 16 turns.

I will let the log have the last word on that blow: "Final formation. Five machines become one blow. The Squamous One takes 12 on the mantle." It scored 10, a defeat. Rating: ★☆☆☆☆ The army will hardly need to file a report.
```

## Notes

The second game on the same seed, this time with the Squamous One as the rival. Playing the robot as a hero: fight the monster, leave the army alone. Dai-Rengō spent its once-a-mission finisher on turn 3 for 12 on the mantle. Once its arms were crippled it could do almost nothing. It could not stomp the other kaiju, and every attack it had left used its arms.

## Follow-up

- **Crippled arms left it with no way to fight the rival.** This is in the data, not the dice. Every damaging attack Dai-Rengō has uses its arms, except Final formation, which works once a mission. The Squamous One's only damaging attack (Tentacle grab) also uses its arms. A stomp cannot target a kaiju (`stompTargets` in `src/rules.js`). So a monster can be alive and unable to hurt its rival. Issue #27.
- **A review bug, fixed in #26.** "A low building came down. Of its kills, one went under its feet." The review counted every `crush` and `eat` event as a kill, but the rules raise both for structures too. Now only units count. `tests/playtest.test.mjs` failed on the old code and passes on the fix.
- **The masthead follows from the seed.** "Issue 24, January 1981" is seed 39724 on turn 8.
- **The Squamous One is strong as a rival and weak as the player's monster.** Compare 001, same seed. The AI rival keeps its distance with Tentacle grab (range 2) and feeds on the army's panic. A person playing it walks in and trades blows.
- **The bot disagrees again, in the other direction.**
  - On this setup the bot's Dai-Rengō wins in 5 turns, taking 16 damage, 6 of it from the rival.
  - Over seeds 21–60 with no mutations, Dai-Rengō against a Squamous rival wins 20 of 40. The median game lasts 7 turns, and the rival deals a median 59% of the damage taken.
  - The script was a one-off and is not kept. These are bot numbers, for comparison only.
  - **The bot played a different game.** It attacks whatever pays best, the army included. The player spared the army and fought only the monster. That is why the results differ, and why #27 asks for a "hero" mode in the bot.
- **Related issues.** #24 (a squishy, regenerating monster) covers the Squamous One's toughness as the player's monster. A change there also changes it as a rival, so this game is a case to keep: the rival should stay a threat. Also #16 (the Squamous One on the Coast).
