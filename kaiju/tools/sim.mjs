// A headless greedy bot and a balance table. The bot plays the player's kaiju through rules.step:
// eat when hungry, roar into a crowd, use the best expected-value attack in reach, else walk
// toward the objective or the rival, else end the turn.
// Run from the repo root: node kaiju/tools/sim.mjs [seeds] [kaiju] [mission]
// e.g. node kaiju/tools/sim.mjs 20, or node kaiju/tools/sim.mjs 1-20 radiosaur swathe:lab

import { pathToFileURL } from "node:url";
import * as H from "../src/hex.js";
import { create, step, reach, attackTargets, forecast, stompTargets, eatTargets, alive } from "../src/rules.js";
import { KAIJU, RULES } from "../src/data/kaiju.js";
import { UNITS } from "../src/data/units.js";
import { TERRAIN, STRUCTURES } from "../src/data/terrain.js";
import { resolveMission, TARGETS } from "../src/data/missions.js";

const OBJECTIVE_VALUE = 700;
const RIVAL_PER_HP = 40;
const WORTH_IT = 8;
const RICH = 35;
const LOW_BATTERY = 2;
const PANIC_WORTH = 0.4;

// Cost to walk from each hex to the goal, ignoring units: entering a hex costs its terrain
// plus its structure's height; solid structures bar the way.
function goalCosts(state, goals) {
  const enter = (key) => {
    const hex = state.map.hexes[key];
    if (!hex) return null;
    const st = hex.structure ? STRUCTURES[hex.structure.type] : null;
    if (st && st.solid) return null;
    return TERRAIN[hex.terrain].cost + (st ? st.height : 0);
  };
  const dist = new Map();
  let frontier = goals.filter((g) => state.map.hexes[g]).map((g) => [0, g]);
  for (const [, g] of frontier) dist.set(g, 0);
  while (frontier.length) {
    frontier.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    const [d, cur] = frontier.shift();
    if (d > dist.get(cur)) continue;
    const c = enter(cur);
    if (c === null && d > 0) continue;
    for (const n of H.neighbors(cur)) {
      if (!state.map.hexes[n]) continue;
      const nd = d + (c === null ? 1 : c);
      if (!dist.has(n) || nd < dist.get(n)) {
        dist.set(n, nd);
        frontier.push([nd, n]);
      }
    }
  }
  return dist;
}

function goalHexes(state) {
  if (state.objective.kind === "rival" && alive(state.rival)) return H.neighbors(state.rival.at);
  if (state.objective.at) {
    const st = state.map.hexes[state.objective.at].structure;
    return st && STRUCTURES[st.type].solid ? H.neighbors(state.objective.at) : [state.objective.at];
  }
  return [];
}

// The chance that 2d6 + pressure beats a morale.
function breakChance(morale, pressure) {
  let n = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b + pressure > morale) n += 1;
  return n / 36;
}

// What a forecast is worth, in score points, weighted toward the goal; goal is true when it
// strikes the objective or the rival.
function worth(state, f) {
  let value = 0;
  let goal = false;
  for (const t of f.targets) {
    const p = t.hitChance / 100;
    const mean = Math.min(t.hp, (t.damage[0] + t.damage[1]) / 2);
    if (t.kind === "kaiju") {
      value += p * mean * RIVAL_PER_HP;
      goal = true;
    } else if (t.kind === "structure") {
      const isGoal = t.key === state.objective.at;
      goal = goal || isGoal;
      value += (p * mean * (isGoal ? OBJECTIVE_VALUE : STRUCTURES[t.type].points)) / t.max;
    } else if (t.kind === "unit" && t.damage[1] === 0) {
      const u = state.units.find((x) => x.id === t.id);
      if (u && u.panicked === 0) value += PANIC_WORTH * UNITS[t.type].points * breakChance(UNITS[t.type].morale, f.panic || 0);
    } else if (t.kind === "unit") {
      const kill = t.damage[0] >= t.hp ? 1 : mean / t.hp;
      value += p * UNITS[t.type].points * kill;
    }
  }
  return { value, goal };
}

