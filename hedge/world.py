"""The hedge as a place: rooms, what you see from them, the plate, the gate.

The room description is the source of truth. Everything a first-person window
would draw (how far the way runs, where it opens, what ends it) is in the
sentence, computed from the same cells. A window that draws from these
numbers cannot disagree with the text.

A position is (floor, row, col). A hedge of one floor is the common case; a
hedge of several is a stack of hedges joined by stairs, one stair up per
floor, far from where you arrive. "up" and "down" are ways like any other.
"""

from . import maze
from .maze import DIRS, OPPOSITE, VERTICAL, open_ways, step

TORCH_PACES = 3  # how far a torch shows
MASK = 0xFFFFFFFF

TELLS = {
    "binary": {
        "brush": "The hedge leans. Every square seems to open north, or east, or both.",
        "rule": ("Every square opens north or east. Walk north and east and you reach "
                 "the north-east corner from anywhere. From that corner, one way leads "
                 "down to every square."),
    },
    "sidewinder": {
        "brush": "A long walk runs along the north edge. The rows below are broken into runs.",
        "rule": ("Every row is runs of squares, and every run has one gate north. "
                 "Go up to the long walk, along it, and down. The way down is the only way."),
    },
    "aldous-broder": {
        "brush": "The hedge has no grain. It was grown by something that wandered.",
        "rule": "There is no rule. Every hedge of this size was as likely as this one. Keep one hand on the hedge.",
    },
}

BRAIDED_TELL = {
    "brush": "The hedge has few dead ends, or none. Ways that part meet again.",
    "rule": ("The hedge has loops. A hand on the hedge goes round and round and never reaches the gate. "
             "Remember where you have been: chalk a mark, keep a map, or search outward from the mouth."),
}

FLOORS_TELL = {
    "brush": "Stairs. The hedge goes on above.",
    "rule": ("The hedge has {n} floors. Each floor has one stair up, and it stands far from where you arrive. "
             "A hand on the hedge never climbs a stair: a spell must ask for up."),
}

NUMBER = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine"}


def words(n):
    return NUMBER.get(n, str(n))


def join(items):
    items = list(items)
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def floor_seed(seed, floor):
    """Each floor is its own hedge from its own seed, all fixed by the first."""
    return seed if floor == 0 else (seed * 1000003 + floor) & MASK


