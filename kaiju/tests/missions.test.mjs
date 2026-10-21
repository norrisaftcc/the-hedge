// The missions: every one resolves to a legal, playable map for any seed and target.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSIONS, TARGETS, resolveMission } from "../src/data/missions.js";
import { TERRAIN, TERRAIN_BY_GLYPH, STRUCTURES, STRUCTURE_BY_GLYPH } from "../src/data/terrain.js";
import { UNITS } from "../src/data/units.js";
import { offsetToKey, keyToOffset, neighbors, distance } from "../src/hex.js";
import { create } from "../src/rules.js";

const IDS = ["fortress", "swathe", "coast"];
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

// Every resolution the tests look at: each mission, seeds 1..20, each target.
function* everyMission() {
  for (const id of IDS) for (const seed of SEEDS) for (const target of TARGETS) yield { id, seed, target, m: resolveMission(id, { seed, target }) };
}

const key = (at) => offsetToKey(at[0], at[1]);
const onMap = (at) => at[0] >= 0 && at[0] < 12 && at[1] >= 0 && at[1] < 14;
const terrainAt = (m, at) => TERRAIN[TERRAIN_BY_GLYPH[m.map.terrain[at[1]][at[0]]]];
const structureAt = (m, at) => STRUCTURES[STRUCTURE_BY_GLYPH[m.map.features[at[1]][at[0]]]] || null;

// The kaiju's cost to enter a hex, or null for a wall: off the map or a solid structure.
function enterCost(m, k) {
  const { col, row } = keyToOffset(k);
  if (!onMap([col, row])) return null;
  const s = structureAt(m, [col, row]);
  if (s && s.solid) return null;
  return terrainAt(m, [col, row]).cost + (s ? s.height : 0);
}

// Dijkstra over terrain cost plus structure height, as MazeBuilder's pathfinding walks a maze.
function costs(m, from) {
  const dist = new Map([[from, 0]]);
  const open = [from];
  while (open.length) {
    open.sort((a, b) => dist.get(a) - dist.get(b));
    const cur = open.shift();
    for (const n of neighbors(cur)) {
      const c = enterCost(m, n);
      if (c === null) continue;
      const d = dist.get(cur) + c;
      if (!dist.has(n) || d < dist.get(n)) {
        dist.set(n, d);
        open.push(n);
      }
    }
  }
  return dist;
}

function objectiveHex(m) {
  return m.objective.kind === "rival" ? m.rivalStart.at : m.objective.at;
}

test("three missions with words to brief them by", () => {
  assert.deepEqual(Object.keys(MISSIONS).sort(), [...IDS].sort());
  for (const id of IDS) {
    const m = MISSIONS[id];
    assert.equal(m.id, id);
    assert.ok(m.briefing.length >= 3 && m.briefing.length <= 4, `${id} briefing`);
    for (const line of [m.name, m.tagline, m.goal, ...m.briefing]) {
      assert.equal(typeof line, "string");
      assert.ok(line.length > 0 && line.length <= 100, `${id}: ${line}`);
      assert.ok(!line.includes("!"), `${id}: ${line}`);
    }
    assert.ok(m.goal.endsWith(".") && m.goal.split(". ").length === 1, `${id} goal is one sentence`);
    assert.ok(Number.isInteger(m.turns) && m.turns > 0);
  }
  assert.equal(MISSIONS.fortress.turns, 14);
  assert.equal(MISSIONS.swathe.turns, 15);
  assert.equal(MISSIONS.coast.turns, 16);
  assert.equal(MISSIONS.swathe.choose, "target");
  assert.equal(MISSIONS.coast.choose, "rival");
  assert.equal(MISSIONS.swathe.generator, "city");
  assert.equal(MISSIONS.swathe.map, null);
});

test("every mission resolves for seeds 1..20 and every target, 12 x 14, known glyphs only", () => {
  for (const { id, seed, target, m } of everyMission()) {
    const where = `${id} seed ${seed} ${target}`;
    assert.equal(m.map.terrain.length, 14, where);
    assert.equal(m.map.features.length, 14, where);
    for (let r = 0; r < 14; r++) {
      assert.equal(m.map.terrain[r].length, 12, `${where} row ${r}`);
      assert.equal(m.map.features[r].length, 12, `${where} row ${r}`);
      for (const g of m.map.terrain[r]) assert.ok(g in TERRAIN_BY_GLYPH, `${where}: terrain ${g}`);
      for (const g of m.map.features[r]) assert.ok(g === "." || g in STRUCTURE_BY_GLYPH, `${where}: feature ${g}`);
    }
  }
});

