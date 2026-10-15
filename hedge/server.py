"""The telnet server. Lines in, lines out, one hedge for everyone.

    python -m hedge --port 4000 --seed 7 --algorithm sidewinder --size 8

Then: telnet localhost 4000 (or nc). Standard library only.
"""

import argparse
import asyncio

from .game import Game
from .world import Hedge

STEP_SECONDS = 0.6  # a spell's pace, so the room can watch it walk
PROMPT = "> "
SPELL_PROMPT = "  . "
QUIET = {"stop", "look", "l", "map", "m", "who", "say", "score", "help", "h", "?", "spells", "read", "study"}


def strip_telnet(data):
    """Drop telnet option bytes (IAC sequences) a real telnet client sends."""
    out, i = bytearray(), 0
    while i < len(data):
        b = data[i]
        if b == 255 and i + 1 < len(data):
            nxt = data[i + 1]
            i += 3 if nxt in (251, 252, 253, 254) else 2
            continue
        if b < 128:
            out.append(b)
        i += 1
    return out.decode("ascii", "replace")


def balanced(text):
    depth, in_str = 0, False
    for ch in text:
        if ch == '"':
            in_str = not in_str
        elif not in_str:
            depth += (ch == "(") - (ch == ")")
    return depth <= 0 and not in_str


class Server:
    def __init__(self, game):
        self.game = game
        self.clients = {}  # name -> writer
        self.spells = {}   # name -> asyncio task

    async def send(self, to, text, exclude=None):
        if to == "all":
            names = list(self.clients)
        elif isinstance(to, tuple):
            _, pos, exclude = to
            names = [n for n, p in self.game.players.items() if p.pos == pos and n != exclude]
        else:
            names = [to]
        for n in names:
            w = self.clients.get(n)
            if w and not w.is_closing():
                w.write((text + "\n").encode("utf-8", "replace"))
        for n in names:
            w = self.clients.get(n)
            if w and not w.is_closing():
                try:
                    await w.drain()
                except ConnectionError:
                    pass

    async def deliver(self, msgs):
        for to, text in msgs:
            await self.send(to, text)

    async def run_spell(self, name):
        try:
            while True:
                await asyncio.sleep(STEP_SECONDS)
                msgs, running = self.game.step_spell(name)
                await self.deliver(msgs)
                if not running:
                    await self.send(name, PROMPT)
                    return
        finally:
            self.spells.pop(name, None)

    async def handle(self, reader, writer):
        writer.write(b"The Hedge. What is your name? ")
        await writer.drain()
        name = None
        try:
            raw = await reader.readline()
            name = strip_telnet(raw).strip()[:20]
            if not name or not name.replace("-", "").isalnum() or name in self.clients:
                writer.write(b"A name is letters, and not one already here. Come back.\n")
                await writer.drain()
                writer.close()
                return
            self.clients[name] = writer
            await self.deliver(self.game.join(name))
            await self.send(name, PROMPT)
            buffer = None  # lines of a spell being typed, until a blank line
            while True:
                raw = await reader.readline()
                if not raw:
                    break
                line = strip_telnet(raw).rstrip("\r\n")
                if buffer is not None:
                    if line.strip():
                        buffer.append(line)
                        await self.send(name, SPELL_PROMPT)
                        continue
                    line, buffer = "cast " + "\n".join(buffer), None
                elif line.strip().lower() == "cast" or (line.strip().lower().startswith("cast ") and not balanced(line)):
                    buffer = [line.strip()[4:].strip()] if line.strip()[4:].strip() else []
                    await self.send(name, "Type the spell. A blank line ends it.\n" + SPELL_PROMPT)
                    continue
                if line.strip().lower() in ("quit", "exit"):
                    break
                if name in self.spells and line.split()[0].lower() not in QUIET:
                    await self.send(name, "A spell is running. stop it, or look, map, who, say, score, help.\n" + PROMPT)
                    continue
                msgs = self.game.command(name, line)
                await self.deliver(msgs)
                if self.game.players[name].spell is not None and name not in self.spells:
                    self.spells[name] = asyncio.create_task(self.run_spell(name))
                else:
                    await self.send(name, PROMPT)
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            if name in self.spells:
                self.spells[name].cancel()
            if name in self.clients:
                del self.clients[name]
                await self.deliver(self.game.leave(name))
            writer.close()


async def serve(args):
    hedge = Hedge(args.size, args.size, args.algorithm, args.seed)
    server = Server(Game(hedge))
    srv = await asyncio.start_server(server.handle, args.host, args.port)
    print(f"The Hedge ({args.algorithm}, {args.size} by {args.size}, seed {args.seed}) on {args.host}:{args.port}. "
          f"Entrance {hedge.entrance}, gate {hedge.gate}, {len(hedge.path) - 1} steps apart.")
    async with srv:
        await srv.serve_forever()


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python -m hedge", description="The Hedge: a maze is a repeated process.")
    parser.add_argument("--port", type=int, default=4000)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--algorithm", "-a", choices=("binary", "sidewinder", "aldous-broder"), default="sidewinder")
    parser.add_argument("--size", type=int, default=8, help="rows and columns")
    parser.add_argument("--solo", action="store_true", help="play alone on this terminal, no network")
    args = parser.parse_args(argv)
    if args.solo:
        from .solo import solo
        return solo(args)
    try:
        asyncio.run(serve(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
