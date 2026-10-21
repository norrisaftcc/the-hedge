---
name: numbers-with-commands
description: Every number written in a doc, PR, commit, slide or speaker note names the command that reproduces it, or it is cut. Simulated numbers say they are simulated. Use when writing any claim with a figure in it - win rates, timings, byte counts, test counts, "N games", "usually X turns".
---

# Numbers with commands

A reader must be able to check any number you write. This repo is a teaching example, so students will check them.

## The rule

Each number has one of these, next to it:

- **A command** that prints it, run from the repository root: `node kaiju/tools/sim.mjs 21-60 squamous coast`.
- **A test** that asserts it: "a defense phase with 20 units stays under 50 ms (`node --test kaiju/tests/rules.test.mjs`)".
- **A commit** for a number about the history: "the engine as reviewed, at ef371d4".

If the script that made a number was not kept, the number goes. You can still say what was done, without the figure: "an earlier comparison was run, and its script was not kept."

## Say what kind of number it is

- **Measured** in a real game, by a person: say who and when.
- **Simulated** by the bot: say "the bot" and give the seeds. The bot is greedy and plays badly, so its numbers are a floor, not a forecast.
- **Measured in Node**, not on a phone: say so. Do not claim phone performance from a Node timing.
- **Illustrative**, made up to show a shape: label it as such on the slide or page, every time.

## Before you write "always", "never" or a range

Look for the counterexample in the recorded games (`kaiju/tests/replay.test.mjs`). "The bot ends a game in 3 to 8 turns" was false: the recorded Coast game at seed 7 goes to the turn limit. Write what the data shows: "usually in a few turns, but not always", and cite the case.

## Checking a draft

1. Search the draft for digits and for the words "always", "never", "every", "usually", "most".
2. For each one, run the command. Check that the output matches the text.
3. Each number that has no command gets a command, or is cut.
