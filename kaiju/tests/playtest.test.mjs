// A copied review ends with the build and the setup, so a playtest can be set up again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { create } from "../src/rules.js";
import { review, setupLine } from "../src/voice.js";
import { resolveMission } from "../src/data/missions.js";
import { VERSION, TITLE } from "../src/version.js";

const swathe = () => create({ kaiju: "squamous", mutations: ["gut", "reserves", "bulk"], mission: resolveMission("swathe", { seed: 39724, target: "plant" }), target: "plant", seed: 39724 });

test("the setup line names the build, the monster, the mission and the seed", () => {
  assert.equal(setupLine(swathe()), `${TITLE} ${VERSION}. Setup: squamous + gut+reserves+bulk, swathe:plant, seed 39724.`);
  const r = create({ kaiju: "radiosaur", mutations: [], mission: resolveMission("rampage", { seed: 5 }), objective: "killer", seed: 5 });
  assert.equal(setupLine(r), `${TITLE} ${VERSION}. Setup: radiosaur, rampage:killer, seed 5.`);
  const c = create({ kaiju: "thalassor", mutations: [], mission: resolveMission("coast", { seed: 7 }), seed: 7 });
  assert.match(setupLine(c), new RegExp(`^${TITLE} ${VERSION.replace(/\./g, "\\.")}\\. Setup: thalassor, coast vs (radiosaur|squamous|dairengo), seed 7\\.$`));
});

test("the copied review ends with the setup line, after a rule", () => {
  const s = swathe();
  const text = review(s, []).text.split("\n");
  assert.equal(text.at(-1), setupLine(s));
  assert.equal(text.at(-2), "---");
});

test("playtest 1's masthead follows from its seed: Issue 24, July 1981, on turn 2", () => {
  const s = swathe();
  s.turn = 2;
  assert.equal(review(s, []).issue, "Issue 24, July 1981");
});

// Playtest 002: "A low building came down. Of its kills, one went under its feet." The rules raise
// crush and eat for structures as well as units; only units are kills.
test("playtest 002: a building walked through or eaten is not a kill", () => {
  const s = create({ kaiju: "dairengo", mutations: ["reserves", "bulk"], mission: resolveMission("coast", { seed: 39724 }), seed: 39724 });
  const at = s.kaiju.at;
  const ev = (k, what, type) => ({ k, actor: "kaiju", who: s.kaiju.id, at, what, type, turn: 1, text: "" });
  const buildings = review(s, [ev("crush", "structure", "low"), ev("eat", "structure", "low")]).paragraphs[1];
  assert.doesNotMatch(buildings, /kills/, buildings);
  const units = review(s, [ev("crush", "unit", "infantry"), ev("eat", "unit", "tank")]).paragraphs[1];
  assert.match(units, /kills|walked over one/, units);
});
