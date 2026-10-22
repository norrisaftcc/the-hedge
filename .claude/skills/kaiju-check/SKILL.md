---
name: kaiju-check
description: The checks to run on the kaiju game before a push or a PR - unit tests, page weight, replays, the balance bot and a browser run at phone and desktop sizes. Use after any change under kaiju/, and before saying a kaiju change works.
---

# Kaiju check

Run these from the repository root. Each one names what it proves. Report the numbers it prints, not a summary of them.

## 1. Tests (every change)

```
node --test kaiju/tests/
```

Node 22, nothing installed. The suite includes:

- `replay.test.mjs`: recorded games with pinned scores, grades and deaths. If a pinned number moves, the rules changed. Say why in the commit, or find the bug.
- `weight.test.mjs`: NFR-1, the first load under 300 KB gzipped. It walks the imports from the page's script tag, so a new module is counted with no edit.
- two timing tests: a defense phase with 20 units (`rules.test.mjs`) and with the rampage cap of 24 (`rampage.test.mjs`) stays under 50 ms in Node.

A new test for a bug must fail on the old code first. Check it: `git stash -- <the fixed file>`, run the one test file, see it fail, then `git stash pop`.

## 2. Balance (a change to rules, ai, data or the bot)

```
node kaiju/tools/sim.mjs 1-20                      # every kaiju, every classic mission
node kaiju/tools/sim.mjs 1-20 all rampage          # every objective; about 45 s
node kaiju/tools/sim.mjs 21-60 squamous coast      # a held-out seed range
```

Compare with the same command on `origin/main`. The bot plays greedy. Its numbers are a floor for a careless player, not a forecast for a good one. Say so when you quote them.

## 3. The page in a browser (a change to ui, art, style.css or index.html)

Serve the page, then run the smoke script in this folder:

```
cd kaiju && python3 -m http.server 8000 &
node .claude/skills/kaiju-check/smoke.cjs --out <scratch dir>
node .claude/skills/kaiju-check/smoke.cjs --mission coast --kaiju thalassor --seed 7 --out <scratch dir>
node .claude/skills/kaiju-check/smoke.cjs --mission coast --kaiju thalassor --seed 7 --cutaway on --out <scratch dir>   # the cutaway, as a player sees it
```

It plays one game at 375×812 (touch) and 1280×800, in light and dark. It prints one JSON line per run and exits 1 on a console error, sideways scroll, or an end screen with no review. It leaves an end-screen screenshot per run. Look at the screenshots: the script cannot see text that overlaps or a button that is too small.

Playwright is not a dependency of the repo. The script finds it through `PLAYWRIGHT_PATH`, then `require("playwright")`, then the cloud container's global install. Set `CHROMIUM_PATH` to use a browser that Playwright did not download.

Stop the server when done.

## What not to do

- Do not add a package.json dependency or a build step to make a check easier. The game has no dependencies (NFR-1, NFR-4).
- Do not change a pinned replay number to make a test pass, unless the commit says what rule changed it.
