// Small hand-made missions and helpers for the engine tests. Missions are in the resolved shape
// rules.create expects: 14 rows of 12 glyphs, positions as [col, row].

import { Mulberry32 } from "../src/rng.js";
import { offsetToKey } from "../src/hex.js";
import { UNITS } from "../src/data/units.js";

const bottomRow = Array.from({ length: 12 }, (_, c) => [c, 13]);
const topRow = Array.from({ length: 12 }, (_, c) => [c, 0]);

export const FORTRESS_LITE = {
  id: "fortress-lite",
  name: "The Small Fortress",
  goal: "Destroy the command bunker.",
  turns: 8,
  map: {
    terrain: [
      "^^^^....^^^^",
      "^^^......^^^",
      "^^........^^",
      "^..........^",
      "............",
      "............",
      "....ff......",
      "....ff......",
      "............",
      "............",
      "......==....",
      "......==....",
      "............",
      "............",
    ],
    features: [
      "............",
      "......B.....",
      "....WW.WW...",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
    ],
  },
  kaijuStart: { at: [6, 12], facing: 1 },
  retreat: bottomRow,
  units: [
    { type: "gun", at: [9, 3] },
    { type: "missile", at: [2, 2] },
    { type: "maser", at: [10, 2] },
    { type: "tank", at: [6, 6] },
    { type: "infantry", at: [5, 8] },
    { type: "infantry", at: [7, 8] },
  ],
  reinforcements: [{ turn: 2, type: "helicopter", at: [6, 0] }],
  objective: { kind: "destroy", at: [6, 1] },
};

export const COAST_LITE = {
  id: "coast-lite",
  name: "A Short Coast",
  goal: "Drive off or destroy the rival.",
  turns: 12,
  map: {
    terrain: [
      "~~~,........",
      "~~~,........",
      "~~,,........",
      "~~,.....ff..",
      "~~,.....ff..",
      "~,,.........",
      "~,..........",
      "~,..........",
      "~,,.........",
      "~~,.........",
      "~~,,........",
      "~~~,........",
      "~~~,........",
      "~~~,........",
    ],
    features: [
      "............",
      "............",
      "....1.......",
      "............",
      "....1.......",
      "............",
      "......T.....",
      "............",
      "....1.......",
      "............",
      "............",
      "............",
      "............",
      "............",
    ],
  },
  kaijuStart: { at: [4, 11], facing: 1 },
  rivalStart: { at: [9, 2], facing: 4 },
  retreat: bottomRow,
  rivalRetreat: topRow.slice(6),
  units: [
    { type: "infantry", at: [6, 9] },
    { type: "infantry", at: [3, 6] },
    { type: "tank", at: [7, 5] },
  ],
  reinforcements: [{ turn: 3, type: "helicopter", at: [11, 7] }],
  objective: { kind: "rival" },
};

export const CITY_LITE = {
  id: "city-lite",
  name: "A Small City",
  goal: "Destroy the chosen target.",
  turns: 10,
  map: {
    terrain: [
      '......."""".',
      "============",
      '.......""""".',
      "............",
      "============",
      "............",
      "............",
      "============",
      "............",
      "............",
      "............",
      ",,,,,,,,,,,,",
      "~~~~~~~~~~~~",
      "~~~~~~~~~~~~",
    ].map((r) => r.slice(0, 12)),
    features: [
      "............",
      "............",
      "...P..L..Y..",
      "..T.T.......",
      "............",
      ".1.2.3.1.2.1",
      "..1..2..1...",
      "............",
      ".2..1...3...",
      "............",
      "............",
      "............",
      "............",
      "............",
    ],
  },
  kaijuStart: { at: [5, 12], facing: 1 },
  retreat: bottomRow,
  units: [
    { type: "tank", at: [4, 7] },
    { type: "infantry", at: [8, 4] },
    { type: "artillery", at: [6, 0] },
  ],
  reinforcements: [
    { turn: 2, type: "helicopter", at: [0, 0] },
    { turn: 3, type: "scientist", at: [11, 0] },
  ],
  objective: { kind: "chosen" },
  targets: { plant: [3, 2], lab: [6, 2], leyline: [9, 2] },
  choose: "target",
};

// An empty field: open ground, a bunker far away as the objective, nothing else.
export function blank(changes = {}) {
  const terrain = Array.from({ length: 14 }, () => "............");
  const features = Array.from({ length: 14 }, () => "............");
  features[0] = "...........B";
  return {
    id: "blank",
    name: "Open Field",
    goal: "Destroy the bunker.",
    turns: 10,
    map: { terrain, features },
    kaijuStart: { at: [5, 7], facing: 0 },
    retreat: bottomRow,
    units: [],
    reinforcements: [],
    objective: { kind: "destroy", at: [11, 0] },
    ...changes,
  };
}

// Paint a glyph into a mission map at [col, row]: layer is "terrain" or "features".
export function paint(mission, layer, col, row, glyph) {
  const rows = mission.map[layer];
  rows[row] = rows[row].slice(0, col) + glyph + rows[row].slice(col + 1);
  return mission;
}

export const at = (col, row) => offsetToKey(col, row);

// Drop a unit into a state directly, for tests.
export function putUnit(state, type, key, extra = {}) {
  const u = { id: `u${state.nextUnit}`, type, at: key, hp: UNITS[type].hp, panicked: 0, reload: 0, ...extra };
  state.nextUnit += 1;
  state.units.push(u);
  return u;
}

// Find a dice state whose next rolls satisfy test(m), where m is a fresh Mulberry32.
export function rigDice(test, from = 1) {
  for (let seed = from; seed < from + 200000; seed++) {
    if (test(new Mulberry32(seed))) return seed;
  }
  throw new Error("No dice state found");
}

export function setup(mission, extra = {}) {
  return { kaiju: "radiosaur", mutations: [], mission, target: null, rival: null, seed: 7, ...extra };
}
