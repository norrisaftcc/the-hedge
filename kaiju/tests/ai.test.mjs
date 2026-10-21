// The AI: plans are legal and deterministic; broken units flee; the rival fights, then runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/hex.js";
import { create, step, reach, unitReach, canFire, attackTargets, affected } from "../src/rules.js";
import { planUnit, planRival, planBerserk } from "../src/ai.js";
import { blank, paint, putUnit, setup, at, FORTRESS_LITE, COAST_LITE, CITY_LITE } from "./fixtures.mjs";

const HOME = at(5, 7);

function checkUnitPlan(s, u, plan) {
  let from = u.at;
  for (const cmd of plan) {
    assert.equal(cmd.id, u.id);
    if (cmd.t === "umove") {
      assert.ok(unitReach(s, u.id)[cmd.to], `${u.type} ${u.id} cannot reach ${cmd.to}`);
      from = cmd.to;
    } else {
      assert.equal(cmd.t, "ufire");
      assert.ok(["kaiju", "rival"].includes(cmd.target));
      assert.ok(canFire(s, u, from, s[cmd.target].at), `${u.type} ${u.id} has no shot from ${from}`);
      assert.equal(u.panicked, 0);
      assert.equal(u.reload, 0);
    }
  }
}

function checkRivalPlan(s, plan) {
  let facing = s.rival.facing;
  for (const cmd of plan) {
    assert.equal(cmd.actor, "rival");
    if (cmd.t === "move") assert.ok(reach(s, "rival")[cmd.to], "rival move out of reach");
    else if (cmd.t === "face") facing = cmd.dir;
    else if (cmd.t === "attack") {
      const view = structuredClone(s);
      view.rival.facing = facing;
      assert.ok(attackTargets(view, cmd.attack, "rival").includes(cmd.target), `rival ${cmd.attack} at ${cmd.target}`);
      assert.ok(affected(view, cmd.attack, cmd.target, "rival").includes(s.kaiju.at));
    } else if (cmd.t === "withdraw") assert.ok(s.rivalRetreat.includes(s.rival.at));
    else assert.equal(cmd.t, "roar");
  }
}

test("unit and rival plans are legal and deterministic across whole games", () => {
  const games = [
    setup(FORTRESS_LITE, { seed: 1 }),
    setup(CITY_LITE, { seed: 2, target: "lab", kaiju: "squamous" }),
    setup(COAST_LITE, { seed: 3, rival: "thalassor" }),
    setup(COAST_LITE, { seed: 4, rival: "dairengo", kaiju: "thalassor" }),
    setup(COAST_LITE, { seed: 5, rival: "radiosaur", kaiju: "dairengo" }),
  ];
  for (const su of games) {
    let s = create(su);
    for (let turn = 0; turn < 8 && !s.result; turn++) {
      for (const u of s.units) {
        const plan = planUnit(s, u.id);
        assert.deepEqual(planUnit(s, u.id), plan);
        checkUnitPlan(s, u, plan);
      }
      if (s.rival) {
        const plan = planRival(s);
        assert.deepEqual(planRival(s), plan);
        checkRivalPlan(s, plan);
      }
      const keys = Object.keys(reach(s)).sort();
      if (keys.length) s = step(s, { t: "move", to: keys[(turn * 5) % keys.length] }).state;
      if (!s.result) s = step(s, { t: "end" }).state;
    }
  }
});

test("units close to range and fire", () => {
  const s = create(setup(blank()));
  const tank = putUnit(s, "tank", H.ray(HOME, 0, 5)[4]);
  const plan = planUnit(s, tank.id);
  assert.equal(plan[0].t, "umove");
  assert.equal(H.distance(plan[0].to, HOME), 2, "a tank wants its best range");
  assert.deepEqual(plan[1], { t: "ufire", id: tank.id, target: "kaiju" });
  const gun = putUnit(s, "gun", H.ray(HOME, 3, 3)[2]);
  assert.deepEqual(planUnit(s, gun.id), [{ t: "ufire", id: gun.id, target: "kaiju" }]);
  const far = putUnit(s, "gun", at(0, 0));
  assert.deepEqual(planUnit(s, far.id), [], "out of reach and range: hold");
});

