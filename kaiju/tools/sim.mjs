// A headless greedy bot and a balance table. The bot plays the player's kaiju through rules.step:
// eat when hungry, roar into a crowd, use the best expected-value attack in reach, else walk
// toward the objective or the rival (in a rampage, toward whatever the objective values), else
// end the turn.
// Run from the repo root: node kaiju/tools/sim.mjs [seeds] [kaiju] [mission]
// A kaiju may take a variant after a colon: radiosaur:mekkasaurus.
// e.g. node kaiju/tools/sim.mjs 20, or node kaiju/tools/sim.mjs 1-20 radiosaur swathe:lab
// Rampage: node kaiju/tools/sim.mjs 1-20 all rampage plays every objective to the end (never
// withdrawing; a guard stops a run after turn 60) and prints the median total and turns lasted.
// Coast against a fixed rival: coast:squamous. Add :hero (coast:squamous:hero) and the bot fights
// only the rival (DESIGN 17.4). Both print a stuck column: the mean number of the player's turns
// per game in which the kaiju stood next to the rival with AP left and could not hurt it. stuck0
// counts the same turns but with full AP and energy given: stuck by parts and spent attacks alone.

import { pathToFileURL } from "node:url";
import * as H from "../src/hex.js";
import { create, step, reach, blastRisk, attackTargets, forecast, stompTargets, eatTargets, alive, rampageScore, starsFor, structureWeight, unitWeight } from "../src/rules.js";
import { KAIJU, RULES } from "../src/data/kaiju.js";
import { kaijuDef } from "../src/data/variants.js";
import { UNITS } from "../src/data/units.js";
import { TERRAIN, STRUCTURES } from "../src/data/terrain.js";
import { resolveMission, TARGETS, OBJECTIVES } from "../src/data/missions.js";

const OBJECTIVE_VALUE = 700;
const RIVAL_PER_HP = 40;
const WORTH_IT = 8;
const RICH = 35;
const LOW_BATTERY = 2;
const PANIC_WORTH = 0.4;
const TURN_GUARD = 60;
const EVEN = { structures: { all: 1 }, units: { all: 1 } };

// In a rampage, what the objective values; an objective that values nothing destroyed
// (Survival) plays as Balanced, since the army it kills cannot shoot back.
function weightsOf(state) {
  if (state.objective.kind !== "none") return EVEN;
  const w = state.objective.weights;
  const none = w.structures.all === 0 && !w.structures.populated && w.units.all === 0 && Object.keys(w.units).length === 1;
  return none ? EVEN : w;
}

const structureValue = (state, type) => STRUCTURES[type].points * structureWeight(weightsOf(state), type);
const unitValue = (state, type) => UNITS[type].points * unitWeight(weightsOf(state), type);

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
  if (state.objective.kind === "none") return rampageGoals(state);
  if (state.objective.at) {
    const st = state.map.hexes[state.objective.at].structure;
    return st && STRUCTURES[st.type].solid ? H.neighbors(state.objective.at) : [state.objective.at];
  }
  return [];
}

// A rampage has no objective hex: the bot heads for whatever the objective values, staying
// off power structures unless it feeds on them.
function rampageGoals(state) {
  const belly = state.kaiju.passives.includes("reactorBelly");
  const out = [];
  for (const [h, hex] of Object.entries(state.map.hexes)) {
    const st = hex.structure;
    if (st && (belly || !STRUCTURES[st.type].power) && structureValue(state, st.type) > 0) out.push(h);
  }
  for (const u of state.units) if (unitValue(state, u.type) > 0) out.push(...H.neighbors(u.at));
  return out;
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
      value += (p * mean * (isGoal ? OBJECTIVE_VALUE : structureValue(state, t.type))) / t.max;
    } else if (t.kind === "unit" && t.damage[1] === 0) {
      const u = state.units.find((x) => x.id === t.id);
      if (u && u.panicked === 0) value += PANIC_WORTH * unitValue(state, t.type) * breakChance(UNITS[t.type].morale, f.panic || 0);
    } else if (t.kind === "unit") {
      const kill = t.damage[0] >= t.hp ? 1 : mean / t.hp;
      value += p * unitValue(state, t.type) * kill;
    }
  }
  return { value, goal };
}

// Whether the bot may set off the power structure on this hex (§16.3). A lethal blast, never.
// A survivable one only on the objective. A monster with reactorBelly wants the blast.
// "A safe attack first" needs no test here: plan() takes the goal strike of most value, and an
// attack on the objective is never valued below a stomp on it. A move or an eat is only planned
// when no goal strike is open.
function blastAllowed(state, key) {
  const risk = blastRisk(state, key);
  if (!risk || risk.energy !== undefined) return true;
  return !risk.lethal && key === state.objective.at;
}

