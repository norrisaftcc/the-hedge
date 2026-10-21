---
name: stacked-prs
description: "The usual method" for this repo - one topic branch and one PR per layer, stacked, kept current with merge commits, PR bodies in three sections, merged in order by the owner. Use when a piece of work spans more than one PR, or when the user says "the usual method".
---

# Stacked PRs: the usual method

A large change goes in as a stack: one branch per layer, each PR based on the one below it. Reviewers read one layer at a time. The kaiju game went in this way: requirements → engine → art → world → page (#8 to #12).

## Branches

- One topic branch per layer, named for the layer: `kaiju-engine`, `kaiju-art`, `kaiju-page`.
- Each PR's base is the branch below it. The bottom PR's base is `main`.
- A fix to a lower layer goes on that layer's branch. Then merge it upward, one branch at a time:
  `git checkout kaiju-art && git merge kaiju-engine`, then `kaiju-world`, then `kaiju-page`.
- Use merge commits, never rebase or force-push. The owner may have the branches checked out, and teaching material may link to their commits.
- Do not delete a branch. The owner keeps the ones that teaching examples reference, and deletes the rest.

## Commits

- Subject: `<Area> <layer>: <what changed>`, as a plain statement. Examples: `Kaiju engine: dice, hexes, rules, AI and the voice`; `Kaiju page: a test for NFR-1, the page weight gzipped`.
- The body says why. Give a number only with the command that produces it.

## The PR body

Three sections, in this order:

```
## What
What the layer adds, for a reader who has not seen the design. Lists, short.

## Details worth knowing
Decisions a reviewer would question, bugs found on the way, what was left alone and why.

## Checks
Each check with its command and its result: tests (pass/fail counts), page weight,
balance (the sim command), browser (sizes, themes, what was looked at).
```

Close the issue it implements with `Closes #N` on the first line. Open the PR as a draft. Mark it ready when its checks pass and its review threads are answered.

## Merging

The owner merges unless they ask you to. When asked to merge a stack:

1. Merge from the bottom up, with method `merge`. Pass the full 40-character head SHA.
2. After each merge, retarget the next PR's base to `main` if GitHub did not.
3. Keep notes as you go: the time, the PR, the merge commit, and anything that went wrong. The notes feed a retrospective.

## Before you open a layer

Write down what the layer must do before you build it: the requirements, then the design section it implements. The PR then answers to that text, and a reviewer can check it against the text.
