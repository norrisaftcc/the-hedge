// KAI-11 (issue #27, DESIGN 17.3 D): the body slam. Every kaiju can throw its body at an adjacent
// kaiju: RULES.slamAp, RULES.slamDamage, RULES.slamAccuracy. The body cannot be crippled, so the
// slam is always there; crippled arms do not weaken it, and the head and eldritch skin still count.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/hex.js";
import { create, step, forecast, actions, slamTargets } from "../src/rules.js";
import { planRival } from "../src/ai.js";
import { RULES } from "../src/data/kaiju.js";
import { blank, rigDice, setup } from "./fixtures.mjs";

// An open field with the rival one hex from the player's kaiju.
function pair(kaiju = "squamous", rival = "radiosaur", extra = {}) {
  const m = blank({ objective: { kind: "rival" }, rivalStart: { at: [5, 0], facing: 3 }, rivalRetreat: [] });
  const s = create(setup(m, { kaiju, rival, ...extra }));
  s.rival.at = H.neighbor(s.kaiju.at, 0);
  return s;
}

const attackEvent = (events) => events.find((e) => e.k === "attack");

test("slamTargets: the rival's hex when it is alive and adjacent, else nothing", () => {
  const s = pair();
  assert.deepEqual(slamTargets(s), [s.rival.at]);
  assert.deepEqual(slamTargets(s, "rival"), [s.kaiju.at]);
  const far = pair();
  far.rival.at = H.ray(far.kaiju.at, 0, 3)[2];
  assert.deepEqual(slamTargets(far), []);
  const dead = pair();
  dead.rival.parts.body.hp = 0;
  assert.deepEqual(slamTargets(dead), []);
  const none = create(setup(blank(), { kaiju: "squamous" }));
  assert.deepEqual(slamTargets(none), []);
});

test("a slam costs RULES.slamAp, strikes the rival and says so in an attack event", () => {
  const s = pair();
  const out = step(s, { t: "slam", target: s.rival.at });
  assert.ok(!out.events.some((e) => e.k === "refuse"), out.events.map((e) => e.text).join(" "));
  assert.equal(out.state.kaiju.ap, s.kaiju.ap - RULES.slamAp);
  const e = attackEvent(out.events);
  assert.equal(e.attack.id, "slam");
  assert.equal(e.attack.name, RULES.slamName);
  assert.equal(e.defender.side, "rival");
  assert.ok(e.text.length > 0 && !/[!{}]|undefined|NaN/.test(e.text), e.text);
});

test("a slam hits for RULES.slamDamage, less armor, at RULES.slamAccuracy", () => {
  const base = pair("squamous", "radiosaur");
  base.rival.armor = 0;
  base.rival.passives = [];
  base.kaiju.parts.head.hp = base.kaiju.parts.head.max;
  const fc = forecast(base, "slam", base.rival.at);
  assert.equal(fc.apCost, RULES.slamAp);
  assert.equal(fc.energyCost, 0);
  assert.equal(fc.targets.length, 1);
  assert.equal(fc.targets[0].kind, "kaiju");
  assert.equal(fc.targets[0].hitChance, RULES.slamAccuracy);
  assert.deepEqual(fc.targets[0].damage, RULES.slamDamage);
  // Both ends of the roll: a hit at the top of the accuracy, a miss just over it.
  const hit = { ...base, rng: rigDice((m) => m.roll(100) <= RULES.slamAccuracy) };
  const miss = { ...base, rng: rigDice((m) => m.roll(100) > RULES.slamAccuracy) };
  const h = attackEvent(step(hit, { t: "slam", target: hit.rival.at }).events);
  assert.equal(h.hit, true);
  assert.ok(h.damage >= RULES.slamDamage[0] && h.damage <= RULES.slamDamage[1] + 1, `damage ${h.damage}`); // +1: from behind
  const m = attackEvent(step(miss, { t: "slam", target: miss.rival.at }).events);
  assert.equal(m.hit, false);
  assert.equal(m.damage, 0);
});

