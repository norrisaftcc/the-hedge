"""Verb and noun: the command grammar, in the manner of adventurelib.

A pattern is words. A word in CAPITALS is a placeholder and matches one typed
word; the last placeholder in a pattern matches the rest of the line; the
placeholder NUMBER matches only digits. A pattern names a verb for the game
and may fix some arguments; a fixed value that names a placeholder takes what
the placeholder matched (so "NUMBER" -> go, direction="NUMBER" makes a bare
8 into ("go", {"direction": "8"}), as in Hunt the Wumpus).

    g = Grammar()
    g.when("go DIRECTION", "go")
    g.when("n", "go", direction="north")
    g.when("say WORDS", "say", words="WORDS")
    g.parse("go north")   -> ("go", {"direction": "north"})

The game knows verbs and arguments, never lines. A browser can send the verb
and arguments as JSON and skip the grammar; a telnet client types the line.
"""


class Grammar:
    def __init__(self):
        self.rules = []       # (words, verb, fixed)
        self.normalizers = {}  # placeholder -> dict of alias -> value

    def when(self, pattern, verb, **fixed):
        """Register a pattern. Several patterns may name one verb."""
        for alt in pattern.split("|"):
            self.rules.append((alt.split(), verb, fixed))
        return self

    def normalize(self, placeholder, aliases):
        """Map typed words for a placeholder, like n -> north."""
        self.normalizers[placeholder] = aliases
        return self

    def parse(self, line):
        """(verb, args) for the first rule that matches, or None."""
        words = line.split()
        if not words:
            return None
        for pattern, verb, fixed in self.rules:
            args = self._match(pattern, words, line)
            if args is not None:
                out = {}
                for k, v in args.items():
                    aliases = self.normalizers.get(k, {})
                    if k in self.normalizers and len(v.split()) == 1:
                        v = aliases.get(v.lower(), v.lower())
                    out[k.lower()] = v
                for k, v in fixed.items():
                    if isinstance(v, str) and v in args:  # a fixed value naming a placeholder takes its match
                        out.pop(v.lower(), None)
                        out[k] = args[v]
                    else:
                        out[k] = v
                return verb, out
        return None

    @staticmethod
    def _rest(line, n):
        """The line after its first n words, as typed: newlines and spacing kept."""
        i, seen = 0, 0
        while seen < n:
            while i < len(line) and line[i].isspace():
                i += 1
            while i < len(line) and not line[i].isspace():
                i += 1
            seen += 1
        return line[i:].strip()

    @classmethod
    def _match(cls, pattern, words, line):
        args = {}
        for i, p in enumerate(pattern):
            if i >= len(words):
                return None
            if p.isupper():
                if p == "NUMBER" and not words[i].isdigit():
                    return None
                if i == len(pattern) - 1:
                    args[p] = cls._rest(line, i)  # a spell keeps its line breaks, so a ; comment ends where it should
                    return args
                args[p] = words[i]
            elif p.lower() != words[i].lower():
                return None
        return args if len(words) == len(pattern) else None

    def verbs(self):
        return sorted({verb for _, verb, _ in self.rules})


DIRECTIONS = {"n": "north", "s": "south", "e": "east", "w": "west", "u": "up",
              "i": "in", "o": "out", "sw": "sunwise", "wd": "widdershins"}

GRAMMAR = (
    Grammar()
    .normalize("DIRECTION", DIRECTIONS)
    .when("look|l", "look")
    .when("map|m", "map")
    .when("north|n", "go", direction="north")
    .when("south|s", "go", direction="south")
    .when("east|e", "go", direction="east")
    .when("west|w", "go", direction="west")
    .when("up|u", "go", direction="up")
    .when("down", "go", direction="down")
    .when("in|i", "go", direction="in")              # a polar hedge's ways; a square hedge says there is no in here
    .when("out|o", "go", direction="out")
    .when("sunwise|sw", "go", direction="sunwise")
    .when("widdershins|wd", "go", direction="widdershins")
    .when("NUMBER", "go", direction="NUMBER")             # a cave's tunnel, by the number over it: 8 is go 8
    .when("ahead", "go", direction="ahead")               # a step by relative word, as one does in a cave
    .when("back", "go", direction="back")
    .when("left", "go", direction="left")
    .when("right", "go", direction="right")
    .when("go DIRECTION", "go")
    .when("face DIRECTION", "face")
    .when("turn WHICH", "turn")
    .when("read", "read")
    .when("study", "study")
    .when("cast WORDS", "cast")
    .when("stop", "stop")
    .when("mark", "mark")
    .when("spells", "spells")
    .when("say WORDS", "say")
    .when("who", "who")
    .when("score", "score")
    .when("again", "again")
    .when("help|h|?", "help")
)
