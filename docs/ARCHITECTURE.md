# How the Hedge is layered

The rule: a new way in (a MUD client, a browser, a test) is a new **transport**, and nothing below it changes. The layers, bottom up:

```
world.py     the place        Hedge: cells, sight lines, descriptions, the plate, the map. Pure.
spell.py     the language     reader, grammar check, and an evaluator that yields one action at a time.
game.py      the rules        Game.act(name, verb, **args) -> [Event]. Players, light, spells. No text parsing.
parser.py    the grammar      verb and noun, adventurelib style: "go DIRECTION" -> ("go", {"direction": ...}).
hub.py       the table        sessions, typed lines, spell typing, QUIET verbs, routing events to sinks.
render.py    the shapes       text(event), json(event), gmcp(event).
transports/  the ways in      telnet (+GMCP), stdin, ws (+ the web page), and api.Table for Python.
```

## Events

The game returns `Event(kind, to, text, **data)`. `text` is what a player reads; `data` is the same thing as numbers. A `room` event carries the description **and** `exits`, `sight` (per open way: how far it runs, where it opens, what ends it), `lit`, `light`, `torches`, `heading`, `pos` (floor, row, col), `floor`, `floors`, `others`. A `map` event is one floor: `cells` and `stairs` keyed `row,col`, with `floor` and `floors`. A client can print the text, or draw from the data, or both. They cannot disagree, because both come from the same cells in `world.py`.

`to` is a name, `"all"`, or `("room", pos, except_name)`. The hub resolves it. A transport never sees another player's events.

Kinds: `info arrive depart room move bump light say face map mark plate who score help spells spell out error`. A `spell` event has `state`: `typing holds refused running ends breaks stopped none`.

## Verbs

The grammar (`parser.GRAMMAR`) turns a line into a verb and arguments. A pattern is words; a CAPITAL word is a placeholder; the last placeholder takes the rest of the line. `n` is `("go", {"direction": "north"})`. The game has one method per verb, `do_<verb>(player, **args)`, and never sees a line. A browser can skip the grammar and send `{"verb": "go", "direction": "north"}`; the hub's `act` takes it the same way.

Adding a verb: one `when` line in the grammar, one `do_` method in the game. No transport changes.

## The hub

`Hub.connect(name, sink)` joins a player; `sink` is a callable that takes the player's events. `Hub.line(name, text)` parses and acts, and returns the session's mode: `"spell"` while a multi-line spell is being typed (a `cast` with no text, or with parentheses still open, until a blank line), else `"command"`. `Hub.tick(name)` runs one spell step and returns whether the spell is still running. The **pace is a hub setting**: `Hub(pace=0.6)` is what telnet and the browser wait between steps, so the room can watch. The stdin transport and `api.Table` have their own default of 0.3 s; transcripts and tests pass `pace=0`. `--pace` on the command line overrides all of it.

While a spell runs, only `QUIET` verbs are allowed (`stop look map who say score help spells read study`). A spell wears thin after `SPELL_REACH` actions (a thousand), so a circling spell in a braided hedge ends on every transport.

## Transports

| Transport | In | Out | Pace |
|-----------|----|-----|------|
| `transports/telnet.py` | lines | text lines; GMCP packets (`Hedge.Room {json}` …) when the client answers IAC DO 201 | `hub.pace`, 0.6 s |
| `transports/stdin.py` | lines from a file or the terminal | text lines | 0.3 s; 0 for a transcript |
| `transports/ws.py` | the name, then lines or `{"verb": …}` JSON | one JSON object per event, plus `{"kind":"prompt"}` | `hub.pace`, 0.6 s |
| `api.Table` | Python calls: `line`, `act`, `tick`, `run_spell` | lists of `Event` | 0.3 s in `run_spell`; `pace=0` for tests |

The WebSocket server also answers a plain `GET /` with `web/index.html`. The page prints the text and draws two pictures from the data. The **first-person view** is a wireframe built from `room.exits` and `room.sight[heading]`: how far the way ahead runs, which paces open left or right, and what ends it (a wall, the dark, a turn, a fork, the gate). The **overhead map** draws only the squares the player has seen, from the `map` event's `cells` (each seen cell's open ways); the page asks for `map` after every room, which is a quiet verb and so allowed while a spell runs. Arrow keys walk and turn through the structured path. Neither picture needed a change below the transport.

## Tests

`api.Table` is how tests play. `tests/walks/*.in` run through the stdin transport and must reproduce `*.out` byte for byte (the backend tag `(chibi)`/`(python)` aside). The telnet and WebSocket transports have their own round-trip tests with scripted clients.
