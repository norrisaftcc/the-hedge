// Rampage, the 1981 mode (DESIGN §14): a city, no goal but the score, waves that grow, and an
// end that names the death.

import { test } from "node:test";
import assert from "node:assert/strict";
import { create, step, waveSize, rampageScore, starsFor } from "../src/rules.js";
import { MISSIONS, OBJECTIVES, resolveMission } from "../src/data/missions.js";
import { TERRAIN, TERRAIN_BY_GLYPH, STRUCTURE_BY_GLYPH } from "../src/data/terrain.js";
import { UNITS } from "../src/data/units.js";
import { neighbors } from "../src/hex.js";
import { at, putUnit, rigDice, blank } from "./fixtures.mjs";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const PARTS = ["head", "arms", "legs", "aux"];

function rampage(objective = "balanced", extra = {}) {
  return create({ kaiju: "radiosaur", mutations: [], mission: resolveMission("rampage", { seed: 7 }), objective, seed: 7, ...extra });
}

// A rampage with the army sent home: no units and no waves.
function quiet(objective = "balanced", extra = {}) {
  const s = rampage(objective, extra);
  s.units = [];
  s.waves.cap = 0;
  return s;
}

// Every part but the body crippled, the body at hp: the next blow anywhere lands on the body.
function onLastLegs(s, hp = 1) {
  for (const p of PARTS) s.kaiju.parts[p].hp = 0;
  s.kaiju.parts.body.hp = hp;
  return s;
}

const kinds = (events, k) => events.filter((e) => e.k === k);

test("rampage: the mission is the 1981 mode, with five objectives", () => {
  const m = MISSIONS.rampage;
  assert.equal(m.turns, null);
  assert.deepEqual(m.objective, { kind: "none" });
  assert.equal(m.choose, "objective");
  assert.equal(m.lingeringGrows, true);
  assert.equal(m.generator, "city");
  assert.deepEqual(Object.keys(OBJECTIVES), ["balanced", "killer", "combat", "destruction", "survival"]);
  for (const o of Object.values(OBJECTIVES)) {
    assert.ok(o.name && o.text && !o.text.includes("!"), o.id);
    assert.equal(o.stars.length, 4, o.id);
    assert.deepEqual([...o.stars].sort((a, b) => a - b), o.stars, `${o.id}: thresholds rise`);
  }
  assert.ok(!MISSIONS.fortress.lingeringGrows && !MISSIONS.swathe.lingeringGrows && !MISSIONS.coast.lingeringGrows);
});

test("rampage: resolves for seeds 1-20 on the swathe's city, with lighter forces", () => {
  const count = (list, type) => list.filter((u) => u.type === type).length;
  for (const seed of SEEDS) {
    const m = resolveMission("rampage", { seed });
    const where = `seed ${seed}`;
    assert.deepEqual(m.map, resolveMission("swathe", { seed, target: "lab" }).map, `${where}: the same city`);
    assert.equal(m.map.terrain.length, 14);
    for (const r of m.map.terrain) for (const g of r) assert.ok(g in TERRAIN_BY_GLYPH, where);
    for (const r of m.map.features) for (const g of r) assert.ok(g === "." || g in STRUCTURE_BY_GLYPH, where);
    assert.equal(count(m.units, "artillery"), 2, where);
    assert.equal(count(m.units, "tank"), 2, where);
    assert.equal(count(m.units, "infantry"), 4, where);
    assert.equal(m.units.length, 8, where);
    assert.deepEqual(m.reinforcements, []);
    for (const u of m.units.filter((u) => u.type === "artillery")) assert.equal(u.at[1], 0, `${where}: artillery on the top avenue`);
    for (const u of m.units) assert.equal(TERRAIN[TERRAIN_BY_GLYPH[m.map.terrain[u.at[1]][u.at[0]]]].id, "road", `${where}: ${u.type} in the streets`);
    assert.equal(new Set(m.units.map((u) => `${u.at}`)).size, m.units.length, `${where}: one unit to a hex`);
    for (const id of Object.keys(OBJECTIVES)) {
      const s = create({ kaiju: "thalassor", mutations: [], mission: m, objective: id, seed });
      assert.equal(s.turnLimit, null);
      assert.equal(s.objective.kind, "none");
      assert.equal(s.objective.id, id);
      assert.deepEqual(s.objective.weights, { structures: OBJECTIVES[id].structures, units: OBJECTIVES[id].units, perTurn: OBJECTIVES[id].perTurn });
      assert.equal(s.units.length, 8);
    }
  }
});

