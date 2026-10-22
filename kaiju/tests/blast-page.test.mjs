// DESIGN §16.4: the words the page shows before a move, Wrong angle, stomp or eat that would set
// off a power structure. The words must name the range the rules then roll inside.
import { test } from "node:test";
import assert from "node:assert/strict";
import { create, step, reach, attackTargets, eatTargets } from "../src/rules.js";
import { blastWords } from "../src/voice.js";
import { blastPreview, blastHexes, hint, forecastSheet } from "../src/ui/panels.js";
import { forecast } from "../src/rules.js";
import { STRUCTURES } from "../src/data/terrain.js";
import { RULES } from "../src/data/kaiju.js";
import { blank, paint, setup, at } from "./fixtures.mjs";

// An open field with a plant at [5, 3] and a pylon at [8, 3]. The monster starts at [5, 7].
function field(kaiju = "squamous") {
  const m = blank({ objective: { kind: "destroy", at: [5, 3] } });
  paint(m, "features", 5, 3, "P");
  paint(m, "features", 8, 3, "T");
  return create(setup(m, { kaiju }));
}

const PLANT = STRUCTURES.plant.blast;

// "6–9" for a range of two numbers, as the page prints it.
const rangeOf = (d) => `${d[0]}–${d[1]}`;
const blastEvent = (events) => events.find((e) => e.k === "blast");

test("a move onto the plant: the words name the range, and the rules' blast falls inside it", () => {
  const s = field();
  s.kaiju.at = at(5, 4);
  s.kaiju.parts.body.hp = 99;
  const w = blastPreview(s, "move", at(5, 3));
  assert.equal(w.text, `Landing here sets off the power plant: ${rangeOf(PLANT)} damage.`);
  assert.equal(w.good, false);
  assert.equal(w.lethal, false);
  for (let seed = 1; seed <= 30; seed++) {
    const t = field();
    t.kaiju.at = at(5, 4);
    t.kaiju.parts.body.hp = 99;
    t.rng = seed;
    const b = blastEvent(step(t, { t: "move", to: at(5, 3) }).events);
    assert.ok(b.damage >= PLANT[0] && b.damage <= PLANT[1], `seed ${seed}: ${b.damage}`);
  }
});

test("a move onto a plain hex says nothing", () => {
  const s = field();
  assert.equal(blastPreview(s, "move", at(5, 6)), null);
  assert.equal(blastPreview(s, "move", "constructor"), null);
});

test("a move that walks through the plant to a hex beyond it names the blast on the way", () => {
  // A wall across row 3 with a gap at the plant, so the plant is the only way north.
  const m = blank({ objective: { kind: "destroy", at: [5, 3] } });
  for (let col = 0; col < 12; col++) paint(m, "features", col, 3, col === 5 ? "P" : "W");
  const s = create(setup(m, { kaiju: "squamous" }));
  s.kaiju.at = at(5, 4);
  s.kaiju.ap = 12;
  s.kaiju.parts.body.hp = 99;
  const all = reach(s);
  const through = Object.entries(all).find(([k, r]) => k !== at(5, 3) && r.path.includes(at(5, 3)));
  assert.ok(through, "some reachable hex has the plant on its path");
  const w = blastPreview(s, "move", through[0]);
  assert.equal(w.text, `Walking there sets off the power plant: ${rangeOf(PLANT)} damage.`);
  const b = blastEvent(step(s, { t: "move", to: through[0] }).events);
  assert.ok(b.damage >= PLANT[0] && b.damage <= PLANT[1]);
});

test("Wrong angle onto the plant: the same range, and the result falls inside it", () => {
  const s = field();
  s.kaiju.at = at(5, 6);
  s.kaiju.energy = 5;
  s.kaiju.parts.body.hp = 99;
  assert.ok(attackTargets(s, "angle").includes(at(5, 3)), "the plant is in Wrong angle's reach");
  const w = blastPreview(s, "teleport", at(5, 3));
  assert.equal(w.text, `Landing here sets off the power plant: ${rangeOf(PLANT)} damage.`);
  const b = blastEvent(step(s, { t: "attack", attack: "angle", target: at(5, 3) }).events);
  assert.ok(b.damage >= PLANT[0] && b.damage <= PLANT[1]);
});

