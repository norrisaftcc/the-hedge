// Replays: a fixed setup and command list for each mission (recorded from tools/sim.mjs, seed 7)
// gives a fixed final score, grade and death [PLT-6]. If the rules or the data change on purpose, record
// again with the bot and change the numbers here in the same commit.
// Commands are written one turn to a line: "m q,r" move, "a attack q,r" attack, "f dir" face,
// "s q,r" stomp, "e q,r" eat, "r" roar, "w" withdraw, "end" end the turn.

import { test } from "node:test";
import assert from "node:assert/strict";
import { create, step, replay, replayEvents } from "../src/rules.js";
import { resolveMission } from "../src/data/missions.js";

const GAMES = [
  {
    name: "fortress",
    setup: { kaiju: "radiosaur", mission: "fortress", target: null, rival: null, seed: 7 },
    commands: [
      "m 3,7 | end",
      "r | m 6,4 | end",
      "r | m 5,2 | end",
      "r | m 4,2 | s 3,2 | s 3,2 | end",
      "a bite 3,2",
    ],
    result: { grade: "total victory", outcome: "goal", turn: 5, death: null, score: { destruction: 200, units: 60, objective: 500, time: 180, parts: 200, total: 1140 } },
  },
  {
    name: "swathe",
    setup: { kaiju: "thalassor", mission: "swathe", target: "lab", rival: null, seed: 7 },
    commands: [
      "m 3,7 | end",
      "r | s 2,7 | a fist 4,7 | end",
      "r | f 3 | a surge 2,7 | end",
      "r | m 4,6 | end",
      "r | end",
    ],
    result: { grade: "defeat", outcome: "fallen", turn: 5, death: "cuts", score: { destruction: 100, units: 10, objective: 0, time: 0, parts: 0, total: 110 } },
  },
  {
    name: "coast",
    setup: { kaiju: "squamous", mission: "coast", target: null, rival: "dairengo", seed: 7 },
    commands: [
      "m 5,7 | end",
      "e 5,6 | a grab 6,6 | a grab 6,6 | r | end",
      "a grab 6,6 | a grab 6,6 | a grab 6,6 | end",
      "a grab 6,6 | a grab 6,6 | a grab 6,6 | end",
      "a grab 6,6 | a grab 6,6 | a grab 6,6 | end",
      "e 5,6 | a grab 6,6 | a grab 6,6 | r | end",
      "f 2 | a gaze 5,6 | end",
      "end",
      "r | f 3 | a gaze 4,7 | a gaze 4,7 | end",
      "a gaze 4,7 | end",
      "e 4,7 | a gaze 4,7 | end",
      "end",
      "e 4,7 | a gaze 4,7 | end",
      "f 2 | a gaze 5,6 | a gaze 5,6 | end",
      "end",
      "a grab 6,6 | a grab 6,6 | end",
    ],
    result: { grade: "draw", outcome: "time", turn: 16, death: null, score: { destruction: 20, units: 30, objective: 0, time: 0, parts: 200, total: 250 } },
  },
  {
    // The bot never withdraws; the mad scientist arrives on turn 5 and the paralysis does the rest.
    name: "rampage",
    setup: { kaiju: "radiosaur", mission: "rampage", objective: "destruction", seed: 7 },
    commands: [
      "m 2,9 | r | s 3,8 | end",
      "m 3,9 | m 5,9 | end",
      "e 4,9 | f 2 | a breath 5,8 | m 6,8 | s 6,7 | end",
      "m 7,8 | s 8,7 | s 7,9 | m 7,7 | s 6,7 | end",
      "r | m 8,6 | m 9,5 | s 9,4 | end",
      "r | m 10,3 | s 9,3 | end",
      "e 10,2 | r | f 3 | a breath 9,3 | end",
      "r | end",
    ],
    result: {
      grade: "rampage", outcome: "fallen", turn: 9, death: "lingering", objective: "destruction", stars: 5,
      score: { structures: 1160, units: 0, survival: 0, total: 1160 },
    },
  },
];

function decode(text) {
  const [op, a, b] = text.trim().split(/\s+/);
  if (op === "m") return { t: "move", to: a };
  if (op === "a") return { t: "attack", attack: a, target: b };
  if (op === "f") return { t: "face", dir: Number(a) };
  if (op === "s") return { t: "stomp", target: a };
  if (op === "e") return { t: "eat", target: a };
  if (op === "r") return { t: "roar" };
  if (op === "w") return { t: "withdraw" };
  if (op === "end") return { t: "end" };
  throw new Error(`Unknown command: ${text}`);
}

function setupOf(game) {
  const s = game.setup;
  return {
    kaiju: s.kaiju,
    mutations: [],
    mission: resolveMission(s.mission, { seed: s.seed, target: s.target || undefined }),
    target: s.target,
    rival: s.rival || undefined,
    objective: s.objective,
    seed: s.seed,
  };
}

const commandsOf = (game) => game.commands.flatMap((line) => line.split("|")).map(decode);

for (const game of GAMES) {
  test(`replay: ${game.name} ends with a fixed grade and score`, () => {
    const state = replay(setupOf(game), commandsOf(game));
    assert.ok(state.result, "the mission is over");
    assert.equal(state.result.grade, game.result.grade);
    assert.equal(state.result.outcome, game.result.outcome);
    assert.equal(state.turn, game.result.turn);
    assert.equal(state.result.death, game.result.death);
    assert.deepEqual(state.result.score, game.result.score);
    if (game.result.objective) {
      assert.equal(state.result.objective, game.result.objective);
      assert.equal(state.result.stars, game.result.stars);
    }
  });

  test(`replay: ${game.name} replayEvents gives the same state and every event`, () => {
    const { state, events } = replayEvents(setupOf(game), commandsOf(game));
    assert.deepEqual(state, replay(setupOf(game), commandsOf(game)));
    let s = create(setupOf(game));
    const all = [];
    for (const cmd of commandsOf(game)) {
      const out = step(s, cmd);
      all.push(...out.events);
      s = out.state;
    }
    assert.deepEqual(events, all);
    assert.equal(events[events.length - 1].k, "over");
  });

  test(`replay: ${game.name} accepts every command and reads cleanly`, () => {
    let state = create(setupOf(game));
    for (const cmd of commandsOf(game)) {
      const out = step(state, cmd);
      assert.ok(!out.events.some((e) => e.k === "refuse"), `refused ${JSON.stringify(cmd)}: ${out.events.map((e) => e.text).join(" ")}`);
      for (const e of out.events) {
        assert.ok(e.text.length > 0, `empty text for ${e.k}`);
        assert.ok(!/[!{}]|undefined|NaN/.test(e.text), `${e.k}: ${e.text}`);
      }
      state = out.state;
    }
    const h = state.result.headline;
    assert.equal(h, h.toUpperCase());
    assert.match(h, /^[^;]+; [A-Z ]+ '[^']+'$/, `headline: ${h}`);
  });
}
