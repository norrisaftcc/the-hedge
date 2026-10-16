"""The hedge as a place: rooms, what you see from them, the plate, the gate.

The room description is the source of truth. Everything a first-person window
would draw (how far the way runs, where it opens, what ends it) is in the
sentence, computed from the same cells. A window that draws from these
numbers cannot disagree with the text.

A position is (floor, row, col). A hedge of one floor is the common case; a
hedge of several is a stack of hedges joined by stairs, one stair up per
floor, far from where you arrive. "up" and "down" are ways like any other.

A hedge has a shape, its topology: square (north east south west), polar
(in widdershins out sunwise: rings round a well) or a cave (twenty rooms on
the twelve-sided die, tunnels named by where they lead, and no compass at
all). The topology owns the way words, what a turn does, and how a step
moves. The rooms ask it; so does everything above them.

A position is (floor,) + cell: (floor, row, col) on a grid, (floor, room) in a cave.
"""

from .topology import RELATIVE, TOPOLOGIES, VERTICAL

TORCH_PACES = 3  # how far a torch shows
MASK = 0xFFFFFFFF

TELLS = {
    "square": {
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
    },
    "polar": {
        "binary": {
            "brush": "The hedge leans inward. Every square seems to open in, or sunwise, or both.",
            "rule": ("Every square opens in or sunwise. Walk in and sunwise and you come to the well "
                     "from anywhere, where one wall, the seam, runs from the well to the rim and stops you. "
                     "From there, one way leads out to every square."),
        },
        "sidewinder": {
            "brush": "A long walk circles the well. The rings outside it are broken into runs.",
            "rule": ("Every ring is runs of squares, and every run has one gate in. "
                     "Go in to the walk round the well, round it, and out. The way out is the only way."),
        },
        "aldous-broder": {
            "brush": "The hedge has no grain. It was grown by something that wandered round the well.",
            "rule": "There is no rule. Every hedge of this size was as likely as this one. Keep one hand on the hedge.",
        },
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

CAVE_TELL = {
    "brush": ("Twenty caves, three tunnels each, and no dead ends. There is no north here: left and right "
              "are from the tunnel you came by. A hand on the wall goes round in five and comes back."),
    "rule": ("Twenty caves, three tunnels each, laid out as the twelve-sided die, the old Wumpus map. "
             "A hand on the wall walks one face of the die: five caves, and back where you began. "
             "Hamilton's walk visits every cave once and comes home: from the stair go ahead, then "
             "left left left right right right left right left right, and again. It works from any tunnel, "
             "because every tunnel of the die is like every other. Where the gate is, a draft blows."),
}

POLAR_TELL = {
    "brush": "The hedge is rings round a well. The ways are in, out, sunwise and widdershins.",
    "rule": "The hedge is rings round a well, and a ring comes back to where it began. Its ways are in, out, sunwise and widdershins; there is no north here.",
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

    def __init__(self, rows=8, cols=8, algorithm="sidewinder", seed=1, braid=0.0, floors=1, shape="square"):
        if floors < 1:
            raise ValueError("a hedge has at least one floor")
        if shape not in TOPOLOGIES:
            raise ValueError(f"unknown shape {shape!r}; choose from {', '.join(TOPOLOGIES)}")
        self.shape = shape
        self.topo = TOPOLOGIES[shape]
        if shape == "cave":
            rows, cols, algorithm, braid = 20, 3, "dodecahedron", 0.0
        self.rows, self.cols, self.algorithm, self.seed, self.braid, self.floors = rows, cols, algorithm, seed, braid, floors
        self.grids = [self.topo.grow(rows, cols, algorithm, floor_seed(seed, f), braid) for f in range(floors)]
        self.grid = self.grids[0]
        self.stairs = {}  # pos -> the pos at the other end of the stair
        path0 = self.topo.longest_path(self.grid)
        self.entrance = (0,) + path0[0]
        self.path = [(0,) + cell for cell in path0]
        # Each floor is walked from where you arrive to its farthest cell: the stair up, or on the top floor the gate.
        self.dist = {}
        here, offset = self.entrance, 0
        for f in range(floors):
            d = self.topo.distances(self.grids[f], here[1:])
            far = self.topo.farthest(self.grids[f], here[1:])
            for cell, n in d.items():
                self.dist[(f,) + cell] = offset + n
            if f == floors - 1:
                self.gate = (f,) + far
            else:
                top, below = (f,) + far, (f + 1,) + far
                self.stairs[top], self.stairs[below] = below, top
                offset += d[far] + 1
                here = below
        self.tell = CAVE_TELL if shape == "cave" else BRAIDED_TELL if braid else TELLS[shape][algorithm]
        self.wumpus = (0, self.grid.wumpus) if shape == "cave" else None  # a sleeper, on the ground floor

    @property
    def dirs(self):
        return self.topo.dirs

    def size_words(self):
        return self.topo.size_words(self.rows, self.cols)

    # ---- geometry ----
    def ways(self, pos):
        f = pos[0]
        ways = self.topo.ways(self.grids[f], pos[1:])
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
        return (pos[0],) + self.topo.step(self.grids[pos[0]], pos[1:], direction)

    def neighbour(self, pos, direction):
        """The cell one step away, wall or no wall; None off the hedge. For maps."""
        cell = self.topo.step(self.grids[pos[0]], pos[1:], direction)
        return None if cell is None else (pos[0],) + cell

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
        On a polar hedge a way round a ring is "straight" too: it keeps its bearing.
        """
        if direction in VERTICAL or not self.topo.dirs or not self.is_open(pos, direction):
            return 0, [], "wall"  # a cave has no sight lines: see senses()
        left, right = self.topo.left(direction), self.topo.right(direction)
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
        if self.shape == "cave":
            return f"Cave {pos[1]}{floor}"
        if self.shape == "polar":
            # A polar hedge's rings are its own: ring 1 is next to the well.
            return f"Ring {pos[1] + 1} of the Hedge{floor}"
        return f"Ring {self.ring(pos)} of the Hedge{floor}"

    def senses(self, pos, heading):
        """What a cave tells without sight: the tunnels by relative name, a draft where the gate is next door,
        a smell where the wumpus is. Returns (tunnels, draft, smell): tunnels is a list of (which, room)
        in the order left, ahead, right, back; draft is the list of rooms the draft comes from."""
        cave = self.grids[pos[0]]
        tunnels = []
        for which in ("left", "ahead", "right", "back"):
            room = cave.relative(pos[1], heading, which)
            if room is not None:
                tunnels.append((which, room))
        nearby = [(pos[0], r) for r in cave.tunnels[pos[1]]]
        draft = [p[1] for p in nearby if p == self.gate]
        smell = self.wumpus in nearby
        return tunnels, draft, smell

    def describe(self, pos, lit=True, heading=None):
        """The room, as the player reads it. One sentence per open way."""
        if self.shape == "cave":
            return self.describe_cave(pos, lit, heading)
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
        if self.shape == "polar" and pos[1] == 0:
            lines.append("The well at the heart is just past the hedge, inward.")
        if self.is_dead_end(pos) and pos not in (self.entrance, self.gate):
            lines.append("A dead end.")
        for d in ways:
            if d in VERTICAL:
                continue
            run, openings, end = self.sight(pos, d)
            text = f"{self.topo.label(d)}, the way runs {words(run)} {'pace' if run == 1 else 'paces'}"
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

    def describe_cave(self, pos, lit, heading):
        lines = [self.name(pos)]
        ways = self.ways(pos)
        tunnels, draft, smell = self.senses(pos, heading)
        if pos == self.entrance:
            lines.append("A stair goes up behind you. A plate is set in the rock beside it.")
        if pos == self.gate:
            lines.append("A stair goes up into daylight. This is the way out.")
        if "up" in ways:
            lines.append("A stair goes up from here, into the cave above.")
        if "down" in ways:
            lines.append("A stair comes up from the cave below.")
        if pos == self.wumpus:
            lines.append("A wumpus sleeps here, breathing slowly. Tiptoe.")
        if not lit:
            lines.append("It is dark. You feel along the rock.")
            lines.append("Tunnels " + join(which for which, _ in tunnels) + ". The numbers carved over them you cannot read.")
            return "\n".join(lines)
        lines.append("Tunnels lead " + join(f"{which} to {room}" for which, room in tunnels) + ".")
        for room in draft:
            which = [w for w, r in tunnels if r == room][0]
            where = {"left": "on the left", "right": "on the right", "ahead": "ahead", "back": "behind you"}[which]
            lines.append(f"A draft comes through the tunnel {where}, and with it a smell of daylight.")
        if smell:
            lines.append("You smell a wumpus.")
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
        key = "rule" if read_fully else "brush"
        text = self.tell[key]
        if self.shape == "polar":
            text = POLAR_TELL[key] + " " + text
        if self.floors > 1:
            text += " " + (FLOORS_TELL["rule"].format(n=words(self.floors)) if read_fully else FLOORS_TELL["brush"])
        return text

    def map_text(self, seen, pos=None, visited=None):
        """A top-down map of the cells the player has seen on this floor, in MazeBuilder's style.

        A polar hedge is drawn unrolled: inward is up, sunwise is right, and the
        two ends join, as the last line says. A cave has no picture: it is a list
        of the caves you have stood in and their tunnels, and the caves you have
        heard of, which is all Hunt the Wumpus ever gave."""
        floor = pos[0] if pos else 0
        g = self.grids[floor]
        if self.shape == "cave":
            stood = sorted(p for p in (visited if visited is not None else seen) if p[0] == floor)
            out = ["Caves you have stood in, and their tunnels:"]
            for p in stood:
                out.append(f"  {p[1]:>2}: {' '.join(self.ways(p))}" + ("  (you are here)" if p == pos else ""))
            heard = sorted(p[1] for p in seen if p[0] == floor and p not in stood)
            if heard:
                out.append("Heard of: " + " ".join(str(r) for r in heard) + ".")
            if self.floors > 1:
                out.append(f"Floor {floor + 1} of {self.floors}.")
            return "\n".join(out)
        on_floor = {(r, c) for f, r, c in seen if f == floor}
        here_rc = pos[1:] if pos else None
        up_d, down_d, left_d, right_d = self.dirs[0], self.dirs[2], self.dirs[3], self.dirs[1]  # drawn up, down, left, right
        if self.shape == "polar":
            left_d, right_d = "widdershins", "sunwise"

        def known(r, c, d):
            """Is the cell one step that way one the player has seen?"""
            there = self.neighbour((floor, r, c), d)
            return there is not None and there[1:] in on_floor

        def wall(r, c, d):
            return not self.is_open((floor, r, c), d)

        out = []
        if self.shape == "polar":
            out.append("  inward (the well)")
        for r in range(g.rows):
            top, mid = "", ""
            for c in range(g.cols):
                here = (r, c) in on_floor
                top += "+" + ("---" if (here or known(r, c, up_d)) and wall(r, c, up_d) else "   ")
                edge = "|" if (here or known(r, c, left_d)) and wall(r, c, left_d) else " "
                if self.shape == "polar" and c == 0 and edge == "|":
                    edge = ":"
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
                mid += edge + body
            last = (r, g.cols - 1)
            end = "|" if (last in on_floor or known(r, g.cols - 1, right_d)) and wall(r, g.cols - 1, right_d) else " "
            if self.shape == "polar" and end == "|":
                end = ":"
            out.append(top + "+")
            out.append(mid + end)
        bottom = ""
        for c in range(g.cols):
            bottom += "+" + ("---" if (g.rows - 1, c) in on_floor and wall(g.rows - 1, c, down_d) else "   ")
        out.append(bottom + "+")
        if self.shape == "polar":
            out.append("  outward (the rim); the ':' ends join")
        if self.floors > 1:
            out.append(f"Floor {floor + 1} of {self.floors}.")
        return "\n".join(out)

    def relative(self, pos, heading, which):
        """Turn a relative direction into one of this hedge's ways, or None where there is only wall.
        Up and down are themselves."""
        return self.topo.relative(self.grids[pos[0]], pos[1:], heading, which)

    def turn(self, pos, heading, which):
        """The heading after a turn, or None where turning means nothing (a cave)."""
        return self.topo.turn(self.grids[pos[0]], pos[1:], heading, which)
