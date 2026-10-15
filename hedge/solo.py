"""Solo play: the stdin transport with a fresh hub. Kept for tests and scripts.

    from hedge.solo import solo
    solo(args, lines, out)   # args has size, algorithm, seed
"""

from .server import make_hub
from .transports.stdin import run


def solo(args, lines, out=None, pace=None):
    run(make_hub(args), lines, out, pace=getattr(args, "pace", 0.3) if pace is None else pace)
