# Midnight Breach

A prototype. A line-drawing adventure in one HTML file.

You are a security analyst. An intruder is copying company data. Carry the laptop, the admin token and the firewall disk to the Server Room, and use the laptop there before the moves run out.

It is a port of the CSC 134 C++ game of the same name. That one had numbered menus and ASCII pictures. This one has what a 1980 home-computer adventure had: a picture drawn in lines, a few lines of text under it, and a prompt that takes one or two words.

## Play it

Open `breach/index.html` in a browser. There is no build step and nothing to install.

Type `help` for the words. `n`, `take laptop`, `use laptop`, `examine badge`, `map` and `hint` cover most of a game.

## Check it

```
node --test breach/tests/
```

The tests play whole games through the rules and pin the result. If one moves, a rule changed.

## How it is built

`index.html` holds two halves, marked `==RULES==` and `==VIEW==`.

- **Rules.** No DOM. `Breach.step(state, line)` returns a new state and a list of events. Each event carries its text and the data behind it. Rooms, items, scores and thresholds are one `DATA` object at the top.
- **View.** Prints the events' text. Draws the picture from the events' data: the doors come from the exits the rules report, a locked door is orange because the rules said it is locked. The view decides nothing.

The picture is 280 by 160 dots. Every drawing is a list of line segments, plotted one dot at a time, so a room can be drawn slowly, a small item can be scaled up for a close view, and the map is drawn from the same grid the rules walk. The letters in the pictures are strokes too.

The game has no dice. The same commands give the same game.

## What changed from the C++ game

- A two-word parser replaces the numbered menus.
- Items lie in the room's picture and leave it when you take them.
- `examine` needs the item in sight. In the C++ game you could examine the vault key in the dark.
- The hints were reordered. The old order told a player who held the vault key where to find the vault key.
- `take all`, `score` and `restart` are new. Everything else, including every number, is the C++ game's.

## Not done

This is a prototype. It has no save, no sound, and no requirements or design document. The repository's version and changelog rules cover kaiju and have not been extended to it.
