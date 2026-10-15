"""Tests for the hedge: dice, mazes, rooms, spells, the grammar, the game, the transports."""

import asyncio
import io
import json
import os
import shutil
import struct
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from hedge import render, spell, verify  # noqa: E402
from hedge.api import Table  # noqa: E402
from hedge.maze import ALGORITHMS, grow  # noqa: E402
from hedge.parser import GRAMMAR, Grammar  # noqa: E402
from hedge.rng import Mulberry32, seed_from_text  # noqa: E402
from hedge.world import Hedge  # noqa: E402

SPELLS = os.path.join(ROOT, "spells")
WALKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "walks")


def read_spell(name):
    with open(os.path.join(SPELLS, name)) as f:
        return f.read()


def kinds(events):
    return [e.kind for e in events]


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

    def marked(self, d=None):
        if d is None:
            return self.pos in self.marks
        there = self.h.move(self.pos, self.resolve(d))
        return there is not None and there in self.marks

    def walk(self, text, cap=None):
        """Walk the spell. Returns the steps taken; with a cap, stops there and returns the cap."""
        self.marks = getattr(self, "marks", set())
        steps = 0
        for kind, arg in spell.run(spell.parse(text), self):
            if kind == "go":
                d = self.resolve(arg)
                nxt = self.h.move(self.pos, d)
                assert nxt is not None, f"walked into the hedge at {self.pos} going {d}"
                self.pos, self.heading, steps = nxt, d, steps + 1
                if cap and steps >= cap:
                    return steps
            elif kind == "turn":
                self.heading = self.resolve({"left": "left", "right": "right", "around": "back"}[arg])
            elif kind == "face":
                self.heading = arg
            elif kind == "mark":
                self.marks.add(self.pos)
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
         "(define x 3)", '(repeat 2 (say "hi"))', "", "(say hi)", "(x)", "(if (wall? left) (turn right))",
         "(mark)", "(marked?)", "(marked? left)", "(marked? up)", "(mark here)"]


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


# ---- the grammar ----

def test_grammar_verbs_and_nouns():
    assert GRAMMAR.parse("n") == ("go", {"direction": "north"})
    assert GRAMMAR.parse("go W") == ("go", {"direction": "west"})
    assert GRAMMAR.parse("Go left") == ("go", {"direction": "left"})
    assert GRAMMAR.parse("say Hello, Hedge!") == ("say", {"words": "Hello, Hedge!"})
    assert GRAMMAR.parse("cast (until (gate?) (go North))") == ("cast", {"words": "(until (gate?) (go North))"})
    assert GRAMMAR.parse("turn around") == ("turn", {"which": "around"})
    assert GRAMMAR.parse("?") == ("help", {})
    assert GRAMMAR.parse("dance") is None and GRAMMAR.parse("") is None
    assert GRAMMAR.parse("look harder") is None  # look takes nothing


def test_a_grammar_is_data():
    g = Grammar().when("take ITEM", "take").when("put ITEM in PLACE", "put")
    assert g.parse("take lamp") == ("take", {"item": "lamp"})
    assert g.parse("put lamp in the bag") == ("put", {"item": "lamp", "place": "the bag"})
    assert g.parse("take") is None
    assert g.verbs() == ["put", "take"]


# ---- the game, through the local API ----

def test_two_players_see_each_other():
    t = Table(pace=0, seed=7, algorithm="sidewinder")
    t.join("Ash")
    assert "Ash is here." in t.text("Brook", t.join("Brook"))
    assert "Brook comes down the stair" in t.text("Ash")
    t.line("Ash", "say hello")
    assert 'Ash says, "hello"' in t.text("Brook", t.take("Brook"))
    d = t.hedge.ways(t.hedge.entrance)[0]
    t.line("Ash", d)
    assert f"Ash goes {d}." in t.text("Brook", t.take("Brook"))


