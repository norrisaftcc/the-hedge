"""Topologies: what the ways are called, which is opposite which, what a turn
does to a heading, and how a step moves.

A hedge is square or polar. Everything else (rooms, light, spells, the hub,
the transports) asks the hedge for ways(pos) and move(pos, direction), and
the hedge asks its topology. The spell language reads its direction words
from here too, so a polar hedge refuses (go north) before it runs.

    SQUARE   north east south west      a grid; MazeBuilder's Grid
    POLAR    in widdershins out sunwise rings round a well; MazeBuilder's PolarGrid.
                                        Sunwise is clockwise. Facing in, sunwise is on your left.

dirs are in right-turn order: the way to the right of dirs[i] is dirs[i + 1].
up and down are not a topology's: a stair opens them, on any hedge.
"""

from .maze import Cell, SeededGrid, SeededPolarGrid

VERTICAL = ("up", "down")
RELATIVE = ("ahead", "back", "left", "right")
TURNS = ("left", "right", "around")


class Topology:
    name = ""
    dirs = ()       # the four ways, in right-turn order
    bits = {}       # way -> Cell flag
    labels = {}     # way -> the word that opens a sentence: "North," "Inward,"
    came = {}       # way walked -> where a watcher sees you come from: "from the south"
    grid_class = None

    def opposite(self, d):
        if d in VERTICAL:
            return "down" if d == "up" else "up"
        return self.dirs[(self.dirs.index(d) + 2) % 4]

    def right(self, d):
        return self.dirs[(self.dirs.index(d) + 1) % 4]

    def left(self, d):
        return self.dirs[(self.dirs.index(d) - 1) % 4]

    def relative(self, heading, which):
        """A relative word (ahead back left right) to one of this topology's ways.
        A way of this topology, or up and down, is itself."""
        if which in self.dirs or which in VERTICAL:
            return which
        return {"ahead": heading, "back": self.opposite(heading),
                "right": self.right(heading), "left": self.left(heading)}[which]

    def label(self, d):
        return self.labels.get(d, d.capitalize())

    def ways(self, grid, r, c):
        """The open ways from (r, c), in this topology's order."""
        cell = grid.at(r, c)
        return [d for d in self.dirs if cell.linked(self.bits[d])]

    def step(self, grid, r, c, d):
        """(r, c) one step away, or None off the grid. Does not look at walls."""
        raise NotImplementedError

    def grid(self, rows, cols, seed):
        return self.grid_class(rows, cols, seed)

    def size_words(self, rows, cols):
        return f"{rows} by {cols}"


class Square(Topology):
    name = "square"
    dirs = ("north", "east", "south", "west")
    bits = {"north": Cell.NORTH, "east": Cell.EAST, "south": Cell.SOUTH, "west": Cell.WEST}
    labels = {}
    came = {d: f"from the {o}" for d, o in (("north", "south"), ("south", "north"), ("east", "west"), ("west", "east"))}
    grid_class = SeededGrid
    OFFSETS = {"north": (-1, 0), "east": (0, 1), "south": (1, 0), "west": (0, -1)}

    def step(self, grid, r, c, d):
        dr, dc = self.OFFSETS[d]
        r, c = r + dr, c + dc
        return (r, c) if 0 <= r < grid.rows and 0 <= c < grid.cols else None


class Polar(Topology):
    name = "polar"
    dirs = ("in", "widdershins", "out", "sunwise")
    bits = {"in": Cell.NORTH, "out": Cell.SOUTH, "sunwise": Cell.EAST, "widdershins": Cell.WEST}
    labels = {"in": "Inward", "out": "Outward"}
    came = {"in": "from the ring outside", "out": "from the ring inside", "sunwise": "from widdershins", "widdershins": "from sunwise"}
    grid_class = SeededPolarGrid

    def step(self, grid, r, c, d):
        if d == "in":
            return (r - 1, c) if r > 0 else None
        if d == "out":
            return (r + 1, c) if r + 1 < grid.rows else None
        return (r, (c + (1 if d == "sunwise" else -1)) % grid.cols)

    def size_words(self, rows, cols):
        return f"{rows} rings of {cols} spokes"


SQUARE, POLAR = Square(), Polar()
TOPOLOGIES = {t.name: t for t in (SQUARE, POLAR)}
SHAPES = tuple(TOPOLOGIES)
ABSOLUTE = tuple(d for t in (SQUARE, POLAR) for d in t.dirs)  # every way word any hedge knows
