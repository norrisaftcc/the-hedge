"""The spell language: a small Scheme subset for walking a hedge.

A spell is a list of forms. Walking forms yield one action at a time, so the
game can run a spell one turn per step and let the player watch.

    (go D)                 take one step. D: north south east west ahead back left right up down
                           (on a polar hedge: in out sunwise widdershins instead of the compass)
    (face D)               turn to a compass direction
    (turn T)               T: left right around
    (wall? D) (open? D)    is the hedge there, or a way?
    (gate?) (dead-end?)    where are we?
    (mark)                 chalk a mark on this cell
    (marked?) (marked? D)  is this cell marked? the open cell one step that way?
    (until TEST BODY...)   repeat BODY until TEST is true
    (while TEST BODY...)   repeat BODY while TEST is true
    (repeat N BODY...)     BODY, N times
    (if TEST THEN [ELSE])  (when TEST BODY...) (unless TEST BODY...)
    (and ...) (or ...) (not X)  (begin BODY...)
    (define (NAME) BODY...)    name a procedure; call it with (NAME). Its value is its last form's.
    (say "words")          speak
    (stop)                 end the spell
    #t #f                  true and false

docs/LANGUAGE.md says the same, with examples. The same grammar is written in
Scheme in check.scm, which chibi-scheme runs to verify a spell.
"""

COMPASS = ("north", "east", "south", "west")  # a square hedge's ways; a polar hedge passes its own to check()
RELATIVE = ("ahead", "back", "left", "right")
VERTICAL = ("up", "down")
TURNS = ("left", "right", "around")
MAX_SPIN = 10000  # evaluation steps allowed between two actions before the spell is judged to spin


class SpellError(Exception):
    """A spell that does not read, or does not make sense."""


class Symbol(str):
    """A name in a spell. A plain str is a string literal."""
    __slots__ = ()

    def __repr__(self):
        return str(self)


# ---- reading ----

def tokenize(text):
    tokens, i, n, line = [], 0, len(text), 1
    while i < n:
        ch = text[i]
        if ch == "\n":
            line += 1
            i += 1
        elif ch.isspace():
            i += 1
        elif ch == ";":
            while i < n and text[i] != "\n":
                i += 1
        elif ch in "()":
            tokens.append((ch, line))
            i += 1
        elif ch == '"':
            j = i + 1
            while j < n and text[j] != '"':
                if text[j] == "\n":
                    line += 1
                j += 1
            if j >= n:
                raise SpellError(f"line {line}: a string that never closes")
            tokens.append((text[i:j + 1], line))
            i = j + 1
        else:
            j = i
            while j < n and not text[j].isspace() and text[j] not in "()\";":
                j += 1
            tokens.append((text[i:j], line))
            i = j
    return tokens


def atom(token):
    if token.startswith('"'):
        return token[1:-1]
    if token == "#t":
        return True
    if token == "#f":
        return False
    try:
        return int(token)
    except ValueError:
        return Symbol(token)


def read(text):
    """Parse a spell into a list of forms."""
    tokens = tokenize(text)
    forms, stack = [], []
    for token, line in tokens:
        if token == "(":
            stack.append(([], line))
        elif token == ")":
            if not stack:
                raise SpellError(f"line {line}: a ) with nothing open")
            form, _ = stack.pop()
            (stack[-1][0] if stack else forms).append(form)
        else:
            (stack[-1][0] if stack else forms).append(atom(token))
    if stack:
        raise SpellError(f"line {stack[-1][1]}: a ( that never closes")
    return forms


# ---- checking: the grammar, before anything runs ----

def check(forms, compass=COMPASS):
    """Raise SpellError on the first form that is not in the language.

    compass is the hedge's own four ways (north east south west, or on a polar
    hedge in widdershins out sunwise). A direction word from another hedge is
    not a word here."""
    defined = set()
    for f in forms:
        if isinstance(f, list) and f and f[0] == "define":
            if len(f) < 3 or not isinstance(f[1], list) or len(f[1]) != 1 or not isinstance(f[1][0], Symbol):
                raise SpellError("define needs (define (name) body...)")
            defined.add(f[1][0])
    for f in forms:
        _check(f, defined, compass, top=True)
    return True


def _is_sym(x, *names):
    return isinstance(x, Symbol) and x in names


