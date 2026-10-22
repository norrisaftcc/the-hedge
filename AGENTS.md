# AGENTS.md

For coding agents working in this repository. People should start with `README.md`.

## What is here

Two games, one repository, and a teaching example of how they were built.

- **The Hedge** (`hedge/`, `web/`, `spells/`, `tests/`): a telnet maze game in Python. Players walk the maze or write spells in a small Scheme to walk it for them. Architecture: `docs/ARCHITECTURE.md`. Spell language: `docs/LANGUAGE.md`.
- **Kaiju** (`kaiju/`): a turn-based tactical game for one giant monster. It is static web files with no build step. Read `kaiju/docs/REQUIREMENTS.md` first (§0 is the thesis), then `kaiju/docs/DESIGN.md` (the contract), then `kaiju/README.md`.
- **MazeBuilder** (`vendor/MazeBuilder`): a git submodule. Both games grow their mazes and cities with its algorithms.

## Setup and checks

```
git submodule update --init          # the hedge's tests need MazeBuilder
python3 -m pytest -q                 # the hedge: Python 3.8+, standard library only
node --test kaiju/tests/             # kaiju: Node 22, nothing installed
```

For any change under `kaiju/`, run the full kaiju checks: the `kaiju-check` skill, at `.claude/skills/kaiju-check/SKILL.md`.

## Rules that hold everywhere

- **No dependencies.** The hedge uses the Python standard library only. Kaiju has no package.json dependencies and no build step. Do not add either to make a task easier.
- **The dice are our own.** Use mulberry32 (`hedge/rng.py`, `kaiju/src/rng.js`), seeded. `random` or `Math.random` may pick a new seed (the page's "New seed" button does), and nothing after the seed. The same seed gives the same game, in every language.
- **Events are the source of truth.** The rules return events that carry text and the data behind it. Clients draw from the data. A view that recomputes what the rules already decided is a bug.
- **The voice never rolls dice.** `kaiju/src/voice.js` and the hedge's descriptions choose their words from the state or a hash of the events. A replay must give the same text.
- **Numbers are data.** Unit stats, attacks, missions, objectives and waves live in `kaiju/src/data/`. A balance change is a data change. Keep rules code free of magic numbers.
- **Replays are pinned.** `kaiju/tests/replay.test.mjs` and `tests/walks/` record whole games. If one moves, the rules changed: say which rule and why in the commit, or treat it as a bug.
- **Look names up with `Object.hasOwn`.** A key from a player, a URL or a save must not reach `constructor` or `__proto__`.
- **Versions.** A PR that changes what a player sees or how the game plays bumps `kaiju/src/version.js` and adds a line to `kaiju/CHANGELOG.md`. A test checks they agree. Playtests name the version they were played on.
- **Page weight.** Kaiju's first load stays under 300 KB gzipped (NFR-1). `kaiju/tests/weight.test.mjs` measures it.

## How work is done here

- **Requirements, then design, then code.** A new feature gets its requirement (in `kaiju/docs/REQUIREMENTS.md`) and its design section (in `kaiju/docs/DESIGN.md`) before it gets code. The first commit of a feature PR is often the design alone.
- **Topic branches and stacked PRs.** See the `stacked-prs` skill. Use merge commits. Do not rebase, force-push or delete a shared branch: teaching material links to these commits.
- **Commit subjects** name the area, then what changed, in plain words: `Kaiju page: a test for NFR-1, the page weight gzipped`.
- **PR bodies** have three sections: What / Details worth knowing / Checks.
- **The owner merges** unless they ask you to.
- **Review rounds.** See the `answer-review` skill. Verify each finding before acting. Make a bug's test fail on the old code before you keep it. Reply on every thread with the commit, then resolve it.
- **Every number has a command.** See the `numbers-with-commands` skill. This applies to commits, PR bodies, docs, slides and speaker notes.

## Writing

- Plain words, short sentences, one idea to a sentence. Prefer the active voice. Cut what does not carry weight.
- Game text has a dry voice: a newsreel for kaiju, a field guide for the hedge. No exclamation marks, except in the names of real 1980s products.
- The kaiju game is *Crush, Crumble and Chomp!* (Epyx, 1981) as imagined from a review with no screenshots. Invented things stay invented: *Cassette & Disk Monthly* is not a real magazine, and nothing on the page imitates a real one.

## Skills

Reusable procedures live in `.claude/skills/<name>/SKILL.md`. Each one is plain Markdown, so any agent can follow it.

| Skill | Use it when |
|---|---|
| `kaiju-check` | before you push a kaiju change: tests, weight, balance bot, browser smoke run |
| `answer-review` | review comments arrive on a PR you opened or drive |
| `stacked-prs` | a change spans more than one PR, or the owner says "the usual method" |
| `numbers-with-commands` | you write any figure in a doc, PR, commit or slide |

Games played by people are logged in `kaiju/playtests/`, one file per game. Treat them as data, as the bot's numbers are: cite them by number.
