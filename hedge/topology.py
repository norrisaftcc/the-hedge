"""Topologies: what the ways are called, which is opposite which, what a turn
does to a heading, and how a step moves.

A hedge is square, polar or a cave. Everything else (rooms, light, spells, the
hub, the transports) asks the hedge for ways(pos) and move(pos, direction),
and the hedge asks its topology. The spell language reads its direction words
from here too, so a polar hedge refuses (go north) before it runs, and a cave
refuses (turn left).

    SQUARE   north east south west       a grid; MazeBuilder's Grid
    POLAR    in widdershins out sunwise  rings round a well; MazeBuilder's PolarGrid.
                                         Sunwise is clockwise. Facing in, sunwise is on your left.
    CAVE     the tunnels, by number      twenty caves on the twelve-sided die (cave.py). No compass
                                         at all: left, right and back are told from the tunnel you came by.

A grid's dirs are in right-turn order: the way to the right of dirs[i] is
dirs[i + 1]. A heading on a grid is one of its dirs; in a cave it is the room
you came from, or None for a stair. up and down are not a topology's: a stair
opens them, on any hedge.

A cell is a tuple: (row, col) on a grid, (room,) in a cave. A position is
(floor,) + cell.
"""

from . import maze
from .cave import Cave, ROOMS
from .maze import Cell, SeededGrid, SeededPolarGrid

VERTICAL = ("up", "down")
RELATIVE = ("ahead", "back", "left", "right")
TURNS = ("left", "right", "around")


class Topology:
    name = ""
    dirs = ()        # the absolute way words, if any
    rooms = 0        # if > 0, the numbers 1..rooms are way words too: a cave's tunnels
    turns = True     # can you face a way and turn without a step?
    labels = {}      # way -> the word that opens a sentence: "North," "Inward,"

    # ---- words ----
    def is_way(self, word):
        """Is word one of this topology's absolute ways?"""
        return word in self.dirs or (self.rooms > 0 and word.isdigit() and 1 <= int(word) <= self.rooms)

    def label(self, d):
        return self.labels.get(d, d.capitalize())

    def facing(self, heading):
        """'Facing north'. For score lines and the hud."""
        return f"Facing {heading}"

    def came(self, floor, cell, way):
        """Where a watcher in the next room sees you come from: 'from the south'."""
        return f"from the {self.opposite(way)}"

    def bump(self, way, spell=False):
        return f"The spell walks into the hedge, {way}, and breaks." if spell else "The hedge is in the way."

    def going(self, way):
        """What a watcher in the room sees you do: 'goes north'."""
        return f"goes {way}"

    def ways_words(self):
        """The ways, for a help line or an error."""
        return ", ".join(self.dirs)

    def size_words(self, rows, cols):
        return f"{rows} by {cols}"

    # ---- headings ----
    def start_heading(self):
        return self.dirs[0]

    def heading_after(self, floor, cell, way, heading):
        """The heading after a step `way` from cell."""
        return way if way in self.dirs else heading

    def opposite(self, d):
        if d in VERTICAL:
            return "down" if d == "up" else "up"
        return self.dirs[(self.dirs.index(d) + 2) % 4]

    def right(self, d):
        return self.dirs[(self.dirs.index(d) + 1) % 4]

    def left(self, d):
        return self.dirs[(self.dirs.index(d) - 1) % 4]

    def relative(self, floor, cell, heading, which):
        """A relative word (ahead back left right) to a way from cell, or None where
        there is nothing that way. A way of this topology, or up and down, is itself."""
        if self.is_way(which) or which in VERTICAL:
            return which
        return {"ahead": heading, "back": self.opposite(heading),
                "right": self.right(heading), "left": self.left(heading)}[which]

    def turn(self, floor, cell, heading, which):
        """The heading after turning left, right or around; None where turning means nothing."""
        return {"left": self.left(heading), "right": self.right(heading), "around": self.opposite(heading)}[which]

    # ---- cells ----
    def grow(self, rows, cols, algorithm, seed, braid=0.0):
        raise NotImplementedError

    def cells(self, floor):
        raise NotImplementedError

    def ways(self, floor, cell):
        raise NotImplementedError

    def step(self, floor, cell, way):
        """The cell one step away, or None off the hedge. Does not look at walls."""
        raise NotImplementedError

    def distances(self, floor, cell):
        raise NotImplementedError

    def farthest(self, floor, cell):
        raise NotImplementedError

    def longest_path(self, floor):
        """The two cells farthest apart, and the way between: the mouth and the gate."""
        raise NotImplementedError


