// KAI-12 (issue #24, DESIGN 18.6): phase-out on the page. The forecast sheet keeps the hit chance and says
// how many of the hits pass through; the setup card says it in plain words; the cutaway reads a phased
// hit as THROUGH, which is neither a wound nor a miss.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/hex.js";
import { create, step, forecast } from "../src/rules.js";
import { RULES, KAIJU } from "../src/data/kaiju.js";
import { forecastSheet, oneIn, passiveText } from "../src/ui/panels.js";
import { buildScene } from "../src/ui/cutaway.js";
import { blank, putUnit, rigDice, setup } from "./fixtures.mjs";

function pair(kaiju, rival, extra = {}) {
  const m = blank({ objective: { kind: "rival" }, rivalStart: { at: [5, 0], facing: 3 }, rivalRetreat: [] });
  const s = create(setup(m, { kaiju, rival, ...extra }));
  s.rival.at = H.neighbor(s.kaiju.at, 0);
  return s;
}

const attacks = (events) => events.filter((e) => e.k === "attack");
const bite = (s) => ({ t: "attack", attack: "bite", target: s.rival.at });
const hitThenPhase = () => rigDice((m) => m.roll(100) <= 10 && m.roll(100) <= RULES.phaseOut);

test("the forecast sheet keeps the hit chance and says one in four pass through; return fire says so too", () => {
  const s = pair("radiosaur", "squamous");
  const html = forecastSheet(forecast(s, "bite", s.rival.at), { name: "Bite" });
  const hit = forecast(s, "bite", s.rival.at).targets[0].hitChance;
  assert.match(html, new RegExp(`<td class="num">${hit}%</td>`), "the hit cell is the chance to land");
  assert.match(html, new RegExp(`${oneIn(RULES.phaseOut)} of the hits pass through`));
  const sq = pair("squamous", "radiosaur");
  putUnit(sq, "tank", H.ray(sq.kaiju.at, 3, 2)[1]);
  const back = forecastSheet(forecast(sq, "grab", sq.rival.at), { name: "Tentacle grab" });
  assert.match(back, /\(55%, /, "the return-fire hit chance is not scaled");
  assert.match(back, new RegExp(`${oneIn(RULES.phaseOut)} hits that pass through you`));
  const plain = pair("radiosaur", "thalassor");
  assert.doesNotMatch(forecastSheet(forecast(plain, "bite", plain.rival.at), { name: "Bite" }), /pass through/);
});

test("oneIn says a chance in plain words", () => {
  assert.equal(oneIn(25), "one in four");
  assert.equal(oneIn(50), "one in two");
  assert.equal(oneIn(40), "40 in 100");
});

test("the setup card words for the passives are plain, and the phase-out one warns against trading blows", () => {
  const words = KAIJU.squamous.passives.map(passiveText).join(" ");
  assert.match(words, new RegExp(`${oneIn(RULES.phaseOut)} of the hits that land pass through`));
  assert.match(words, /must not stand and trade blows/);
  assert.doesNotMatch(words, /harder to hit/);
  assert.match(passiveText("eldritch"), new RegExp(`${RULES.eldritchAccuracy} points less likely to hit`));
  for (const id of Object.keys(KAIJU)) for (const p of KAIJU[id].passives) assert.ok(passiveText(p).length > 0, `${id}: ${p}`);
  assert.equal(passiveText("constructor"), "");
  assert.equal(passiveText("__proto__"), "");
});

test("the cutaway reads a phased hit as THROUGH, not as a miss and not as a wound", () => {
  const s = pair("radiosaur", "squamous");
  s.rng = hitThenPhase();
  const out = step(s, bite(s));
  const [e] = attacks(out.events);
  const scene = buildScene({ events: [e], start: 0, end: 0 }, s, out.state, out.events);
  assert.equal(scene.result.text, "THROUGH");
  assert.equal(scene.result.hit, false);
  assert.notEqual(scene.result.text, "MISS");
});
