"""The hub: sessions, lines, spell typing, and routing events to sinks.

A transport connects a player with a sink, a callable that takes a list of
events for that player. The transport feeds lines (or verbs) and asks the hub
to tick running spells. The hub knows nothing about sockets, prompts or
rendering; the transport knows nothing about the game.

    hub = Hub(Game(Hedge()))
    hub.connect("Ash", lambda events: ...)
    mode = hub.line("Ash", "look")        # "command", or "spell" while a spell is being typed
    hub.act("Ash", "go", direction="north")  # the structured path, for a browser
    while hub.tick("Ash"): ...             # one spell step; the transport sets the pace
"""

from .events import Event, recipients
from .parser import GRAMMAR

QUIET = {"stop", "look", "map", "who", "say", "score", "help", "spells", "read", "study"}


def balanced(text):
    depth, in_str = 0, False
    for ch in text:
        if ch == '"':
            in_str = not in_str
        elif not in_str:
            depth += (ch == "(") - (ch == ")")
    return depth <= 0 and not in_str


class Hub:
    def __init__(self, game, grammar=GRAMMAR):
        self.game = game
        self.grammar = grammar
        self.sinks = {}
        self.typing = {}  # name -> lines of a spell being typed

    # ---- sessions ----
    def connect(self, name, sink):
        """Join the game. Returns False if the name is taken."""
        if name in self.game.players:
            return False
        self.sinks[name] = sink
        self.route(self.game.join(name))
        return True

    def disconnect(self, name):
        self.typing.pop(name, None)
        self.route(self.game.leave(name))  # the leaver hears "has left" too, as in a MUD
        self.sinks.pop(name, None)

    def names(self):
        return list(self.sinks)

    def running(self, name):
        return self.game.running(name)

    def mode(self, name):
        return "spell" if name in self.typing else "command"

    # ---- input ----
    def line(self, name, text):
        """A typed line. Returns the session's mode afterwards."""
        text = text.rstrip("\r\n")
        if name in self.typing:
            if text.strip():
                self.typing[name].append(text)
                return "spell"
            lines = self.typing.pop(name)
            return self.act(name, "cast", words="\n".join(lines))
        head, _, rest = text.strip().partition(" ")
        if head.lower() == "cast" and (not rest.strip() or not balanced(rest)):
            self.typing[name] = [rest.strip()] if rest.strip() else []
            self.route([Event("spell", name, "Type the spell. A blank line ends it.", state="typing")])
            return "spell"
        parsed = self.grammar.parse(text)
        if parsed is None:
            if text.strip():
                self.route([Event("error", name, f"'{text.split()[0]}' is not a word here. Type help.")])
            return "command"
        verb, args = parsed
        return self.act(name, verb, **args)

    def act(self, name, verb, **args):
        """A verb with arguments, from the grammar or from a client that speaks JSON."""
        if self.game.running(name) and verb not in QUIET:
            self.route([Event("error", name, "A spell is running. stop it, or look, map, who, say, score, help.")])
            return "command"
        self.route(self.game.act(name, verb, **args))
        return "command"

    def tick(self, name):
        """One step of a running spell. Returns whether it is still running."""
        events, running = self.game.step_spell(name)
        self.route(events)
        return running

    # ---- output ----
    def route(self, events):
        by_name = {}
        for ev in events:
            for n in recipients(ev, self.game.players) if ev.to != "all" else list(self.sinks):
                by_name.setdefault(n, []).append(ev)
        for n, evs in by_name.items():
            sink = self.sinks.get(n)
            if sink:
                sink(evs)
