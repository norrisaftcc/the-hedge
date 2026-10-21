# Research: the games behind Kaiju

Notes gathered before the requirements. Sources are linked inline. Where a fact is uncertain it says so.

## 1. Crush, Crumble and Chomp! (Automated Simulations / Epyx, 1981)

Primary source: the original 25-page manual, https://mocagh.org/epyx/ccc-manual.pdf ("the manual"). Background: https://en.wikipedia.org/wiki/Crush,_Crumble_and_Chomp!

**Making of.** Designed by Jon Freeman and J. W. Connelley; programmed by Connelley; Apple version by Michael Farren. First on TRS-80, Apple II and Atari 8-bit; later VIC-20, C64 and IBM PC. Subtitle: *The Movie Monster Game*. Written in BASIC with character graphics.

**The six monsters** (names confirmed in the manual):

| Monster | Body | Character |
|---------|------|-----------|
| Goshilla | biped amphibian | Each step leaves radioactive waste that turns street to rubble. Swims; breathes fire. |
| The Kraken | sea monster | Must stay in water or on or under bridges. Obliterates with tentacles; attacks bridges and docks. |
| Arachnis | insect | Spins webs to fence prey or slow pursuers; digs tunnels; paralyzes. Too weak to topple buildings well. |
| The Glob | amorphous | No head, so no aim and no rays; turning is free. Strong. Leaves a slime trail that ignites into a wall of fire. |
| Mechismo | robot walker | No hunger, never berserk, cannot heal. Atomizes and zaps. |
| Mantra | flyer | Flies; Ultrasonic Scream kills units in view; breathes fire; immolates. Cannot swim. |

**Cities.** New York, "Golden Gate" (San Francisco Bay), Washington D.C., Tokyo, each with landmarks, and separate starts for sea and land monsters. Five objectives give 120 monster × objective × city games on cassette, 160 on disk. The manual suggests scenarios such as "It Came from Beneath Its Budget" (Kraken, Destruction, Golden Gate) and "Goshilla vs. the Smog Monster" (Goshilla, Balanced, Tokyo).

**Map.** An 8 × 8 window of square cells, one sixteenth of the city, scrolling. Terrain: roads, parks, low buildings, skyscrapers and monuments, power plants and fuel stores, bridges, water, fire, rubble. A monster walks on low buildings; it stands on a skyscraper only after a jump or a flight. **Crumbling or stomping a power plant or fuel store is instant "Sudden Death"**: destroy them at range. Fire spreads downwind; the wind shows on screen; firemen put fires out after the monster leaves. Rubble slows people, not monsters.

**Commands.** One key each. A body heading with 90° turns; M moves one square forward, never sideways or back. The head tilts 30° at a time to aim the Atomize ray (unlimited range, stopped by buildings), Zap (high, for helicopters) and fire breath (adjacent). Also: jump 2, fly or land, dig or dive, grab, eat, crumble the building in front, stomp your own square, obliterate, tail-lash behind, web, paralyze, ultrasonic scream, immolate (all four neighbours, hurts yourself). Grabbing a second thing drops the first, and the dropped human dies. "No self-respecting monster eats dead things": what fire or rays kill is no food.

**Time.** Semi-real-time. You type at the `?` prompt, then people take "their turn"; long actions let people act mid-action ("a car drives away just as you are reaching for it"). A FAST/SLOW setting sets thinking time. Turns are counted in game minutes. It is said to run on the Dunjonquest engine (Temple of Apshai, Datestones of Ryn), but Wikipedia marks this "citation needed". *Uncertain.* There is no fixed time limit.

**Monster state.** Health only in words: HEALTHY, SCRATCHED, HURT, CRITICAL, dead. Regeneration by carcass and options. Hunger runs HUNGRY, RAVENOUS, BERSERK; **a berserk monster ignores your commands**. Anything that moves can be eaten: people are the best food, tanks and guns poor. Digging and atomizing raise hunger. Size, strength, agility and speed are hidden; the per-monster numbers were on printed cards not in the scan. *Uncertain.*

**Defenders.** Eight human types: helpless populace, National Guard, cars, police cars, tanks, artillery (slow, armored, hits hard), helicopters, and the **Mad Scientist**, who flies, ignores fire, and whose hit causes "the Lingering Death", a creeping paralysis that kills even if the scientist dies. Firemen too.

**Winning.** There is none. "They will get you in the end." The monster dies one of Three Deaths: a thousand cuts, the sudden death of a power plant, or the lingering death. Then a score and a rating. Five objectives weight the score: Balanced, Killer Monster, Combat Machine, Destruction, Survival.

