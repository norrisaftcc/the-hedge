"""The hedge as a place: rooms, what you see from them, the plate, the gate.

The room description is the source of truth. Everything a first-person window
would draw (how far the way runs, where it opens, what ends it) is in the
sentence, computed from the same cells. A window that draws from these
numbers cannot disagree with the text.
"""

from . import maze
from .maze import DIRS, OPPOSITE, open_ways, step

TORCH_PACES = 3  # how far a torch shows

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


class Hedge:
    """One maze, grown once, shared by everyone on the server."""

    def __init__(self, rows=8, cols=8, algorithm="sidewinder", seed=1, braid=0.0):
        self.rows, self.cols, self.algorithm, self.seed, self.braid = rows, cols, algorithm, seed, braid
        self.grid = maze.grow(rows, cols, algorithm, seed, braid)
        self.path = maze.longest_path(self.grid)
        self.entrance, self.gate = self.path[0], self.path[-1]
        self.dist = maze.distances_from(self.grid, *self.entrance)
        self.tell = BRAIDED_TELL if braid else TELLS[algorithm]

    # ---- geometry ----
    def ways(self, pos):
        return open_ways(self.grid, *pos)

    def is_open(self, pos, direction):
        return direction in self.ways(pos)

    def move(self, pos, direction):
        """The cell one step away, or None if the hedge is in the way."""
        return step(*pos, direction) if self.is_open(pos, direction) else None

    def is_dead_end(self, pos):
        return len(self.ways(pos)) == 1

    def ring(self, pos):
        return self.dist[pos]

    def sight(self, pos, direction, paces=TORCH_PACES):
        """What lies along the straight way from pos, as far as the light reaches.

        Returns (run, openings, end): run is how many paces the way goes before
        a wall or the dark; openings is a list of (pace, side) seen on the way,
        side being "left" or "right"; end is "dark", "dead end", "turns left",
        "turns right", "a fork" or "the gate".
        """
        if not self.is_open(pos, direction):
            return 0, [], "wall"
        left, right = DIRS[(DIRS.index(direction) - 1) % 4], DIRS[(DIRS.index(direction) + 1) % 4]
        here, run, openings = pos, 0, []
        while run < paces and self.is_open(here, direction):
            here = step(*here, direction)
            run += 1
            if here == self.gate:
                return run, openings, "the gate"
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
        return f"Ring {self.ring(pos)} of the Hedge"

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
        if self.is_dead_end(pos) and pos not in (self.entrance, self.gate):
            lines.append("A dead end.")
        for d in ways:
            run, openings, end = self.sight(pos, d)
            text = f"{d.capitalize()}, the way runs {words(run)} {'pace' if run == 1 else 'paces'}"
            if openings:
                text += " with " + join(self._openings(openings))
            ending = {
                "dark": "and goes on into the dark",
                "dead end": "to a dead end",
                "the gate": "to a stair and daylight",
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
        return self.tell["rule"] if read_fully else self.tell["brush"]

    def map_text(self, seen, pos=None):
        """A top-down map of the cells the player has seen, in MazeBuilder's style."""
        g = self.grid
        out = []
        for r in range(g.rows):
            top, mid = "", ""
            for c in range(g.cols):
                here = (r, c) in seen
                up = (r - 1, c) in seen
                cell = g.at(r, c)
                top += "+" + ("   " if (here or up) and cell.linked(maze.DIR_BIT["north"]) else ("---" if here or up else "   "))
                left = (r, c - 1) in seen
                wall = "|" if (here or left) and not cell.linked(maze.DIR_BIT["west"]) else " "
                body = " @ " if (r, c) == pos else ("   " if here else "   ")
                if (r, c) == self.gate and here:
                    body = " > "
                if (r, c) == self.entrance and here and (r, c) != pos:
                    body = " < "
                mid += wall + body
            last = g.at(r, g.cols - 1)
            out.append(top + "+")
            out.append(mid + ("|" if (r, g.cols - 1) in seen and not last.linked(maze.DIR_BIT["east"]) else " "))
        bottom = ""
        for c in range(g.cols):
            cell = g.at(g.rows - 1, c)
            bottom += "+" + ("---" if (g.rows - 1, c) in seen and not cell.linked(maze.DIR_BIT["south"]) else "   ")
        out.append(bottom + "+")
        return "\n".join(out)

    def relative(self, heading, which):
        """Turn a relative direction into a compass one."""
        if which in DIRS:
            return which
        i = DIRS.index(heading)
        return {"ahead": heading, "back": OPPOSITE[heading],
                "right": DIRS[(i + 1) % 4], "left": DIRS[(i - 1) % 4]}[which]
