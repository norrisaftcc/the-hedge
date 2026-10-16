# The Hedge

*To a conjurer, a maze is just a repeated process.* Feel free to get lost here.

A telnet game and a teaching example. A hedge is grown by one of [MazeBuilder](https://github.com/norrisaftcc/MazeBuilder)'s algorithms. Players come down the stair at its mouth, read the rooms, and find the far gate. They can walk by hand, or they can write a **spell**: a small program in a Scheme subset that walks for them, one step a turn, while the room watches. Each algorithm leaves a tell, and the tell is a process; learn to say the process and the hedge cannot hold you.

It is built like a 1992 MUD because that is what it is for: a room full of terminals, everyone in the same maze, and a language to learn.

## Run it

Python 3.8 or newer, standard library only. MazeBuilder comes as a submodule.

```
git clone --recurse-submodules <this repository>
cd the-hedge
python -m hedge --seed 7 --algorithm sidewinder --size 8      # telnet on 4000, browser on http://localhost:4001/
```

Then, from any terminal: `telnet localhost 4000` or `nc localhost 4000`. Or open the browser page. Give a name. Type `help`.

Alone, with no network: `python -m hedge --solo --seed 7`. It reads commands from the terminal or a file, so a transcript is a test.

Algorithms: `binary`, `sidewinder`, `aldous-broder`. `--shape polar` grows the hedge as rings round a well: the ways are `in`, `out`, `sunwise` and `widdershins`, a ring comes back to where it began, and the same algorithms leave different tells (Binary Tree: in or sunwise reaches the well; Sidewinder: the long walk circles it). `--spokes 12` sets the cells in a ring (default twice `--size`). `--shape cave` is not a grid at all: twenty caves, three tunnels each, laid out as the twelve-sided die, which is Hunt the Wumpus's map and before that Hamilton's Icosian game. There is no compass; a tunnel is named by the cave it leads to (`8`), and `left`, `right` and `back` are from the tunnel you came by. A hand on the wall goes round in five; Hamilton's word of twenty turns visits every cave. `--floors 3` stacks three hedges joined by stairs, one stair up per floor, far from where you arrive; the gate is on the top floor, and a hand on the hedge never climbs. `--braid 0.5` joins half the dead ends to a neighbour, which makes loops; `--braid 1.0` leaves none. In a braided hedge the left-hand rule goes round for ever, and the plate says so. Same seed, same hedge, every time and in every language, because the dice are our own (`hedge/rng.py`, six lines, the classroom's mulberry32).

## Play

| Type | Does |
|------|------|
| `look`, `map`, `who`, `score` | the room; what you have seen; who is here; your turns and light |
| `north` `south` `east` `west` `up` `down` (or `n s e w u`), `go left`, `left` | a step. A step costs a turn of light. Three torches of thirty, a floor. On a polar hedge the ways are `in` `out` `sunwise` `widdershins` (`i o sw wd`); in a cave, `8` or `go 8` takes the tunnel to cave 8, and `left` `right` `back` are from the tunnel you came by. |
| `face north`, `turn left` | face a way without stepping. Free. Not in a cave: there is nothing to face by. |
| `read`, `study` | the plate at the mouth: the tell, briefly or in full |
| `mark` | chalk a mark here; the map shows it, and a spell can test `(marked? left)` |
| `cast (until (gate?) (go north))` | a spell on one line |
| `cast`, then lines, then a blank line | a spell over several lines |
| `stop` | end a running spell |
| `say hello` | speak to the room |
| `again` | back to the mouth with fresh torches |

When the light runs out you can still walk, and the spells still work (they feel the hedge), but `look` shows only the open ways and the map stops growing.

## The spell language

See [docs/LANGUAGE.md](docs/LANGUAGE.md). Twenty words, no numbers but a count, no variables. Example spells are in `spells/`.

A spell is checked before it runs, in the hedge's own words: a polar hedge refuses `(go north)`, a cave refuses `(turn left)` and takes `(go 8)`. If `chibi-scheme` is on the PATH (or named by `HEDGE_CHIBI`), the grammar in `hedge/check.scm` checks it, and the game says `The spell holds (chibi)`. If not, the Python reader makes the same checks and says `(python)`. Chibi is small and builds in a minute:

```
git clone https://github.com/ashinn/chibi-scheme && cd chibi-scheme && make && sudo make install
```

## How it is built

Layers, bottom up. A new way in is a new transport; nothing below it changes. The whole story is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
hedge/rng.py          the dice: mulberry32
hedge/maze.py         grows a hedge with MazeBuilder's algorithms (vendor/MazeBuilder), rolling our dice
hedge/topology.py     the shape: square, polar or cave. The way words, headings, turns, and how a step moves
hedge/cave.py         the dodecahedron: twenty rooms, three tunnels each, Hamilton's left and right
hedge/world.py        the hedge as rooms: descriptions, sight lines, the plate, the map
hedge/spell.py        the spell language: reader, grammar check, and a stepping evaluator
hedge/check.scm       the same grammar in Scheme, for chibi
hedge/verify.py       runs chibi, or falls back to the Python reader
hedge/events.py       Event(kind, to, text, **data): the words, and the numbers behind them
hedge/game.py         Game.act(name, verb, **args) -> events. Players, light, spells. No text parsing.
hedge/parser.py       verb and noun, adventurelib style: "go DIRECTION" -> ("go", {"direction": ...})
hedge/hub.py          sessions, typed lines, multi-line spells, routing events to sinks
hedge/render.py       text(event), json(event), gmcp(event)
hedge/transports/     telnet (with GMCP), stdin, ws (WebSocket, and it serves web/index.html)
hedge/api.py          Table: play from Python, for tests and other programs
web/index.html        a small browser client drawn from the events' data
spells/               example spells
tests/                pytest; tests/walks/ holds transcripts as test vectors
```

**The room description is the source of truth.** Every sentence is computed from the cells: how far the way runs, where it opens, what ends it. The same numbers ride in the `room` event's data, so a window drawn from them cannot disagree with the text. The browser page draws its first-person view and its overhead map (only the squares you have seen) from that data, and needed no change below the transport. On a polar hedge the map is rings and spokes; the view is the same wireframe, which is honest to within the curve of a ring. In a cave the view is three tunnel mouths with the numbers carved over them, and the map is the die unfolded (the Schlegel diagram), showing only the caves you have stood in or heard of.

**Theme:** the page follows the system's light or dark setting; its `theme` button overrides it (system, light, dark) and the choice is remembered in that browser.

**Spell pace:** 0.6 s a step on telnet and in the browser, so the room can watch; 0.3 s solo and in `api.Table`; `--pace 0` for a transcript.

**Ways in today:** `telnet localhost 4000`; a GMCP client (Mudlet, for one) on the same port gets `Hedge.Room` packets beside the text; a browser at `http://localhost:4001/`; `--solo` on the terminal; and `hedge.api.Table` from Python.

## Tests

```
python -m pytest
```

The chibi tests skip when `chibi-scheme` is not found. A test vector in `tests/walks/` is a file of commands and the exact transcript they produce; after a deliberate change to the words, regenerate with `python -m hedge --solo --seed 7 < tests/walks/<name>.in > tests/walks/<name>.out` and read the diff.

## What is next

- The first-person window: a client that draws the wireframe from the room description's numbers.
- The algorithms in C++ beside the Python, byte-identical, for the classroom.
- The Fort's rooms: a cave is the first graph; the next is a room table with named doors. See [docs/TOPOLOGIES.md](docs/TOPOLOGIES.md).
- The Fort Country: whose hedge this is, and what the conjurer wanted.
