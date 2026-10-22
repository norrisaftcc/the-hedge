// KAI-12 (issue #24, DESIGN 18): phase-out. The Squamous One, and Meow'thprrtep by inheritance, lets
// a hit that landed pass through, RULES.phaseOut percent of the time. The rules roll it on the seeded
// dice after the hit roll. A blast never asks. The forecast keeps the hit chance and reports the phase
// chance beside it, and the voice names the part the hit crossed without rolling anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/hex.js";
import { create, step, forecast, phaseChance, replayEvents } from "../src/rules.js";
import { RULES, KAIJU, PART_SLOTS } from "../src/data/kaiju.js";
import { kaijuDef, VARIANTS } from "../src/data/variants.js";
import { say, LINES } from "../src/voice.js";
import { playBot, setupFor } from "../tools/sim.mjs";
import { blank, paint, putUnit, rigDice, setup, at } from "./fixtures.mjs";

// An open field, the player's kaiju at the start hex, the rival one hex to its east.
function pair(kaiju, rival, extra = {}) {
  const m = blank({ objective: { kind: "rival" }, rivalStart: { at: [5, 0], facing: 3 }, rivalRetreat: [] });
  const s = create(setup(m, { kaiju, rival, ...extra }));
  s.rival.at = H.neighbor(s.kaiju.at, 0);
  return s;
}

const attacks = (events) => events.filter((e) => e.k === "attack");
const bite = (s) => ({ t: "attack", attack: "bite", target: s.rival.at });
// Dice whose next two rolls are a hit and a pass (or a fail) of the phase roll.
const hitThenPhase = () => rigDice((m) => m.roll(100) <= 10 && m.roll(100) <= RULES.phaseOut);
const hitThenSolid = () => rigDice((m) => m.roll(100) <= 10 && m.roll(100) > RULES.phaseOut);

test("only the Squamous One and Meow'thprrtep can phase out; every other kaiju and look cannot", () => {
  assert.ok(RULES.phaseOut > 0 && RULES.phaseOut < 100, "one number in RULES, a percent");
  for (const [id, def] of Object.entries(KAIJU)) {
    assert.equal(def.passives.includes("phaseOut"), id === "squamous", id);
  }
  for (const v of Object.values(VARIANTS)) {
    assert.equal(kaijuDef(v.of, v.id).passives.includes("phaseOut"), v.of === "squamous", v.id);
  }
  for (const [id, variant] of [["squamous", null], ["squamous", "meowthprrtep"], ["radiosaur", null], ["thalassor", null], ["dairengo", null]]) {
    const k = create(setup(blank(), { kaiju: id, variant })).kaiju;
    assert.equal(phaseChance(k), id === "squamous" ? RULES.phaseOut : 0, `${id}/${variant}`);
  }
});

test("Meow'thprrtep inherits the passive from the Squamous One's data, with no line of its own", () => {
  assert.equal(VARIANTS.meowthprrtep.change?.passives, undefined);
  assert.deepEqual(kaijuDef("squamous", "meowthprrtep").passives, KAIJU.squamous.passives);
});

test("a phased hit does no damage, names the part it crossed, and leaves the monster as it was", () => {
  const s = pair("radiosaur", "squamous");
  s.rng = hitThenPhase();
  const out = step(s, bite(s));
  const [e] = attacks(out.events);
  assert.equal(e.hit, true);
  assert.equal(e.phased, true);
  assert.equal(e.damage, 0);
  assert.equal(e.spill, 0);
  assert.ok(PART_SLOTS.includes(e.part), `part ${e.part}`);
  assert.deepEqual(e.before, e.after);
  assert.deepEqual(out.state.rival.parts, s.rival.parts, "no part lost a hit point");
  const partName = kaijuDef("squamous").parts[e.part].name.toLowerCase().replace(/^the /, "");
  assert.ok(e.text.toLowerCase().includes(partName), `"${e.text}" names the ${partName}`);
  assert.ok(!/[!{}]|undefined|NaN/.test(e.text), e.text);
});

test("the same hit with a failed phase roll does its damage, and its event does not say phased", () => {
  const s = pair("radiosaur", "squamous");
  s.rng = hitThenSolid();
  const [e] = attacks(step(s, bite(s)).events);
  assert.equal(e.hit, true);
  assert.equal(e.phased, undefined);
  assert.ok(e.damage > 0);
});

test("a monster without the passive never phases, on the very dice that phase the Squamous One", () => {
  for (const rival of ["thalassor", "radiosaur", "dairengo"]) {
    const s = pair(rival === "radiosaur" ? "thalassor" : "radiosaur", rival);
    s.rng = hitThenPhase();
    const [e] = attacks(step(s, s.kaiju.id === "radiosaur" ? bite(s) : { t: "attack", attack: "fist", target: s.rival.at }).events);
    assert.equal(e.phased, undefined, rival);
    if (e.hit) assert.ok(e.damage > 0, rival);
  }
});