test("resolveMission returns a fresh copy and leaves MISSIONS alone", () => {
  const before = JSON.stringify(MISSIONS);
  const a = resolveMission("fortress", { seed: 1 });
  a.units.push({ type: "jet", at: [0, 0] });
  a.map.terrain[0] = "............";
  assert.notDeepEqual(resolveMission("fortress", { seed: 1 }), a);
  const s = resolveMission("swathe", { seed: 3, target: "lab" });
  s.units.length = 0;
  assert.ok(resolveMission("swathe", { seed: 3, target: "lab" }).units.length > 0);
  assert.equal(JSON.stringify(MISSIONS), before);
  assert.throws(() => resolveMission("nowhere", { seed: 1 }));
});

test("the swathe: same seed, same city; other seeds, other cities", () => {
  assert.deepEqual(resolveMission("swathe", { seed: 9, target: "plant" }), resolveMission("swathe", { seed: 9, target: "plant" }));
  const maps = new Set(SEEDS.map((seed) => JSON.stringify(resolveMission("swathe", { seed, target: "plant" }).map)));
  assert.ok(maps.size > 15);
  // A text seed reads as rules.create reads it: its digits.
  assert.deepEqual(resolveMission("swathe", { seed: "harbour 9", target: "lab" }), resolveMission("swathe", { seed: 9, target: "lab" }));
  // The target changes the objective, not the city.
  for (const seed of SEEDS) {
    const a = resolveMission("swathe", { seed, target: "plant" });
    const b = resolveMission("swathe", { seed, target: "leyline" });
    assert.deepEqual(a.map, b.map);
    assert.deepEqual(a.units, b.units);
  }
});

test("the objective stands where the mission says", () => {
  for (const { id, seed, target, m } of everyMission()) {
    const where = `${id} seed ${seed} ${target}`;
    if (id === "fortress") {
      assert.equal(m.objective.kind, "destroy");
      assert.equal(structureAt(m, m.objective.at).id, "bunker", where);
    }
    if (id === "coast") {
      assert.equal(m.objective.kind, "rival");
      assert.ok(m.rivalStart && onMap(m.rivalStart.at));
      assert.ok(m.rivalRetreat.length > 0);
    }
    if (id === "swathe") {
      assert.equal(m.objective.kind, "chosen");
      assert.deepEqual(m.objective.at, m.targets[target], where);
      for (const t of TARGETS) {
        const at = m.targets[t];
        assert.equal(structureAt(m, at).id, t, `${where}: ${t}`);
        assert.ok(at[1] <= 4, `${where}: ${t} in the top third`);
      }
      const plant = key(m.targets.plant);
      const pylons = neighbors(plant).filter((k) => {
        const { col, row } = keyToOffset(k);
        return onMap([col, row]) && structureAt(m, [col, row])?.id === "pylon";
      });
      assert.equal(pylons.length, 2, `${where}: pylons beside the plant`);
      assert.equal(terrainAt(m, m.targets.leyline).id, "park", `${where}: the stones stand in a park`);
      for (let r = 11; r < 14; r++) for (const g of m.map.terrain[r]) assert.ok([",", "~", "="].includes(g), `${where}: harbour row ${r}`);
      assert.equal(terrainAt(m, m.kaijuStart.at).id, "water", `${where}: the monster starts in the harbour`);
    }
  }
});

test("the kaiju can walk from its start to a hex beside the objective", () => {
  for (const { id, seed, target, m } of everyMission()) {
    const where = `${id} seed ${seed} ${target}`;
    const start = key(m.kaijuStart.at);
    assert.notEqual(enterCost(m, start), null, `${where}: start hex`);
    const goal = key(objectiveHex(m));
    const hexes = distance(start, goal);
    assert.ok(hexes >= 9 && hexes <= 12, `${where}: objective ${hexes} hexes away`);
    const dist = costs(m, start);
    const beside = neighbors(goal).filter((n) => dist.has(n));
    assert.ok(beside.length > 0, `${where}: no way to the objective`);
  }
});

