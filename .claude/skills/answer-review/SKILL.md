---
name: answer-review
description: How to answer a round of review comments on a PR (Copilot, a review bot, or a person) - verify each finding, fix with a failing test first, one commit for the round, reply on each thread naming the commit, resolve. Use when review comments arrive on a PR you opened or drive.
---

# Answer a review

A finding is a claim. Check it before you act on it, and answer every thread.

## For each finding

1. **Read the code it names.** Find a real path from a real caller or input to the failure. Read the line, and also the callers and the data that reach it.
2. **Decide.**
   - *Real and worth its fix:* fix it.
   - *Real but costs more than it prevents:* do not build for it. Say what path you traced and why the fix does not pay. Leave the decision to the owner.
   - *Not real:* say what you checked and what you found.
3. **Fix with a test that fails first.** Write the test. Stash the fix and run the test: it must fail. Pop the stash: it must pass. A test that never failed proves nothing.
4. **Look for the same fault nearby.** One `[name]` lookup with no `Object.hasOwn` usually has siblings. Fix them in the same round, or say in the reply why you stopped.

## One commit for the round

- Subject: `<Area>: answers to the review of #<PR>`. For one finding, name the fix instead: `Review: count Wrong angle as an attack use`.
- Body: one line per finding, saying what changed.
- Run the full checks before you push (for kaiju, the `kaiju-check` skill). One sound push is better than three guesses.

## Reply on each thread, then resolve it

Reply after the push, so the commit exists. Each reply:

- says whether the finding was right, in a word ("Confirmed", "Right", "Not reproduced");
- names the short commit hash;
- says what changed, and the test that now covers it.

Keep it to three sentences or fewer. End each reply with the attribution footer if the session requires one. Then resolve the thread.

Your own replies come back as notifications. They are not new work.

## Numbers in a review reply

When the finding is about a number, the answer is the command that makes the number, or the number goes. See the `numbers-with-commands` skill.

## Do not

- Do not mark a finding as optional because of its tone. A bot's "nit" that turns out to be a bug you introduced is a bug: fix it.
- Do not skip, disable or loosen a test to make a finding go away.
- Do not resolve a thread you did not answer.
