// DESIGN §16: blastRisk in the rules, and the bot that no longer walks into a lethal blast
// (issue #25, from playtest 001).
import { test } from "node:test";
import assert from "node:assert/strict";
import { create, step, blastRisk } from "../src/rules.js";
import { plan, playBot } from "../tools/sim.mjs";
import { resolveMission } from "../src/data/missions.js";
import { STRUCTURES } from "../src/data/terrain.js";
import { RULES } from "../src/data/kaiju.js";
import { blank, paint, setup, at } from "./fixtures.mjs";

// An open field with a power plant (the objective) at [5, 3], a pylon at [8, 3], a low building
// at [8, 5], and the given kaiju at the start hex.
function field(kaiju = "squamous") {
  const m = blank({ objective: { kind: "destroy", at: [5, 3] } });
  paint(m, "features", 5, 3, "P");
  paint(m, "features", 8, 3, "T");
  paint(m, "features", 8, 5, "1");
  return create(setup(m, { kaiju }));
}

test("blastRisk: a plant gives its range, from the structure data", () => {
  const s = field();
  const r = blastRisk(s, at(5, 3));
  assert.deepEqual(r, { type: "plant", name: "Power plant", damage: STRUCTURES.plant.blast });
  assert.deepEqual(blastRisk(s, at(8, 3)), { type: "pylon", name: "Pylon", damage: STRUCTURES.pylon.blast });
});

test("blastRisk: a plain hex, a building and a hex off the map are null", () => {
  const s = field();
  assert.equal(blastRisk(s, at(0, 0)), null);
  assert.equal(blastRisk(s, at(8, 5)), null);
  assert.equal(blastRisk(s, "99,99"), null);
  assert.equal(blastRisk(s, "constructor"), null);
});

test("blastRisk: a reactorBelly monster gets energy, not damage", () => {
  const s = field("radiosaur");
  assert.deepEqual(blastRisk(s, at(5, 3)), { type: "plant", name: "Power plant", energy: RULES.reactorBlastEnergy });
});

test("blastRisk: lethal when the top of the range reaches the body's hit points", () => {
  const s = field();
  const [, hi] = STRUCTURES.plant.blast;
  s.kaiju.parts.body.hp = hi + 1;
  assert.equal(blastRisk(s, at(5, 3)).lethal, undefined);
  s.kaiju.parts.body.hp = hi;
  assert.equal(blastRisk(s, at(5, 3)).lethal, true);
  s.kaiju.parts.body.hp = 1;
  assert.equal(blastRisk(s, at(5, 3)).lethal, true);
  assert.equal(blastRisk(s, at(8, 3)).lethal, true, "a pylon's top damage is 3");
  s.kaiju.parts.body.hp = STRUCTURES.pylon.blast[1] + 1;
  assert.equal(blastRisk(s, at(8, 3)).lethal, undefined);
});

test("blastRisk: the damage it gives is the damage the blast does", () => {
  const [lo, hi] = STRUCTURES.plant.blast;
  const s = field();
  s.kaiju.parts.body.hp = 99;
  const out = step(s, { t: "move", to: at(5, 3) });
  const blast = out.events.find((e) => e.k === "blast");
  assert.ok(blast.damage >= lo && blast.damage <= hi);
});


// The bot: a lethal blast is never taken, a survivable one on the objective only when no safe
// attack is in reach.
test("the bot walks onto the objective plant when it is far from an attack and the blast is survivable", () => {
  const s = field();
  assert.deepEqual(plan(s), [{ t: "move", to: at(5, 3) }]);
});

test("the bot will not walk onto the objective plant when the blast could kill it", () => {
  const s = field();
  s.kaiju.parts.body.hp = STRUCTURES.plant.blast[1];
  const cmds = plan(s);
  assert.ok(!cmds.some((c) => c.to === at(5, 3)), JSON.stringify(cmds));
  // It still walks toward the plant, to stop short and break it with an attack.
  assert.equal(cmds[0].t, "move");
});

// Beside the plant with one AP left: a stomp is the only way to strike it.
function besidePlant(hp) {
  const s = field();
  s.kaiju.at = at(5, 4);
  s.kaiju.ap = RULES.stompAp;
  s.kaiju.parts.body.hp = hp;
  return s;
}

test("the bot stomps the objective plant when the blast is survivable and no attack is left", () => {
  assert.deepEqual(plan(besidePlant(21)), [{ t: "stomp", target: at(5, 3) }]);
});

test("the bot does not stomp the objective plant when the blast could kill it", () => {
  assert.deepEqual(plan(besidePlant(STRUCTURES.plant.blast[1])), [{ t: "end" }]);
});

// With no special gate: plan() takes the goal strike of most value, and the attack outvalues the stomp.
test("the bot attacks the plant rather than stomp it when it has the AP for an attack", () => {
  const s = besidePlant(21);
  s.kaiju.ap = 6;
  const [cmd] = plan(s);
  assert.equal(cmd.t, "attack");
  assert.equal(cmd.target, at(5, 3));
});

test("a monster that feeds on the blast still walks onto the plant", () => {
  const s = field("radiosaur");
  s.kaiju.parts.body.hp = 1; // the energy is the same at any hit points
  assert.deepEqual(plan(s), [{ t: "move", to: at(5, 3) }]);
});

// Replay a bot game's commands and collect the events.
function eventsOf(setupArg) {
  const { commands, state: end } = playBot(setupArg);
  let state = create(setupArg);
  const events = [];
  for (const c of commands) {
    const out = step(state, c);
    events.push(...out.events);
    state = out.state;
  }
  return { events, end };
}

test("playtest 001: the bot on seed 39724 does not take the plant's blast", () => {
  const swathe = { kaiju: "squamous", mutations: ["gut", "reserves", "bulk"], mission: resolveMission("swathe", { seed: 39724, target: "plant" }), target: "plant", seed: 39724 };
  const { events, end } = eventsOf(swathe);
  assert.deepEqual(events.filter((e) => e.k === "blast"), []);
  assert.notEqual(end.result && end.result.death, "sudden");
});

test("Radiosaur still sets off power structures when it pays: some game on seeds 1-20 does", () => {
  let blasts = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const swathe = { kaiju: "radiosaur", mutations: [], mission: resolveMission("swathe", { seed, target: "plant" }), target: "plant", seed };
    blasts += eventsOf(swathe).events.filter((e) => e.k === "blast" && e.energy === RULES.reactorBlastEnergy).length;
  }
  assert.ok(blasts > 0, "Radiosaur took no blast on seeds 1-20 of swathe:plant");
});