// Every strike open to the kaiju now: [{cmds, value, goal, ap}], turning first where that helps.
// Single attacks ignore facing; area attacks are tried in every facing.
export function strikes(state) {
  const k = state.kaiju;
  const out = [];
  for (const d of [k.facing, 0, 1, 2, 3, 4, 5].filter((x, i, all) => all.indexOf(x) === i)) {
    const turned = d === k.facing ? state : { ...state, kaiju: { ...k, facing: d } };
    const face = d === k.facing ? [] : [{ t: "face", dir: d }];
    for (const a of KAIJU[k.id].attacks) {
      if (a.pattern === "teleport") continue;
      if (a.pattern === "single" && d !== k.facing) continue;
      const targets = attackTargets(turned, a.id);
      for (const target of a.pattern === "single" ? targets : targets.slice(0, 1)) {
        const w = worth(state, { ...forecast(turned, a.id, target), panic: a.effects.panic });
        out.push({ cmds: [...face, { t: "attack", attack: a.id, target }], ...w, ap: a.ap });
      }
    }
    if (d === k.facing && k.ap >= RULES.stompAp) {
      for (const target of stompTargets(state)) {
        const st = state.map.hexes[target].structure;
        if (st && STRUCTURES[st.type].power && !k.passives.includes("reactorBelly") && target !== state.objective.at) continue;
        const w = worth(state, forecast(state, "stomp", target));
        out.push({ cmds: [{ t: "stomp", target }], ...w, ap: RULES.stompAp });
      }
    }
  }
  return out;
}

const perAp = (list) => list.reduce((a, b) => (b.value / b.ap > a.value / a.ap ? b : a));

function hungry(k) {
  return k.hunger !== null && k.hunger >= Math.ceil(RULES.hungryAt * k.hungerMax) - 1;
}

function eatCommand(state) {
  const k = state.kaiju;
  if (!hungry(k) || k.ap < RULES.eatAp) return null;
  const safe = eatTargets(state).filter((h) => {
    const st = state.map.hexes[h].structure;
    return !(st && STRUCTURES[st.type].power && !k.passives.includes("reactorBelly"));
  });
  if (!safe.length) return null;
  const objective = safe.find((h) => h === state.objective.at);
  return { t: "eat", target: objective || safe.sort()[0] };
}

function roarCommand(state) {
  const k = state.kaiju;
  if (k.used.roar || k.ap < RULES.roarAp) return null;
  const near = state.units.filter((u) => UNITS[u.type].morale < 99 && H.distance(u.at, k.at) <= k.roarRadius);
  return near.length >= 3 ? { t: "roar" } : null;
}

// A robot low on battery heads for the hexes beside a power structure instead of the goal,
// and stays there until the next phase start charges it.
function chargeHexes(state) {
  const k = state.kaiju;
  if (KAIJU[k.id].energy.rule !== "battery" || k.energy > LOW_BATTERY) return null;
  const power = Object.keys(state.map.hexes).filter((h) => {
    const st = state.map.hexes[h].structure;
    return st && STRUCTURES[st.type].power;
  });
  if (!power.length) return null;
  return power.flatMap((h) => H.neighbors(h)).filter((h) => state.map.hexes[h] && !state.map.hexes[h].structure);
}

// A move toward the goal. Avoid stepping onto power structures unless the kaiju feeds on them.
function moveCommand(state) {
  const k = state.kaiju;
  const options = reach(state);
  const costs = goalCosts(state, chargeHexes(state) || goalHexes(state));
  const far = (h) => (costs.has(h) ? costs.get(h) : 999);
  const blasts = (path) =>
    !k.passives.includes("reactorBelly") &&
    path.some((h) => {
      const st = state.map.hexes[h].structure;
      return st && STRUCTURES[st.type].power && h !== state.objective.at;
    });
  // A kaiju that drinks the sea likes to stand in it, as the rival does.
  const wet = (h) => (KAIJU[k.id].energy.rule === "water" && TERRAIN[state.map.hexes[h].terrain].water ? 0.5 : 0);
  let bestKey = null;
  let bestScore = far(k.at) - wet(k.at);
  for (const [h, r] of Object.entries(options).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (blasts(r.path)) continue;
    const score = far(h) - wet(h) + r.cost / 100;
    if (score < bestScore) {
      bestScore = score;
      bestKey = h;
    }
  }
  // A teleport, when it gains more ground than walking would.
  const jump = KAIJU[k.id].attacks.find((a) => a.pattern === "teleport");
  if (jump) {
    let hop = null;
    for (const h of attackTargets(state, jump.id).sort()) {
      if (!blasts([h]) && far(h) + 1 < bestScore && (!hop || far(h) < far(hop))) hop = h;
    }
    if (hop) return { t: "attack", attack: jump.id, target: hop };
  }
  return bestKey ? { t: "move", to: bestKey } : null;
}

