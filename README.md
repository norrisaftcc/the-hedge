# The Hedge

*To a conjurer, a maze is just a repeated process.* Feel free to get lost here.

A telnet game and a teaching example. A hedge is grown by one of [MazeBuilder](https://github.com/norrisaftcc/MazeBuilder)'s algorithms. Players come down the stair at its mouth, read the rooms, and find the far gate. They can walk by hand, or they can write a **spell**: a small program in a Scheme subset that walks for them, one step a turn, while the room watches. Each algorithm leaves a tell, and the tell is a process; learn to say the process and the hedge cannot hold you.

It is built like a 1992 MUD because that is what it is for: a room full of terminals, everyone in the same maze, and a language to learn.

## Run it

Python 3.8 or newer, standard library only. MazeBuilder comes as a submodule.

```
git clone --recurse-submodules <this repository>
cd the-hedge
python -m hedge --seed 7 --algorithm sidewinder --size 8      # a server on port 4000
```

Then, from any terminal: `telnet localhost 4000` or `nc localhost 4000`. Give a name. Type `help`.

Alone, with no network: `python -m hedge --solo --seed 7`. It reads commands from the terminal or a file, so a transcript is a test.

Algorithms: `binary`, `sidewinder`, `aldous-broder`. Same seed, same hedge, every time and in every language, because the dice are our own (`hedge/rng.py`, six lines, the classroom's mulberry32).

## Play

| Type | Does |
|------|------|
| `look`, `map`, `who`, `score` | the room; what you have seen; who is here; your turns and light |
| `north` `south` `east` `west` (or `n s e w`), `go left` | a step. A step costs a turn of light. Three torches of thirty. |
| `face north`, `turn left` | face a way without stepping. Free. |
| `read`, `study` | the plate at the mouth: the tell, briefly or in full |
| `cast (until (gate?) (go north))` | a spell on one line |
| `cast`, then lines, then a blank line | a spell over several lines |
| `stop` | end a running spell |
| `say hello` | speak to the room |
| `again` | back to the mouth with fresh torches |

When the light runs out you can still walk, and the spells still work (they feel the hedge), but `look` shows only the open ways and the map stops growing.

## The spell language

See [docs/LANGUAGE.md](docs/LANGUAGE.md). Twenty words, no numbers but a count, no variables. Example spells are in `spells/`.

A spell is checked before it runs. If `chibi-scheme` is on the PATH (or named by `HEDGE_CHIBI`), the grammar in `hedge/check.scm` checks it, and the game says `The spell holds (chibi)`. If not, the Python reader makes the same checks and says `(python)`. Chibi is small and builds in a minute:

```
git clone https://github.com/ashinn/chibi-scheme && cd chibi-scheme && make && sudo make install
```

## How it is built

```
hedge/rng.py       the dice: mulberry32
hedge/maze.py      grows a hedge with MazeBuilder's algorithms (vendor/MazeBuilder), rolling our dice
hedge/world.py     the hedge as rooms: descriptions, sight lines, the plate, the map
hedge/spell.py     the spell language: reader, grammar check, and a stepping evaluator
hedge/check.scm    the same grammar in Scheme, for chibi
hedge/verify.py    runs chibi, or falls back to the Python reader
hedge/game.py      players, commands, spells one step at a time. No sockets, no clock.
hedge/server.py    the telnet server (asyncio)
hedge/solo.py      one player, stdin to stdout
spells/            example spells
tests/             pytest; tests/walks/ holds transcripts as test vectors
```

**The room description is the source of truth.** Every sentence is computed from the cells: how far the way runs, where it opens, what ends it. A first-person window drawn from the same numbers cannot disagree with the text. That window is the next thing to build, and it is a client, not a change to the game.

## Tests

```
python -m pytest
```

The chibi tests skip when `chibi-scheme` is not found. A test vector in `tests/walks/` is a file of commands and the exact transcript they produce; after a deliberate change to the words, regenerate with `python -m hedge --solo --seed 7 < tests/walks/<name>.in > tests/walks/<name>.out` and read the diff.

## What is next

- The first-person window: a client that draws the wireframe from the room description's numbers.
- The algorithms in C++ beside the Python, byte-identical, for the classroom.
- Braided hedges (loops), where the left-hand rule fails and breadth-first search is the lesson.
- The Fort Country: whose hedge this is, and what the conjurer wanted.
