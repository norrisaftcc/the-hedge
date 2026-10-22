// One bot game, and where the monster's damage came from, turn by turn. For reading a playtest
// against the bot, and for balance work on toughness (#24).
// Run from the repo root: node kaiju/tools/damage.mjs <seed> <kaiju>[+mutation...] <mission>
// mission is as sim.mjs takes it: fortress, swathe:plant, coast, coast:squamous, rampage:killer.
// e.g. node kaiju/tools/damage.mjs 39724 squamous+gut+reserves+bulk swathe:plant
import { pathToFileURL } from "node:url";
import { replayEvents } from "../src/rules.js";
import { resolveMission } from "../src/data/missions.js";
import { playBot } from "./sim.mjs";

export function damageTable(seed, kaijuArg, missionArg) {
  const [kaiju, ...mutations] = kaijuArg.split("+");
  const [mission, extra] = missionArg.split(":");
  const setup = { kaiju, mutations, seed, mission: resolveMission(mission, { seed, target: mission === "swathe" ? extra : undefined }) };
  if (mission === "swathe") setup.target = extra;
  if (mission === "coast" && extra) setup.rival = extra;
  if (mission === "rampage") setup.objective = extra || "balanced";
  const { commands } = playBot(setup);
  const { state, events } = replayEvents(setup, commands);
  const turns = {};
  const add = (turn, who, n) => { turns[turn] = turns[turn] || {}; turns[turn][who] = (turns[turn][who] || 0) + n; };
  for (const e of events) {
    if (e.k === "attack" && e.defender && e.defender.side === "kaiju" && e.hit && e.damage > 0) {
      add(e.turn, e.attacker.side === "unit" ? e.attacker.type : `rival ${state.rival ? state.rival.id : ""}`.trim(), e.damage);
    } else if (e.k === "blast" && e.actor === "kaiju" && e.damage) add(e.turn, `blast (${e.type})`, e.damage);
    else if (e.k === "hurt" && e.actor === "kaiju") add(e.turn, e.why || "hurt", e.damage);
  }
  return { state, turns };
}

function main() {
  const [seedArg, kaijuArg, missionArg] = process.argv.slice(2);
  if (!seedArg || !kaijuArg || !missionArg) {
    console.log("usage: node kaiju/tools/damage.mjs <seed> <kaiju>[+mutation...] <mission>");
    process.exit(2);
  }
  const { state, turns } = damageTable(Number(seedArg), kaijuArg, missionArg);
  const r = state.result || {};
  console.log(`${kaijuArg} ${missionArg} seed ${seedArg}: ${r.grade || "unfinished"} on turn ${state.turn}${r.death ? `, death: ${r.death}` : ""}`);
  let total = 0;
  for (const [turn, by] of Object.entries(turns)) {
    const sum = Object.values(by).reduce((a, b) => a + b, 0);
    total += sum;
    console.log(`turn ${turn}: ${sum} (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  }
  console.log(`total ${total}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
