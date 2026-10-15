"""Events: what the game says, to whom, with the numbers behind the words.

The game never writes to a socket or a screen. It returns events. A renderer
turns an event into a line of text (telnet, the terminal), a JSON object (a
browser), or a GMCP packet (a modern MUD client). The text in an event is the
room as the player reads it; the data is the same room as numbers, so a
window drawn from the data cannot disagree with the text.

to is a player's name, "all", or ("room", pos, except_name).
"""


class Event:
    __slots__ = ("kind", "to", "text", "data")

    def __init__(self, kind, to, text="", **data):
        self.kind, self.to, self.text, self.data = kind, to, text, data

    def as_dict(self):
        d = {"kind": self.kind, "text": self.text}
        d.update(self.data)
        return d

    def __repr__(self):
        return f"Event({self.kind!r}, {self.to!r}, {self.text!r})"


def recipients(event, players):
    """Who gets this event. players maps name -> object with .pos and .out."""
    to = event.to
    if to == "all":
        return list(players)
    if isinstance(to, tuple):
        _, pos, exclude = to
        return [n for n, p in players.items() if p.pos == pos and n != exclude and not p.out]
    return [to] if to in players else []