test("a miss is not a phase: a missed shot rolls no phase and says hit: false", () => {
  const s = pair("radiosaur", "squamous");
  s.rng = rigDice((m) => m.roll(100) > 95 && m.roll(100) <= RULES.phaseOut);
  const [e] = attacks(step(s, bite(s)).events);
  assert.equal(e.hit, false);
  assert.equal(e.phased, undefined);
});

test("a rival Squamous One phases the player's hits, and Meow'thprrtep as rival does the same", () => {
  for (const rivalVariant of [null, "meowthprrtep"]) {
    const s = pair("radiosaur", "squamous", { rivalVariant });
    s.rng = hitThenPhase();
    const [e] = attacks(step(s, bite(s)).events);
    assert.equal(e.phased, true, `rival ${rivalVariant || "squamous"}`);
    assert.equal(e.defender.side, "rival");
    if (rivalVariant) {
      const names = Object.values(VARIANTS[rivalVariant].parts).map((p) => p.name.toLowerCase().replace(/^the /, ""));
      assert.ok(names.some((n) => e.text.toLowerCase().includes(n)), `"${e.text}" uses a part name of ${rivalVariant}`);
      assert.ok(e.text.includes(VARIANTS[rivalVariant].name), e.text);
    }
  }
});

test("the rival and the army phase out on the player's Squamous One too", () => {
  let byRival = 0;
  let byUnit = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = pair("squamous", "radiosaur");
    s.rng = seed;
    putUnit(s, "tank", H.ray(s.kaiju.at, 3, 2)[1]);
    const events = attacks(step(s, { t: "end" }).events).filter((e) => e.defender.side === "kaiju");
    for (const e of events) {
      if (!e.phased) continue;
      assert.equal(e.damage, 0);
      if (e.attacker.side === "rival") byRival += 1;
      if (e.attacker.side === "unit") byUnit += 1;
    }
  }
  assert.ok(byRival > 0, "the rival's blows phase out");
  assert.ok(byUnit > 0, "the army's shots phase out");
});

// 4000 seeded games of one bite at a Squamous One: the share of landed hits that pass through.
test("over 4000 seeded bites the phase rate is near RULES.phaseOut, and the forecast says the same number", (t) => {
  const SEEDS = 4000;
  let landed = 0;
  let phased = 0;
  let said = null;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const s = pair("radiosaur", "squamous");
    s.rng = seed;
    said = forecast(s, "bite", s.rival.at).targets[0].phase;
    const [e] = attacks(step(s, bite(s)).events);
    if (!e.hit) continue;
    landed += 1;
    if (e.phased) phased += 1;
  }
  const rate = (100 * phased) / landed;
  t.diagnostic(`${phased} of ${landed} landed hits phased: ${rate.toFixed(1)}% (${SEEDS} seeded bites)`);
  assert.equal(said, RULES.phaseOut, "the forecast reports the rules' number");
  assert.ok(landed > 2000, `${landed} landed hits of ${SEEDS}`);
  // Four standard errors of a rate near 25% over about 2600 hits is about 3.4 points.
  assert.ok(Math.abs(rate - RULES.phaseOut) < 4, `${phased} of ${landed} landed hits phased: ${rate.toFixed(1)}%`);
});

test("a blast never phases: it rolls no phase die and does the damage it always did", () => {
  const [lo, hi] = [6, 9];
  for (let seed = 1; seed <= 200; seed++) {
    const run = (strip) => {
      const m = blank({ objective: { kind: "destroy", at: [5, 3] } });
      paint(m, "features", 5, 3, "P");
      const s = create(setup(m, { kaiju: "squamous", mutations: ["bulk"] }));
      s.rng = seed;
      s.kaiju.parts.body.hp = 99;
      if (strip) s.kaiju.passives = s.kaiju.passives.filter((p) => p !== "phaseOut");
      return step(s, { t: "move", to: at(5, 3) }).events.find((e) => e.k === "blast");
    };
    const withPhase = run(false);
    const without = run(true);
    assert.ok(withPhase.damage >= lo && withPhase.damage <= hi, `seed ${seed}: ${withPhase.damage}`);
    assert.equal(withPhase.phased, undefined);
    assert.deepEqual(withPhase, { ...without, text: withPhase.text }, `seed ${seed}: the passive changed the blast`);
  }
});

