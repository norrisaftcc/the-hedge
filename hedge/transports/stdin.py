"""The stdin transport: one player, lines in, text out. Spells run at once.

    python -m hedge --solo --seed 7 < tests/walks/sidewinder-7.in

Same seed and same lines give the same output, so a transcript is a test.
"""

import sys

from .. import render


def run(hub, lines, out=None, name="you"):
    out = out or sys.stdout

    def sink(events):
        for ev in events:
            print(render.text(ev), file=out)

    hub.connect(name, sink)
    for line in lines:
        line = line.rstrip("\n")
        print(("  . " if hub.mode(name) == "spell" else "> ") + line, file=out)
        if line.strip().lower() in ("quit", "exit") and hub.mode(name) == "command":
            break
        hub.line(name, line)
        while hub.running(name):
            if not hub.tick(name):
                break
    hub.disconnect(name)
