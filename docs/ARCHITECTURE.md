# How the Hedge is layered

The rule: a new way in (a MUD client, a browser, a test) is a new **transport**, and nothing below it changes. The layers, bottom up:

```
topology.py  the shape        Square, Polar or Graph: the way words, what a heading is, what a turn does, how a step moves.
cave.py      the first graph  the dodecahedron: twenty rooms, three tunnels each, left and right from the tunnel you came by.
world.py     the place        Hedge: cells, sight lines, descriptions, the plate, the map. Pure. Asks its topology.
spell.py     the language     reader, grammar check, and an evaluator that yields one action at a time.
game.py      the rules        Game.act(name, verb, **args) -> [Event]. Players, light, spells. No text parsing.
parser.py    the grammar      verb and noun, adventurelib style: "go DIRECTION" -> ("go", {"direction": ...}).
hub.py       the table        sessions, typed lines, spell typing, QUIET verbs, routing events to sinks.
render.py    the shapes       text(event), json(event), gmcp(event).
transports/  the ways in      telnet (+GMCP), stdin, ws (+ the web page), and api.Table for Python.
```

## Events

The game returns `Event(kind, to, text, **data)`. `text` is what a player reads; `data` is the same thing as numbers. A `room` event carries the description **and** `exits`, `sight` (per open way: how far it runs, where it opens, what ends it), `lit`, `light`, `torches`, `heading`, `pos` (floor, row, col), `floor`, `floors`, `others`, and the hedge's `shape` and `dirs` (its absolute ways, in right-turn order; none in a cave) and `facing` (the heading as words), so a client never assumes a compass. In a cave a `room` event also carries `tunnels` (pairs of relative word and room), `draft` (rooms the gate's draft comes from), `smell` and `wumpus`. A `map` event is one floor: `cells` and `stairs` keyed by cell (`row,col`, or a cave's number), with `floor`, `floors`, `shape` and `dirs`; on a polar hedge `rows` are rings and `cols` are spokes; in a cave it carries `layout` (where each known cave sits on the unfolded die) and `known`. A client can print the text, or draw from the data, or both. They cannot disagree, because both come from the same cells in `world.py`.

`to` is a name, `"all"`, or `("room", pos, except_name)`. The hub resolves it. A transport never sees another player's events.

Kinds: `info arrive depart room move bump light say face map mark plate who score help spells spell out error`. A `spell` event has `state`: `typing holds refused running ends breaks stopped none`.

## The topology

`topology.Square`, `topology.Polar` and `topology.Graph` own what a hedge's ways are called, what a heading is (a compass word on a grid; in a cave, the room you came from, or `None` for a stair), what `left` and `right` do, and how a step moves (a polar ring wraps; a cave's step follows a tunnel). A cell is a tuple of whatever arity the shape needs, `(row, col)` or `(room,)`, and a position is `(floor,) + cell`. The world asks its topology for `ways`, `step`, `relative`, `turn`, `distances` and `longest_path`; the game reads `hedge.dirs`, `topo.facing`, `topo.bump`, `topo.going` and `topo.came` for its words; the spell checker takes the topology as its `Language` (`dirs`, `rooms`, `turns`), so `(go north)` is refused on a polar hedge and `(turn left)` in a cave before either runs, by chibi (`check.scm polar`, `check.scm cave`) and by Python alike. The grammar knows every way word of every shape, and a bare number; the game answers "There is no north in this hedge" for another shape's word. Adding a shape is one class here, something to grow it on (a grid in MazeBuilder, or a room table), and its tells in `world.py`.

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

The WebSocket server also answers a plain `GET /` with `web/index.html`. The page prints the text and draws two pictures from the data. The **first-person view** is a wireframe built from `room.exits` and `room.sight[heading]`: how far the way ahead runs, which paces open left or right, and what ends it (a wall, the dark, a turn, a fork, the gate). The **overhead map** draws only the squares the player has seen, from the `map` event's `cells` (each seen cell's open ways); the page asks for `map` after every room, which is a quiet verb and so allowed while a spell runs. When the map's `shape` is `polar` it draws rings round a well, each seen cell a slice with arcs and spokes for walls. When it is `cave`, the view is three tunnel mouths (left, ahead, right) with the numbers over them and daylight in the one the draft comes through, and the map is the die unfolded from the event's `layout`, with L, R and B on the tunnels out of the cave you stand in. In a cave the arrow keys step, since there is no turning. Arrow keys walk and turn through the structured path. Neither picture needed a change below the transport.

## Tests

`api.Table` is how tests play. `tests/walks/*.in` run through the stdin transport and must reproduce `*.out` byte for byte (the backend tag `(chibi)`/`(python)` aside). The telnet and WebSocket transports have their own round-trip tests with scripted clients.
