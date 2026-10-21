# Kaiju: requirements and user stories

Working title: **Kaiju**. Status: spike. This file comes before the design. It says what the spike must do, not how.

## 0. Thesis

As a child, the author of this project read a magazine review of *Crush, Crumble and Chomp!*. It described the play in detail and showed no screenshots. This is the game imagined from that review. The review may never be found, and the aim is not to rebuild the 1981 program. The aim is to keep what the words promised.

What follows from that:

- **The words come first.** The review was the whole game once. So every event is told, in a voice worth reading, and the log is a main panel, not a footnote. A player who only read the log should still see the game.
- **The pictures are the imagined ones.** No screenshots meant no character graphics to copy. The art draws what a reader would have pictured, not what a 1981 screen could show.
- **Keep the promises a review would make.** Distinct monsters with distinct powers. A city to crush. Hunger. Defenders that grow desperate, a mad scientist among them. Objectives that change what counts. "They will get you in the end."
- **The game should be able to write its own review.** A play-through, told back at the end in the manner of a period magazine, closes the circle.

## 1. Purpose

The player commands one giant monster through short tactical missions. The power fantasy is control: a creature the size of weather, steered with care. The spike proves the core loop on a phone browser:

> choose a kaiju → spend a small mutation budget → choose a mission → move, smash, eat and fight on a hex map, one turn at a time → read the score.

## 2. Sources and what we take from each

| Source | What we take |
|--------|--------------|
| *Crush, Crumble and Chomp!* (Epyx, 1981) | The premise: a monster against a city and its defenders. Scored destruction. Hunger that forces the monster to feed. A choice of monsters with different powers. Mission goals beyond "destroy all". See `RESEARCH.md`. |
| *OGRE* (Steve Jackson, 1977) | Asymmetry: one huge unit against many small ones. Damage by system: legs slow the monster, arms weaken it, the head spoils its aim. The monster wears down; it does not die at once. |
| *Car Wars* (Steve Jackson, 1981) | Build to a budget before play. Facing matters: a hit from behind hurts more. Dark, dry humour in the text. |
| *Mail Order Monsters* (EA, 1985) | Choose a body, then buy add-ons. Each monster plays differently. (Persistent growth and a shop come later.) |
| *Advance Wars*, *Fire Emblem* | Alternating turns. A forecast before an attack. A short combat cutaway: the two combatants face each other over a terrain backdrop, with health bars and damage numbers. |
| *Wizardry* (1981) | The screen as framed tiles: map, status, messages, commands, each in its own bordered panel. |
| the-hedge, MazeBuilder | Seeded mulberry32 dice (same numbers in Python and JavaScript). A topology layer. A pure rules core that returns events with text and data. Transcripts as tests. Light and dark themes. A maze algorithm to grow city streets. |

## 3. Decisions already made

| Question | Decision |
|----------|----------|
| Home | `the-hedge/kaiju/` |
| Time | Alternating turns. Kaiju phase, then defense phase. |
| Grid | Hex |
| Art | Vector SVG drawn by code. No image files. |
| Sides | The player is always the kaiju. Defense forces and rival kaiju are AI. |
| Tone | Dry B-movie: newsreel captions, terse radio traffic, the monster treated as weather. |
| Customization | Light: a point budget for two or three mutations. |
| Missions | Separate missions. No campaign. Only settings persist. |
| Format | Static web page. No build step. No runtime dependencies. |

## 4. Glossary

- **Kaiju**: the player's monster. One unit, large, with body parts.
- **Part**: a section of the kaiju's body with its own hit points: head, arms, body, legs, tail (or a kaiju's equivalent).
- **AP**: action points. The kaiju spends them to move and act in its phase.
- **Energy**: a per-kaiju resource that powers special attacks. Each kaiju refills it in its own way.
- **Hunger**: rises each turn. High hunger costs AP. Eating lowers it. (From the 1981 original.)
- **Unit**: one defense piece: infantry, tank, artillery, helicopter, jet, missile battery, super-weapon.
- **Structure**: a building or installation on a hex. It has a height and structure points.
- **Objective**: the hex or target a mission is about.
- **Cutaway**: the short combat scene shown when an attack resolves.
- **Forecast**: the panel that shows the likely result of an attack before the player commits.

## 5. Functional requirements

