"""The local API: play the hedge from Python, for tests and for other programs.

    from hedge.api import Table
    t = Table(seed=7, algorithm="sidewinder")
    t.join("Ash")
    events = t.line("Ash", "look")           # the events Ash saw
    t.line("Ash", "cast (until (gate?) (go north))")
    t.run_spell("Ash")                        # tick until it ends
    print(t.text("Ash"))                      # everything Ash has read, as text

Same layers as telnet and the browser; only the sink differs.
"""

import time

from .game import Game
from .hub import Hub
from .world import Hedge
from . import render


class Table:
    PACE = 0.3  # seconds between spell steps in run_spell; pass pace=0 for tests

    def __init__(self, seed=1, algorithm="sidewinder", size=8, hedge=None, pace=PACE):
        self.pace = pace
        self.hedge = hedge or Hedge(size, size, algorithm, seed)
        self.game = Game(self.hedge)
        self.hub = Hub(self.game)
        self.seen = {}   # name -> all events, in order
        self.fresh = {}  # name -> events since the last call that took them

    def _sink(self, name):
        def deliver(events):
            self.seen.setdefault(name, []).extend(events)
            self.fresh.setdefault(name, []).extend(events)
        return deliver

    def join(self, name):
        ok = self.hub.connect(name, self._sink(name))
        return self.take(name) if ok else []

    def leave(self, name):
        self.hub.disconnect(name)

    def line(self, name, text):
        """Type a line. Returns the events this player saw because of it."""
        self.take(name)
        self.hub.line(name, text)
        return self.take(name)

    def act(self, name, verb, **args):
        self.take(name)
        self.hub.act(name, verb, **args)
        return self.take(name)

    def tick(self, name):
        return self.hub.tick(name)

    def run_spell(self, name, max_steps=10000):
        """Tick until the spell ends. Returns the events, and how many steps ran."""
        self.take(name)
        steps = 0
        while self.hub.running(name) and steps < max_steps:
            if self.pace:
                time.sleep(self.pace)
            self.hub.tick(name)
            steps += 1
        return self.take(name), steps

    def take(self, name):
        events, self.fresh[name] = self.fresh.get(name, []), []
        return events

    def text(self, name, events=None):
        return "\n".join(render.text(e) for e in (events if events is not None else self.seen.get(name, [])))

    def player(self, name):
        return self.game.players.get(name)
