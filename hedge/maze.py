"""Grow a hedge with MazeBuilder's algorithms, rolling with our own dice.

MazeBuilder lives in vendor/MazeBuilder (a git submodule). Its algorithms draw
every random number through Grid.random_int, so a Grid that rolls with
Mulberry32 makes the same maze for the same seed in any language.
"""

import os
import sys

from .rng import Mulberry32

VENDOR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vendor", "MazeBuilder", "py_port")
if not os.path.isdir(VENDOR):
    raise ImportError("vendor/MazeBuilder is empty: run `git submodule update --init`")
if VENDOR not in sys.path:
    sys.path.insert(0, VENDOR)

from cell import Cell  # noqa: E402,F401  (topology.py reads the direction flags from here)
from grid import Grid  # noqa: E402
from polar_grid import PolarGrid  # noqa: E402
from algorithms.binary_tree import BinaryTreeMaze  # noqa: E402
from algorithms.sidewinder import SidewinderMaze  # noqa: E402
from algorithms.aldous_broder import AldousBroderMaze  # noqa: E402
from algorithms.braid import Braid  # noqa: E402
from pathfinding.dijkstra import Dijkstra  # noqa: E402

ALGORITHMS = ("binary", "sidewinder", "aldous-broder")


class Seeded:
    """A MazeBuilder grid whose dice are ours. Mixed into a grid class."""

    def __init__(self, rows, cols, seed):
        self.rng = Mulberry32(seed)
        super().__init__(rows, cols)

    def random_int(self, min_val, max_val):
        return self.rng.randint(min_val, max_val)


class SeededGrid(Seeded, Grid):
    """A square grid: rows and columns."""


class SeededPolarGrid(Seeded, PolarGrid):
    """A polar grid: rings around a well, spokes that wrap round."""


def grow(rows, cols, algorithm, seed, braid=0.0, grid_class=SeededGrid):
    """Build the maze. Same arguments, same maze, byte for byte.

    braid is the fraction of dead ends to join to a neighbour (0.0 to 1.0). Each
    one makes a loop, and with loops the left-hand rule can circle forever.
    grid_class is SeededGrid (square) or SeededPolarGrid (rings and spokes); the
    algorithms do not care, which is the point.
    """
    if algorithm not in ALGORITHMS:
        raise ValueError(f"unknown algorithm {algorithm!r}; choose from {', '.join(ALGORITHMS)}")
    grid = grid_class(rows, cols, seed)
    if algorithm == "binary":
        BinaryTreeMaze.on(grid)
    elif algorithm == "sidewinder":
        SidewinderMaze.on(grid)
    else:
        AldousBroderMaze.on(grid)  # no seed argument: it would reseed Python's random, which we do not use
    if braid:
        Braid.on(grid, braid)
    return grid


def longest_path(grid):
    """The two cells farthest apart, and the path between them, as (row, col) pairs."""
    path = Dijkstra.longest_path(grid)
    return [(cell.row, cell.col) for cell in path]


def farthest_from(grid, r, c):
    """The cell farthest from (r, c), chosen as Dijkstra.longest_path chooses its ends."""
    cell = Dijkstra.calculate_distances(grid, grid.at(r, c)).get_max_cell(grid)
    return cell.row, cell.col


def distances_from(grid, r, c):
    """Steps from (r, c) to every cell, as a dict keyed by (row, col)."""
    d = Dijkstra.calculate_distances(grid, grid.at(r, c))
    return {(rr, cc): d.get_distance(grid.at(rr, cc)) for rr in range(grid.rows) for cc in range(grid.cols)}
