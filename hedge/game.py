"""The game: players in a hedge, verbs, spells one step at a time.

No sockets, no clock, no text parsing. Game.act takes a verb and arguments
(from the grammar, or straight from a browser) and returns events. The hub
routes the events; a renderer turns them into text, JSON or GMCP.
"""

from . import spell, verify
from .events import Event
from .maze import OPPOSITE
from .spell import COMPASS, RELATIVE, SpellError

TORCHES = 3
TORCH_TURNS = 30
TURN_BY = {"left": "left", "right": "right", "around": "back"}

HELP = """\
look (l)            the room again        map (m)       what you have seen
north south east west, or n s e w          go <way>      a step; ways: north south east west ahead back left right
face <compass>      turn without a step   turn left|right|around
read                the plate, briefly    study         the plate, all of it
cast <spell>        run a spell, one step a turn; 'cast' alone takes lines until a blank one
stop                end a running spell   spells        the spell words
say <words>         speak to the room     who           who is in the hedge
score               your turns and light  again         back to the mouth, fresh torches
help (h, ?)         this                  quit          leave"""

SPELLS = """\
(go D)  D: north south east west ahead back left right    (face D)  (turn left|right|around)
(wall? D) (open? D) (gate?) (dead-end?)                     tests
(until TEST BODY...) (while TEST BODY...) (repeat N BODY...)
(if TEST THEN ELSE) (when TEST BODY...) (unless TEST BODY...) (and ...) (or ...) (not X) (begin ...)
(define (NAME) BODY...) then (NAME)      (say "words")      (stop)      #t #f
A spell runs one step a turn. It breaks if it walks into the hedge. 'stop' ends it."""


class Player:
    def __init__(self, name, pos):
        self.name = name
        self.pos = pos
        self.heading = "north"
        self.seen = {pos}
        self.torches = TORCHES - 1
        self.light = TORCH_TURNS
        self.turns = 0
        self.out = False
        self.spell = None

    @property
    def lit(self):
        return self.light > 0


class SpellWorld:
    """What a spell can ask about the world, from one player's place."""

    def __init__(self, game, player):
        self.game, self.p = game, player

    def resolve(self, d):
        return self.game.hedge.relative(self.p.heading, d)

    def wall(self, d):
        return not self.game.hedge.is_open(self.p.pos, self.resolve(d))

    def gate(self):
        return self.p.pos == self.game.hedge.gate

    def dead_end(self):
        return self.game.hedge.is_dead_end(self.p.pos)


