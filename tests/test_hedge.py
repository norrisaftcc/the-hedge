"""Tests for the hedge: dice, mazes, rooms, spells, the game, the server."""

import asyncio
import io
import os
import shutil
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from hedge import spell, verify  # noqa: E402
from hedge.game import Game, TORCH_TURNS  # noqa: E402
from hedge.maze import ALGORITHMS, grow  # noqa: E402
from hedge.rng import Mulberry32, seed_from_text  # noqa: E402
from hedge.world import Hedge  # noqa: E402

SPELLS = os.path.join(ROOT, "spells")
WALKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "walks")


def read_spell(name):
    with open(os.path.join(SPELLS, name)) as f:
        return f.read()


# ---- dice ----

def test_seed_from_text():
    assert seed_from_text("42") == 42 == seed_from_text(" seed 4-2 ")
    assert seed_from_text("") == 0


@pytest.mark.skipif(shutil.which("node") is None, reason="node not found")
def test_dice_match_javascript_mulberry32():
    js = """
    let s = 42 >>> 0; const out = [];
    for (let i = 0; i < 20; i++) { let t = s = (s + 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      out.push((t ^ (t >>> 14)) >>> 0); }
    console.log(out.join(" "));
    """
    expected = [int(x) for x in subprocess.check_output(["node", "-e", js], text=True).split()]
    rng = Mulberry32(42)
    assert [rng.next_u32() for _ in range(20)] == expected


# ---- mazes ----

@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_same_seed_same_maze(algorithm):
    a = grow(8, 8, algorithm, 7).display()
    b = grow(8, 8, algorithm, 7).display()
    c = grow(8, 8, algorithm, 8).display()
    assert a == b and a != c


@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_hedge_is_perfect_and_the_ends_are_dead_ends(algorithm):
    h = Hedge(8, 8, algorithm, 3)
    assert len(h.dist) == 64 and max(h.dist.values()) < 64  # every cell reachable
    assert h.is_dead_end(h.entrance) and h.is_dead_end(h.gate)
    assert h.dist[h.gate] == len(h.path) - 1


# ---- rooms ----

def test_description_matches_geometry():
    h = Hedge(8, 8, "sidewinder", 7)
    for pos in h.dist:
        text = h.describe(pos)
        for d in ("north", "east", "south", "west"):
            assert (d.capitalize() + "," in text) == h.is_open(pos, d)
    dark = h.describe(h.path[2], lit=False)
    assert "It is dark" in dark and "Open ways:" in dark


def test_sight_stops_at_the_light():
    h = Hedge(8, 8, "binary", 1)
    # The top row of a binary-tree maze is one corridor east: a long sight line.
    run, _, end = h.sight((0, 0), "east", paces=3)
    assert run == 3 and end == "dark"
    run, _, end = h.sight((0, 0), "east", paces=99)
    assert run == 7 and end in ("dead end", "turns right")  # the corner may open south


# ---- the spell language ----

class Walker:
    """A spell's world over a hedge, with no game around it."""

    def __init__(self, h):
        self.h, self.pos, self.heading = h, h.entrance, "north"

    def resolve(self, d):
        return self.h.relative(self.heading, d)

    def wall(self, d):
        return not self.h.is_open(self.pos, self.resolve(d))

    def gate(self):
        return self.pos == self.h.gate

    def dead_end(self):
        return self.h.is_dead_end(self.pos)

    def walk(self, text):
        steps = 0
        for kind, arg in spell.run(spell.parse(text), self):
            if kind == "go":
                d = self.resolve(arg)
                nxt = self.h.move(self.pos, d)
                assert nxt is not None, f"walked into the hedge at {self.pos} going {d}"
                self.pos, self.heading, steps = nxt, d, steps + 1
            elif kind == "turn":
                self.heading = self.resolve({"left": "left", "right": "right", "around": "back"}[arg])
            elif kind == "face":
                self.heading = arg
        return steps