Priority: **M** must (spike), **S** should (spike if time allows), **N** next (the PR after the spike), **C** could (later).

### 5.1 Setup

| ID | Pri | Requirement |
|----|-----|-------------|
| SET-1 | M | The player chooses one of four kaiju. Each shows a portrait, a silhouette, its stats, its attacks and its energy rule. |
| SET-2 | M | The player spends a mutation budget (default 3 points) on mutations. The total cannot exceed the budget. Each kaiju may forbid some mutations. Unspent points become body hit points, one per point (as *Crush, Crumble and Chomp!* turned unspent credits into hit points). |
| SET-3 | M | The player chooses one of three missions. Each shows a briefing in the house voice, the goal and the turn limit. |
| SET-4 | M | Mission 2 asks the player to pick its target: power plant, research lab, or the ley line in the park. |
| SET-5 | M | Mission 3 asks for the rival kaiju, or picks one at random from the other three. |
| SET-6 | S | The player may enter a seed. The same seed, kaiju, build and mission give the same game. |

### 5.2 The board

| ID | Pri | Requirement |
|----|-----|-------------|
| MAP-1 | M | The board is a hex grid, pointy-top, about 12 × 14 hexes. |
| MAP-2 | M | Each hex has one terrain: open, road, park, forest, water (deep), shore (shallow), mountain, rubble, or a structure. |
| MAP-3 | M | Terrain sets the AP cost to enter and whether a hex blocks line of sight. |
| MAP-4 | M | Structures have a height (1–3) and structure points. A destroyed structure becomes rubble and scores points. |
| MAP-5 | M | The kaiju has a facing (one of six hex sides). Moving sets facing. Turning in place costs no AP. |
| MAP-6 | M | Tapping a hex shows what is there in the status panel. |
| MAP-7 | M | When the kaiju is selected, the hexes it can reach this phase are highlighted, with AP cost shown on demand. |
| MAP-8 | S | The city in Mission 2 is grown from a seed: a maze algorithm from MazeBuilder (Sidewinder) lays out the streets; blocks fill with structures. |
| MAP-9 | C | Pan and pinch-zoom for larger maps. |

### 5.3 The kaiju

| ID | Pri | Requirement |
|----|-----|-------------|
| KAI-1 | M | Four starters: an atomic tyrannosaurus, an Atlantean colossus, the squamous thing from the City of Angles, a sentai giant robot. Names in section 9. |
| KAI-2 | M | Each kaiju has parts with hit points, AP per turn, an armor value, a move style, two or three attacks and one passive trait. |
| KAI-3 | M | Damage to legs lowers AP. Damage to arms lowers melee damage. Damage to the head lowers accuracy. Body at zero ends the mission in defeat. Any other part at zero is *crippled* and its effects are at their worst. |
| KAI-4 | M | A hit from the kaiju's rear arc (the three hex sides behind it) deals +1 damage. (Car Wars facing, simplified.) |
| KAI-5 | M | Energy powers special attacks. Each kaiju refills energy by its own rule (eating, standing in water, panic around it, a power source). |
| KAI-6 | M | Hunger rises by one each turn. At high hunger the kaiju loses 1 AP. Eating a unit or a populated structure lowers hunger. The robot has no hunger; it has a battery that drains instead. |
| KAI-7 | M | Actions: move, turn, attack (per attack type), stomp (destroy the structure or units in an adjacent hex), eat, roar (panic test for nearby units), end phase. |
| KAI-8 | S | Mutations change stats or add an ability: thicker hide, longer breath, regeneration, extra AP, wider roar, and so on. |
| KAI-9 | S | Berserk: when hunger reaches its maximum, the kaiju's next phase is played for it: it goes for the nearest food and eats. Then hunger drops. |
| KAI-10 | S | Power plants and pylons explode when the kaiju enters, stomps or eats them, dealing heavy damage to it. The atomic tyrannosaurus takes the blast as energy instead. Ranged attacks destroy them safely. |

### 5.4 Defense forces and rival kaiju

