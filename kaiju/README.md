# Kaiju

*They will get you in the end. The question is what it cost them.*

A turn-based tactical game for one giant monster. Choose one of four, spend three points on mutations, and send it somewhere it is not wanted: up a valley to a mountain fortress, across a city to the target you picked, or onto a beach where another monster is waiting. The map is hexes; the army moves after you do; every blow is told in the log in a dry newsreel voice, and the ones that matter play as a short cutaway.

It is *Crush, Crumble and Chomp!* (Epyx, 1981) as imagined from a magazine review that had no screenshots, with OGRE's damage by system, Car Wars's facing and build budget, and Advance Wars's forecast and combat scene. The streets of the city are grown by MazeBuilder's Sidewinder, so the city has the same tell as the hedge.

## Run it

Static files, no build, nothing to install. From the repository root:

```
cd kaiju
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Any static server will do; opening `index.html` straight from disk will not, because browsers refuse modules from `file://`. `art.html` is a gallery of every drawing in every damage state.

The page works one-thumbed on a phone in portrait and with keys on a desktop: `1` move, `2`–`4` attacks, `5` stomp, `6` eat, `7` withdraw, `F` face, `R` roar, `E` end turn, `U` undo a move, arrow keys to step through targets, `Enter` to confirm, `Esc` to cancel. The theme follows the system unless you choose; the choice and the cutaway setting are remembered in that browser.

## Tests

From the repository root:

```
node --test kaiju/tests/
```

`node --test kaiju/tests/*.test.mjs` and `cd kaiju && node --test` run the same suite. (`tests/index.js` and `tests/package.json` exist only because Node 22 loads a directory argument as a module; the index imports every test file.) Node 22, nothing installed. The page itself is checked in a browser with Playwright at phone and desktop sizes.

## How it is built

Layers, bottom up, as in the hedge. Nothing below `ui` touches the page; the rules are pure and run the same in Node.

```
index.html, style.css   the page: setup, play and end screens as framed tiles; theme tokens
src/rng.js              the dice: mulberry32, a port of hedge/rng.py (same seed, same numbers)
src/hex.js              axial hex arithmetic: distance, lines, cones, arcs
src/data/               terrain, structures, kaiju, units, mutations, missions: numbers, not code
src/city.js             grows the city for The Swathe with MazeBuilder's Sidewinder, braided
src/rules.js            create(setup), step(state, command) -> {state, events}, and the queries
src/ai.js               plans for the defense units, the rival kaiju and a berserk kaiju
src/voice.js            every event's line in the log, and the newspaper headline
src/art/                SVG drawn in code: portraits, silhouettes, figures, tokens, tiles, backdrops
src/ui/main.js          boot and the three screens; plays each step's events in order
src/ui/board.js         the hex map as one SVG: terrain, highlights, pieces, taps
src/ui/panels.js        top bar, status, actions, log lines, hint bar, forecast sheet
src/ui/cutaway.js       the combat scene
src/ui/settings.js      theme and cutaway mode, remembered
tests/                  node --test; *.test.mjs
tools/sim.mjs           a greedy bot that plays every monster and mission over a run of seeds: node kaiju/tools/sim.mjs
```

**The events are the source of truth.** `rules.step` returns the new state and a list of events, each with its text and the data behind it. The page plays them in order: the board is patched from their data so the army can be seen moving, a run of fire from one unit type becomes one cutaway, and the log prints the text. Then the page settles on the state `step` returned. A seed and a list of commands replay a game exactly.

## Docs

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md): what the spike must do, and the user stories.
- [docs/RESEARCH.md](docs/RESEARCH.md): the 1981 original and the other sources.
- [docs/DESIGN.md](docs/DESIGN.md): the contract the code is built to.
