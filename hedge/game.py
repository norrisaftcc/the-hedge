"""The game: players in a hedge, verbs, spells one step at a time.

No sockets, no clock, no text parsing. Game.act takes a verb and arguments
(from the grammar, or straight from a browser) and returns events. The hub
routes the events; a renderer turns them into text, JSON or GMCP.
"""

from . import spell, verify
from .events import Event
from .spell import SpellError
from .topology import ABSOLUTE, RELATIVE, VERTICAL

TORCHES = 3  # a floor's worth; a hedge of several floors gives three a floor
TORCH_TURNS = 30
SPELL_REACH = 1000  # steps a spell may take before it wears thin; a loop in a braided hedge ends here
TURN_BY = {"left": "left", "right": "right", "around": "back"}

HELP = """\
look (l)            the room again        map (m)       what you have seen
{ways} up down, or {short} u  go <way>    a step; ways: {ways} ahead back left right up down
face <way>          turn without a step   turn left|right|around
read                the plate, briefly    study         the plate, all of it
cast <spell>        run a spell, one step a turn; 'cast' alone takes lines until a blank one
stop                end a running spell   spells        the spell words
mark                chalk a mark here; a spell can test (marked? <way>)
say <words>         speak to the room     who           who is in the hedge
score               your turns and light  again         back to the mouth, fresh torches
help (h, ?)         this                  quit          leave"""

SPELLS = """\
(go D)  D: {ways} ahead back left right up down    (face D)  D: {ways}    (turn left|right|around)
(wall? D) (open? D) (gate?) (dead-end?) (marked?) (marked? D)   tests      (mark)  chalk a mark here
(until TEST BODY...) (while TEST BODY...) (repeat N BODY...)
(if TEST THEN ELSE) (when TEST BODY...) (unless TEST BODY...) (and ...) (or ...) (not X) (begin ...)
(define (NAME) BODY...) then (NAME)      (say "words")      (stop)      #t #f
A spell runs one step a turn. It breaks if it walks into the hedge. 'stop' ends it; so do a thousand steps."""

SHORT = {"square": "n s e w", "polar": "i o sw wd"}


def help_text(hedge):
    return HELP.format(ways=" ".join(hedge.dirs), short=SHORT[hedge.shape])


def spells_text(hedge):
    return SPELLS.format(ways=" ".join(hedge.dirs))


class Player:
    def __init__(self, name, pos, torches=TORCHES, heading="north"):
        self.name = name
        self.pos = pos
        self.heading = heading
        self.seen = {pos}
        self.torches = torches - 1
        self.light = TORCH_TURNS
        self.turns = 0
        self.out = False
        self.spell = None
        self.marks = set()  # chalk marks: the player's own memory
        self.spell_steps = 0

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

    def marked(self, d=None):
        """Is there a chalk mark here (d None) or in the open cell one step that way?"""
        if d is None:
            return self.p.pos in self.p.marks
        there = self.game.hedge.move(self.p.pos, self.resolve(d))
        return there is not None and there in self.p.marks