test("rampage: create refuses an unknown or inherited objective", () => {
  const mission = resolveMission("rampage", { seed: 1 });
  for (const objective of [undefined, "", "nowhere", "toString", "constructor", "__proto__", 3]) {
    assert.throws(() => create({ kaiju: "radiosaur", mutations: [], mission, objective, seed: 1 }), /objective/, String(objective));
  }
});

test("rampage: it never ends on time", () => {
  let s = quiet();
  s.kaiju.hunger = null;
  for (let i = 0; i < 40; i++) {
    const out = step(s, { t: "end" });
    assert.equal(kinds(out.events, "over").length, 0, `turn ${s.turn}`);
    s = out.state;
  }
  assert.equal(s.turn, 41);
  assert.equal(s.result, null);
  assert.equal(s.phase, "kaiju");
});

test("rampage: waves grow by the table", () => {
  const w = MISSIONS.rampage.waves;
  assert.deepEqual(Array.from({ length: 14 }, (_, i) => waveSize(w, i + 1)), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4]);
});

test("rampage: each defense phase brings its wave before the units act, from the unlocked types", () => {
  // The robot does not eat, so it never goes berserk; a huge body lets it stand and watch.
  let s = rampage("balanced", { kaiju: "dairengo" });
  s.kaiju.parts.body.hp = s.kaiju.parts.body.max = 9999;
  const w = s.waves;
  for (let turn = 1; turn <= 12; turn++) {
    const before = s.units.length;
    const out = step(s, { t: "end" });
    const arrivals = kinds(out.events, "reinforce");
    const scientist = turn >= 5 && (turn - 5) % 6 === 0 ? 1 : 0;
    assert.equal(arrivals.length, Math.min(waveSize(w, turn) + scientist, w.cap - before), `turn ${turn}`);
    const unlocked = w.mix.filter((m) => m.from <= turn).flatMap((m) => m.types);
    for (const e of arrivals) assert.ok(unlocked.includes(e.type) || e.type === "scientist", `turn ${turn}: ${e.type}`);
    assert.equal(arrivals.filter((e) => e.type === "scientist").length, before < w.cap ? scientist : 0, `turn ${turn}: the mad scientist`);
    if (scientist && before < w.cap) assert.equal(arrivals[0].type, "scientist", `turn ${turn}: the mad scientist comes first`);
    const firstAct = out.events.findIndex((e) => e.k === "umove" || (e.k === "attack" && e.attacker.side === "unit"));
    if (arrivals.length && firstAct >= 0) assert.ok(out.events.indexOf(arrivals[arrivals.length - 1]) < firstAct, `turn ${turn}: wave first`);
    if (arrivals.length) {
      const calls = kinds(out.events, "radio").filter((e) => e.about === "wave");
      assert.equal(calls.length, 1);
      const edges = new Set(arrivals.filter((e) => e.edge).map((e) => e.edge));
      assert.equal(calls[0].edge, edges.size === 1 ? [...edges][0] : null, `turn ${turn}: the call names the edge only when the wave shares it`);
      if (calls[0].edge === null) assert.doesNotMatch(calls[0].text, /NORTH|EAST|WEST/, `turn ${turn}: ${calls[0].text}`);
    }
    for (const e of arrivals) {
      const u = out.state.units.find((x) => x.id === e.unit);
      assert.ok(u, `turn ${turn}: ${e.unit} stands`);
    }
    s = out.state;
  }
});

test("rampage: no wave while the cap of units stands, and a wave stops at the cap", () => {
  let s = rampage("balanced", { kaiju: "dairengo" });
  s.turn = 10;
  const roads = Object.keys(s.map.hexes).filter((k) => s.map.hexes[k].terrain === "road" && !s.units.some((u) => u.at === k) && k !== s.kaiju.at);
  while (s.units.length < s.waves.cap - 1) putUnit(s, "infantry", roads.pop());
  const one = step(s, { t: "end" });
  assert.equal(kinds(one.events, "reinforce").length, 1, "one place left under the cap");
  putUnit(s, "infantry", roads.pop());
  assert.equal(s.units.length, 24);
  const none = step(s, { t: "end" });
  assert.equal(kinds(none.events, "reinforce").length, 0, "the cap is reached");
});

