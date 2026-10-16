"""The cave: twenty rooms, three tunnels each, laid out as the twelve-sided die.

This is Hunt the Wumpus's map (Gregory Yob, 1973), which is the dodecahedron,
and before that Hamilton's Icosian game (1857): find a walk that visits every
one of twenty cities once and comes home. We keep the lineage in plain sight.

A cave is a graph, not a grid. There is no north. The ways out of a room are
its tunnels, named by the room each leads to, and left, right and back are
told from the tunnel you came by: with the tunnels round a room in
counterclockwise order, right is the next after the one you came by, left the
one before. That is Hamilton's convention, and under it his word of turns,
LLLRRRLRLR said twice, visits every cave once from any tunnel at all, because
every tunnel of the die looks like every other.

The drawing is the Schlegel diagram: four rings of five, the outer pentagon
being the far face. layout holds it for the browser's chart.
"""

import math
from collections import deque

from .rng import Mulberry32

ROOMS = 20
HAMILTON = "LLLRRRLRLR"  # said twice: a Hamiltonian cycle on the dodecahedron


def _schlegel():
    """Vertices 0..19 with (x, y), and the 30 edges, as a planar drawing."""
    xy = {}
    for n0, radius, offset in ((0, 3.0, 0), (5, 2.0, 0), (10, 1.3, 36), (15, 0.7, 36)):
        for i in range(5):
            a = math.radians(90 + 72 * i + offset)
            xy[n0 + i] = (radius * math.cos(a), radius * math.sin(a))
    edges = set()
    for i in range(5):
        j = (i + 1) % 5
        edges |= {frozenset((i, j)), frozenset((i, 5 + i)), frozenset((5 + i, 10 + i)),
                  frozenset((5 + j, 10 + i)), frozenset((10 + i, 15 + i)), frozenset((15 + i, 15 + j))}
    return xy, edges


class Cave:
    """Rooms 1..20. tunnels[room] is its three neighbours in counterclockwise order."""

    def __init__(self, seed=1):
        self.seed = seed
        self.rows, self.cols = ROOMS, 3  # so a cave answers like a grid where only sizes are asked
        rng = Mulberry32(seed)
        xy, edges = _schlegel()
        # Name the vertices 1..20 at random, so each seed is a different cave with the same bones.
        names = list(range(1, ROOMS + 1))
        for i in range(ROOMS - 1, 0, -1):
            j = rng.randint(0, i)
            names[i], names[j] = names[j], names[i]
        self.layout = {names[v]: (round(x, 3), round(y, 3)) for v, (x, y) in xy.items()}
        adj = {v: [] for v in range(ROOMS)}
        for e in edges:
            a, b = tuple(e)
            adj[a].append(b)
            adj[b].append(a)
        self.tunnels = {}
        for v in range(ROOMS):
            x0, y0 = xy[v]
            ccw = sorted(adj[v], key=lambda w: math.atan2(xy[w][1] - y0, xy[w][0] - x0))
            self.tunnels[names[v]] = [names[w] for w in ccw]
        self.entrance = rng.randint(1, ROOMS)
        self.gate = max(self.distances(self.entrance).items(), key=lambda kv: (kv[1], -kv[0]))[0]  # the antipode
        others = [r for r in range(1, ROOMS + 1) if r not in (self.entrance, self.gate)]
        self.wumpus = others[rng.randint(0, len(others) - 1)]

    def rooms(self):
        return list(range(1, ROOMS + 1))

    def distances(self, start):
        d, q = {start: 0}, deque([start])
        while q:
            u = q.popleft()
            for w in self.tunnels[u]:
                if w not in d:
                    d[w] = d[u] + 1
                    q.append(w)
        return d

    def path(self, start, end):
        d = self.distances(end)
        here, out = start, [start]
        while here != end:
            here = min(self.tunnels[here], key=lambda w: d[w])
            out.append(here)
        return out

    def relative(self, room, came, which):
        """The tunnel to your left, right, ahead or back, having come from `came`.

        came is a room, or None for a stair, which stands in the gap before the
        first tunnel: then right, ahead and left are the three tunnels in turn.
        Returns a room, or None where there is only rock."""
        t = self.tunnels[room]
        if came is None:
            return {"right": t[0], "ahead": t[1], "left": t[2], "back": None}[which]
        if came not in t:
            return None
        i = t.index(came)
        return {"back": came, "right": t[(i + 1) % 3], "left": t[(i - 1) % 3], "ahead": None}[which]