test("the lethal sentence follows when the top of the range could finish the monster", () => {
  const s = field();
  s.kaiju.at = at(5, 4);
  s.kaiju.parts.body.hp = PLANT[1];
  const w = blastPreview(s, "move", at(5, 3));
  assert.equal(w.lethal, true);
  assert.match(w.text, /It could be the last thing the monster does\.$/);
  s.kaiju.parts.body.hp = PLANT[1] + 1;
  assert.doesNotMatch(blastPreview(s, "move", at(5, 3)).text, /last thing/);
});

test("a stomp says nothing when it cannot bring the plant down, and names the range when it can", () => {
  const s = field();
  s.kaiju.at = at(5, 4);
  s.kaiju.parts.body.hp = 99;
  const stompMax = RULES.stompDamage[1];
  assert.ok(STRUCTURES.plant.hp > stompMax, "a whole plant outlasts one stomp");
  assert.equal(blastPreview(s, "stomp", at(5, 3)), null);
  const before = step(s, { t: "stomp", target: at(5, 3) });
  assert.equal(blastEvent(before.events), undefined, "and the rules agree: no blast");

  // Worn down to the top of one stomp: it may fall, and if it does the blast is in range.
  s.map.hexes[at(5, 3)].structure.hp = stompMax;
  const w = blastPreview(s, "stomp", at(5, 3));
  assert.equal(w.text, `Stomping it may set off the power plant: ${rangeOf(PLANT)} damage.`);

  // Worn down to the bottom: it is certain.
  s.map.hexes[at(5, 3)].structure.hp = RULES.stompDamage[0];
  const sure = blastPreview(s, "stomp", at(5, 3));
  assert.equal(sure.text, `Stomping it sets off the power plant: ${rangeOf(PLANT)} damage.`);
  const fc = forecast(s, "stomp", at(5, 3));
  assert.ok(fc.targets[0].damage[0] >= fc.targets[0].hp, "the forecast agrees it falls");
  const b = blastEvent(step(s, { t: "stomp", target: at(5, 3) }).events);
  assert.ok(b.damage >= PLANT[0] && b.damage <= PLANT[1]);
});

test("a stomp on a pylon always sets it off, with the pylon's range", () => {
  const s = field();
  s.kaiju.at = at(8, 4);
  s.kaiju.parts.body.hp = 99;
  const P = STRUCTURES.pylon.blast;
  const w = blastPreview(s, "stomp", at(8, 3));
  assert.equal(w.text, `Stomping it sets off the pylon: ${rangeOf(P)} damage.`);
  const b = blastEvent(step(s, { t: "stomp", target: at(8, 3) }).events);
  assert.ok(b.damage >= P[0] && b.damage <= P[1]);
});

test("Radiosaur sees the energy form, and it is not a warning", () => {
  const s = field("radiosaur");
  s.kaiju.at = at(5, 4);
  s.kaiju.energy = 0;
  const w = blastPreview(s, "move", at(5, 3));
  assert.equal(w.text, `Landing here sets off the power plant: +${RULES.reactorBlastEnergy} energy.`);
  assert.equal(w.good, true);
  assert.equal(w.lethal, false);
  const out = step(s, { t: "move", to: at(5, 3) });
  assert.equal(blastEvent(out.events).energy, RULES.reactorBlastEnergy);
  assert.equal(out.state.kaiju.energy, RULES.reactorBlastEnergy);
});

test("Radiosaur eating the plant is told the eat figure, which is not the blast figure", () => {
  const s = field("radiosaur");
  s.kaiju.at = at(5, 4);
  s.kaiju.energy = 0;
  assert.ok(eatTargets(s).includes(at(5, 3)));
  const w = blastPreview(s, "eat", at(5, 3));
  assert.equal(w.good, true);
  assert.match(w.text, new RegExp(`\\+${RULES.reactorEatEnergy} energy\\.$`));
  assert.notEqual(RULES.reactorEatEnergy, RULES.reactorBlastEnergy);
  assert.equal(step(s, { t: "eat", target: at(5, 3) }).state.kaiju.energy, RULES.reactorEatEnergy);
});

test("blastWords: two blasts on one walk add up, and together they can be lethal", () => {
  const risks = [{ type: "pylon", name: "Pylon", damage: [2, 3] }, { type: "plant", name: "Power plant", damage: [6, 9] }];
  const w = blastWords(risks, "cross", { hp: 12 });
  assert.equal(w.text, "Walking there sets off the pylon and the power plant: 8–12 damage in all. It could be the last thing the monster does.");
  assert.equal(blastWords(risks, "cross", { hp: 13 }).lethal, false);
});