@pytest.mark.parametrize("algorithm", ALGORITHMS)
@pytest.mark.parametrize("seed", [1, 7, 42, 2026])
def test_left_hand_rule_reaches_the_gate(algorithm, seed):
    w = Walker(Hedge(8, 8, algorithm, seed))
    w.walk(read_spell("left-hand.scm"))
    assert w.gate()


@pytest.mark.parametrize("seed", [1, 7, 42])
def test_north_east_spell_reaches_the_corner_of_a_binary_tree(seed):
    w = Walker(Hedge(8, 8, "binary", seed))
    w.walk(read_spell("north-east.scm"))
    assert w.pos == (0, 7) or w.gate()


@pytest.mark.parametrize("seed", [1, 7, 42])
def test_long_walk_spell_climbs_a_sidewinder_to_the_corner(seed):
    w = Walker(Hedge(8, 8, "sidewinder", seed))
    w.walk(read_spell("long-walk.scm"))
    assert w.pos == (0, 0)


@pytest.mark.parametrize("bad, words", [
    ("(go up)", "go needs one direction"),
    ("(until (gate?))", "needs a test and a body"),
    ("(go north", "never closes"),
    ("north", "not a thing on its own"),
    ("(fly)", "not a word"),
    ("(repeat x (go north))", "needs a count"),
    ('(say hi)', "words in quotes"),
    ("(define x 3)", "define needs"),
    ("(if (gate?) (define (x) (go north)))", "only at the top"),
    ("", "empty"),
])
def test_bad_spells_are_refused(bad, words):
    with pytest.raises(spell.SpellError) as e:
        spell.parse(bad)
    assert words in str(e.value)


def test_a_spell_that_spins_is_refused():
    w = Walker(Hedge(4, 4, "binary", 1))
    with pytest.raises(spell.SpellError, match="spins"):
        w.walk(read_spell("spin.scm"))


def test_stop_ends_a_spell_and_say_speaks():
    w = Walker(Hedge(4, 4, "binary", 1))
    actions = list(spell.run(spell.parse('(say "hello") (stop) (go north)'), w))
    assert actions == [("say", "hello")]


# ---- chibi ----

CASES = ["(until (gate?) (go north))", "(go up)", "(go north", "north", "(fly)", "(define (x) (go north)) (x)",
         "(define x 3)", '(repeat 2 (say "hi"))', "", "(say hi)", "(x)", "(if (wall? left) (turn right))"]


@pytest.mark.skipif(verify.chibi_path() is None, reason="chibi-scheme not found")
def test_chibi_agrees_with_python_on_what_holds():
    for text in CASES + [read_spell(f) for f in os.listdir(SPELLS)]:
        ok, msg, backend = verify.verify(text)
        assert backend == "chibi"
        try:
            spell.parse(text)
            python_ok = True
        except spell.SpellError:
            python_ok = False
        assert ok == python_ok, f"{text!r}: chibi says {msg}, python says {python_ok}"


def test_verify_falls_back_to_python(monkeypatch):
    monkeypatch.setattr(verify, "chibi_path", lambda: None)
    assert verify.verify("(go north)") == (True, "ok", "python")
    ok, msg, backend = verify.verify("(go up)")
    assert not ok and backend == "python"


# ---- the game ----

def names(msgs, who):
    return "\n".join(t for to, t in msgs if to == who or to == "all")


def test_two_players_see_each_other():
    g = Game(Hedge(8, 8, "sidewinder", 7))
    g.join("Ash")
    msgs = g.join("Brook")
    assert "Ash is here." in names(msgs, "Brook")
    msgs = g.command("Ash", "say hello")
    assert any(to == ("room", g.hedge.entrance, "Ash") and "hello" in t for to, t in msgs)
    d = g.hedge.ways(g.hedge.entrance)[0]
    msgs = g.command("Ash", d)
    assert any(to == ("room", g.hedge.entrance, "Ash") and f"goes {d}" in t for to, t in msgs)