| ID | Pri | Requirement |
|----|-----|-------------|
| DEF-1 | M | Unit types: infantry, tank, artillery, attack helicopter, jet, missile battery, and one super-weapon (a maser cannon). |
| DEF-2 | M | Each unit has hit points, move, range, attack, a morale value and a point value. |
| DEF-3 | M | In the defense phase each unit moves and fires by a simple AI: close to range, prefer cover, fire at the kaiju. |
| DEF-4 | M | Panicked units flee and do not fire. Roar and some attacks cause panic tests. |
| DEF-5 | M | Reinforcements arrive at map edges on set turns. |
| DEF-6 | M | A rival kaiju acts in the defense phase with its own AI: approach, attack the best target in reach, use specials when energy allows, retreat to water or cover when the body is low. |
| DEF-7 | S | Units inside a structure take less damage until it falls. |
| DEF-9 | S | A nemesis unit, the mad scientist, appears in Mission 2. It flies. Each hit it lands leaves a lasting penalty: −1 AP on every later turn, which stacks. |
| DEF-8 | C | Air units ignore terrain and cannot be stomped, only swatted. |

### 5.5 Combat

| ID | Pri | Requirement |
|----|-----|-------------|
| CMB-1 | M | Before the player commits an attack, a forecast shows hit chance, damage range, and what the target can return. |
| CMB-2 | M | Attacks resolve with the seeded dice. Hits on the kaiju land on a part by a hit-location roll. |
| CMB-3 | M | When an attack involves the kaiju (as attacker or target), a cutaway plays: the two sides face each other, a terrain backdrop matches the defender's hex, health bars drop, damage numbers show. |
| CMB-4 | M | The cutaway can be skipped with one tap, and turned off or set to "kaiju-vs-kaiju only" in settings. |
| CMB-5 | M | Defense fire against the kaiju in one phase may be grouped into one cutaway per attacker type, so a phase does not become a slide show. |
| CMB-6 | S | Area attacks (breath, sweep, tidal surge) hit all hexes in their pattern, structures included. |

### 5.6 Missions

| ID | Pri | Requirement |
|----|-----|-------------|
| MIS-1 | M | **Mission 1, the mountain fortress.** The kaiju comes down a valley to a fortress cut into a mountain. Gun emplacements, missile batteries, and a maser cannon that fires every other turn. Win: destroy the command bunker. Turn limit applies. |
| MIS-2 | M | **Mission 2, the swathe.** The kaiju comes ashore at a harbour and crosses a city to its target (chosen at setup). Win: destroy the target. Score: destruction along the way. |
| MIS-3 | M | **Mission 3, the coast.** The kaiju meets a rival kaiju on a coastline. Light defense forces harass both. Win: the rival's body falls to zero, or it flees off the map. |
| MIS-4 | M | Each mission has a turn limit. When it runs out the mission ends; the score counts but the goal is failed. |
| MIS-5 | M | Defeat: the kaiju's body falls to zero. The kaiju may also choose to withdraw off a map edge marked as its retreat. |
| MIS-6 | M | Score: destruction points, units destroyed, objective bonus, turns left, parts intact. The end screen shows a breakdown and a newspaper headline. |
| MIS-8 | N | **Rampage**, the 1981 mode. A city, no goal but the score, endless reinforcements that grow, and no victory: it ends when the kaiju falls or withdraws. Before play the player picks an objective that weights the score, as the original's five did: Balanced, Killer Monster (people), Combat Machine (units only), Destruction (structures, tall ones most), Survival (turns lasted). The end names the death: a thousand cuts, the sudden death (a power plant), or the lingering death (the mad scientist). |
| MIS-9 | N | **The review.** The end screen offers a short review of this play-through in the manner of a 1981 computer magazine: a headline, three or four paragraphs drawn from the game's events (what the monster did, what stopped it, a quoted line from the log), and a rating. It can be copied as text. |
| MIS-7 | M | Results are graded, as in *OGRE*: total victory (goal met, body above half), victory (goal met), draw (time ran out or withdrew with the goal unmet), defeat (body at zero). |

### 5.7 Interface

