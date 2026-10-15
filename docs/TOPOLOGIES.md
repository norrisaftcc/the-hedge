# Other hedges: a note on topologies

A hedge today is a rectangular grid of cells with four ways, grown as a tree (a perfect maze) and now, with `--braid`, with loops. This note ponders what else a hedge could be, what each would cost, and what each would teach. The test for a topology is the same as for an algorithm: **does it leave a tell?** A tell is a process a player can learn to say.

## What the engine assumes

`world.py` knows four compass directions, their opposites, and that `left` of `north` is `west`. `spell.py` knows the same four words plus `ahead back left right`. The first-person view assumes straight corridors that turn by right angles. Everything else (rooms, light, the hub, the transports) asks only `ways(pos)` and `move(pos, direction)`.

So one abstraction unlocks most of what follows: a **Topology** that owns the direction names, their opposites, what a turn does to a heading, how to step, and the words for each way. `world.py` and `spell.py` would read their direction sets from it. The grammar and the game would not change. The view would need to know the turn angle.

## The hedges

| Hedge | What it is | The tell | Words | View | MazeBuilder | Cost |
|-------|-----------|----------|-------|------|-------------|------|
| **Braided** (now) | dead ends joined; loops | the left-hand rule circles. Memory wins: a mark, a map, a search. | none new | none | `Braid.on` | done |
| **Masked** | cells removed; a hedge shaped like a thing (a letter, a lake, the Fort's wall) | none by shape; the algorithm's tell survives | none | none | a mask on the grid before growing | small |
| **Cylinder** | the east edge joins the west edge | Sidewinder's long walk becomes a ring: "the way east comes back to where it began" | none | none | wrap column indices | small |
| **Floors** | several hedges joined by stairs | Binary Tree in three dimensions: always north, east or up | `up`, `down`; `(go up)` finally means something | a stair glyph; the overhead map gets a floor picker | a stack of grids with stair links, as the Crawler already does | medium |
| **Polar** | rings and spokes, growing outward from a centre | Binary Tree on rings: always inward or sunwise reaches the centre. The best new tell. | `in`, `out`, `sunwise`, `widdershins` replace the compass; "Inward, the way runs two paces" | curved walls; a straight wireframe is an honest approximation | a new grid class: rings of unequal cell counts | medium |
| **Hex** | six ways; turns of sixty degrees | weak; Sidewinder's runs become diagonals | six direction names | corridors bend at 120 degrees: the wireframe needs a diagonal frame | a new grid class | large |
| **Weave** | passages pass over and under each other | none new; a perfect weave still yields to the left hand. Pretty, and a good map lesson. | "a way under the hedge" | a tunnel mouth; the map needs a bridge glyph | a grid with under-cells | large |
| **Labyrinth** | one path, no choices (unicursal) | the opposite lesson: a process with no decisions. `(until (gate?) (go ahead))` with turns handled | none | none | braid to zero branches, or a Chartres pattern | small |
| **Shifting** | a wall regrows every N turns | memory lies; a spell must test, not remember | none | none | re-run a step of the algorithm on a timer | medium |
| **A graph** | rooms with named exits, not a grid: a MUD | whatever the builder puts there | exits by name: "a door", "the stair", "the well" | no geometry to draw; show the room as a count of doors, or a hand-drawn picture per room | not MazeBuilder's job | the destination |

## What each teaches

- **Braided**: wall-following fails. Breadth-first search (the classroom's stage 7) or a mark is the general process. The spell language will want memory: `(mark)` and `(marked? D)` are two words and enough for a Trémaux walk.
- **Floors**: a third dimension is just a third pair of words. The algorithms do not care, which is the point.
- **Polar**: the same algorithm on a different grid leaves a different tell. Binary Tree's "always north or east" becomes "always inward or sunwise". A student who has learned the first can predict the second.
- **Labyrinth**: a maze with no choices is a loop with no test. It is the degenerate spell, and a good first lesson.
- **A graph**: when the grid goes, so does the picture, and the words carry everything. That is the MUD, and that is where the Fort's rooms live.

## Recommended order

1. **Braided**, done in this change.
2. **Floors**: the Crawler already models stairs between maps, the Forge grows towers, and `(go up)` is the most asked-for word. The spell language gains two directions.
3. **Polar**: the best new tell for the least new engine. It forces the Topology abstraction, which everything after it needs.
4. **A graph**: the destination for the Fort Country. By then the words do all the work and the pictures are optional.
5. **Weave** and **hex** when there is time for the view. They are mostly drawing.

## A note on MazeBuilder

MazeBuilder has one grid, rectangular, with four directions on bit flags, and the braid now. Polar, hex, weave and masked grids are each a new `Grid` class with the same `random_int` and `link` interface, so the algorithms keep working, and the hedge keeps rolling the same dice.