def test_room_event_carries_the_numbers_behind_the_words():
    t = Table(pace=0, seed=7, algorithm="sidewinder")
    room = [e for e in t.join("Ash") if e.kind == "room"][0]
    assert room.data["exits"] == t.hedge.ways(t.hedge.entrance)
    assert room.data["entrance"] is True and room.data["lit"] is True
    for d, s in room.data["sight"].items():
        run, openings, end = t.hedge.sight(t.hedge.entrance, d)
        assert s == {"run": run, "openings": [list(o) for o in openings], "end": end}
    # The words and the numbers agree.
    for d in room.data["exits"]:
        assert d.capitalize() + "," in room.text
    as_json = render.json(room)
    assert as_json["kind"] == "room" and as_json["text"] == room.text and as_json["exits"] == room.data["exits"]
    package, payload = render.gmcp(room)
    assert package == "Hedge.Room" and payload["pos"] == room.data["pos"]


def test_structured_verbs_skip_the_grammar():
    t = Table(pace=0, seed=7, algorithm="sidewinder")
    t.join("Ash")
    d = t.hedge.ways(t.hedge.entrance)[0]
    events = t.act("Ash", "go", direction=d)
    assert "room" in kinds(events) and t.player("Ash").turns == 1
    assert kinds(t.act("Ash", "dance")) == ["error"]


def test_walking_into_the_hedge_and_out_of_the_light():
    t = Table(pace=0, seed=7, algorithm="aldous-broder")
    t.join("Ash")
    p = t.player("Ash")
    closed = [d for d in ("north", "east", "south", "west") if not t.hedge.is_open(p.pos, d)][0]
    assert kinds(t.line("Ash", closed)) == ["bump"]
    assert p.turns == 0
    t.line("Ash", "cast " + read_spell("left-hand.scm"))
    events, steps = t.run_spell("Ash")
    assert p.out or any(e.kind == "light" and e.data["torches"] == 0 for e in events)
    assert p.turns > 0


def test_a_spell_walks_to_the_gate_in_the_game():
    t = Table(pace=0, seed=3, algorithm="binary")
    t.join("Ash")
    assert "The spell holds" in t.text("Ash", t.line("Ash", "cast " + read_spell("left-hand.scm")))
    events, steps = t.run_spell("Ash")
    assert t.player("Ash").out
    assert any(e.kind == "out" for e in events)


def test_a_spell_that_walks_into_the_hedge_breaks():
    t = Table(pace=0, seed=3, algorithm="binary")
    t.join("Ash")
    t.line("Ash", "cast (repeat 20 (go south))")  # the entrance of this hedge has no way south
    assert not t.tick("Ash")
    assert "breaks" in t.text("Ash", t.take("Ash"))


def test_bad_spell_does_not_hold_and_quiet_verbs_during_a_spell():
    t = Table(pace=0, seed=1, algorithm="binary", size=4)
    t.join("Ash")
    assert "does not hold" in t.text("Ash", t.line("Ash", "cast (go up)"))
    assert t.player("Ash").spell is None
    t.line("Ash", "cast " + read_spell("left-hand.scm"))
    assert kinds(t.line("Ash", "north")) == ["error"]
    assert kinds(t.line("Ash", "who")) == ["who"]
    assert "You let the spell go." in t.text("Ash", t.line("Ash", "stop"))


def test_multi_line_spell_typed_until_a_blank_line():
    t = Table(pace=0, seed=7, algorithm="sidewinder")
    t.join("Ash")
    assert t.hub.line("Ash", "cast") == "spell"
    assert "Type the spell" in t.text("Ash", t.take("Ash"))
    assert t.hub.line("Ash", "(define (step) (go north))") == "spell"
    assert t.hub.line("Ash", "(step)") == "spell"
    assert t.hub.line("Ash", "") == "command"
    assert "The spell holds" in t.text("Ash", t.take("Ash"))


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
    solo(Args, lines, out, pace=0)
    # The transcript does not depend on whether chibi-scheme is installed.
    plain = lambda t: t.replace(" (chibi)", "").replace(" (python)", "")
    assert plain(out.getvalue()) == plain(expected)


# ---- transports ----