def test_walking_into_the_hedge_and_out_of_the_light():
    g = Game(Hedge(8, 8, "aldous-broder", 7))
    g.join("Ash")
    p = g.players["Ash"]
    closed = [d for d in ("north", "east", "south", "west") if not g.hedge.is_open(p.pos, d)][0]
    assert "The hedge is in the way." in names(g.command("Ash", closed), "Ash")
    assert p.turns == 0
    # Burn every torch with the left-hand rule, which walks far.
    g.command("Ash", "cast " + read_spell("left-hand.scm"))
    seen_dark = False
    for _ in range(400):
        msgs, running = g.step_spell("Ash")
        if "It is dark." in names(msgs, "Ash"):
            seen_dark = True
        if not running:
            break
    assert p.out or seen_dark
    assert p.turns > 0


def test_a_spell_walks_to_the_gate_in_the_game():
    g = Game(Hedge(8, 8, "binary", 3))
    g.join("Ash")
    msgs = g.command("Ash", "cast " + read_spell("left-hand.scm"))
    assert "The spell holds" in names(msgs, "Ash")
    for _ in range(1000):
        msgs, running = g.step_spell("Ash")
        if not running:
            break
    assert g.players["Ash"].out
    assert "found the far gate" in names(msgs, "Ash")


def test_a_spell_that_walks_into_the_hedge_breaks():
    g = Game(Hedge(8, 8, "binary", 3))
    g.join("Ash")
    g.command("Ash", "cast (repeat 20 (go south))")  # the entrance of this hedge has no way south
    msgs, running = g.step_spell("Ash")
    assert not running and "breaks" in names(msgs, "Ash")


def test_bad_spell_does_not_hold():
    g = Game(Hedge(4, 4, "binary", 1))
    g.join("Ash")
    assert "does not hold" in names(g.command("Ash", "cast (go up)"), "Ash")
    assert g.players["Ash"].spell is None


# ---- transcripts as test vectors ----

@pytest.mark.parametrize("name", sorted(f[:-3] for f in os.listdir(WALKS) if f.endswith(".in")))
def test_walk_transcript(name):
    from hedge.solo import solo

    class Args:
        size, algorithm, seed = 8, name.split("-")[0], int(name.split("-")[1])

    with open(os.path.join(WALKS, name + ".in")) as f:
        lines = f.readlines()
    with open(os.path.join(WALKS, name + ".out")) as f:
        expected = f.read()
    out = io.StringIO()
    solo(Args, lines, out)
    # The transcript does not depend on whether chibi-scheme is installed.
    plain = lambda t: t.replace(" (chibi)", "").replace(" (python)", "")
    assert plain(out.getvalue()) == plain(expected)


# ---- the server ----

def test_server_round_trip():
    from hedge.server import Server, strip_telnet, balanced

    assert strip_telnet(b"\xff\xfb\x01look\r\n") == "look\r\n"
    assert balanced("(go north)") and not balanced("(go north") and balanced('(say ")")')

    async def run():
        server = Server(Game(Hedge(8, 8, "sidewinder", 7)))
        srv = await asyncio.start_server(server.handle, "127.0.0.1", 0)
        port = srv.sockets[0].getsockname()[1]

        async def client(name, lines):
            r, w = await asyncio.open_connection("127.0.0.1", port)
            await r.readuntil(b"? ")
            w.write((name + "\n").encode())
            for line in lines:
                await asyncio.sleep(0.05)
                w.write((line + "\n").encode())
            await w.drain()
            await asyncio.sleep(0.5)
            w.write(b"quit\n")
            await w.drain()
            data = await r.read()
            w.close()
            return data.decode()

        a, b = await asyncio.gather(client("Ash", ["say hi", "cast", "(go north)", "", "look"]),
                                    client("Brook", ["look", "who"]))
        srv.close()
        await srv.wait_closed()
        return a, b

    a, b = asyncio.run(run())
    assert "Type the spell. A blank line ends it." in a and "The spell holds" in a
    assert "Ash says" in b or "Ash is here" in b
    assert "In the hedge:" in b