test("infantry prefer a building", () => {
  const m = blank();
  const cover = H.neighbor(HOME, 0);
  const { col, row } = H.keyToOffset(cover);
  paint(m, "features", col, row, "1");
  const s = create(setup(m));
  const inf = putUnit(s, "infantry", H.ray(HOME, 0, 2)[1]);
  const plan = planUnit(s, inf.id);
  assert.equal(plan[0].to, cover, "the building beats the open hexes beside the kaiju");
  assert.equal(plan[1].t, "ufire");
});

test("panicked units flee and do not fire", () => {
  const s = create(setup(blank()));
  const inf = putUnit(s, "infantry", H.neighbor(HOME, 0), { panicked: 1 });
  const plan = planUnit(s, inf.id);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].t, "umove");
  assert.ok(H.distance(plan[0].to, HOME) > H.distance(inf.at, HOME));
  assert.equal(H.distance(plan[0].to, HOME), 3);
});

test("the rival attacks when it can, with its special first", () => {
  const s = create(setup(COAST_LITE, { rival: "radiosaur", kaiju: "thalassor" }));
  s.rival.at = H.ray(s.kaiju.at, 1, 3)[2];
  s.rival.facing = 0;
  s.rival.energy = 10;
  s.units = [];
  const plan = planRival(s);
  assert.deepEqual(plan, [
    { t: "face", actor: "rival", dir: 4 },
    { t: "attack", actor: "rival", attack: "breath", target: s.kaiju.at },
  ]);
  s.rival.energy = 0;
  s.rival.at = H.neighbor(s.kaiju.at, 1);
  const melee = planRival(s);
  assert.equal(melee[melee.length - 1].attack, "bite");
});

test("the rival closes in when nothing reaches", () => {
  const s = create(setup(COAST_LITE, { rival: "thalassor" }));
  const plan = planRival(s);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].t, "move");
  assert.ok(H.distance(plan[0].to, s.kaiju.at) < H.distance(s.rival.at, s.kaiju.at));
});

test("the rival roars at a crowd", () => {
  const s = create(setup(COAST_LITE, { rival: "thalassor" }));
  for (const d of [0, 1, 2]) putUnit(s, "infantry", H.neighbor(s.rival.at, d));
  assert.deepEqual(planRival(s), [{ t: "roar", actor: "rival" }]);
});

test("the rival retreats when low, and withdraws on arrival", () => {
  const s = create(setup(COAST_LITE, { rival: "thalassor" }));
  s.rival.at = at(9, 4);
  s.rival.parts.body.hp = 4;
  const plan = planRival(s);
  assert.equal(plan[0].t, "move");
  const exit = (k) => Math.min(...s.rivalRetreat.map((x) => H.distance(k, x)));
  assert.ok(exit(plan[0].to) < exit(s.rival.at));
  s.rival.at = at(9, 0);
  assert.deepEqual(planRival(s), [{ t: "withdraw", actor: "rival" }]);
});

test("a rival robot low on battery goes to a power structure and waits beside it", () => {
  const s = create(setup(COAST_LITE, { rival: "dairengo" }));
  const pylon = at(6, 6);
  s.rival.energy = 0;
  s.kaiju.at = at(10, 12);
  const plan = planRival(s);
  checkRivalPlan(s, plan);
  assert.equal(plan[0].t, "move");
  assert.ok(H.distance(plan[0].to, pylon) < H.distance(s.rival.at, pylon));
  assert.ok(!reach(s, "rival")[plan[0].to].path.includes(pylon), "it does not walk through the pylon");
  s.rival.at = H.neighbor(pylon, 0);
  for (const cmd of planRival(s)) assert.equal(cmd.t, "face");
});

test("a berserk kaiju goes for food and eats it", () => {
  const m = blank();
  const food = H.ray(HOME, 3, 4)[3];
  const { col, row } = H.keyToOffset(food);
  paint(m, "features", col, row, "1");
  const s = create(setup(m));
  const first = planBerserk(s);
  assert.equal(first[0].t, "move");
  assert.ok(H.neighbors(first[0].to).includes(food));
  s.kaiju.at = first[0].to;
  assert.deepEqual(planBerserk(s), [{ t: "eat", actor: "kaiju", target: food }]);
  const robot = create(setup(m, { kaiju: "dairengo" }));
  assert.deepEqual(planBerserk(robot), []);
});