def test_telnet_round_trip_with_gmcp():
    from hedge.transports.telnet import TelnetTransport, split_telnet
    from hedge.hub import balanced

    assert split_telnet(b"\xff\xfd\xc9look\r\n") == ("look\r\n", [(253, 201)])
    assert balanced("(go north)") and not balanced("(go north") and balanced('(say ")")')

    async def run():
        t = Table(pace=0, seed=7, algorithm="sidewinder")
        transport = TelnetTransport(t.hub)
        srv = await asyncio.start_server(transport.handle, "127.0.0.1", 0)
        port = srv.sockets[0].getsockname()[1]

        async def client(name, lines, gmcp=False):
            r, w = await asyncio.open_connection("127.0.0.1", port)
            await r.readuntil(b"? ")
            w.write((bytes([255, 253, 201]) if gmcp else b"") + (name + "\n").encode())
            for line in lines:
                await asyncio.sleep(0.05)
                w.write((line + "\n").encode())
            await w.drain()
            await asyncio.sleep(0.5)
            w.write(b"quit\n")
            await w.drain()
            data = await r.read()
            w.close()
            return data

        a, b = await asyncio.gather(client("Ash", ["say hi", "cast", "(go north)", "", "look"], gmcp=True),
                                    client("Brook", ["look", "who"]))
        srv.close()
        await srv.wait_closed()
        return a, b

    a, b = asyncio.run(run())
    assert b"Type the spell. A blank line ends it." in a and b"The spell holds" in a
    assert bytes([255, 250, 201]) + b"Hedge.Room {" in a      # GMCP for the client that asked
    assert bytes([255, 250, 201]) not in b                      # none for the one that did not
    assert b"Ash says" in b or b"Ash is here" in b
    assert b"In the hedge:" in b


