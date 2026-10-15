"""Renderers: one event, three shapes.

text(event)  the line a telnet client or a terminal prints
json(event)  a dict for a browser over WebSocket
gmcp(event)  (package, dict) for a MUD client that speaks GMCP, or None

The text is written by the game and is the same in every shape. The data is
the same room as numbers. A client may draw from either, or both.
"""

import json as _json


def text(event):
    return event.text


def json(event):
    return event.as_dict()


def json_line(event):
    return _json.dumps(event.as_dict(), separators=(",", ":"))


GMCP_PACKAGES = {
    "room": "Hedge.Room",
    "light": "Hedge.Light",
    "spell": "Hedge.Spell",
    "say": "Hedge.Say",
    "move": "Hedge.Move",
    "out": "Hedge.Out",
    "score": "Hedge.Score",
    "who": "Hedge.Who",
    "map": "Hedge.Map",
    "plate": "Hedge.Plate",
    "face": "Hedge.Face",
    "info": "Hedge.Info",
}


def gmcp(event):
    package = GMCP_PACKAGES.get(event.kind)
    if not package:
        return None
    data = dict(event.data)
    data["text"] = event.text
    return package, data