class Grid(Topology):
    """Four ways on MazeBuilder cells. Square and Polar differ in words and in how a step moves."""
    bits = {}
    grid_class = None

    def grow(self, rows, cols, algorithm, seed, braid=0.0):
        return maze.grow(rows, cols, algorithm, seed, braid, self.grid_class)

    def cells(self, grid):
        return [(r, c) for r in range(grid.rows) for c in range(grid.cols)]

    def ways(self, grid, cell):
        here = grid.at(*cell)
        return [d for d in self.dirs if here.linked(self.bits[d])]

    def distances(self, grid, cell):
        return maze.distances_from(grid, *cell)

    def farthest(self, grid, cell):
        return maze.farthest_from(grid, *cell)

    def longest_path(self, grid):
        return maze.longest_path(grid)


class Square(Grid):
    name = "square"
    dirs = ("north", "east", "south", "west")
    bits = {"north": Cell.NORTH, "east": Cell.EAST, "south": Cell.SOUTH, "west": Cell.WEST}
    grid_class = SeededGrid
    OFFSETS = {"north": (-1, 0), "east": (0, 1), "south": (1, 0), "west": (0, -1)}

    def step(self, grid, cell, d):
        dr, dc = self.OFFSETS[d]
        r, c = cell[0] + dr, cell[1] + dc
        return (r, c) if 0 <= r < grid.rows and 0 <= c < grid.cols else None


class Polar(Grid):
    name = "polar"
    dirs = ("in", "widdershins", "out", "sunwise")
    bits = {"in": Cell.NORTH, "out": Cell.SOUTH, "sunwise": Cell.EAST, "widdershins": Cell.WEST}
    labels = {"in": "Inward", "out": "Outward"}
    CAME = {"in": "from the ring outside", "out": "from the ring inside", "sunwise": "from widdershins", "widdershins": "from sunwise"}
    grid_class = SeededPolarGrid

    def came(self, grid, cell, way):
        return self.CAME[way]

    def step(self, grid, cell, d):
        r, c = cell
        if d == "in":
            return (r - 1, c) if r > 0 else None
        if d == "out":
            return (r + 1, c) if r + 1 < grid.rows else None
        return (r, (c + (1 if d == "sunwise" else -1)) % grid.cols)

    def size_words(self, rows, cols):
        return f"{rows} rings of {cols} spokes"


class Graph(Topology):
    """Rooms with named tunnels, no compass. The first graph is the cave: the dodecahedron."""
    name = "cave"
    dirs = ()
    rooms = ROOMS
    turns = False

    def label(self, way):
        return f"The tunnel to {way}"

    def facing(self, heading):
        return "Your back to the stair" if heading is None else f"Your back to cave {heading}"

    def came(self, cave, cell, way):
        return f"in from cave {cell[0]}"

    def bump(self, way, spell=False):
        return f"The spell walks into the rock, {way}, and breaks." if spell else "Rock. No tunnel leads that way."

    def going(self, way):
        return f"takes the tunnel to {way}"

    def ways_words(self):
        return "the tunnels, by number, and left, right and back from the tunnel you came by"

    def size_words(self, rows, cols):
        return "twenty caves of three tunnels"

    def start_heading(self):
        return None

    def heading_after(self, cave, cell, way, heading):
        return cell[0] if way not in VERTICAL else None  # a stair stands behind you like the first one

    def opposite(self, d):
        if d in VERTICAL:
            return "down" if d == "up" else "up"
        raise ValueError("a tunnel has no opposite; back is the tunnel you came by")

    def relative(self, cave, cell, heading, which):
        if self.is_way(which) or which in VERTICAL:
            return which
        room = cave.relative(cell[0], heading, which)
        return None if room is None else str(room)

    def turn(self, cave, cell, heading, which):
        return None

    def grow(self, rows, cols, algorithm, seed, braid=0.0):
        return Cave(seed)

    def cells(self, cave):
        return [(r,) for r in cave.rooms()]

    def ways(self, cave, cell):
        return [str(r) for r in cave.tunnels[cell[0]]]

    def step(self, cave, cell, way):
        return (int(way),) if way.isdigit() and int(way) in cave.tunnels[cell[0]] else None

    def distances(self, cave, cell):
        return {(r,): n for r, n in cave.distances(cell[0]).items()}

    def farthest(self, cave, cell):
        d = cave.distances(cell[0])
        return (max(d.items(), key=lambda kv: (kv[1], -kv[0]))[0],)

    def longest_path(self, cave):
        return [(r,) for r in cave.path(cave.entrance, cave.gate)]


SQUARE, POLAR, CAVE = Square(), Polar(), Graph()
TOPOLOGIES = {t.name: t for t in (SQUARE, POLAR, CAVE)}
SHAPES = tuple(TOPOLOGIES)
ABSOLUTE = tuple(d for t in (SQUARE, POLAR) for d in t.dirs)  # every compass-like way word any hedge knows