**Monster creation** (disk only). Choose one of eight carcasses, each with a budget of Crunch Credits (Biped 160, Sea Monster 170, Insect 175, Amorphous 180, Robot 120, Flyer 140, Brontosaur 160, Serpent 180) and its own price list (Biped: Fly 35, Fire 30, Atomize 20, Armor hide 75, Regeneration 10–100). **Unspent credits become extra hit points.** Robots pay double for self-repair.

**Reception.** Praised: graphics, theme (CGW 1981); "my all-time favorite" (Pournelle, BYTE 1984). Criticised: slow BASIC action (80 US); a steep learning curve from many keys (MobyGames). https://computeradsfromthepast.substack.com/p/crush-crumble-and-chomp

## 2. OGRE (Metagaming, 1977; Steve Jackson)

Sources: https://en.wikipedia.org/wiki/Ogre_(board_game), https://rulespal.com/ogre/rulebook

- One cybertank against a defense bought with points (Mark III: 12 armor units and 20 infantry points).
- The Ogre wins by destroying the command post; results are graded (escape off the edge, or kill everything, scores better).
- Every system is its own target: main battery, secondary batteries, AP guns, missiles. **Treads**: 45 on a Mark III; movement falls 3 → 2 → 1 → 0 as each third is lost.
- Combat results table: odds against one d6; results no effect, disabled, destroyed. Defenders pool attacks on one target.
- Ramming and overrun cost the Ogre treads.
- Hex map. Craters block movement, not fire.

## 3. Car Wars (Steve Jackson Games, 1981)

Sources: https://en.wikipedia.org/wiki/Car_Wars, https://www.sjgames.com/carwars/games/classic/img/car-wars-classic-rules.pdf

- Build to three limits: money, weight and spaces.
- Armor by facing (front, back, left, right, top, under). A hit goes through layers: armor, then weapons, then motor, then crew.
- One-second turns in phases; handling class; a control roll after hard maneuvers, failure to the crash tables.
- Tone: autoduelling in a broken America, dark with a straight face.
- Praised for the design system; criticised for slow simultaneous movement.

## 4. Mail Order Monsters (EA, 1985)

Sources: https://en.wikipedia.org/wiki/Mail_Order_Monsters, https://thedoteaters.com/?cat=300

- Twelve base morphs. Currency: psychons, won in tournaments.
- The Vats sell organs (stingers, tentacles, claws, webs, acid breath, psi-blast); the weapons shop sells guns, some needing tentacles to hold.
- Monsters kept between fights and saved to disk. Death is permanent.
- Modes: Destruction (duel), Capture the Flag, The Horde (co-op waves).
- Praised as light-hearted mayhem; faulted for little tactical depth.

## 5. Advance Wars and Fire Emblem

Sources: https://www.fireemblemwiki.org/wiki/Combat_forecast, https://advancewars.fandom.com/wiki/Terrain

- **Forecast** before an attack: each side's HP, damage, hit %, crit %, double attacks; later games show HP after the exchange and mark a lethal hit.
- **Battle scene**: attacker and defender face each other over the terrain they stand on; HP bars and numbers at the bottom drain as hits land.
- Advance Wars: units have 10 HP and deal damage in proportion; terrain gives 0–5 defense stars; the number of soldier sprites shows remaining HP. *Sprite-count detail unverified.*

## 6. What we borrow

1. **Hunger that bites** (CCC). At the top of the scale the monster goes berserk and the player loses a phase.
2. **Unspent build points become hit points** (CCC). A clean trade-off for the mutation budget.
3. **Power plants are dangerous to touch** (CCC's Sudden Death). Melee on one explodes; the atomic tyrannosaurus alone drinks the blast.
4. **A nemesis unit** (the Mad Scientist). A rare unit whose hit leaves a lasting penalty; kill it first.
5. **Parts as systems** (OGRE treads, Car Wars layers). Legs set AP; a lost part loses its attack; overflow goes to the body.
6. **Facing** (CCC heading, Car Wars armor). The rear arc takes more.
7. **Graded results** (OGRE). Not only win or lose.
8. **Forecast, then cutaway** (Fire Emblem, Advance Wars). Readable numbers before; a short, skippable scene after.
9. **Dry humour** (CCC's "It Came from Beneath Its Budget", Car Wars).

Not taken for the spike: real time, fire spread and wind, flying, digging, persistent roster, shops.
