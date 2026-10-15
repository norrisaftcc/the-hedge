"""Play alone, on this terminal or from a file of lines. Spells run at once.

    python -m hedge --solo --seed 7 < tests/walks/sidewinder-7.in

Same seed and same lines give the same output, so a transcript is a test.
"""

import sys

from .game import Game
from .server import balanced
from .world import Hedge


def solo(args, lines=None, out=None):
    out = out or sys.stdout
    hedge = Hedge(args.size, args.size, args.algorithm, args.seed)
    game = Game(hedge)
    name = "you"

    def show(msgs):
        for to, text in msgs:
            if to == name or to == "all":
                print(text, file=out)

    show(game.join(name))
    source = lines if lines is not None else sys.stdin
    buffer = None  # a spell being typed over several lines, until a blank line
    for line in source:
        line = line.rstrip("\n")
        print(("  . " if buffer is not None else "> ") + line, file=out)
        if buffer is not None:
            if line.strip():
                buffer.append(line)
                continue
            line, buffer = "cast " + "\n".join(buffer), None
        elif line.strip().lower() == "cast" or (line.strip().lower().startswith("cast ") and not balanced(line)):
            buffer = [line.strip()[4:].strip()] if line.strip()[4:].strip() else []
            continue
        if line.strip().lower() in ("quit", "exit"):
            break
        show(game.command(name, line))
        while game.players[name].spell is not None:
            msgs, running = game.step_spell(name)
            show(msgs)
            if not running:
                break
    show(game.leave(name))