class Game:
    def __init__(self, hedge):
        self.hedge = hedge
        self.players = {}

    # ---- joining and leaving ----
    def join(self, name):
        if name in self.players:
            return [Event("error", name, "Someone of that name is already in the hedge.")]
        p = Player(name, self.hedge.entrance)
        self.players[name] = p
        self.see_around(p)
        h = self.hedge
        return [
            Event("arrive", "all", f"{name} comes down the stair into the hedge.", who=name),
            Event("info", name, f"The Hedge ({h.algorithm}, {h.rows} by {h.cols}, seed {h.seed}). Find the far gate. Type help for the words.",
                  algorithm=h.algorithm, rows=h.rows, cols=h.cols, seed=h.seed),
            self.room(p),
        ]

    def leave(self, name):
        p = self.players.pop(name, None)
        if not p:
            return []
        return [Event("depart", ("room", p.pos, name), f"{name} fades from the hedge.", who=name),
                Event("depart", "all", f"{name} has left.", who=name)]

    def running(self, name):
        p = self.players.get(name)
        return bool(p and p.spell is not None)

    # ---- verbs ----
    def act(self, name, verb, **args):
        p = self.players.get(name)
        if not p:
            return [Event("error", name, "You are not in the hedge.")]
        handler = getattr(self, "do_" + verb, None)
        if handler is None:
            return [Event("error", name, f"'{verb}' is not a word here. Type help.")]
        return handler(p, **args)

    def do_look(self, p):
        return [self.room(p)]

    def do_go(self, p, direction=""):
        d = direction.lower()
        if d not in COMPASS and d not in RELATIVE:
            return [Event("error", p.name, "Go where? north, south, east, west, ahead, back, left or right.")]
        return self.move(p, self.hedge.relative(p.heading, d))

    def do_face(self, p, direction=""):
        d = direction.lower()
        if d not in COMPASS:
            return [Event("error", p.name, "Face north, south, east or west.")]
        p.heading = d
        return [Event("face", p.name, f"You face {d}.", heading=d)]

    def do_turn(self, p, which=""):
        t = which.lower()
        if t not in TURN_BY:
            return [Event("error", p.name, "Turn left, right or around.")]
        p.heading = self.hedge.relative(p.heading, TURN_BY[t])
        return [Event("face", p.name, f"You turn {t}. You face {p.heading}.", heading=p.heading)]

    def do_map(self, p):
        return [Event("map", p.name, self.hedge.map_text(p.seen, p.pos), seen=sorted(p.seen), pos=list(p.pos))]

    def do_read(self, p):
        return self.read(p, fully=False)

    def do_study(self, p):
        return self.read(p, fully=True)

    def do_cast(self, p, words=""):
        return self.cast(p, words)

    def do_stop(self, p):
        if p.spell is None:
            return [Event("spell", p.name, "No spell is running.", state="none")]
        p.spell = None
        return [Event("spell", p.name, "You let the spell go.", state="stopped")]

    def do_spells(self, p):
        return [Event("spells", p.name, SPELLS)]

    def do_say(self, p, words=""):
        if not words.strip():
            return [Event("error", p.name, "Say what?")]
        return [Event("say", p.name, f'You say, "{words}"', who=p.name, words=words),
                Event("say", ("room", p.pos, p.name), f'{p.name} says, "{words}"', who=p.name, words=words)]

    def do_who(self, p):
        rows, lines = [], []
        for q in self.players.values():
            where = "out, past the far gate" if q.out else ("here" if q.pos == p.pos else self.hedge.name(q.pos))
            rows.append({"name": q.name, "where": where, "turns": q.turns, "out": q.out})
            lines.append(f"  {q.name}: {where}, {q.turns} turns")
        return [Event("who", p.name, "In the hedge:\n" + "\n".join(lines), players=rows)]

    def do_score(self, p):
        light = f"{p.light} turns of light and {p.torches} torches to come" if p.lit else "no light"
        return [Event("score", p.name, f"{p.turns} turns. {light}. Facing {p.heading}.",
                      turns=p.turns, light=p.light, torches=p.torches, heading=p.heading)]

    def do_again(self, p):
        self.players[p.name] = q = Player(p.name, self.hedge.entrance)
        self.see_around(q)
        return [Event("arrive", ("room", q.pos, q.name), f"{q.name} comes down the stair.", who=q.name),
                Event("info", q.name, "You go back to the mouth of the hedge with fresh torches."),
                self.room(q)]

    def do_help(self, p):
        return [Event("help", p.name, HELP)]

    # ---- the room ----
    def see_around(self, p):
        """Mark what the light shows from here."""
        p.seen.add(p.pos)
        if not p.lit:
            return
        for d in self.hedge.ways(p.pos):
            run, _, _ = self.hedge.sight(p.pos, d)
            here = p.pos
            for _ in range(run):
                here = self.hedge.move(here, d)
                p.seen.add(here)

    def room(self, p):
        """The room event: the text as the player reads it, and the numbers behind it."""
        h = self.hedge
        text = h.describe(p.pos, lit=p.lit)
        others = [q.name for q in self.players.values() if q is not p and q.pos == p.pos and not q.out]
        if others:
            text += "\n" + (f"{others[0]} is here." if len(others) == 1 else ", ".join(others) + " are here.")
        sight = {}
        if p.lit:
            for d in h.ways(p.pos):
                run, openings, end = h.sight(p.pos, d)
                sight[d] = {"run": run, "openings": [[pace, side] for pace, side in openings], "end": end}
        return Event("room", p.name, text, name=h.name(p.pos), ring=h.ring(p.pos), pos=list(p.pos),
                     exits=h.ways(p.pos), sight=sight, lit=p.lit, light=p.light, torches=p.torches,
                     heading=p.heading, others=others, entrance=p.pos == h.entrance, gate=p.pos == h.gate)

    def read(self, p, fully):
        if p.pos != self.hedge.entrance:
            return [Event("error", p.name, "There is nothing to read here.")]
        return [Event("plate", p.name, self.hedge.plate(fully), full=fully)]

    # ---- moving ----
    def move(self, p, d):
        if p.out:
            return [Event("error", p.name, "You are out of the hedge. Type again to go back in.")]
        nxt = self.hedge.move(p.pos, d)
        if nxt is None:
            p.heading = d
            return [Event("bump", p.name, "The hedge is in the way.", direction=d)]
        old = p.pos
        events = [Event("move", ("room", old, p.name), f"{p.name} goes {d}.", who=p.name, direction=d, leaving=True)]
        p.pos, p.heading = nxt, d
        p.turns += 1
        if p.lit:
            p.light -= 1
            if p.light == 0:
                if p.torches > 0:
                    p.torches -= 1
                    p.light = TORCH_TURNS
                    events.append(Event("light", p.name, "Your torch gutters out. You light another.", light=p.light, torches=p.torches))
                else:
                    events.append(Event("light", p.name, "Your last torch gutters out. It is dark.", light=0, torches=0))
        self.see_around(p)
        events.append(Event("move", ("room", nxt, p.name), f"{p.name} comes from the {OPPOSITE[d]}.", who=p.name, direction=d, leaving=False))
        events.append(self.room(p))
        if nxt == self.hedge.gate:
            p.out = True
            p.spell = None
            events.append(Event("out", p.name, f"You climb the stair into daylight. {p.turns} turns.", who=p.name, turns=p.turns))
            events.append(Event("out", "all", f"{p.name} has found the far gate in {p.turns} turns.", who=p.name, turns=p.turns))
        return events

    # ---- spells ----
    def cast(self, p, text):
        if not text.strip():
            return [Event("error", p.name, "Cast what? Type spells for the words.")]
        if p.spell is not None:
            return [Event("spell", p.name, "A spell is already running. stop it first.", state="running")]
        ok, msg, backend = verify.verify(text)
        if not ok:
            return [Event("spell", p.name, f"The spell does not hold ({backend}): {msg}", state="refused", backend=backend, reason=msg)]
        try:
            forms = spell.parse(text)
        except SpellError as e:
            return [Event("spell", p.name, f"The spell does not hold: {e}", state="refused", backend="python", reason=str(e))]
        p.spell = spell.run(forms, SpellWorld(self, p))
        return [Event("spell", p.name, f"The spell holds ({backend}). It runs one step a turn; stop ends it.", state="holds", backend=backend),
                Event("spell", ("room", p.pos, p.name), f"{p.name} begins to murmur.", state="holds", who=p.name)]

    def step_spell(self, name):
        """One step. Returns (events, still_running)."""
        p = self.players.get(name)
        if not p or p.spell is None:
            return [], False
        try:
            action = next(p.spell)
        except StopIteration:
            p.spell = None
            return [Event("spell", name, "The spell ends.", state="ends")], False
        except SpellError as e:
            p.spell = None
            return [Event("spell", name, f"The spell breaks: {e}", state="breaks", reason=str(e))], False
        kind, arg = action
        if kind == "go":
            d = self.hedge.relative(p.heading, arg)
            if self.hedge.move(p.pos, d) is None:
                p.spell = None
                p.heading = d
                return [Event("spell", name, f"The spell walks into the hedge, {d}, and breaks.", state="breaks", direction=d)], False
            return self.move(p, d), p.spell is not None
        if kind == "face":
            return self.do_face(p, arg), True
        if kind == "turn":
            return self.do_turn(p, arg), True
        if kind == "say":
            return self.do_say(p, arg), True
        return [], True
