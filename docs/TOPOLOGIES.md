# Other hedges: a note on topologies

A hedge today is a rectangular grid of cells with four ways, grown as a tree (a perfect maze) and now, with `--braid`, with loops. This note ponders what else a hedge could be, what each would cost, and what each would teach. The test for a topology is the same as for an algorithm: **does it leave a tell?** A tell is a process a player can learn to say.

## What the engine assumes

`world.py` asks its **Topology** (`hedge/topology.py`) for the four way words in right-turn order, their opposites, what a turn does to a heading, and how a step moves. `spell.py` checks a spell against the hedge's four words; `check.scm` takes the shape as its argument. The game reads `hedge.dirs` for its messages, and the grammar knows every way word of every shape so it can say "there is no north here". Two vertical ways, `up` and `down`, belong to stairs, not to a topology. The first-person view assumes straight corridors that turn by right angles. Everything else (rooms, light, the hub, the transports) asks only `ways(pos)` and `move(pos, direction)`.

That was the abstraction the polar hedge forced, and it is in.

## The hedges

| Hedge | What it is | The tell | Words | View | MazeBuilder | Cost |
|-------|-----------|----------|-------|------|-------------|------|
| **Braided** (now) | dead ends joined; loops | the left-hand rule circles. Memory wins: a mark, a map, a search. | none new | none | `Braid.on` | done |
| **Masked** | cells removed; a hedge shaped like a thing (a letter, a lake, the Fort's wall) | none by shape; the algorithm's tell survives | none | none | a mask on the grid before growing | small |
| **Cylinder** | the east edge joins the west edge | Sidewinder's long walk becomes a ring: "the way east comes back to where it began" | none | none | wrap column indices | small |
| **Floors** (now) | several hedges joined by stairs, one stair up per floor, far from where you arrive | a hand on the hedge never climbs: ask for `up` first | `up`, `down` | a stair glyph on the map; the floor in the hud | a stack of grids with stair links | done |
| **Polar** (now) | rings round a well; the spokes wrap | Binary Tree: in or sunwise reaches the well, at the seam. Sidewinder: the long walk circles the well. | `in`, `out`, `sunwise`, `widdershins` replace the compass; "Inward, the way runs two paces" | the map is rings and spokes; the view keeps its straight wireframe, honest to within the curve of a ring | `PolarGrid`: equal spokes on every ring, so `Cell`'s four flags still serve | done |
| **Hex** | six ways; turns of sixty degrees | weak; Sidewinder's runs become diagonals | six direction names | corridors bend at 120 degrees: the wireframe needs a diagonal frame | a new grid class | large |
| **Weave** | passages pass over and under each other | none new; a perfect weave still yields to the left hand. Pretty, and a good map lesson. | "a way under the hedge" | a tunnel mouth; the map needs a bridge glyph | a grid with under-cells | large |
| **Labyrinth** | one path, no choices (unicursal) | the opposite lesson: a process with no decisions. `(until (gate?) (go ahead))` with turns handled | none | none | braid to zero branches, or a Chartres pattern | small |
| **Shifting** | a wall regrows every N turns | memory lies; a spell must test, not remember | none | none | re-run a step of the algorithm on a timer | medium |
| **A graph** (now: the cave) | rooms with named exits, not a grid: a MUD. The first is the dodecahedron, Hunt the Wumpus's twenty caves. | Hamilton's walk: a word of twenty lefts and rights visits every cave. A hand on the wall goes round in five. | tunnels by number (`8`); `left`, `right`, `back` from the tunnel you came by; no compass, no turning | three tunnel mouths; the die unfolded for a map | `cave.py`, not MazeBuilder's job | done; the Fort's rooms are a room table away |

## What each teaches

- **Braided**: wall-following fails. Breadth-first search (the classroom's stage 7) or a mark is the general process. The spell language will want memory: `(mark)` and `(marked? D)` are two words and enough for a Trémaux walk.
- **Floors**: a third dimension is just a third pair of words. The algorithms do not care, which is the point.
- **Polar**: the same algorithm on a different grid leaves a different tell. Binary Tree's "always north or east" becomes "always in or sunwise". A student who has learned the first can predict the second, and `spells/sunwise.scm` is `north-east.scm` with the words changed. Two things were decided for it. Every ring has the same number of cells (a true polar grid doubles them as the rings widen, but then a cell can have two outward neighbours, which four flags cannot say); the rings are drawn as rings, so the inner cells are narrow slices and the outer ones wide. And a **seam**: Binary Tree and Sidewinder treat the last spoke as an edge and never link across it, so one wall runs from the well to the rim and their mazes stay perfect (a ring whose every cell linked sunwise would be a loop). Aldous-Broder and braiding cross the seam. The seam is the polar corner, and the plate names it.
- **Labyrinth**: a maze with no choices is a loop with no test. It is the degenerate spell, and a good first lesson.
- **A graph**: when the grid goes, so does the picture, and the words carry everything. That is the MUD, and that is where the Fort's rooms live. The cave is the first graph, and we keep its lineage in plain sight: Gregory Yob's Hunt the Wumpus (1973) put its caves on the dodecahedron, and Hamilton's Icosian game (1857) asked for a walk through all twenty. Three things were decided for it. A heading is not a compass word but *the room you came from*, so `left` and `right` are told from your own tunnel, as Hamilton told them (right is the next tunnel counterclockwise after yours, left the one before); there is no `turn` and no `face`, because there is nothing to turn by, and the checker refuses them in a cave. The senses stand in for sight lines: a draft where the gate is next door, a smell where the wumpus sleeps (it only sleeps: no fights here). And the map is the Schlegel diagram, the die unfolded flat, which the server sends as a layout so the page draws no geometry of its own. The seed renumbers the caves and places the mouth, the gate (its antipode, five tunnels away) and the wumpus; the bones are always the die.

## Recommended order

1. **Braided**, done.
2. **Floors**, done: a stack of hedges joined by stairs. A true three-dimensional Binary Tree (always north, east or up) would need a 3D grid in MazeBuilder and is still open.
3. **Polar**, done: the best new tell for the least new engine. It forced the Topology abstraction, which everything after it needs.
4. **A graph**, done as the cave. `topology.Graph` has no grid: `ways` and `step` read `cave.py`'s tunnel table. The Fort's rooms are the same class over a different table, with exits named by words ("the door", "the well") instead of numbers; that table is the next thing to write, and it is content, not engine.
5. **Weave** and **hex** when there is time for the view. They are mostly drawing.

## A note on MazeBuilder

MazeBuilder has a rectangular `Grid` with four directions on bit flags, the braid, and now `PolarGrid` (`py_port/polar_grid.py`): a `Grid` whose columns wrap, with `main.py --polar` to show one unrolled. Hex, weave and masked grids would each be another `Grid` class with the same `random_int` and `link` interface, so the algorithms keep working, and the hedge keeps rolling the same dice.