class Hedge:
    """One maze, grown once, shared by everyone on the server."""

    def __init__(self, rows=8, cols=8, algorithm="sidewinder", seed=1, braid=0.0, floors=1):
        if floors < 1:
            raise ValueError("a hedge has at least one floor")
        self.rows, self.cols, self.algorithm, self.seed, self.braid, self.floors = rows, cols, algorithm, seed, braid, floors
        self.grids = [maze.grow(rows, cols, algorithm, floor_seed(seed, f), braid) for f in range(floors)]
        self.grid = self.grids[0]
        self.stairs = {}  # pos -> the pos at the other end of the stair
        path0 = maze.longest_path(self.grid)
        self.entrance = (0,) + path0[0]
        self.path = [(0,) + rc for rc in path0]
        # Each floor is walked from where you arrive to its farthest cell: the stair up, or on the top floor the gate.
        self.dist = {}
        here, offset = self.entrance, 0
        for f in range(floors):
            d = maze.distances_from(self.grids[f], here[1], here[2])
            far = maze.farthest_from(self.grids[f], here[1], here[2])
            for rc, n in d.items():
                self.dist[(f,) + rc] = offset + n
            if f == floors - 1:
                self.gate = (f,) + far
            else:
                top, below = (f,) + far, (f + 1,) + far
                self.stairs[top], self.stairs[below] = below, top
                offset += d[far] + 1
                here = below
        self.tell = BRAIDED_TELL if braid else TELLS[algorithm]

    # ---- geometry ----
    def ways(self, pos):
        f, r, c = pos
        ways = open_ways(self.grids[f], r, c)
        other = self.stairs.get(pos)
        if other is not None:
            ways.append("up" if other[0] > f else "down")
        return ways

    def is_open(self, pos, direction):
        return direction in self.ways(pos)

    def move(self, pos, direction):
        """The cell one step away, or None if the hedge is in the way."""
        if not self.is_open(pos, direction):
            return None
        if direction in VERTICAL:
            return self.stairs[pos]
        return (pos[0],) + step(pos[1], pos[2], direction)

    def is_dead_end(self, pos):
        return len(self.ways(pos)) == 1

    def ring(self, pos):
        return self.dist[pos]

    def sight(self, pos, direction, paces=TORCH_PACES):
        """What lies along the straight way from pos, as far as the light reaches.

        Returns (run, openings, end): run is how many paces the way goes before
        a wall or the dark; openings is a list of (pace, side) seen on the way,
        side being "left" or "right"; end is "dark", "dead end", "turns left",
        "turns right", "a fork", "a stair" or "the gate". Stairs have no sight line.
        """
        if direction in VERTICAL or not self.is_open(pos, direction):
            return 0, [], "wall"
        left, right = DIRS[(DIRS.index(direction) - 1) % 4], DIRS[(DIRS.index(direction) + 1) % 4]
        here, run, openings = pos, 0, []
        while run < paces and self.is_open(here, direction):
            here = self.move(here, direction)
            run += 1
            if here == self.gate:
                return run, openings, "the gate"
            if here in self.stairs:
                return run, openings, "a stair"
            sides = [s for s, d in (("left", left), ("right", right)) if self.is_open(here, d)]
            if self.is_open(here, direction):
                openings.extend((run, s) for s in sides)
                continue
            if not sides:
                return run, openings, "dead end"
            return run, openings, "a fork" if len(sides) == 2 else f"turns {sides[0]}"
        return run, openings, "dark"

    # ---- words ----
    def name(self, pos):
        if pos == self.entrance:
            return "The Mouth of the Hedge"
        if pos == self.gate:
            return "The Far Gate"
        floor = f", floor {pos[0] + 1}" if self.floors > 1 else ""
        return f"Ring {self.ring(pos)} of the Hedge{floor}"

    def describe(self, pos, lit=True):
        """The room, as the player reads it. One sentence per open way."""
        lines = [self.name(pos)]
        ways = self.ways(pos)
        if not lit:
            lines.append("It is dark. You feel along the hedge.")
            lines.append(f"Open ways: {join(ways)}." if ways else "The hedge closes on every side.")
            return "\n".join(lines)
        if pos == self.entrance:
            lines.append("A stair goes up behind you. A plate is set in the hedge beside it.")
        if pos == self.gate:
            lines.append("A stair goes up into daylight. This is the way out.")
        if "up" in ways:
            lines.append("A stair goes up from here, into the floor above.")
        if "down" in ways:
            lines.append("A stair comes up from the floor below.")
        if self.is_dead_end(pos) and pos not in (self.entrance, self.gate):
            lines.append("A dead end.")
        for d in ways:
            if d in VERTICAL:
                continue
            run, openings, end = self.sight(pos, d)
            text = f"{d.capitalize()}, the way runs {words(run)} {'pace' if run == 1 else 'paces'}"
            if openings:
                text += " with " + join(self._openings(openings))
            ending = {
                "dark": "and goes on into the dark",
                "dead end": "to a dead end",
                "the gate": "to a stair and daylight",
                "a stair": "to a stair",
                "a fork": "and forks",
            }.get(end, "and " + end)
            lines.append(f"{text} {ending}.")
        return "\n".join(lines)

    @staticmethod
    def _openings(openings):
        """'an opening on the left at two', 'openings on the right at one and three'."""
        for side in ("left", "right"):
            paces = [words(pace) for pace, s in openings if s == side]
            if len(paces) == 1:
                yield f"an opening on the {side} at {paces[0]}"
            elif paces:
                yield f"openings on the {side} at {join(paces)}"

    def plate(self, read_fully):
        text = self.tell["rule"] if read_fully else self.tell["brush"]
        if self.floors > 1:
            text += " " + (FLOORS_TELL["rule"].format(n=words(self.floors)) if read_fully else FLOORS_TELL["brush"])
        return text

    def map_text(self, seen, pos=None):
        """A top-down map of the cells the player has seen on this floor, in MazeBuilder's style."""
        floor = pos[0] if pos else 0
        g = self.grids[floor]
        on_floor = {(r, c) for f, r, c in seen if f == floor}
        here_rc = pos[1:] if pos else None
        out = []
        for r in range(g.rows):
            top, mid = "", ""
            for c in range(g.cols):
                here = (r, c) in on_floor
                up = (r - 1, c) in on_floor
                cell = g.at(r, c)
                top += "+" + ("   " if (here or up) and cell.linked(maze.DIR_BIT["north"]) else ("---" if here or up else "   "))
                left = (r, c - 1) in on_floor
                wall = "|" if (here or left) and not cell.linked(maze.DIR_BIT["west"]) else " "
                body = "   "
                if here:
                    other = self.stairs.get((floor, r, c))
                    if other is not None:
                        body = " ^ " if other[0] > floor else " v "
                    if (floor, r, c) == self.gate:
                        body = " > "
                    if (floor, r, c) == self.entrance:
                        body = " < "
                if (r, c) == here_rc:
                    body = " @ "
                mid += wall + body
            last = g.at(r, g.cols - 1)
            out.append(top + "+")
            out.append(mid + ("|" if (r, g.cols - 1) in on_floor and not last.linked(maze.DIR_BIT["east"]) else " "))
        bottom = ""
        for c in range(g.cols):
            cell = g.at(g.rows - 1, c)
            bottom += "+" + ("---" if (g.rows - 1, c) in on_floor and not cell.linked(maze.DIR_BIT["south"]) else "   ")
        out.append(bottom + "+")
        if self.floors > 1:
            out.append(f"Floor {floor + 1} of {self.floors}.")
        return "\n".join(out)

    def relative(self, heading, which):
        """Turn a relative direction into a compass one. Up and down are themselves."""
        if which in DIRS or which in VERTICAL:
            return which
        i = DIRS.index(heading)
        return {"ahead": heading, "back": OPPOSITE[heading],
                "right": DIRS[(i + 1) % 4], "left": DIRS[(i - 1) % 4]}[which]
