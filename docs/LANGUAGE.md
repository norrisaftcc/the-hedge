# The spell language

A spell is a small program in a Scheme subset. It walks the hedge one step a turn, so the room can watch it go. The hedge checks a spell before it runs: with chibi-scheme when it is installed (`hedge/check.scm`), and always with the Python reader (`hedge/spell.py`). Both say the same things.

## Words

| Form | Does | Value |
|------|------|-------|
| `(go D)` | One step. `D` is one of the hedge's ways (`north`, `south`, `east`, `west`; on a polar hedge `in`, `out`, `sunwise`, `widdershins`; in a cave a tunnel's number, `(go 8)`), or `ahead`, `back`, `left`, `right` from where you face, or `up`, `down` where there is a stair. A step costs a turn of light. A step into the hedge **breaks the spell**. | `#t` |
| `(face D)` | Face one of the hedge's four ways. Free. Not in a cave. | `#t` |
| `(turn T)` | `left`, `right` or `around`. Free. Not in a cave: there, left and right are from the tunnel you came by, and the only way to turn is to step. | `#t` |
| `(wall? D)` | Is the hedge there? `(wall? up)` is true where there is no stair. | `#t` or `#f` |
| `(open? D)` | Is there a way? | `#t` or `#f` |
| `(gate?)` | Am I at the far gate? | `#t` or `#f` |
| `(dead-end?)` | Is there only one way out of here? | `#t` or `#f` |
| `(mark)` | Chalk a mark on this cell. Free. The map shows it. | `#t` |
| `(marked?)` `(marked? D)` | Is this cell marked? Is the open cell one step that way marked? A wall is never marked. | `#t` or `#f` |
| `(until TEST BODY...)` | Run `BODY` until `TEST` is true. The test runs first. | `#t` |
| `(while TEST BODY...)` | Run `BODY` while `TEST` is true. | `#t` |
| `(repeat N BODY...)` | `BODY`, `N` times. `N` is a whole number. | `#t` |
| `(if TEST THEN ELSE)` | `ELSE` may be left out. | the branch's value |
| `(when TEST BODY...)` `(unless TEST BODY...)` | A body with a guard. | `#t` |
| `(and ...)` `(or ...)` `(not X)` | As in Scheme. | |
| `(begin BODY...)` | Several forms where one is wanted. | `#t` |
| `(define (NAME) BODY...)` | Name a procedure. Only at the top of a spell. Call it with `(NAME)`. No arguments. | |
| `(say "words")` | Speak to the room. | `#t` |
| `(stop)` | End the spell here. | |
| `#t` `#f` | True and false. | |
| `; words` | A comment, to the end of the line. | |

Nothing else is in the language. No numbers except in `repeat`, no variables, no arguments. That is on purpose: a spell is a repeated process, and these are the parts of one. Chalk is the only memory, and it is on the hedge, not in the spell.

## Rules

- A spell runs one action a turn: `go`, `face`, `turn`, `say`. Tests are free.
- A loop that goes round ten thousand times without a step **spins**, and the hedge refuses it.
- A spell that walks into the hedge breaks, and tells you which way it walked.
- A spell wears thin after a thousand actions. In a braided hedge that is how a circling spell ends when nobody types `stop`.
- `stop` at the prompt ends a running spell. While a spell runs you may `look`, `map`, `who`, `say`, `score`.
- The hedge is case-sensitive, like Scheme. `(GO north)` is not a word.
- The way words are the hedge's own. A polar hedge has no north: `(go north)` does not hold there, and `(go in)` does not hold in a square one. A cave has no compass and no turning: `(go 8)` holds, `(turn left)` does not. Read the plate.

## Three spells

The hedges have tells. Read the plate at the mouth (`read`, then `study`).

**Binary Tree.** Every square opens north or east. This reaches the north-east corner from anywhere, then stops; from the corner, the one way down to the gate is yours to find.

```scheme
(until (gate?)
  (if (open? north) (go north)
      (if (open? east) (go east)
          (stop))))
```

**Sidewinder.** Every run of squares has one gate north, and the north row is one long walk. `seek` finds this run's gate; `climb` goes up it. Eight times, for eight rows; it ends at the north-west corner.

