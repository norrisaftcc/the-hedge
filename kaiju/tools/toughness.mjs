// How tough a monster is against the army, measured from bot games (#24, DESIGN §18.4).
// For each shooter type: shots at the monster, and the mean damage per shot (misses count as 0).
// Also the mean turns played and the mean damage taken per turn, from every source.
// Run from the repo root: node kaiju/tools/toughness.mjs <seeds> <kaiju>[:variant][+mutation...] [mission...]
// e.g. node kaiju/tools/toughness.mjs 21-60 squamous fortress swathe:plant coast
// The missions default to fortress, swathe:plant, swathe:lab, swathe:leyline and coast.
// These are the bot's games: it sprints, so a monster may be shot at less than a person's would be.
import { pathToFileURL } from "node:url";
import { replayEvents } from "../src/rules.js";
import { resolveMission } from "../src/data/missions.js";
import { playBot, splitKaiju } from "./sim.mjs";

const MISSIONS = ["fortress", "swathe:plant", "swathe:lab", "swathe:leyline", "coast"];

function setupOf(seed, kaijuArg, missionArg) {
  const [spec, ...mutations] = kaijuArg.split("+");
  const [mission, extra] = missionArg.split(":");
  const setup = { ...splitKaiju(spec), seed, mission: resolveMission(mission, { seed, target: mission === "swathe" ? extra : undefined }) };
  if (mutations.length) setup.mutations = mutations;
  if (mission === "swathe") setup.target = extra;
  if (mission === "coast" && extra) setup.rival = extra;
  return setup;
}

export function toughness(seeds, kaijuArg, missions = MISSIONS) {
  const shots = {};
  let games = 0;
  let turns = 0;
  let taken = 0;
  for (const missionArg of missions) {
    for (const seed of seeds) {
      const setup = setupOf(seed, kaijuArg, missionArg);
      const { commands } = playBot(setup);
      const { state, events } = replayEvents(setup, commands);
      games += 1;
      turns += state.turn;
      for (const e of events) {
        const atMonster = e.k === "attack" && e.defender && e.defender.side === "kaiju";
        if (atMonster && e.attacker.side === "unit") {
          const s = (shots[e.attacker.type] = shots[e.attacker.type] || { n: 0, damage: 0 });
          s.n += 1;
          s.damage += e.hit ? e.damage : 0;
        }
        if (atMonster && e.hit) taken += e.damage;
        else if (e.k === "blast" && e.actor === "kaiju" && e.damage) taken += e.damage;
        else if (e.k === "hurt" && e.actor === "kaiju") taken += e.damage;
      }
    }
  }
  return { games, turns: turns / games, perTurn: taken / turns, shots };
}

function parseSeeds(arg) {
  const [a, b] = arg.split("-").map(Number);
  return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i);
}

function main() {
  const [seedArg, kaijuArg, ...missions] = process.argv.slice(2);
  if (!seedArg || !kaijuArg) {
    console.log("usage: node kaiju/tools/toughness.mjs <seeds> <kaiju>[:variant][+mutation...] [mission...]");
    process.exit(2);
  }
  const r = toughness(parseSeeds(seedArg), kaijuArg, missions.length ? missions : MISSIONS);
  console.log(`${kaijuArg}, ${r.games} games: ${r.turns.toFixed(1)} turns, ${r.perTurn.toFixed(2)} damage taken a turn`);
  for (const [type, s] of Object.entries(r.shots).sort()) {
    console.log(`  ${type.padEnd(12)} ${String(s.n).padStart(5)} shots  ${(s.damage / s.n).toFixed(2)} a shot`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