// What a forecast does to the rival kaiju: whether it can hurt it (a hit chance above 0 and a top
// damage above 0), and the expected damage, capped at the rival's hit points in the part struck.
function rivalEffect(f) {
  let hurts = false;
  let expected = 0;
  for (const t of f.targets) {
    if (t.kind !== "kaiju" || t.hitChance <= 0 || t.damage[1] <= 0) continue;
    hurts = true;
    expected += (t.hitChance / 100) * Math.min(t.hp, (t.damage[0] + t.damage[1]) / 2);
  }
  return { hurts, expected };
}

// Every strike open to the kaiju now: [{cmds, value, goal, ap, hurts, expected}], turning first
// where that helps. hurts and expected say what the strike does to the rival kaiju alone.
// Single attacks ignore facing; area attacks are tried in every facing. A stomp is listed even
// if it would set off a power structure; strikes() filters those.
function allStrikes(state) {
  const k = state.kaiju;
  const out = [];
  for (const d of [k.facing, 0, 1, 2, 3, 4, 5].filter((x, i, all) => all.indexOf(x) === i)) {
    const turned = d === k.facing ? state : { ...state, kaiju: { ...k, facing: d } };
    const face = d === k.facing ? [] : [{ t: "face", dir: d }];
    for (const a of kaijuDef(k.id, k.variant).attacks) {
      if (a.pattern === "teleport") continue;
      if (a.pattern === "single" && d !== k.facing) continue;
      const targets = attackTargets(turned, a.id);
      for (const target of a.pattern === "single" ? targets : targets.slice(0, 1)) {
        const f = forecast(turned, a.id, target);
        const w = worth(state, { ...f, panic: a.effects.panic });
        out.push({ cmds: [...face, { t: "attack", attack: a.id, target }], ...w, ap: a.ap, ...rivalEffect(f) });
      }
    }
    if (d === k.facing && k.ap >= RULES.stompAp) {
      for (const target of stompTargets(state)) {
        const f = forecast(state, "stomp", target);
        out.push({ cmds: [{ t: "stomp", target }], ...worth(state, f), ap: RULES.stompAp, stomp: target, ...rivalEffect(f) });
      }
    }
  }
  return out;
}

// Every strike open to the kaiju now, less any stomp that would set off a power structure
// unless blastAllowed.
export function strikes(state) {
  return allStrikes(state).filter((s) => !s.stomp || blastAllowed(state, s.stomp));
}

// Whether the kaiju, next to a living rival, has a legal command that can damage it: an attack
// or a stomp, after a free change of facing, whose forecast has a hit chance above 0 and a top
// damage above 0. False when there is no living rival, none adjacent, or no AP or energy for it.
// With fresh set, the kaiju is first given full AP and full energy, so the answer depends only on
// its parts and its spent once-a-mission attacks, as the KAI-11 test asks (DESIGN 17.2).
// A stomp that sets off a power structure is still legal, so it counts. (DESIGN 17.4)
export function canHurtRival(state, { fresh = false } = {}) {
  const k = state.kaiju;
  const r = state.rival;
  if (state.result || !alive(k) || !r || !alive(r) || H.distance(k.at, r.at) !== 1) return false;
  const from = fresh ? { ...state, kaiju: { ...k, ap: k.apMax, energy: kaijuDef(k.id, k.variant).energy.max } } : state;
  return allStrikes(from).some((s) => s.hurts);
}

const perAp = (list) => list.reduce((a, b) => (b.value / b.ap > a.value / a.ap ? b : a));

function hungry(k) {
  return k.hunger !== null && k.hunger >= Math.ceil(RULES.hungryAt * k.hungerMax) - 1;
}

function eatCommand(state) {
  const k = state.kaiju;
  if (!hungry(k) || k.ap < RULES.eatAp) return null;
  const safe = eatTargets(state).filter((h) => blastAllowed(state, h));
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
  if (kaijuDef(k.id, k.variant).energy.rule !== "battery" || k.energy > LOW_BATTERY) return null;
  const power = Object.keys(state.map.hexes).filter((h) => {
    const st = state.map.hexes[h].structure;
    return st && STRUCTURES[st.type].power;
  });
  if (!power.length) return null;
  return power.flatMap((h) => H.neighbors(h)).filter((h) => state.map.hexes[h] && !state.map.hexes[h].structure);
}