test("the hint bar and the forecast sheet carry the words, marked so they read without colour", () => {
  const s = field();
  s.kaiju.at = at(5, 4);
  s.kaiju.parts.body.hp = PLANT[1];
  const w = blastPreview(s, "move", at(5, 3));
  const bar = hint({ text: "Walk 1 hex.", confirm: "Go", cancel: "Cancel", blast: w });
  assert.ok(bar.includes(w.text));
  assert.match(bar, /class="hint-blast blast-note bad lethal"/);
  assert.match(bar, /<svg class="blast-badge"/);

  s.map.hexes[at(5, 3)].structure.hp = 1;
  const sw = blastPreview(s, "stomp", at(5, 3));
  const sheet = forecastSheet(forecast(s, "stomp", at(5, 3)), { name: "Stomp", blast: sw });
  assert.ok(sheet.includes(sw.text));
  assert.match(sheet, /class="fc-blast blast-note bad lethal"/);
  assert.ok(!forecastSheet(forecast(s, "stomp", at(5, 3)), { name: "Stomp" }).includes("blast-note"), "no note when nothing goes up");

  const good = hint({ text: "x", blast: { text: "Landing here sets off the power plant: +5 energy.", good: true, lethal: false } });
  assert.match(good, /blast-note good"/);
});

test("the lit hexes that would blast: a triangle for a risk, a circle for good news, a plain hex none", () => {
  const s = field();
  s.kaiju.at = at(5, 4);
  const lit = [at(5, 3), at(5, 5)];
  assert.deepEqual(blastHexes(s, "move", lit), { danger: [at(5, 3)], good: [] });
  assert.deepEqual(blastHexes(s, "teleport", lit), { danger: [at(5, 3)], good: [] });
  const r = field("radiosaur");
  r.kaiju.at = at(5, 4);
  assert.deepEqual(blastHexes(r, "move", lit), { danger: [], good: [at(5, 3)] });
});

// The battery has a top. The words promise only what changeEnergy will pay.
test("Radiosaur near a full battery is told the gain the rules will pay, not the flat figure", () => {
  const s = field("radiosaur");
  s.kaiju.at = at(5, 4);
  const room = 2;
  s.kaiju.energy = s.kaiju.energyMax - room;
  const w = blastPreview(s, "move", at(5, 3));
  assert.equal(w.text, `Landing here sets off the power plant: +${room} energy.`);
  assert.equal(w.good, true);
  const out = step(s, { t: "move", to: at(5, 3) });
  assert.equal(out.state.kaiju.energy - (s.kaiju.energyMax - room), room);
});

test("Radiosaur with a full battery is told there is nothing to gain", () => {
  const s = field("radiosaur");
  s.kaiju.at = at(5, 4);
  s.kaiju.energy = s.kaiju.energyMax;
  const w = blastPreview(s, "move", at(5, 3));
  assert.equal(w.text, "Landing here sets off the power plant: the battery is already full.");
  assert.equal(w.good, true);
  assert.equal(w.lethal, false);
  assert.equal(step(s, { t: "move", to: at(5, 3) }).state.kaiju.energy, s.kaiju.energyMax);
  assert.doesNotMatch(w.text, /\+0/);
});

test("eating a power structure near a full battery is told the capped gain", () => {
  const s = field("radiosaur");
  s.kaiju.at = at(5, 4);
  s.kaiju.energy = s.kaiju.energyMax - 1;
  const w = blastPreview(s, "eat", at(5, 3));
  assert.equal(w.text, "Eating it takes the power plant's charge: +1 energy.");
  assert.equal(step(s, { t: "eat", target: at(5, 3) }).state.kaiju.energy, s.kaiju.energyMax);
  s.kaiju.energy = s.kaiju.energyMax;
  assert.equal(blastPreview(s, "eat", at(5, 3)).text, "Eating it takes the power plant's charge: the battery is already full.");
});

test("blastWords: a walk through two power hexes caps the sum at the room left", () => {
  const risks = [{ type: "pylon", name: "Pylon", energy: 5 }, { type: "pylon", name: "Pylon", energy: 5 }];
  assert.equal(blastWords(risks, "cross").text, "Walking there sets off the pylon and the pylon: +10 energy.");
  assert.equal(blastWords(risks, "cross", { room: 7 }).text, "Walking there sets off the pylon and the pylon: +7 energy.");
  assert.equal(blastWords(risks, "cross", { room: 0 }).text, "Walking there sets off the pylon and the pylon: the battery is already full.");
});