test("the rival can reach the player's kaiju on the coast", () => {
  const m = resolveMission("coast", { seed: 1 });
  const dist = costs(m, key(m.rivalStart.at));
  assert.ok(neighbors(key(m.kaijuStart.at)).some((n) => dist.has(n)));
});

test("units stand on legal hexes, one to a hex", () => {
  for (const { id, seed, target, m } of everyMission()) {
    const where = `${id} seed ${seed} ${target}`;
    const placed = [...m.units.map((u) => ({ ...u, when: "start" })), ...m.reinforcements.map((u) => ({ ...u, when: `turn ${u.turn}` }))];
    const starts = new Set(m.units.map((u) => key(u.at)));
    assert.equal(starts.size, m.units.length, `${where}: two units on one hex`);
    const kaijuHexes = [m.kaijuStart.at, ...(m.rivalStart ? [m.rivalStart.at] : [])].map(key);
    for (const u of placed) {
      const def = UNITS[u.type];
      const what = `${where}: ${u.type} at ${u.at} (${u.when})`;
      assert.ok(def, what);
      assert.ok(onMap(u.at), what);
      assert.ok(!kaijuHexes.includes(key(u.at)), `${what} is on a kaiju`);
      const t = terrainAt(m, u.at);
      const s = structureAt(m, u.at);
      if (!def.air) assert.notEqual(t.water, "deep", `${what} is in deep water`);
      if (u.type !== "infantry") {
        assert.notEqual(t.id, "mountain", `${what} is on a mountain`);
        assert.equal(s, null, `${what} is in a structure`);
      }
      if (u.when !== "start") assert.ok(Number.isInteger(u.turn) && u.turn >= 2 && u.turn <= m.turns, what);
    }
  }
});

test("the forces each mission promises", () => {
  const count = (list, type) => list.filter((u) => u.type === type).length;
  const f = resolveMission("fortress", { seed: 1 });
  assert.ok(count(f.units, "gun") >= 2 && count(f.units, "missile") === 2 && count(f.units, "maser") === 1 && count(f.units, "infantry") >= 2);
  assert.deepEqual(f.reinforcements.map((r) => [r.turn, r.type]), [[3, "helicopter"], [6, "helicopter"], [8, "jet"]]);
  for (const seed of SEEDS) {
    const s = resolveMission("swathe", { seed, target: "lab" });
    assert.ok(count(s.units, "tank") >= 2 && count(s.units, "infantry") >= 2 && count(s.units, "artillery") >= 1);
    for (const u of s.units.filter((u) => u.type !== "artillery")) assert.equal(terrainAt(s, u.at).id, "road", `seed ${seed}: ${u.type} in the streets`);
    for (const u of s.units.filter((u) => u.type === "artillery")) assert.equal(u.at[1], 0, `seed ${seed}: artillery at the top edge`);
    assert.deepEqual(s.reinforcements.map((r) => [r.turn, r.type]), [[2, "helicopter"], [4, "scientist"], [5, "helicopter"], [7, "jet"]]);
  }
  const c = resolveMission("coast", { seed: 1 });
  assert.equal(count(c.units, "infantry"), 4);
  assert.equal(count(c.units, "tank"), 2);
  assert.deepEqual(c.reinforcements.map((r) => [r.turn, r.type]), [[4, "helicopter"]]);
});

test("retreat hexes lie on the map edge", () => {
  for (const { id, m } of everyMission()) {
    for (const at of [...m.retreat, ...(m.rivalRetreat || [])]) {
      assert.ok(onMap(at), `${id}: ${at}`);
      assert.ok(at[0] === 0 || at[0] === 11 || at[1] === 0 || at[1] === 13, `${id}: ${at} is not on an edge`);
    }
  }
  for (const id of ["fortress", "swathe"]) {
    assert.deepEqual(resolveMission(id, { seed: 1, target: "lab" }).retreat.map((at) => at[1]), Array(12).fill(13));
  }
});

test("rules.create accepts every resolved mission", () => {
  for (const id of IDS) {
    for (const target of TARGETS) {
      const m = resolveMission(id, { seed: 5, target });
      const s = create({ kaiju: "radiosaur", mutations: [], mission: m, target, rival: id === "coast" ? "thalassor" : undefined, seed: 5 });
      assert.equal(s.mission, id);
      assert.equal(s.units.length, m.units.length);
      if (id !== "coast") assert.equal(s.objective.at, key(objectiveHex(m)));
    }
  }
});