def _check(f, defined, compass, top=False):
    ways = compass + RELATIVE + VERTICAL
    if isinstance(f, (bool, int, str)) and not isinstance(f, Symbol):
        return
    if isinstance(f, Symbol):
        raise SpellError(f"{f} is not a thing on its own; did you mean ({f})?")
    if not f:
        raise SpellError("() is empty")
    head, args = f[0], f[1:]
    if not isinstance(head, Symbol):
        raise SpellError(f"{show(f)} does not start with a name")
    n = len(args)

    def need(ok, msg):
        if not ok:
            raise SpellError(f"{show(f)}: {msg}")

    if head == "go":
        need(n == 1 and _is_sym(args[0], *ways), "go needs one direction: " + " ".join(ways))
    elif head == "face":
        need(n == 1 and _is_sym(args[0], *compass), "face needs " + ", ".join(compass[:-1]) + " or " + compass[-1])
    elif head == "turn":
        need(n == 1 and _is_sym(args[0], *TURNS), "turn needs left, right or around")
    elif head in ("wall?", "open?"):
        need(n == 1 and _is_sym(args[0], *ways), f"{head} needs one direction")
    elif head in ("gate?", "dead-end?", "stop", "mark"):
        need(n == 0, f"{head} takes nothing")
    elif head == "marked?":
        need(n == 0 or (n == 1 and _is_sym(args[0], *ways)), "marked? takes nothing, or one direction")
    elif head in ("until", "while"):
        need(n >= 2, f"{head} needs a test and a body")
        for a in args:
            _check(a, defined, compass)
    elif head == "repeat":
        need(n >= 2 and isinstance(args[0], int) and not isinstance(args[0], bool) and args[0] >= 0, "repeat needs a count and a body")
        for a in args[1:]:
            _check(a, defined, compass)
    elif head == "if":
        need(n in (2, 3), "if needs a test, a then, and maybe an else")
        for a in args:
            _check(a, defined, compass)
    elif head in ("when", "unless"):
        need(n >= 2, f"{head} needs a test and a body")
        for a in args:
            _check(a, defined, compass)
    elif head in ("and", "or", "begin"):
        for a in args:
            _check(a, defined, compass)
    elif head == "not":
        need(n == 1, "not needs one thing")
        _check(args[0], defined, compass)
    elif head == "say":
        need(n == 1 and isinstance(args[0], str) and not isinstance(args[0], Symbol), 'say needs "words in quotes"')
    elif head == "define":
        need(top, "define only at the top of a spell")
        for a in args[1:]:
            _check(a, defined, compass)
    elif head in defined:
        need(n == 0, f"({head}) takes nothing")
    else:
        raise SpellError(f"{head} is not a word of the language")


def show(f):
    if isinstance(f, list):
        return "(" + " ".join(show(x) for x in f) + ")"
    if isinstance(f, bool):
        return "#t" if f else "#f"
    if isinstance(f, str) and not isinstance(f, Symbol):
        return f'"{f}"'
    return str(f)


# ---- running: one action at a time ----

class Stop(Exception):
    pass


def run(forms, world):
    """A generator. Each yielded value is an action: ("go", D), ("face", D),
    ("turn", T) or ("say", text). The world answers the tests:
    world.wall(D), world.gate(), world.dead_end(), world.marked(D or None). D may be relative; the
    world resolves it against the player's heading."""
    procs = {f[1][0]: f[2:] for f in forms if isinstance(f, list) and f and f[0] == "define"}
    spin = [0]

    def tick():
        spin[0] += 1
        if spin[0] > MAX_SPIN:
            raise SpellError("the spell spins: a loop with no step in it")

    def body(seq):
        """Evaluate forms in order; the value is the last one's, as in Scheme."""
        v = True
        for f in seq:
            v = yield from ev(f)
        return v

    def ev(f):
        """Evaluate f, yielding actions along the way. Returns f's value."""
        tick()
        if isinstance(f, (bool, int, str)) and not isinstance(f, Symbol):
            return f
        head, args = f[0], f[1:]
        if head == "go":
            yield ("go", args[0]); spin[0] = 0; return True
        if head == "face":
            yield ("face", args[0]); return True
        if head == "turn":
            yield ("turn", args[0]); return True
        if head == "say":
            yield ("say", args[0]); return True
        if head == "stop":
            raise Stop()
        if head == "wall?":
            return world.wall(args[0])
        if head == "open?":
            return not world.wall(args[0])
        if head == "gate?":
            return world.gate()
        if head == "dead-end?":
            return world.dead_end()
        if head == "marked?":
            return world.marked(args[0] if args else None)
        if head == "mark":
            yield ("mark", None); return True
        if head == "not":
            return not (yield from ev(args[0]))
        if head == "and":
            v = True
            for a in args:
                v = yield from ev(a)
                if not v:
                    return False
            return v
        if head == "or":
            for a in args:
                v = yield from ev(a)
                if v:
                    return v
            return False
        if head == "if":
            t = yield from ev(args[0])
            if t:
                return (yield from ev(args[1]))
            return (yield from ev(args[2])) if len(args) == 3 else False
        if head == "when" or head == "unless":
            t = yield from ev(args[0])
            if bool(t) == (head == "when"):
                yield from body(args[1:])
            return True
        if head == "begin":
            return (yield from body(args))
        if head == "until" or head == "while":
            while True:
                t = yield from ev(args[0])
                if bool(t) == (head == "until"):
                    return True
                yield from body(args[1:])
        if head == "repeat":
            for _ in range(args[0]):
                yield from body(args[1:])
            return True
        if head == "define":
            return True
        if head in procs:
            return (yield from body(procs[head]))  # so a procedure can be a test: (if (fresh-left) ...)
        raise SpellError(f"{head} is not a word of the language")

    try:
        yield from body(forms)
    except Stop:
        return


def parse(text, compass=COMPASS):
    """Read and check. Returns the forms or raises SpellError."""
    forms = read(text)
    if not forms:
        raise SpellError("an empty spell")
    check(forms, compass)
    return forms