```scheme
(define (climb) (until (wall? north) (go north)))
(define (seek)
  (until (or (open? north) (wall? east)) (go east))
  (until (or (open? north) (wall? west)) (go west)))
(repeat 8 (seek) (climb))
```

**Any perfect maze.** The left-hand rule: keep one hand on the hedge. Slow, and sure. It is the general process for a hedge without loops.

```scheme
(define (step)
  (if (open? left)
      (begin (turn left) (go ahead))
      (if (open? ahead)
          (go ahead)
          (turn right))))
(until (gate?) (step))
```

**A braided hedge** (`--braid 0.5` or `1.0`) has loops, and there the left hand goes round for ever. Chalk helps: mark where you stand, prefer a way whose far cell is unmarked, fall back to the left hand. It is not a proof. With marks on cells and no memory of the way back, it can still circle. The sure process is a search outward from the mouth with a map, which no spell this small can say; that is the classroom's stage 7.

```scheme
(define (fresh-left) (and (open? left) (not (marked? left))))
(define (fresh-ahead) (and (open? ahead) (not (marked? ahead))))
(define (fresh-right) (and (open? right) (not (marked? right))))
(define (step)
  (mark)
  (if (fresh-left) (begin (turn left) (go ahead))
      (if (fresh-ahead) (go ahead)
          (if (fresh-right) (begin (turn right) (go ahead))
              (if (open? left) (begin (turn left) (go ahead))
                  (if (open? ahead) (go ahead) (turn right)))))))
(until (gate?) (step))
```

**A hedge of floors** (`--floors 3`) is a stack of hedges joined by stairs, one stair up per floor, far from where you arrive, with the gate on the top floor. A hand on the hedge never climbs a stair, so the left-hand rule stays on the ground floor for ever. Ask for `up` first. A third dimension is a third pair of words; the algorithm does not care.

```scheme
(define (step)
  (if (open? up) (go up)
      (if (open? left) (begin (turn left) (go ahead))
          (if (open? ahead) (go ahead) (turn right)))))
(until (gate?) (step))
```

**A polar hedge** (`--shape polar`) is rings round a well. Its ways are `in`, `out`, `sunwise` (clockwise) and `widdershins`; facing the well, sunwise is on your left. A ring comes back to where it began, but one wall, the seam, runs from the well to the rim. The same algorithms leave the same tells in new words. Binary Tree: every square opens in or sunwise, so this reaches the well at the seam from anywhere.

```scheme
(until (gate?)
  (if (open? in) (go in)
      (if (open? sunwise) (go sunwise)
          (stop))))
```

Sidewinder: the long walk circles the well, and every run has one gate in. `seek` and `climb` are `long-walk.scm` with the words changed (`spells/round-the-well.scm`). The left-hand rule needs no change at all: `left` is still left.

**A cave** (`--shape cave`) is twenty rooms with three tunnels each, laid out as the twelve-sided die: Hunt the Wumpus's map, and before that Hamilton's Icosian game of 1857, whose puzzle was to visit every room once. There is no compass. A tunnel is named by the room it leads to, and `left` and `right` are from the tunnel you came by: with the tunnels round a room in counterclockwise order, right is the next after yours, left the one before. From the stair at the mouth, the three tunnels are `left`, `ahead` and `right`. A hand on the wall walks one face of the die: five caves, and home. Hamilton's word, said twice, visits all twenty from any tunnel, because every tunnel of the die is like every other. `spells/icosian.scm`:

```scheme
(go ahead)
(until (gate?)
  (go left) (go left) (go left)
  (go right) (go right) (go right)
  (go left) (go right) (go left) (go right))
```

That is the whole lesson of the graph: when the picture goes, the words carry everything, and a process is still a process.

## Checking a spell by hand

```
chibi-scheme hedge/check.scm < spells/left-hand.scm      # ok
echo '(go sideways)' | chibi-scheme hedge/check.scm       # error: (go sideways): go needs one direction ...
echo '(go north)' | chibi-scheme hedge/check.scm polar     # error: a polar hedge has in, out, sunwise, widdershins
echo '(turn left)' | chibi-scheme hedge/check.scm cave      # error: in a cave you do not face or turn
```
