// Midnight Breach: whole games, pinned. Run with: node --test breach/tests/
// The rules live in the page, between two markers. This file runs that half alone, with no DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const rules = page.split('/* ==RULES==')[1].split('/* ==VIEW== */')[0];
const Breach = new Function(`/* ${rules}\nreturn Breach;`)();

// Play a list of commands. Returns the last state, the last status and every line of text.
function play(lines) {
  let { state, events } = Breach.newGame();
  const text = events.map((e) => e.text).filter(Boolean);
  for (const line of lines) {
    ({ state, events } = Breach.step(state, line));
    text.push(...events.map((e) => e.text).filter(Boolean));
  }
  return { state, status: events.at(-1), events, text: text.join('\n') };
}

const WIN = [
  'take laptop', 'w', 'take flashlight', 'n', 'take badge', 's', 's', 'take key',
  'e', 'take skateboard', 'e', 'e', 'take disk', 'n', 'take token', 'w', 'use laptop',
];

test('the short way wins: nine steps, two of them free on the skateboard', () => {
  const { state, status, text } = play(WIN);
  assert.equal(state.over, 'won');
  assert.equal(state.steps, 9);
  assert.equal(state.moves, 33);
  assert.equal(state.score, 7 * 5 + 50 + 33 * 2);
  assert.equal(status.over, 'won');
  assert.match(text, /Rank: Elite Analyst\./);
  assert.equal((text.match(/That move was free/g) || []).length, 2);
});

test('the same commands give the same game', () => {
  assert.deepEqual(play(WIN).events, play(WIN).events);
  assert.equal(play(WIN).text, play(WIN).text);
});

test('step does not change the state it was given', () => {
  const { state } = Breach.newGame();
  const before = structuredClone(state);
  Breach.step(state, 'take laptop');
  Breach.step(state, 'w');
  assert.deepEqual(state, before);
});

test('a locked door costs nothing and says what it needs', () => {
  const { state, status, text } = play(['e', 'e']);
  assert.equal(state.at, 'server');
  assert.equal(state.moves, 39);
  assert.equal(status.exits.east.locked, true);
  assert.match(text, /needs an access badge/);
});

test('the garage hides its items until you carry a light', () => {
  const dark = play(['w', 's', 'take key', 'examine key']);
  assert.equal(dark.status.dark, true);
  assert.deepEqual(dark.status.items, []);
  assert.equal(dark.state.where.key, 'garage');
  const lit = play(['w', 'take flashlight', 's', 'take key']);
  assert.equal(lit.status.dark, false);
  assert.equal(lit.state.where.key, 'carried');
});

test('the moves run out and the breach completes', () => {
  const { state, status, text } = play(Array.from({ length: 60 }, (_, i) => (i % 2 ? 'e' : 'w')));
  assert.equal(state.over, 'lost');
  assert.equal(state.moves, 0);
  assert.equal(state.steps, 40);
  assert.equal(status.stolen.percent, 100);
  assert.match(text, /The breach is complete/);
});

test('coffee and the energy drink buy moves, once each', () => {
  const { state } = play(['s', 'e', 'take coffee', 'drink coffee', 'drink coffee']);
  assert.equal(state.moves, 40 - 2 + 3);
  assert.equal(state.where.coffee, 'gone');
});

test('the usb drive saves the logs once, in the server room', () => {
  const { state } = play(['n', 'take usb', 'use usb', 's', 'e', 'use usb', 'use usb']);
  assert.equal(state.logs, true);
  assert.equal(state.score, 5 + 20);
});

test('the map reports which rooms are locked', () => {
  const { events } = play(['map']);
  const map = events.find((e) => e.type === 'map');
  assert.equal(map.at, 'security');
  assert.equal(map.cells.closet.locked, true);
  assert.equal(map.cells.vault.locked, true);
  assert.equal(map.cells.lobby.locked, false);
});

test('the hint follows what you carry', () => {
  assert.match(play(['hint']).text, /laptop from the Security Office/);
  assert.match(play(WIN.slice(0, -1).concat('hint')).text, /Use the laptop in the Server Room/);
});

test('the parser takes the words people type', () => {
  assert.deepEqual(Breach.parse('N'), { verb: 'go', dir: 'north' });
  assert.equal(Breach.parse('go to the west').dir, 'west');
  assert.equal(Breach.parse('pick up the laptop').item, 'laptop');
  assert.equal(Breach.parse('look at sticky note').verb, 'examine');
  assert.equal(Breach.parse('drink energy drink').item, 'energy');
  assert.equal(Breach.parse('take all').all, true);
});

test('a word from the player never reaches a built-in name', () => {
  for (const word of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(Breach.parse(word).verb, 'unknown');
    assert.equal(Breach.parse(`take ${word}`).item, null);
    assert.equal(Breach.parse(`go ${word}`).dir, null);
    const { state } = play([word, `take ${word}`, `use ${word}`, `examine ${word}`]);
    assert.equal(state.score, 0);
  }
});
