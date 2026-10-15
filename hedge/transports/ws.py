"""The WebSocket transport, for a browser. Standard library only.

One port does two things. A plain GET serves web/index.html (and nothing
else). A request with Upgrade: websocket becomes a session:

    client -> server   the first text frame is the player's name; after that a line,
                       or a JSON object {"verb": "go", "direction": "north"}
    server -> client   one JSON object per event (hedge/render.py json), plus
                       {"kind": "prompt", "mode": "command"|"spell"} after each line

RFC 6455, text frames only, no extensions. Enough for a page on the same machine.
"""

import asyncio
import base64
import hashlib
import json
import os
import struct

from .. import render
from .telnet import STEP_SECONDS

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "web")


def frame(text):
    data = text.encode("utf-8")
    n = len(data)
    if n < 126:
        head = bytes([0x81, n])
    elif n < 65536:
        head = bytes([0x81, 126]) + struct.pack(">H", n)
    else:
        head = bytes([0x81, 127]) + struct.pack(">Q", n)
    return head + data


async def read_frame(reader):
    """(opcode, payload) or None at close."""
    try:
        b1, b2 = await reader.readexactly(2)
    except asyncio.IncompleteReadError:
        return None
    opcode, masked, n = b1 & 0x0F, b2 & 0x80, b2 & 0x7F
    if n == 126:
        n = struct.unpack(">H", await reader.readexactly(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", await reader.readexactly(8))[0]
    mask = await reader.readexactly(4) if masked else None
    payload = await reader.readexactly(n)
    if mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return opcode, payload


class WebSocketTransport:
    def __init__(self, hub, web_dir=WEB_DIR):
        self.hub = hub
        self.web_dir = web_dir
        self.writers = {}
        self.tasks = {}

    def send(self, writer, obj):
        if not writer.is_closing():
            writer.write(frame(json.dumps(obj, separators=(",", ":"))))

    def sink(self, name):
        def deliver(events):
            w = self.writers.get(name)
            if w:
                for ev in events:
                    self.send(w, render.json(ev))
        return deliver

    async def run_spell(self, name):
        try:
            while True:
                await asyncio.sleep(STEP_SECONDS)
                if not self.hub.tick(name):
                    w = self.writers.get(name)
                    if w:
                        self.send(w, {"kind": "prompt", "mode": "command"})
                    return
        finally:
            self.tasks.pop(name, None)

    async def handle(self, reader, writer):
        try:
            request = await reader.readuntil(b"\r\n\r\n")
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            writer.close()
            return
        head = request.decode("latin-1")
        lines = head.split("\r\n")
        headers = {k.strip().lower(): v.strip() for k, _, v in (l.partition(":") for l in lines[1:]) if k}
        if headers.get("upgrade", "").lower() != "websocket":
            await self.serve_page(writer, lines[0])
            return
        key = headers.get("sec-websocket-key", "")
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
        await writer.drain()
        name = None
        try:
            while True:
                got = await read_frame(reader)
                if got is None:
                    break
                opcode, payload = got
                if opcode == 8:
                    break
                if opcode == 9:
                    writer.write(bytes([0x8A, len(payload)]) + payload)
                    continue
                if opcode != 1:
                    continue
                text = payload.decode("utf-8", "replace")
                if name is None:
                    candidate = text.strip()
                    if candidate.startswith("{"):
                        candidate = str(json.loads(candidate).get("name", "")).strip()
                    candidate = candidate[:20]
                    if not candidate or not candidate.replace("-", "").isalnum():
                        self.send(writer, {"kind": "error", "text": "A name is letters."})
                        continue
                    self.writers[candidate] = writer
                    if not self.hub.connect(candidate, self.sink(candidate)):
                        del self.writers[candidate]
                        self.send(writer, {"kind": "error", "text": "Someone of that name is already here."})
                        continue
                    name = candidate
                    self.send(writer, {"kind": "prompt", "mode": "command"})
                    await writer.drain()
                    continue
                if text.lstrip().startswith("{"):
                    msg = json.loads(text)
                    verb = msg.pop("verb", None)
                    if verb == "line":
                        mode = self.hub.line(name, msg.get("text", ""))
                    elif verb:
                        mode = self.hub.act(name, verb, **{k: str(v) for k, v in msg.items()})
                    else:
                        mode = "command"
                else:
                    mode = self.hub.line(name, text)
                if self.hub.running(name) and name not in self.tasks:
                    self.tasks[name] = asyncio.create_task(self.run_spell(name))
                elif name not in self.tasks:
                    self.send(writer, {"kind": "prompt", "mode": mode})
                await writer.drain()
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            if name in self.tasks:
                self.tasks[name].cancel()
            if name in self.writers:
                del self.writers[name]
                self.hub.disconnect(name)
            writer.close()

    async def serve_page(self, writer, request_line):
        path = request_line.split(" ")[1] if len(request_line.split(" ")) > 1 else "/"
        page = os.path.join(self.web_dir, "index.html")
        if path in ("/", "/index.html") and os.path.exists(page):
            with open(page, "rb") as f:
                body = f.read()
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n"
                         + f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body)
        elif path == "/favicon.ico":
            writer.write(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n")
        else:
            writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        await writer.drain()
        writer.close()


async def serve_ws(hub, host="0.0.0.0", port=4001, web_dir=WEB_DIR):
    transport = WebSocketTransport(hub, web_dir)
    return await asyncio.start_server(transport.handle, host, port)