// A move toward the goal. Avoid stepping onto power structures unless the kaiju feeds on them,
// or the objective is one and the blast would not kill (blastAllowed).
function moveCommand(state) {
  const k = state.kaiju;
  const options = reach(state);
  const costs = goalCosts(state, chargeHexes(state) || goalHexes(state));
  const far = (h) => (costs.has(h) ? costs.get(h) : 999);
  const blasts = (path) => path.some((h) => !blastAllowed(state, h));
  // A kaiju that drinks the sea likes to stand in it, as the rival does.
  const wet = (h) => (kaijuDef(k.id, k.variant).energy.rule === "water" && TERRAIN[state.map.hexes[h].terrain].water ? 0.5 : 0);
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
  const jump = kaijuDef(k.id, k.variant).attacks.find((a) => a.pattern === "teleport");
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
// With hero set (DESIGN 17.4), the bot fights only the rival: it eats when hungry, strikes with
// whatever can damage the rival (most expected damage first, turning first), walks toward the
// rival, else ends the turn. It never roars at a crowd, and never strikes a unit or structure
// except as the other victim of a blow that also hurts the rival.
export function plan(state, { hero = false } = {}) {
  if (state.result) return [];
  const eat = eatCommand(state);
  if (eat) return [eat];
  if (hero) {
    const blows = strikes(state).filter((s) => s.hurts);
    if (blows.length) return blows.reduce((a, b) => (b.expected > a.expected ? b : a)).cmds;
    const move = state.kaiju.ap > 0 ? moveCommand(state) : null;
    return move ? [move] : [{ t: "end" }];
  }
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

// Play a whole mission. Returns the final state and every command sent. A rampage has no turn
// limit, so maxTurn stops it.
// stuck is the number of the player's turns in which, at some point, the kaiju stood next to a
// living rival with AP left and canHurtRival was false. It is checked where the bot decides.
// stuckFresh counts the same turns with canHurtRival(state, {fresh: true}): stuck even with full
// AP and energy, so by its parts and spent attacks alone.
export function playBot(setup, { maxSteps = 5000, maxTurn = TURN_GUARD, hero = false } = {}) {
  let state = create(setup);
  const commands = [];
  const stuckTurns = new Set();
  const freshTurns = new Set();
  for (let i = 0; i < maxSteps && !state.result && state.turn <= maxTurn; i++) {
    const k = state.kaiju;
    if (state.phase === "kaiju" && k.ap > 0 && state.rival && alive(state.rival) && H.distance(k.at, state.rival.at) === 1) {
      if (!canHurtRival(state)) stuckTurns.add(state.turn);
      if (!canHurtRival(state, { fresh: true })) freshTurns.add(state.turn);
    }
    for (const cmd of plan(state, { hero })) {
      const out = step(state, cmd);
      // A refused order should not happen; if it does, the bot ends its turn rather than stall.
      const refused = out.events.length === 1 && out.events[0].k === "refuse";
      const sent = refused ? { t: "end" } : cmd;
      state = refused ? step(state, sent).state : out.state;
      commands.push(sent);
      if (refused || state.result) break;
    }
  }
  return { state, commands, stuck: stuckTurns.size, stuckFresh: freshTurns.size };
}

export const CELLS = [
  { mission: "fortress" },
  ...TARGETS.map((target) => ({ mission: "swathe", target })),
  { mission: "coast" },
];

// "radiosaur" or "radiosaur:mekkasaurus": the kaiju id, and its variant or null.
export function splitKaiju(spec) {
  const [kaiju, variant = null] = String(spec).split(":");
  return { kaiju, variant: variant || null };
}

export function setupFor(spec, cell, seed) {
  return {
    ...splitKaiju(spec), // no mutations: a variant's preset applies, a plain kaiju takes none
    mission: resolveMission(cell.mission, { seed, target: cell.target }),
    target: cell.target || null,
    rival: cell.rival || "",
    seed,
  };
}

export function rampageSetup(spec, objective, seed) {
  return { ...splitKaiju(spec), mission: resolveMission("rampage", { seed }), objective, seed };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// One kaiju, one objective, every seed: the median total and turns lasted, and the deaths.
// A run the guard stops is scored as it stands.
export function runRampage(kaiju, objective, seeds) {
  const totals = [];
  const turns = [];
  const deaths = { cuts: 0, sudden: 0, lingering: 0, guard: 0 };
  for (const seed of seeds) {
    const { state } = playBot(rampageSetup(kaiju, objective, seed));
    const r = state.result;
    const turn = Math.min(state.turn, TURN_GUARD);
    totals.push(r ? r.score.total : rampageScore(state.objective.weights, state.tally.destroyed, turn).total);
    turns.push(turn);
    deaths[r ? r.death : "guard"] += 1;
  }
  return { total: median(totals), turns: median(turns), totals, deaths };
}

function rampageTable(seeds, kaijus) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`rampage, seeds ${seeds[0]}..${seeds[seeds.length - 1]}; median total and turns lasted`);
  console.log(`${pad("objective", 12)} ${kaijus.map((k) => pad(k, 12)).join(" ")} ${pad("all", 10)} stars at median (s2/s3/s4/s5)`);
  for (const id of Object.keys(OBJECTIVES)) {
    const all = [];
    const cells = kaijus.map((k) => {
      const r = runRampage(k, id, seeds);
      all.push(...r.totals);
      return pad(`${r.total} / ${r.turns}`, 12);
    });
    const m = median(all);
    console.log(`${pad(id, 12)} ${cells.join(" ")} ${pad(m, 10)} ${starsFor(OBJECTIVES[id].stars, m)} (${OBJECTIVES[id].stars.join("/")})`);
  }
}

export function runCell(kaiju, cell, seeds) {
  const grades = { "total victory": 0, victory: 0, draw: 0, defeat: 0 };
  let wins = 0;
  let turns = 0;
  let score = 0;
  let stuck = 0;
  let stuckFresh = 0;
  for (const seed of seeds) {
    const { state, stuck: s, stuckFresh: f } = playBot(setupFor(kaiju, cell, seed), { hero: !!cell.hero });
    stuck += s;
    stuckFresh += f;
    const r = state.result || { grade: "draw", score: { total: 0 } };
    grades[r.grade] += 1;
    if (r.grade === "victory" || r.grade === "total victory") wins += 1;
    turns += state.turn;
    score += r.score.total;
  }
  const n = seeds.length;
  return { wins: wins / n, turns: turns / n, score: score / n, stuck: stuck / n, stuckFresh: stuckFresh / n, grades };
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
  const kaijus = kaijuArg && kaijuArg !== "all" ? [kaijuArg] : Object.keys(KAIJU);
  for (const spec of kaijus) {
    const { kaiju, variant } = splitKaiju(spec);
    kaijuDef(kaiju, variant); // throws on an unknown kaiju or variant
  }
  if (cellArg === "rampage") {
    rampageTable(seeds, kaijus);
    return;
  }
  // coast:<rival> fixes the rival; plain coast leaves it to the seed, as the page does.
  // coast:<rival>:hero also plays the hero bot. Only these cells print the stuck column.
  const rivalArg = /^coast:(\w+)(:hero)?$/.exec(cellArg || "");
  if (rivalArg && !Object.hasOwn(KAIJU, rivalArg[1])) throw new Error(`Unknown rival: ${rivalArg[1]}`);
  const cells = rivalArg ? [{ mission: "coast", rival: rivalArg[1], hero: !!rivalArg[2] }]
    : cellArg ? CELLS.filter((c) => (c.target ? `${c.mission}:${c.target}` : c.mission) === cellArg) : CELLS;
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`seeds ${seeds[0]}..${seeds[seeds.length - 1]}`);
  const nameWidth = rivalArg ? 20 : 15;
  console.log(`${pad("kaiju", 22)} ${pad("mission", nameWidth)} ${pad("win", 5)} ${pad("turns", 6)} ${pad("score", 7)} ${pad("TV/V/D/L", rivalArg ? 9 : 0)}${rivalArg ? " stuck stuck0" : ""}`.trimEnd());
  const byKaiju = {};
  const byCell = {};
  for (const id of kaijus) {
    for (const cell of cells) {
      const name = cell.target ? `swathe:${cell.target}` : cell.rival ? `coast:${cell.rival}${cell.hero ? ":hero" : ""}` : cell.mission;
      const r = runCell(id, cell, seeds);
      byKaiju[id] = (byKaiju[id] || 0) + r.wins / cells.length;
      byCell[name] = (byCell[name] || 0) + r.wins / kaijus.length;
      const g = r.grades;
      console.log(
        `${pad(id, 22)} ${pad(name, nameWidth)} ${pad(Math.round(r.wins * 100) + "%", 5)} ${pad(r.turns.toFixed(1), 6)} ${pad(Math.round(r.score), 7)} ` +
          (rivalArg
            ? `${pad(`${g["total victory"]}/${g.victory}/${g.draw}/${g.defeat}`, 9)} ${pad(r.stuck.toFixed(2), 5)} ${r.stuckFresh.toFixed(2)}`
            : `${g["total victory"]}/${g.victory}/${g.draw}/${g.defeat}`),
      );
    }
  }
  console.log("by kaiju: " + Object.entries(byKaiju).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", "));
  console.log("by mission: " + Object.entries(byCell).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", "));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