class Game:
    def __init__(self, hedge):
        self.hedge = hedge
        self.players = {}

    # ---- joining and leaving ----
    def join(self, name):
        if name in self.players:
            return [Event("error", name, "Someone of that name is already in the hedge.")]
        h = self.hedge
        p = Player(name, h.entrance, TORCHES * h.floors, heading=h.dirs[0])
        self.players[name] = p
        self.see_around(p)
        return [
            Event("arrive", "all", f"{name} comes down the stair into the hedge.", who=name),
            Event("info", name, f"The Hedge ({h.algorithm}, {h.size_words()}, seed {h.seed}{', braided' if h.braid else ''}{f', {h.floors} floors' if h.floors > 1 else ''}). Find the far gate. Type help for the words.",
                  algorithm=h.algorithm, rows=h.rows, cols=h.cols, seed=h.seed, braid=h.braid, floors=h.floors, shape=h.shape, dirs=list(h.dirs)),
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
        h = self.hedge
        if d not in h.dirs and d not in RELATIVE and d not in VERTICAL:
            if d in ABSOLUTE:  # another hedge's word
                return [Event("error", p.name, f"There is no {d} in this hedge. Its ways are {', '.join(h.dirs)}, and up and down where there is a stair.")]
            return [Event("error", p.name, f"Go where? {', '.join(h.dirs)}, ahead, back, left, right, up or down.")]
        return self.move(p, h.relative(p.heading, d))

    def do_face(self, p, direction=""):
        d = direction.lower()
        if d not in self.hedge.dirs:
            ways = list(self.hedge.dirs)
            return [Event("error", p.name, f"Face {', '.join(ways[:-1])} or {ways[-1]}.")]
        p.heading = d
        return [Event("face", p.name, f"You face {d}.", heading=d)]

    def do_turn(self, p, which=""):
        t = which.lower()
        if t not in TURN_BY:
            return [Event("error", p.name, "Turn left, right or around.")]
        p.heading = self.hedge.relative(p.heading, TURN_BY[t])
        return [Event("face", p.name, f"You turn {t}. You face {p.heading}.", heading=p.heading)]

    def do_mark(self, p):
        p.marks.add(p.pos)
        return [Event("mark", p.name, "You chalk a mark on the hedge here.", pos=list(p.pos))]

    def do_map(self, p):
        """The map: the text, and for every seen cell its open ways, so a client can draw the walls."""
        h = self.hedge
        floor = p.pos[0]
        on_floor = lambda pos: pos[0] == floor
        cells = {f"{r},{c}": h.ways((f, r, c)) for f, r, c in sorted(p.seen) if f == floor}
        stairs = {f"{r},{c}": ("up" if h.stairs[(f, r, c)][0] > f else "down") for f, r, c in sorted(p.seen) if f == floor and (f, r, c) in h.stairs}
        return [Event("map", p.name, h.map_text(p.seen, p.pos), cells=cells, pos=list(p.pos[1:]), floor=floor, floors=h.floors,
                      heading=p.heading, rows=h.rows, cols=h.cols, shape=h.shape, dirs=list(h.dirs), stairs=stairs,
                      entrance=list(h.entrance[1:]) if on_floor(h.entrance) else None,
                      marks=[list(m[1:]) for m in sorted(p.marks) if on_floor(m)],
                      gate=list(h.gate[1:]) if h.gate in p.seen and on_floor(h.gate) else None)]

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
        return [Event("spells", p.name, spells_text(self.hedge))]

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
        self.players[p.name] = q = Player(p.name, self.hedge.entrance, TORCHES * self.hedge.floors, heading=self.hedge.dirs[0])
        self.see_around(q)
        return [Event("arrive", ("room", q.pos, q.name), f"{q.name} comes down the stair.", who=q.name),
                Event("info", q.name, "You go back to the mouth of the hedge with fresh torches."),
                self.room(q)]

    def do_help(self, p):
        return [Event("help", p.name, help_text(self.hedge))]

    # ---- the room ----
    def see_around(self, p):
        """Mark what the light shows from here."""
        p.seen.add(p.pos)
        if not p.lit:
            return
        for d in self.hedge.ways(p.pos):
            if d in VERTICAL:
                continue
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
                if d in VERTICAL:
                    continue
                run, openings, end = h.sight(p.pos, d)
                sight[d] = {"run": run, "openings": [[pace, side] for pace, side in openings], "end": end}
        return Event("room", p.name, text, name=h.name(p.pos), ring=h.ring(p.pos), pos=list(p.pos), floor=p.pos[0], floors=h.floors,
                     shape=h.shape, dirs=list(h.dirs), exits=h.ways(p.pos), sight=sight, lit=p.lit, light=p.light, torches=p.torches,
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
            if d in VERTICAL:
                return [Event("bump", p.name, "There is no stair here.", direction=d)]
            p.heading = d
            return [Event("bump", p.name, "The hedge is in the way.", direction=d)]
        old = p.pos
        going = f"{p.name} goes {d} the stair." if d in VERTICAL else f"{p.name} goes {d}."
        events = [Event("move", ("room", old, p.name), going, who=p.name, direction=d, leaving=True)]
        p.pos = nxt
        if d not in VERTICAL:
            p.heading = d
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
        coming = f"{p.name} comes {'up' if d == 'up' else 'down'} the stair." if d in VERTICAL else f"{p.name} comes {self.hedge.topo.came[d]}."
        events.append(Event("move", ("room", nxt, p.name), coming, who=p.name, direction=d, leaving=False))
        if d in VERTICAL:
            events.append(Event("info", p.name, "You climb the stair." if d == "up" else "You go down the stair."))
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
        ok, msg, backend = verify.verify(text, self.hedge.shape)
        if not ok:
            return [Event("spell", p.name, f"The spell does not hold ({backend}): {msg}", state="refused", backend=backend, reason=msg)]
        try:
            forms = spell.parse(text, self.hedge.dirs)
        except SpellError as e:
            return [Event("spell", p.name, f"The spell does not hold: {e}", state="refused", backend="python", reason=str(e))]
        p.spell = spell.run(forms, SpellWorld(self, p))
        p.spell_steps = 0
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
        p.spell_steps += 1
        if p.spell_steps > SPELL_REACH:
            p.spell = None
            return [Event("spell", name, "The spell wears thin and ends. You have gone round and round.", state="ends", reason="reach")], False
        if kind == "go":
            d = self.hedge.relative(p.heading, arg)
            if self.hedge.move(p.pos, d) is None:
                p.spell = None
                if d not in VERTICAL:
                    p.heading = d
                return [Event("spell", name, f"The spell walks into the hedge, {d}, and breaks.", state="breaks", direction=d)], False
            return self.move(p, d), p.spell is not None
        if kind == "face":
            return self.do_face(p, arg), True
        if kind == "turn":
            return self.do_turn(p, arg), True
        if kind == "say":
            return self.do_say(p, arg), True
        if kind == "mark":
            return self.do_mark(p), True
        return [], True
