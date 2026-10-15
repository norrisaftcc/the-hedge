"""The game: players in a hedge, commands, spells one step at a time.

No sockets and no clock here. Game.command takes a line and returns messages;
Game.step_spell runs one step of a player's spell. The telnet server and the
solo console both drive this, so a transcript is the same from either.

A message is (to, text). to is a player's name, "all", or ("room", pos, name)
for everyone at pos except name.
"""

from . import spell, verify
from .maze import OPPOSITE
from .spell import COMPASS, RELATIVE, SpellError

ABBREV = {"n": "north", "s": "south", "e": "east", "w": "west", "l": "look", "m": "map", "h": "help", "?": "help"}
TORCHES = 3
TORCH_TURNS = 30

HELP = """\
look (l)            the room again        map (m)       what you have seen
north south east west, or n s e w          go <way>      a step; ways: north south east west ahead back left right
face <compass>      turn without a step   turn left|right|around
read                the plate, briefly    study         the plate, all of it
cast <spell>        run a spell, one step a turn; a spell may run over several lines until its parens close
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
        self.read_plate = False

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
            return [(name, "Someone of that name is already in the hedge.")]
        p = Player(name, self.hedge.entrance)
        self.players[name] = p
        self.see_around(p)
        msgs = [("all", f"{name} comes down the stair into the hedge.")]
        msgs.append((name, f"The Hedge ({self.hedge.algorithm}, {self.hedge.rows} by {self.hedge.cols}, seed {self.hedge.seed}). "
                           f"Find the far gate. Type help for the words."))
        msgs += self.look(p)
        return msgs

    def leave(self, name):
        p = self.players.pop(name, None)
        if not p:
            return []
        return [(("room", p.pos, name), f"{name} fades from the hedge."), ("all", f"{name} has left.")]

    # ---- commands ----
    def command(self, name, line):
        p = self.players.get(name)
        if not p:
            return [(name, "You are not in the hedge.")]
        line = line.strip()
        if not line:
            return []
        word, _, rest = line.partition(" ")
        word = ABBREV.get(word.lower(), word.lower())
        rest = rest.strip()
        if word in COMPASS:
            return self.move(p, word)
        if word == "go":
            d = ABBREV.get(rest.lower(), rest.lower())
            if d not in COMPASS and d not in RELATIVE:
                return [(name, "Go where? north, south, east, west, ahead, back, left or right.")]
            return self.move(p, self.hedge.relative(p.heading, d))
        if word == "face":
            d = ABBREV.get(rest.lower(), rest.lower())
            if d not in COMPASS:
                return [(name, "Face north, south, east or west.")]
            p.heading = d
            return [(name, f"You face {d}.")]
        if word == "turn":
            t = rest.lower()
            if t not in spell.TURNS:
                return [(name, "Turn left, right or around.")]
            p.heading = self.hedge.relative(p.heading, {"left": "left", "right": "right", "around": "back"}[t])
            return [(name, f"You turn {t}. You face {p.heading}.")]
        if word == "look":
            return self.look(p)
        if word == "map":
            return [(name, self.hedge.map_text(p.seen, p.pos))]
        if word == "read":
            return self.read(p, fully=False)
        if word == "study":
            return self.read(p, fully=True)
        if word == "cast":
            return self.cast(p, rest)
        if word == "stop":
            if p.spell is None:
                return [(name, "No spell is running.")]
            p.spell = None
            return [(name, "You let the spell go.")]
        if word == "spells":
            return [(name, SPELLS)]
        if word == "say":
            if not rest:
                return [(name, "Say what?")]
            return [(name, f'You say, "{rest}"'), (("room", p.pos, name), f'{name} says, "{rest}"')]
        if word == "who":
            lines = []
            for q in self.players.values():
                where = "out, past the far gate" if q.out else ("here" if q.pos == p.pos else self.hedge.name(q.pos))
                lines.append(f"  {q.name}: {where}, {q.turns} turns")
            return [(name, "In the hedge:\n" + "\n".join(lines))]
        if word == "score":
            light = f"{p.light} turns of light and {p.torches} torches to come" if p.lit else "no light"
            return [(name, f"{p.turns} turns. {light}. Facing {p.heading}.")]
        if word == "again":
            self.players[name] = p = Player(name, self.hedge.entrance)
            self.see_around(p)
            return [(("room", p.pos, name), f"{name} comes down the stair."), (name, "You go back to the mouth of the hedge with fresh torches.")] + self.look(p)
        if word == "help":
            return [(name, HELP)]
        return [(name, f"'{word}' is not a word here. Type help.")]

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

    def look(self, p):
        text = self.hedge.describe(p.pos, lit=p.lit)
        others = [q.name for q in self.players.values() if q is not p and q.pos == p.pos and not q.out]
        if others:
            text += "\n" + (f"{others[0]} is here." if len(others) == 1 else ", ".join(others) + " are here.")
        return [(p.name, text)]

    def read(self, p, fully):
        if p.pos != self.hedge.entrance:
            return [(p.name, "There is nothing to read here.")]
        p.read_plate = p.read_plate or fully
        return [(p.name, self.hedge.plate(fully))]

    # ---- moving ----
    def move(self, p, d):
        if p.out:
            return [(p.name, "You are out of the hedge. Type again to go back in.")]
        nxt = self.hedge.move(p.pos, d)
        if nxt is None:
            p.heading = d
            return [(p.name, "The hedge is in the way.")]
        old = p.pos
        msgs = [(("room", old, p.name), f"{p.name} goes {d}.")]
        p.pos, p.heading = nxt, d
        p.turns += 1
        if p.lit:
            p.light -= 1
            if p.light == 0:
                if p.torches > 0:
                    p.torches -= 1
                    p.light = TORCH_TURNS
                    msgs.append((p.name, "Your torch gutters out. You light another."))
                else:
                    msgs.append((p.name, "Your last torch gutters out. It is dark."))
        self.see_around(p)
        msgs.append((("room", nxt, p.name), f"{p.name} comes from the {OPPOSITE[d]}."))
        msgs += self.look(p)
        if nxt == self.hedge.gate:
            p.out = True
            p.spell = None
            msgs.append((p.name, f"You climb the stair into daylight. {p.turns} turns."))
            msgs.append(("all", f"{p.name} has found the far gate in {p.turns} turns."))
        return msgs

    # ---- spells ----
    def cast(self, p, text):
        if not text.strip():
            return [(p.name, "Cast what? Type spells for the words.")]
        if p.spell is not None:
            return [(p.name, "A spell is already running. stop it first.")]
        ok, msg, backend = verify.verify(text)
        if not ok:
            return [(p.name, f"The spell does not hold ({backend}): {msg}")]
        try:
            forms = spell.parse(text)
        except SpellError as e:
            return [(p.name, f"The spell does not hold: {e}")]
        p.spell = spell.run(forms, SpellWorld(self, p))
        return [(p.name, f"The spell holds ({backend}). It runs one step a turn; stop ends it."),
                (("room", p.pos, p.name), f"{p.name} begins to murmur.")]

    def step_spell(self, name):
        """One step. Returns (messages, still_running)."""
        p = self.players.get(name)
        if not p or p.spell is None:
            return [], False
        try:
            action = next(p.spell)
        except StopIteration:
            p.spell = None
            return [(name, "The spell ends.")], False
        except SpellError as e:
            p.spell = None
            return [(name, f"The spell breaks: {e}")], False
        kind, arg = action
        if kind == "go":
            d = self.hedge.relative(p.heading, arg)
            if self.hedge.move(p.pos, d) is None:
                p.spell = None
                p.heading = d
                return [(name, f"The spell walks into the hedge, {d}, and breaks.")], False
            msgs = self.move(p, d)
            return msgs, p.spell is not None
        if kind == "face":
            p.heading = arg
            return [(name, f"You face {arg}.")], True
        if kind == "turn":
            p.heading = self.hedge.relative(p.heading, {"left": "left", "right": "right", "around": "back"}[arg])
            return [(name, f"You turn {arg}. You face {p.heading}.")], True
        if kind == "say":
            return [(name, f'You say, "{arg}"'), (("room", p.pos, name), f'{name} says, "{arg}"')], True
        return [], True