| ID | Pri | Requirement |
|----|-----|-------------|
| UI-1 | M | The screen is a set of framed tiles in the Wizardry manner: map panel, status panel, actions panel, log panel, top bar. |
| UI-2 | M | Phone portrait (360–430 px wide): tiles stack. Map first; status and actions below; the log in a drawer. No horizontal scroll. |
| UI-3 | M | Landscape and desktop: the map takes the left two thirds; status, actions and log tile on the right. |
| UI-4 | M | The status panel shows the kaiju's head-and-shoulders portrait and its full-body silhouette in outline. Each part on the silhouette is shaded by its damage: intact, hurt, badly hurt, crippled. Shading uses pattern as well as colour. |
| UI-5 | M | The status panel shows AP, energy, hunger (or battery), armor, turn and turn limit, and the mission goal. |
| UI-6 | M | The log reads as newsreel captions and radio traffic. Each entry comes from a rules event. |
| UI-7 | M | Every command is a button at least 44 px square. Every command also has a keyboard key on desktop. |
| UI-8 | M | Light and dark themes follow the system; a button overrides it and the choice is remembered. |
| UI-9 | M | The page respects `prefers-reduced-motion`: cutaways become still frames. |
| UI-10 | S | An "undo move" for the last move, if no dice were rolled since. |

### 5.8 Platform

| ID | Pri | Requirement |
|----|-----|-------------|
| PLT-1 | M | Static files only. Served by any static server (`python -m http.server`). No build step, no package install to play. |
| PLT-2 | M | Plain JavaScript modules. No runtime libraries. |
| PLT-3 | M | The rules core is pure: it never touches the page. The same core runs in the browser and in Node for tests. |
| PLT-4 | M | Tests run with `node --test` and need nothing installed. |
| PLT-5 | M | The dice are mulberry32, the same as `hedge/rng.py`, so a seed means the same thing in both. |
| PLT-6 | S | A replay (seed, setup, list of commands) reproduces a game. Replays are test vectors, as `tests/walks/` are for the hedge. |
| PLT-7 | C | Later formats: an installable PWA; a server-backed version through the hedge's hub for hot-seat or network play; a native build (Godot) if the art outgrows SVG. |

## 6. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | First load under 300 KB over the wire, all files together. |
| NFR-2 | A defense phase with 20 units resolves its rules in under 50 ms on a mid-range phone. |
| NFR-3 | Text contrast meets WCAG AA in both themes. |
| NFR-4 | Rules data (kaiju, units, mutations, terrain, missions) is data, not code, so a designer can change numbers without touching the rules. |
| NFR-5 | Writing follows the house voice: short sentences, concrete nouns, no exclamation marks in the log. |

## 7. User stories

Format: *As a … I want … so that …* Then acceptance criteria. IDs map to requirements.

### Epic A: Choosing a monster

**A1. Pick a kaiju.** As a player, I want to see each kaiju's face, body and powers side by side, so that I choose by how it plays, not only by how it looks.
- Four cards. Each shows portrait, silhouette, parts and hit points, AP, armor, attacks, passive, energy rule.
- Tapping a card selects it; a second control confirms. (SET-1)

**A2. Mutate it.** As a player, I want to spend a few points on mutations, so that my monster is mine.
- Budget shown as points left. A mutation that would exceed it is disabled, with the reason.
- Stats on the card update as I choose. (SET-2, KAI-8)

**A3. Choose the job.** As a player, I want a short briefing for each mission, so that I know what I am walking into.
- Briefing in newsreel voice, goal, turn limit, expected opposition.
- Mission 2 asks for its target; Mission 3 asks for the rival. (SET-3, SET-4, SET-5)

### Epic B: Moving the monster

**B1. See where I can go.** As a player, I want reachable hexes lit when I select my kaiju, so that I do not count hexes by hand.
- Reach accounts for terrain cost, leg damage, hunger and units in the way. (MAP-7, KAI-3)

**B2. Walk through the city.** As a player, I want to walk through buildings and crush them, so that the walk itself is destruction.
- Entering a structure hex costs more AP and damages or destroys the structure. Destruction scores and logs. (MAP-4)

**B3. Face the threat.** As a player, I want to turn to face the guns, so that my back is not exposed.
- Turning is free. The rear arc is shown on the map when the kaiju is selected. (MAP-5, KAI-4)

### Epic C: Fighting

**C1. Know before I strike.** As a player, I want a forecast, so that I can weigh a bite against a breath.
- Hit chance, damage range, energy cost, and the target's likely return fire. (CMB-1)

**C2. See the blow land.** As a player, I want a short cutaway when my kaiju strikes or is struck, so that the fight feels like a fight.
- Kaiju on one side, enemy on the other, backdrop from the defender's terrain, bars that fall, numbers that show.
- One tap skips. Settings can turn it off. Reduced motion gives a still frame. (CMB-3, CMB-4, UI-9)