test("rampage: waves roll the game's dice, so a replay repeats them", () => {
  const a = step(rampage(), { t: "end" });
  const b = step(rampage(), { t: "end" });
  assert.deepEqual(kinds(a.events, "reinforce"), kinds(b.events, "reinforce"));
  const c = step(rampage("balanced", { seed: 8 }), { t: "end" });
  assert.notDeepEqual(c.state.rng, a.state.rng);
});

test("rampage: a defense phase with the cap of 24 units stays well under 50 ms", () => {
  const s = rampage("balanced", { kaiju: "dairengo" });
  s.kaiju.parts.body.hp = s.kaiju.parts.body.max = 9999;
  const types = ["jet", "helicopter", "tank", "infantry", "artillery", "missile", "scientist"];
  const free = Object.keys(s.map.hexes).filter((k) => {
    const hex = s.map.hexes[k];
    return !hex.structure && TERRAIN[hex.terrain].ground && !s.units.some((u) => u.at === k) && k !== s.kaiju.at;
  });
  const spots = free.filter((_, i) => i % 3 === 0);
  for (let i = 0; s.units.length < 24; i++) putUnit(s, types[i % types.length], spots[i]);
  assert.equal(s.units.length, 24);
  const times = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    step(s, { t: "end" });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  assert.ok(times[3] < 50, `median ${times[3].toFixed(1)} ms`);
});

test("objectives weigh a hand-made tally as the table says", () => {
  const destroyed = {
    structures: ["low", "tower", "pylon", "lab"].map((type) => ({ type, at: "0,0" })),
    units: ["infantry", "tank", "helicopter"].map((type) => ({ type, at: "0,0" })),
  };
  // low 10 (height 1), tower 50 (3), pylon 15 (1, not populated), lab 150 (2); Guard 10, tank 30, helicopter 40.
  const expected = {
    balanced: { structures: 225, units: 80, survival: 90, total: 395 },
    killer: { structures: 420, units: 65, survival: 0, total: 485 },
    combat: { structures: 0, units: 160, survival: 0, total: 160 },
    destruction: { structures: 475, units: 0, survival: 0, total: 475 },
    survival: { structures: 0, units: 0, survival: 900, total: 900 },
  };
  for (const id of Object.keys(OBJECTIVES)) {
    const s = rampage(id);
    assert.deepEqual(rampageScore(s.objective.weights, destroyed, 9), expected[id], id);
    // And through the rules' own ending: withdraw on turn 9 with that tally.
    s.turn = 9;
    s.tally.destroyed = structuredClone(destroyed);
    s.kaiju.at = s.retreat[5];
    const { state, events } = step(s, { t: "withdraw" });
    const r = state.result;
    assert.equal(r.grade, "rampage");
    assert.equal(r.outcome, "withdrawn");
    assert.equal(r.objective, id);
    assert.equal(r.death, null);
    assert.deepEqual(r.score, expected[id], id);
    assert.equal(r.stars, starsFor(OBJECTIVES[id].stars, r.score.total));
    assert.match(events[events.length - 1].text, new RegExp(`${OBJECTIVES[id].name} score ${r.score.total}`));
  }
});

test("stars run from one to five by the thresholds", () => {
  const t = [100, 200, 300, 400];
  assert.deepEqual([0, 99, 100, 199, 200, 300, 399, 400, 5000].map((n) => starsFor(t, n)), [1, 1, 2, 2, 3, 4, 4, 5, 5]);
});

