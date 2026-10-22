// DESIGN §17.4 (issue #27): the bot's hero mode, which fights only the rival, and canHurtRival,
// the check that counts stuck turns and that the KAI-11 test will reuse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as H from "../src/hex.js";
import { create, step, forecast } from "../src/rules.js";
import { RULES } from "../src/data/kaiju.js";
import { plan, playBot, canHurtRival, setupFor } from "../tools/sim.mjs";
import { blank, putUnit, setup } from "./fixtures.mjs";

// An open field, the player's kaiju in the middle, the rival at the far top edge.
function field(kaiju, rival = "squamous") {
  const m = blank({ objective: { kind: "rival" }, rivalStart: { at: [5, 0], facing: 3 }, rivalRetreat: [] });
  return create(setup(m, { kaiju, rival }));
}

// Plan and apply commands until the bot would end its turn. Returns every command it sent.
function playOutTurn(s) {
  const sent = [];
  for (let i = 0; i < 30 && !s.result; i++) {
    const cmds = plan(s, { hero: true });
    if (cmds.length === 1 && cmds[0].t === "end") break;
    for (const c of cmds) {
      const out = step(s, c);
      assert.notEqual(out.events[0] && out.events[0].k, "refuse", JSON.stringify(c));
      sent.push({ c, before: s });
      s = out.state;
    }
  }
  return { sent, state: s };
}

test("hero: with only units and a building in reach, it attacks none of them and walks on", () => {
  for (const id of ["radiosaur", "thalassor", "squamous", "dairengo"]) {
    const s = field(id, id === "squamous" ? "radiosaur" : "squamous");
    const [a, b, c, d] = H.neighbors(s.kaiju.at);
    putUnit(s, "infantry", a);
    putUnit(s, "infantry", b);
    putUnit(s, "tank", c);
    s.map.hexes[d].structure = { type: "low", hp: 2, maxHp: 2 };
    // The normal bot goes for the crowd (three units are enough to make it roar).
    const normal = plan(s);
    assert.ok(normal.some((x) => x.t === "attack" || x.t === "stomp" || x.t === "roar"), `${id}: the normal bot should strike here`);
    const { sent } = playOutTurn(s);
    assert.ok(sent.length > 0, `${id} did nothing`);
    for (const { c: cmd } of sent) assert.ok(!["attack", "stomp", "roar", "eat"].includes(cmd.t), `${id} sent ${JSON.stringify(cmd)}`);
  }
});

test("hero: every blow it strikes can damage the rival; an area blow may also hit units", () => {
  for (const id of ["radiosaur", "thalassor", "dairengo"]) {
    const s = field(id, "squamous");
    const [a, b] = H.neighbors(s.kaiju.at);
    s.rival.at = a;
    putUnit(s, "infantry", b);
    const { sent } = playOutTurn(s);
    const blows = sent.filter(({ c }) => c.t === "attack" || c.t === "stomp" || c.t === "slam");
    assert.ok(blows.length > 0, `${id} struck nothing`);
    for (const { c, before } of blows) {
      const turned = { ...before, kaiju: { ...before.kaiju } };
      const f = forecast(turned, c.t === "attack" ? c.attack : c.t, c.target);
      assert.ok(f.targets.some((t) => t.kind === "kaiju" && t.hitChance > 0 && t.damage[1] > 0), `${id}: ${JSON.stringify(c)} cannot hurt the rival`);
    }
  }
});

test("hero: next to the rival with only a unit to stomp, it does not stomp", () => {
  const s = field("squamous", "radiosaur");
  const [a, b] = H.neighbors(s.kaiju.at);
  s.rival.at = a;
  s.kaiju.parts.arms.hp = 0; // the Squamous One's only damaging part
  s.kaiju.ap = RULES.stompAp; // one AP left: a stomp is open, a slam (2 AP) is not, so nothing can hurt the rival
  putUnit(s, "infantry", b);
  assert.ok(s.kaiju.ap < RULES.slamAp);
  assert.equal(canHurtRival(s), false);
  assert.ok(plan(s).some((x) => x.t === "stomp" || x.t === "attack" || x.t === "roar"), "the normal bot goes for the infantry");
  assert.deepEqual(plan(s, { hero: true }), [{ t: "end" }]);
});