**C3. Feel the wear.** As a player, I want hits to land on parts, so that a wounded monster plays differently from a fresh one.
- Leg damage shrinks reach; arm damage shrinks melee; head damage spoils aim. The silhouette shows it. (KAI-3, UI-4)

**C4. Scatter them.** As a player, I want to roar, so that I can break a line of infantry without fighting it.
- Units within radius test morale; failures flee next defense phase and do not fire. (KAI-7, DEF-4)

**C5. Feed.** As a player, I want to eat what I crush, so that hunger does not slow me.
- Eat is offered on an adjacent hex with infantry or a populated structure. Hunger falls; some kaiju gain energy. (KAI-6)

### Epic D: The opposition

**D1. Be hunted.** As a player, I want the defense forces to close in and fire with some sense, so that I must think about where I stand.
- Units move toward range, prefer cover, focus fire, and flee when panicked. (DEF-3, DEF-4)

**D2. Feel the reinforcements.** As a player, I want new units to arrive on schedule, so that delay costs me. (DEF-5)

**D3. Fight a peer.** As a player, I want a rival kaiju that fights back with its own powers, so that Mission 3 is a duel and not a hunt. (DEF-6)

### Epic E: Reading the screen

**E1. Know my monster at a glance.** As a player, I want my kaiju's portrait and damaged silhouette always in view, so that I never have to open a menu to know how hurt I am. (UI-4, UI-5)

**E2. Play on the bus.** As a player on a phone, I want the whole game in portrait with one thumb, so that I can play anywhere.
- At 360 px wide: no horizontal scroll; every button ≥ 44 px; map hexes ≥ 26 px across; the log is a drawer. (UI-2, UI-7)

**E3. Read the news.** As a player, I want the log in a dry newsreel voice, so that the destruction has a narrator. (UI-6)

### Epic F: Ending

**F1. Score it.** As a player, I want a score with a breakdown and a headline, so that I know how well I did and want to try again.
- Destruction, units, objective, turns left, parts intact. A headline fitted to the result. Buttons: replay same seed, new seed, change kaiju. (MIS-6)

**F2. Read my rampage.** As a player, I want the game to write a magazine review of the game I just played, so that I can read about my monster the way I first read about the original. (MIS-9)

**F3. Play it the old way.** As a player, I want a rampage with no goal but the score, so that I can play the game the review described: they get you in the end, and the question is what it cost them. (MIS-8)

### Epic G: Building it

**G1. Test the rules without a browser.** As a developer, I want the rules to run in Node, so that tests are fast and need nothing installed. (PLT-3, PLT-4)

**G2. Replay a game.** As a developer, I want a seed and a command list to reproduce a game exactly, so that a bug report is a test. (PLT-5, PLT-6)

**G3. Tune by data.** As a designer, I want kaiju, units and missions in data files, so that balance changes do not touch the rules. (NFR-4)

## 8. Out of scope for the spike

Campaign and saved progress. A shop or persistent growth (Mail Order Monsters). Playing the defense side. Network or hot-seat play. Sound. Fog of war. Air units with separate altitude. Map editor.

## 9. The starters (working names)

| Kaiju | Shape | Character | Energy rule |
|-------|-------|-----------|-------------|
| **Radiosaur**, the atomic tyrannosaurus | biped, tail | Strong bite, tail sweep, atomic breath in a line. Thick hide. | Eats to charge; feeds on reactors. |
| **Thalassor**, the Atlantean colossus | humanoid statue of green bronze | Slow, heavily armored. Fist, thrown trident, tidal surge in a cone. | Refills standing in water or shore. |
| **The Squamous One**, from the City of Angles | tentacled, wrong-angled | Tentacle grab at reach 2, a gaze that spreads panic, a short step through a wrong angle (teleport). Regenerates. | Feeds on panic: each unit that breaks gives energy. |
| **Dai-Rengō**, the sentai giant robot | humanoid mech | Rocket punch at range, beam sword, a once-per-mission finishing move. No hunger. | A battery that drains each turn; recharges at power infrastructure. |

## 10. Open questions (defaults in force until answered)

1. Final names for the kaiju and the game. Default: the working names above.
2. Should civilians appear as tokens, or only as "populated" structures? Default: populated structures only.
3. Should the rival kaiju in Mission 3 be playable later as the player's kaiju in a mirror match? Default: no.