test("the Three Deaths: a thousand cuts", () => {
  const s = onLastLegs(quiet());
  const tank = putUnit(s, "tank", neighbors(s.kaiju.at).find((k) => s.map.hexes[k] && s.map.hexes[k].terrain !== "water"));
  s.rng = rigDice((m) => m.roll(100) <= UNITS.tank.accuracy);
  const { state, events } = step(s, { t: "end" });
  assert.ok(events.some((e) => e.k === "attack" && e.attacker.id === tank.id && e.hit));
  assert.equal(state.kaiju.lastHurt, "attack");
  assert.equal(state.result.outcome, "fallen");
  assert.equal(state.result.grade, "rampage");
  assert.equal(state.result.death, "cuts");
  assert.match(kinds(events, "over")[0].text, /thousand cuts|No one shot/);
});

test("the Three Deaths: the sudden death, a power plant", () => {
  const s = onLastLegs(quiet("balanced", { kaiju: "thalassor" }));
  const m = resolveMission("rampage", { seed: 7 });
  const plant = at(...m.targets.plant);
  s.map.hexes[plant].structure.hp = 1;
  s.kaiju.at = neighbors(plant).find((k) => s.map.hexes[k] && !s.map.hexes[k].structure);
  const { state, events } = step(s, { t: "stomp", target: plant });
  assert.equal(kinds(events, "blast").length, 1);
  assert.equal(state.kaiju.lastHurt, "blast");
  assert.equal(state.result.outcome, "fallen");
  assert.equal(state.result.death, "sudden");
  assert.match(kinds(events, "over")[0].text, /sudden death/);
  assert.match(state.result.headline, /POWER|LIGHTS OUT|GRID/);
});

test("the Three Deaths: the lingering death", () => {
  const s = quiet();
  s.kaiju.parts.body.hp = 1;
  s.kaiju.lingering = 6;
  const { state, events } = step(s, { t: "end" });
  const hurt = kinds(events, "hurt");
  assert.equal(hurt.length, 1);
  assert.deepEqual([hurt[0].actor, hurt[0].who, hurt[0].why, hurt[0].part], ["kaiju", "radiosaur", "lingering", "body"]);
  assert.equal(hurt[0].damage, 2, "lingering 7 against 6 AP: two below the floor of 1");
  assert.equal(state.kaiju.lastHurt, "lingering");
  assert.equal(state.result.outcome, "fallen");
  assert.equal(state.result.death, "lingering");
  assert.match(kinds(events, "over")[0].text, /lingering death/);
});

test("other missions record the death too, without changing their scores", () => {
  const s = onLastLegs(create({ kaiju: "radiosaur", mutations: [], mission: blank(), seed: 7 }));
  putUnit(s, "tank", neighbors(s.kaiju.at)[0]);
  s.rng = rigDice((m) => m.roll(100) <= UNITS.tank.accuracy);
  const { state } = step(s, { t: "end" });
  assert.equal(state.result.grade, "defeat");
  assert.equal(state.result.death, "cuts");
  assert.deepEqual(Object.keys(state.result.score), ["destruction", "units", "objective", "time", "parts", "total"]);
  const w = create({ kaiju: "radiosaur", mutations: [], mission: blank(), seed: 7 });
  w.kaiju.at = w.retreat[0];
  assert.equal(step(w, { t: "withdraw" }).state.result.death, null);
});

test("lingering grows in Rampage and not elsewhere", () => {
  const r = quiet();
  r.kaiju.lingering = 1;
  const grown = step(r, { t: "end" });
  assert.equal(grown.state.kaiju.lingering, 2);
  assert.equal(kinds(grown.events, "lingering").length, 1);
  assert.equal(grown.state.kaiju.apMax, 6 - 2);
  assert.equal(kinds(grown.events, "hurt").length, 0, "AP still covers it");
  const none = quiet();
  assert.equal(step(none, { t: "end" }).state.kaiju.lingering, 0, "no lingering, nothing grows");

  const b = create({ kaiju: "radiosaur", mutations: [], mission: blank(), seed: 7 });
  b.kaiju.lingering = 1;
  const kept = step(b, { t: "end" });
  assert.equal(kept.state.kaiju.lingering, 1);
  assert.equal(kinds(kept.events, "lingering").length, 0);
  b.kaiju.lingering = 9;
  const capped = step(b, { t: "end" });
  assert.equal(capped.state.kaiju.apMax, 1);
  assert.equal(kinds(capped.events, "hurt").length, 0, "outside Rampage lingering never hurts");
});