test("hero: with the arms crippled and AP for it, it slams the rival rather than stomp the unit beside it", () => {
  const s = field("squamous", "radiosaur");
  const [a, b] = H.neighbors(s.kaiju.at);
  s.rival.at = a;
  s.kaiju.parts.arms.hp = 0;
  putUnit(s, "infantry", b);
  assert.equal(canHurtRival(s), true, "the slam");
  assert.deepEqual(plan(s, { hero: true }), [{ t: "slam", target: a }]);
});

test("hero: the normal bot is the default", () => {
  const s = field("radiosaur");
  assert.deepEqual(plan(s), plan(s, { hero: false }));
});

test("canHurtRival: Dai-Rengo with the arms crippled and the finisher used can only slam, which takes 2 AP", () => {
  const s = field("dairengo");
  s.rival.at = H.neighbors(s.kaiju.at)[0];
  assert.equal(canHurtRival(s), true, "intact");
  s.kaiju.parts.arms.hp = 0;
  assert.equal(canHurtRival(s), true, "arms crippled, the finisher still there");
  s.kaiju.used.finish = true;
  assert.equal(canHurtRival(s), true, "arms crippled and the finisher used: the body slam");
  assert.deepEqual(plan(s, { hero: true }), [{ t: "slam", target: s.rival.at }]);
  s.kaiju.ap = RULES.slamAp - 1;
  assert.equal(canHurtRival(s), false, "1 AP is not enough for a slam");
  assert.equal(canHurtRival(s, { fresh: true }), true, "full AP and energy give it back");
});

test("canHurtRival: false with no rival, a far rival or a dead one", () => {
  const far = field("dairengo");
  assert.equal(canHurtRival(far), false, "rival far away");
  const near = field("dairengo");
  near.rival.at = H.neighbors(near.kaiju.at)[3];
  assert.equal(canHurtRival(near), true);
  near.rival.parts.body.hp = 0;
  assert.equal(canHurtRival(near), false, "rival dead");
  const none = create(setup(blank(), { kaiju: "dairengo" }));
  assert.equal(none.rival, null);
  assert.equal(canHurtRival(none), false, "no rival on the map");
});

test("canHurtRival: it works in every facing, and spent AP counts unless fresh is set", () => {
  const s = field("radiosaur");
  for (let d = 0; d < 6; d++) {
    const t = structuredClone(s);
    t.rival.at = H.neighbor(t.kaiju.at, d);
    assert.equal(canHurtRival(t), true, `rival in direction ${d}`);
    t.kaiju.ap = 0;
    assert.equal(canHurtRival(t), false, "no AP");
    assert.equal(canHurtRival(t, { fresh: true }), true, "fresh");
  }
});

test("canHurtRival: an input state is not changed", () => {
  const s = field("dairengo");
  s.rival.at = H.neighbors(s.kaiju.at)[0];
  s.kaiju.ap = 0;
  const before = JSON.stringify(s);
  canHurtRival(s, { fresh: true });
  assert.equal(JSON.stringify(s), before);
});

test("playBot counts stuck turns, and hero mode is deterministic", () => {
  const cell = { mission: "coast", rival: "squamous", hero: true };
  const a = playBot(setupFor("dairengo", cell, 3), { hero: true });
  const b = playBot(setupFor("dairengo", cell, 3), { hero: true });
  assert.deepEqual(a.commands, b.commands);
  assert.ok(Number.isInteger(a.stuck) && a.stuck >= 0);
  assert.ok(a.stuckFresh <= a.stuck, "a turn stuck with full AP is stuck as it stands");
});

test("sim.mjs: coast:<rival>:hero prints the stuck columns; other cells do not", () => {
  const run = (...args) => spawnSync(process.execPath, ["kaiju/tools/sim.mjs", "2", ...args], { encoding: "utf8" });
  const hero = run("radiosaur", "coast:squamous:hero");
  assert.equal(hero.status, 0, hero.stderr);
  assert.match(hero.stdout, /stuck stuck0/);
  assert.match(hero.stdout, /coast:squamous:hero/);
  const plain = run("radiosaur", "coast");
  assert.equal(plain.status, 0, plain.stderr);
  assert.doesNotMatch(plain.stdout, /stuck/);
  const bad = run("radiosaur", "coast:nobody:hero");
  assert.notEqual(bad.status, 0);
});