// The bot's next commands for the current state: one action, with a turn first if it needs one.
// Eat when hungry; strike the goal when it can; roar into a crowd; take a rich strike; walk
// toward the goal; spend what AP is left on lesser strikes; end the turn.
export function plan(state) {
  if (state.result) return [];
  const eat = eatCommand(state);
  if (eat) return [eat];
  const all = strikes(state);
  const goal = all.filter((s) => s.goal);
  if (goal.length) return goal.reduce((a, b) => (b.value > a.value ? b : a)).cmds;
  const roar = roarCommand(state);
  if (roar) return [roar];
  const rich = all.filter((s) => s.value >= RICH);
  if (rich.length) return perAp(rich).cmds;
  const move = state.kaiju.ap > 0 ? moveCommand(state) : null;
  if (move) return [move];
  const lesser = all.filter((s) => s.value >= WORTH_IT);
  if (lesser.length) return perAp(lesser).cmds;
  return [{ t: "end" }];
}

// Play a whole mission. Returns the final state and every command sent.
export function playBot(setup, { maxSteps = 2000 } = {}) {
  let state = create(setup);
  const commands = [];
  for (let i = 0; i < maxSteps && !state.result; i++) {
    for (const cmd of plan(state)) {
      const out = step(state, cmd);
      // A refused order should not happen; if it does, the bot ends its turn rather than stall.
      const refused = out.events.length === 1 && out.events[0].k === "refuse";
      const sent = refused ? { t: "end" } : cmd;
      state = refused ? step(state, sent).state : out.state;
      commands.push(sent);
      if (refused || state.result) break;
    }
  }
  return { state, commands };
}

export const CELLS = [
  { mission: "fortress" },
  ...TARGETS.map((target) => ({ mission: "swathe", target })),
  { mission: "coast" },
];

export function setupFor(kaiju, cell, seed) {
  return {
    kaiju,
    mutations: [],
    mission: resolveMission(cell.mission, { seed, target: cell.target }),
    target: cell.target || null,
    seed,
  };
}

export function runCell(kaiju, cell, seeds) {
  const grades = { "total victory": 0, victory: 0, draw: 0, defeat: 0 };
  let wins = 0;
  let turns = 0;
  let score = 0;
  for (const seed of seeds) {
    const { state } = playBot(setupFor(kaiju, cell, seed));
    const r = state.result || { grade: "draw", score: { total: 0 } };
    grades[r.grade] += 1;
    if (r.grade === "victory" || r.grade === "total victory") wins += 1;
    turns += state.turn;
    score += r.score.total;
  }
  const n = seeds.length;
  return { wins: wins / n, turns: turns / n, score: score / n, grades };
}

function parseSeeds(arg) {
  if (!arg) return Array.from({ length: 20 }, (_, i) => i + 1);
  const m = /^(\d+)-(\d+)$/.exec(arg);
  if (m) return Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i);
  return Array.from({ length: Number(arg) }, (_, i) => i + 1);
}

function main() {
  const [seedArg, kaijuArg, cellArg] = process.argv.slice(2);
  const seeds = parseSeeds(seedArg);
  const kaijus = kaijuArg ? [kaijuArg] : Object.keys(KAIJU);
  const cells = cellArg ? CELLS.filter((c) => (c.target ? `${c.mission}:${c.target}` : c.mission) === cellArg) : CELLS;
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`seeds ${seeds[0]}..${seeds[seeds.length - 1]}`);
  console.log(`${pad("kaiju", 10)} ${pad("mission", 15)} ${pad("win", 5)} ${pad("turns", 6)} ${pad("score", 7)} TV/V/D/L`);
  const byKaiju = {};
  const byCell = {};
  for (const id of kaijus) {
    for (const cell of cells) {
      const name = cell.target ? `swathe:${cell.target}` : cell.mission;
      const r = runCell(id, cell, seeds);
      byKaiju[id] = (byKaiju[id] || 0) + r.wins / cells.length;
      byCell[name] = (byCell[name] || 0) + r.wins / kaijus.length;
      const g = r.grades;
      console.log(
        `${pad(id, 10)} ${pad(name, 15)} ${pad(Math.round(r.wins * 100) + "%", 5)} ${pad(r.turns.toFixed(1), 6)} ${pad(Math.round(r.score), 7)} ${g["total victory"]}/${g.victory}/${g.draw}/${g.defeat}`,
      );
    }
  }
  console.log("by kaiju: " + Object.entries(byKaiju).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", "));
  console.log("by mission: " + Object.entries(byCell).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", "));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
