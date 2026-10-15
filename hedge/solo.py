"""Solo play: the stdin transport with a fresh hub. Kept for tests and scripts.

    from hedge.solo import solo
    solo(args, lines, out)   # args has size, algorithm, seed
"""

from .server import make_hub
from .transports.stdin import run


def solo(args, lines, out=None):
    run(make_hub(args), lines, out)