test("the slam is there with any one of head, arms, legs or aux crippled; crippled arms do not weaken it", () => {
  const whole = pair("dairengo", "thalassor");
  const arms = pair("dairengo", "thalassor");
  arms.kaiju.parts.arms.hp = 0;
  assert.deepEqual(forecast(arms, "slam", arms.rival.at).targets[0].damage, forecast(whole, "slam", whole.rival.at).targets[0].damage);
  for (const part of ["head", "arms", "legs", "aux"]) {
    const s = pair("dairengo", "thalassor");
    s.kaiju.parts[part].hp = 0;
    const row = actions(s).find((a) => a.id === "slam");
    assert.equal(row.enabled, s.kaiju.ap >= RULES.slamAp, `${part} crippled: ${row.why}`);
  }
  const head = pair("dairengo", "thalassor");
  head.kaiju.parts.head.hp = 0;
  assert.ok(forecast(head, "slam", head.rival.at).targets[0].hitChance < RULES.slamAccuracy, "a crippled head still costs accuracy");
});

test("a slam is refused with too little AP and with nothing adjacent", () => {
  const poor = pair();
  poor.kaiju.ap = RULES.slamAp - 1;
  const a = step(poor, { t: "slam", target: poor.rival.at });
  assert.equal(a.events[0].k, "refuse");
  assert.equal(a.state, poor);
  const far = pair();
  far.rival.at = H.ray(far.kaiju.at, 0, 3)[2];
  const b = step(far, { t: "slam", target: far.rival.at });
  assert.equal(b.events[0].k, "refuse");
  assert.equal(b.events[0].text, "Nothing to slam there.");
  // An empty adjacent hex is not a target either.
  const c = step(pair(), { t: "slam", target: H.neighbor(pair().kaiju.at, 3) });
  assert.equal(c.events[0].k, "refuse");
});

test("actions lists the slam after the stomp, named from the data, with a reason when it is off", () => {
  const near = pair();
  const list = actions(near);
  const ids = list.map((a) => a.id);
  assert.equal(ids.indexOf("slam"), ids.indexOf("stomp") + 1);
  const row = list.find((a) => a.id === "slam");
  assert.deepEqual({ name: row.name, kind: row.kind, ap: row.ap, energy: row.energy, enabled: row.enabled }, { name: RULES.slamName, kind: "slam", ap: RULES.slamAp, energy: 0, enabled: true });
  const far = pair();
  far.rival.at = H.ray(far.kaiju.at, 0, 3)[2];
  const off = actions(far).find((a) => a.id === "slam");
  assert.equal(off.enabled, false);
  assert.equal(off.why, "No kaiju adjacent to slam.");
  const tired = pair();
  tired.kaiju.ap = RULES.slamAp - 1;
  assert.equal(actions(tired).find((a) => a.id === "slam").why, "Not enough AP.");
});

test("the rival plans a slam when its own attacks are crippled and the player's kaiju is beside it", () => {
  const s = pair("radiosaur", "squamous");
  s.rival.parts.arms.hp = 0; // the Squamous One's only damaging part
  s.rival.at = H.neighbor(s.kaiju.at, 3);
  const cmds = planRival(s);
  const slam = cmds.find((c) => c.t === "slam");
  assert.ok(slam, JSON.stringify(cmds));
  assert.equal(slam.actor, "rival");
  assert.equal(slam.target, s.kaiju.at);
  // Its own blows are healed to 1 hp at the phase start, so the order itself is what we check:
  // the same command, as the player's side, is legal and strikes the player's kaiju.
  assert.ok(forecast(s, "slam", s.kaiju.at, "rival").targets.some((x) => x.kind === "kaiju" && x.hitChance > 0 && x.damage[1] > 0));
});

test("the same seed gives the same slam", () => {
  const a = step(pair(), { t: "slam", target: pair().rival.at });
  const b = step(pair(), { t: "slam", target: pair().rival.at });
  assert.deepEqual(a, b);
});
