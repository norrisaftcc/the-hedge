# The spell language

A spell is a small program in a Scheme subset. It walks the hedge one step a turn, so the room can watch it go. The hedge checks a spell before it runs: with chibi-scheme when it is installed (`hedge/check.scm`), and always with the Python reader (`hedge/spell.py`). Both say the same things.

## Words

| Form | Does | Value |
|------|------|-------|
| `(go D)` | One step. `D` is `north`, `south`, `east`, `west`, or `ahead`, `back`, `left`, `right` from where you face. A step costs a turn of light. A step into the hedge **breaks the spell**. | `#t` |
| `(face D)` | Face a compass direction. Free. | `#t` |
| `(turn T)` | `left`, `right` or `around`. Free. | `#t` |
| `(wall? D)` | Is the hedge there? | `#t` or `#f` |
| `(open? D)` | Is there a way? | `#t` or `#f` |
| `(gate?)` | Am I at the far gate? | `#t` or `#f` |
| `(dead-end?)` | Is there only one way out of here? | `#t` or `#f` |
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

Nothing else is in the language. No numbers except in `repeat`, no variables, no arguments. That is on purpose: a spell is a repeated process, and these are the parts of one.

## Rules

- A spell runs one action a turn: `go`, `face`, `turn`, `say`. Tests are free.
- A loop that goes round ten thousand times without a step **spins**, and the hedge refuses it.
- A spell that walks into the hedge breaks, and tells you which way it walked.
- `stop` at the prompt ends a running spell. While a spell runs you may `look`, `map`, `who`, `say`, `score`.
- The hedge is case-sensitive, like Scheme. `(GO north)` is not a word.

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

**Any perfect maze.** The left-hand rule: keep one hand on the hedge. Slow, and sure. It is the general process, and it fails only in a hedge with loops, which is where breadth-first search comes in.

```scheme
(define (step)
  (if (open? left)
      (begin (turn left) (go ahead))
      (if (open? ahead)
          (go ahead)
          (turn right))))
(until (gate?) (step))
```

## Checking a spell by hand

```
chibi-scheme hedge/check.scm < spells/left-hand.scm      # ok
echo '(go up)' | chibi-scheme hedge/check.scm             # error: (go up): go needs one direction ...
```