test("forecast and step agree: the phase chance is on the target, on return fire, and on the rival's blow", () => {
  const s = pair("radiosaur", "squamous");
  putUnit(s, "tank", H.ray(s.kaiju.at, 3, 2)[1]);
  const fc = forecast(s, "bite", s.rival.at);
  assert.equal(fc.targets[0].phase, RULES.phaseOut);
  const noPhase = pair("radiosaur", "squamous");
  noPhase.rival.passives = noPhase.rival.passives.filter((p) => p !== "phaseOut");
  assert.equal(fc.targets[0].hitChance, forecast(noPhase, "bite", noPhase.rival.at).targets[0].hitChance, "the hit chance does not fold the phase in");
  assert.equal(forecast(noPhase, "bite", noPhase.rival.at).targets[0].phase, 0);
  assert.ok(fc.returnFire.every((r) => r.phase === 0), "the radiosaur has no phase-out");
  const sq = pair("squamous", "radiosaur");
  putUnit(sq, "tank", H.ray(sq.kaiju.at, 3, 2)[1]);
  const back = forecast(sq, "grab", sq.rival.at);
  assert.ok(back.returnFire.length > 0);
  for (const r of back.returnFire) assert.equal(r.phase, RULES.phaseOut, r.name);
  assert.equal(back.returnFire.find((r) => r.type === "tank").hitChance, 55, "the tank's 65, less the eldritch 10; the phase is beside it");
  const slam = forecast(pair("radiosaur", "squamous"), "slam", pair("radiosaur", "squamous").rival.at);
  assert.equal(slam.targets[0].phase, RULES.phaseOut);
  const none = pair("radiosaur", "thalassor");
  assert.equal(forecast(none, "bite", none.rival.at).targets[0].phase, 0);
});

test("the voice: every phased line names the part and has no exclamation mark, and none is a miss line", () => {
  for (const table of [LINES.attack.phasedUnit, LINES.attack.phasedKaiju]) {
    assert.ok(table.length >= 4);
    for (const line of table) {
      assert.ok(line.includes("{part}"), line);
      assert.ok(!line.includes("!"), line);
      for (const miss of [...LINES.attack.unitMissesKaiju, ...LINES.attack.kaijuMissesKaiju]) assert.notEqual(line, miss);
    }
  }
});

test("the voice names the part from the event, picks by turn and hex, and rolls no dice", () => {
  const phasedEvent = (over) => ({
    attacker: { side: "unit", id: "u1", type: "tank" },
    defender: { side: "kaiju", id: "kaiju", type: "squamous" },
    attack: { id: "fire", name: "Main gun" },
    hit: true, phased: true, damage: 0, part: "head", rear: false, spill: 0, turn: 1, at: "5,7", ...over,
  });
  const seen = new Set();
  for (let turn = 0; turn < 8; turn++) {
    for (const part of PART_SLOTS) {
      for (const attacker of [{ side: "unit", id: "u1", type: "tank" }, { side: "rival", id: "rival", type: "dairengo" }]) {
        const e = phasedEvent({ turn, part, attacker, attack: attacker.side === "unit" ? { id: "fire", name: "Main gun" } : { id: "fist", name: "Rocket fist" } });
        const text = say("attack", e);
        assert.equal(say("attack", e), text, "the same event says the same thing");
        const name = KAIJU.squamous.parts[part].name.toLowerCase().replace(/^the /, "");
        assert.ok(text.toLowerCase().includes(name), `"${text}" names the ${name}`);
        assert.ok(!/[!{}]|undefined|NaN/.test(text), text);
        assert.ok(!/miss/i.test(text), text);
        seen.add(text);
      }
    }
  }
  assert.ok(seen.size >= 12, `${seen.size} different lines`);
  // Plural parts agree with their verb ("the feelers were"), also in a look.
  assert.match(say("attack", phasedEvent({ part: "arms", turn: 3, attacker: { side: "rival", id: "rival", type: "dairengo" }, attack: { id: "fist", name: "Rocket fist" } })), /feelers/);
  const meow = say("attack", phasedEvent({ part: "arms", turn: 3, defender: { side: "kaiju", id: "kaiju", type: "squamous", variant: "meowthprrtep" } }));
  assert.match(meow, /paws/);
  assert.match(meow, /Meow'thprrtep/);
});

test("a phased hit in a whole bot game: damage 0, never on a blast, only against the passive, text clean", () => {
  let phased = 0;
  for (const [id, variant] of [["squamous", null], ["squamous", "meowthprrtep"], ["radiosaur", null]]) {
    for (const cell of [{ mission: "fortress" }, { mission: "coast", rival: "squamous" }, { mission: "coast", rival: "thalassor" }]) {
      const s = setupFor(variant ? `${id}:${variant}` : id, cell, 5);
      const { commands } = playBot(s);
      const { events } = replayEvents(s, commands);
      for (const e of events) {
        if (e.k === "blast") assert.equal(e.phased, undefined);
        if (!e.phased) continue;
        phased += 1;
        assert.equal(e.k, "attack");
        assert.equal(e.hit, true);
        assert.equal(e.damage, 0);
        assert.ok(e.text && !e.text.includes("!"), e.text);
        if (e.defender.side === "kaiju") assert.equal(id, "squamous", "only a Squamous One as the player's monster is phased");
        if (e.defender.side === "rival") assert.equal(cell.rival, "squamous", "only a Squamous rival is phased");
      }
    }
  }
  assert.ok(phased > 0, "some hit phased out in these games");
});
