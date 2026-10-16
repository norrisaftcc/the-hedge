"""The command line: one hedge, served every way at once.

    python -m hedge --seed 7 --algorithm sidewinder --size 8        telnet on 4000, browser on 4001
    python -m hedge --telnet 4000 --ws 0                             telnet only
    python -m hedge --solo --seed 7 < tests/walks/sidewinder-7.in    one player, no network
    python -m hedge --shape polar --size 6 -a binary                 rings round a well
    python -m hedge --shape cave --seed 7                            twenty caves, three tunnels each
"""

import argparse
import asyncio
import sys

from .game import Game
from .hub import Hub
from .world import Hedge


def make_hedge(size, algorithm, seed, shape="square", spokes=None, braid=0.0, floors=1):
    """A square hedge is size by size. A polar one is size rings of spokes, twice size unless said.
    A cave is always twenty rooms of three tunnels; size, algorithm and braid do not apply."""
    if shape == "cave":
        return Hedge(seed=seed, floors=floors, shape="cave")
    cols = size if shape == "square" else (spokes or 2 * size)
    return Hedge(size, cols, algorithm, seed, braid=braid, floors=floors, shape=shape)


def make_hub(args):
    pace = getattr(args, "pace", None)
    hedge = make_hedge(args.size, args.algorithm, args.seed, shape=getattr(args, "shape", "square"), spokes=getattr(args, "spokes", None),
                       braid=getattr(args, "braid", 0.0), floors=getattr(args, "floors", 1))
    return Hub(Game(hedge), pace=0.6 if pace is None else pace)


async def serve(args):
    from .transports.telnet import serve_telnet
    from .transports.ws import serve_ws

    hub = make_hub(args)
    h = hub.game.hedge
    servers = []
    if args.telnet:
        servers.append(await serve_telnet(hub, args.host, args.telnet))
        print(f"telnet  {args.host}:{args.telnet}")
    if args.ws:
        servers.append(await serve_ws(hub, args.host, args.ws))
        print(f"browser http://localhost:{args.ws}/")
    print(f"The Hedge ({h.algorithm}, {h.size_words()}, seed {h.seed}{', braided ' + str(h.braid) if h.braid else ''}{f', {h.floors} floors' if h.floors > 1 else ''}). "
          f"Entrance {h.entrance}, gate {h.gate}, {len(h.path) - 1} steps apart.")
    if not servers:
        print("nothing to serve: give --telnet or --ws a port, or --solo")
        return
    await asyncio.gather(*(s.serve_forever() for s in servers))


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python -m hedge", description="The Hedge: a maze is a repeated process.")
    parser.add_argument("--telnet", type=int, default=4000, metavar="PORT", help="telnet port, 0 for none (default 4000)")
    parser.add_argument("--ws", type=int, default=4001, metavar="PORT", help="WebSocket and web page port, 0 for none (default 4001)")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--algorithm", "-a", choices=("binary", "sidewinder", "aldous-broder"), default="sidewinder")
    parser.add_argument("--size", type=int, default=8, help="rows and columns; on a polar hedge, rings")
    parser.add_argument("--shape", choices=("square", "polar", "cave"), default="square",
                        help="square (north east south west); polar: rings round a well, ways in out sunwise widdershins; "
                             "cave: twenty caves of three tunnels, the old Wumpus map, no compass at all")
    parser.add_argument("--spokes", type=int, default=None, metavar="N", help="cells in each ring of a polar hedge (default twice --size)")
    parser.add_argument("--floors", type=int, default=1, metavar="N", help="floors joined by stairs, one stair up per floor (default 1)")
    parser.add_argument("--braid", type=float, default=0.0, metavar="P",
                        help="join this fraction of dead ends to a neighbour (0 to 1), making loops; the left-hand rule then fails")
    parser.add_argument("--solo", action="store_true", help="play alone on this terminal, no network")
    parser.add_argument("--pace", type=float, default=None, metavar="SECONDS",
                        help="seconds between spell steps (default 0.6 on the network, 0.3 solo; 0 for a transcript)")
    args = parser.parse_args(argv)
    if args.solo:
        from .transports.stdin import run
        pace = 0.3 if args.pace is None else args.pace
        args.pace = pace
        return run(make_hub(args), sys.stdin, pace=pace)
    if args.pace is None:
        args.pace = 0.6
    try:
        asyncio.run(serve(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