def test_websocket_round_trip_and_the_page():
    from hedge.transports.ws import WebSocketTransport, GUID
    import base64
    import hashlib
    import os as _os

    def mask_frame(text):
        data = text.encode()
        mask = _os.urandom(4)
        head = bytes([0x81, 0x80 | len(data)]) if len(data) < 126 else bytes([0x81, 0x80 | 126]) + struct.pack(">H", len(data))
        return head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data))

    async def read_frame(r):
        b1, b2 = await r.readexactly(2)
        n = b2 & 0x7F
        if n == 126:
            n = struct.unpack(">H", await r.readexactly(2))[0]
        return json.loads(await r.readexactly(n))

    async def run():
        t = Table(pace=0, seed=7, algorithm="sidewinder")
        transport = WebSocketTransport(t.hub)
        srv = await asyncio.start_server(transport.handle, "127.0.0.1", 0)
        port = srv.sockets[0].getsockname()[1]
        # The page.
        r, w = await asyncio.open_connection("127.0.0.1", port)
        w.write(b"GET / HTTP/1.1\r\nHost: x\r\n\r\n")
        page = await r.read()
        w.close()
        # The socket.
        r, w = await asyncio.open_connection("127.0.0.1", port)
        key = base64.b64encode(_os.urandom(16)).decode()
        w.write(f"GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
        head = (await r.readuntil(b"\r\n\r\n")).decode()
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        w.write(mask_frame("Ash"))
        got = []
        for _ in range(4):
            got.append(await read_frame(r))
        w.write(mask_frame(json.dumps({"verb": "go", "direction": t.hedge.ways(t.hedge.entrance)[0]})))
        for _ in range(2):
            got.append(await read_frame(r))
        w.write(mask_frame("say over the wire"))
        for _ in range(2):
            got.append(await read_frame(r))
        w.write(bytes([0x88, 0x80]) + _os.urandom(4))
        w.close()
        srv.close()
        await srv.wait_closed()
        return page, head, accept, got

    page, head, accept, got = asyncio.run(run())
    assert page.startswith(b"HTTP/1.1 200") and b"<title>The Hedge</title>" in page
    assert "101" in head and accept in head
    kinds_seen = [g["kind"] for g in got]
    assert kinds_seen[:4] == ["arrive", "info", "room", "prompt"]
    rooms = [g for g in got if g["kind"] == "room"]
    assert len(rooms) == 2 and rooms[1]["ring"] == 1 and "exits" in rooms[1] and "sight" in rooms[1]
    assert any(g["kind"] == "say" and g["words"] == "over the wire" for g in got)


def test_map_event_carries_only_the_seen_cells():
    t = Table(pace=0, seed=7, algorithm="sidewinder")
    t.join("Ash")
    ev = [e for e in t.line("Ash", "map") if e.kind == "map"][0]
    seen = set(tuple(map(int, k.split(","))) for k in ev.data["cells"])
    assert seen == t.player("Ash").seen and len(seen) < t.hedge.rows * t.hedge.cols
    for key, ways in ev.data["cells"].items():
        r, c = map(int, key.split(","))
        assert ways == t.hedge.ways((r, c))
    assert ev.data["pos"] == list(t.hedge.entrance) and ev.data["gate"] is None
    assert ev.data["rows"] == 8 and ev.data["heading"] == "north"


def test_pace_is_a_hub_setting_and_zero_in_tests():
    from hedge.hub import Hub
    assert Hub(None).pace == 0.6
    assert Table.PACE == 0.3 and Table(pace=0, seed=1).pace == 0


# ---- braided hedges: where the left-hand rule fails ----

def test_a_braided_hedge_has_loops_and_the_same_dice():
    perfect = Hedge(8, 8, "sidewinder", 7)
    half = Hedge(8, 8, "sidewinder", 7, braid=0.5)
    full = Hedge(8, 8, "sidewinder", 7, braid=1.0)
    dead = lambda h: sum(1 for pos in h.dist if h.is_dead_end(pos))
    assert dead(full) == 0 < dead(half) < dead(perfect)
    assert Hedge(8, 8, "sidewinder", 7, braid=0.5).grid.display() == half.grid.display()
    assert full.tell is not perfect.tell and "loops" in full.plate(True)
    assert len(full.dist) == 64  # every cell still reachable


@pytest.mark.parametrize("seed", [20, 23])
def test_left_hand_circles_a_braided_hedge_and_chalk_gets_out(seed):
    # Measured over 40 seeds per algorithm: the left hand fails on 7 to 18 of them once braided,
    # chalk on 3 to 7. These two seeds are ones where the left hand circles and chalk does not.
    h = Hedge(8, 8, "binary", seed, braid=1.0)
    left = Walker(h)
    assert left.walk(read_spell("left-hand.scm"), cap=600) == 600 and not left.gate()
    chalk = Walker(h)
    chalk.walk(read_spell("chalk.scm"), cap=600)
    assert chalk.gate()


def test_chalk_is_not_a_proof():
    # Seed 11 defeats both. The plate says why: cell marks and no memory of the way back.
    h = Hedge(8, 8, "binary", 11, braid=1.0)
    w = Walker(h)
    assert w.walk(read_spell("chalk.scm"), cap=600) == 600 and not w.gate()


@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_chalk_still_solves_a_perfect_hedge(algorithm):
    w = Walker(Hedge(8, 8, algorithm, 5))
    w.walk(read_spell("chalk.scm"))
    assert w.gate()


def test_a_procedure_returns_its_last_value():
    # The bug the braid found: (if (fresh-left) ...) always took the first branch.
    w = Walker(Hedge(4, 4, "binary", 1))
    actions = list(spell.run(spell.parse('(define (no) (not (gate?)) #f) (if (no) (say "yes") (say "no")) (if (begin #t #f) (say "yes") (say "no"))'), w))
    assert actions == [("say", "no"), ("say", "no")]


def test_mark_in_the_game_and_on_the_map():
    t = Table(pace=0, seed=7, algorithm="sidewinder", braid=0.5)
    events = t.join("Ash")
    assert "braided" in t.text("Ash", events)
    assert kinds(t.line("Ash", "mark")) == ["mark"]
    ev = [e for e in t.line("Ash", "map") if e.kind == "map"][0]
    assert ev.data["marks"] == [list(t.hedge.entrance)]
    t.line("Ash", "cast (if (marked?) (say \"chalk\") (say \"clean\"))")
    events, _ = t.run_spell("Ash")
    assert any(e.kind == "say" and e.data["words"] == "chalk" for e in events)


def test_a_circling_spell_wears_thin(monkeypatch):
    from hedge import game as game_module
    monkeypatch.setattr(game_module, "SPELL_REACH", 12)
    t = Table(pace=0, seed=11, algorithm="binary", braid=1.0)
    t.join("Ash")
    t.line("Ash", "cast " + read_spell("left-hand.scm"))
    events, steps = t.run_spell("Ash", max_steps=100)
    assert steps <= 13 and any(e.kind == "spell" and e.data.get("reason") == "reach" for e in events)
    assert t.player("Ash").spell is None
