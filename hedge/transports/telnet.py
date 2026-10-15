"""The telnet transport: lines in, text out, GMCP alongside for clients that ask.

GMCP (Generic MUD Communication Protocol) is telnet option 201. We offer it
with IAC WILL 201. A modern client answers IAC DO 201 and then receives, with
every room, an out-of-band packet: IAC SB 201 "Hedge.Room {json}" IAC SE.
A plain telnet client never sees any of it.
"""

import asyncio
import json

from .. import render

IAC, SB, SE, WILL, WONT, DO, DONT, GMCP = 255, 250, 240, 251, 252, 253, 254, 201
PROMPT = "> "
SPELL_PROMPT = "  . "


def split_telnet(data):
    """(text, options): the typed text, and the option replies (verb, option) found."""
    out, options, i = bytearray(), [], 0
    while i < len(data):
        b = data[i]
        if b == IAC and i + 1 < len(data):
            verb = data[i + 1]
            if verb in (WILL, WONT, DO, DONT) and i + 2 < len(data):
                options.append((verb, data[i + 2]))
                i += 3
            elif verb == SB:
                end = data.find(bytes([IAC, SE]), i)
                i = len(data) if end < 0 else end + 2
            else:
                i += 2
            continue
        if b < 128:
            out.append(b)
        i += 1
    return out.decode("ascii", "replace"), options


class TelnetTransport:
    def __init__(self, hub):
        self.hub = hub
        self.writers = {}
        self.gmcp = set()
        self.tasks = {}

    def sink(self, name):
        def deliver(events):
            w = self.writers.get(name)
            if not w or w.is_closing():
                return
            for ev in events:
                w.write((render.text(ev) + "\n").encode("utf-8", "replace"))
                if name in self.gmcp:
                    packet = render.gmcp(ev)
                    if packet:
                        package, data = packet
                        body = f"{package} {json.dumps(data, separators=(',', ':'))}".encode("utf-8", "replace")
                        w.write(bytes([IAC, SB, GMCP]) + body + bytes([IAC, SE]))
        return deliver

    async def write(self, name, text):
        w = self.writers.get(name)
        if w and not w.is_closing():
            w.write(text.encode("utf-8", "replace"))
            try:
                await w.drain()
            except ConnectionError:
                pass

    async def run_spell(self, name):
        try:
            while True:
                await asyncio.sleep(self.hub.pace)
                if not self.hub.tick(name):
                    await self.write(name, PROMPT)
                    return
        finally:
            self.tasks.pop(name, None)

    async def handle(self, reader, writer):
        writer.write(bytes([IAC, WILL, GMCP]) + b"The Hedge. What is your name? ")
        await writer.drain()
        name = None
        try:
            text, options = split_telnet(await reader.readline())
            name = text.strip()[:20]
            if (DO, GMCP) in options:
                self.gmcp.add(name)
            if not name or not name.replace("-", "").isalnum():
                writer.write(b"A name is letters. Come back.\n")
                await writer.drain()
                writer.close()
                return
            self.writers[name] = writer
            if not self.hub.connect(name, self.sink(name)):
                del self.writers[name]
                writer.write(b"Someone of that name is already here. Come back.\n")
                await writer.drain()
                writer.close()
                return
            await self.write(name, PROMPT)
            while True:
                raw = await reader.readline()
                if not raw:
                    break
                line, options = split_telnet(raw)
                if (DO, GMCP) in options:
                    self.gmcp.add(name)
                if (DONT, GMCP) in options:
                    self.gmcp.discard(name)
                if line.strip().lower() in ("quit", "exit") and self.hub.mode(name) == "command":
                    break
                mode = self.hub.line(name, line)
                if mode == "spell":
                    await self.write(name, SPELL_PROMPT)
                elif self.hub.running(name) and name not in self.tasks:
                    self.tasks[name] = asyncio.create_task(self.run_spell(name))
                elif name not in self.tasks:
                    await self.write(name, PROMPT)
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            if name in self.tasks:
                self.tasks[name].cancel()
            if name in self.writers:
                del self.writers[name]
                self.gmcp.discard(name)
                self.hub.disconnect(name)
            writer.close()


async def serve_telnet(hub, host="0.0.0.0", port=4000):
    transport = TelnetTransport(hub)
    return await asyncio.start_server(transport.handle, host, port)
