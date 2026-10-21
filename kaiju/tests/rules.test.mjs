// The rules core: commands, refusals, damage, hunger, panic, turn order, results, purity, speed.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/hex.js";
import { create, step, reach, unitReach, eatTargets, actions, forecast, attackTargets, affected, describeHex, partState, replay } from "../src/rules.js";
import { blank, paint, putUnit, rigDice, setup, at, FORTRESS_LITE, COAST_LITE, CITY_LITE } from "./fixtures.mjs";

const HOME = at(5, 7); // the kaiju's start in blank()
const E = H.neighbor(HOME, 0);
const W = H.neighbor(HOME, 3);

function paintKey(mission, layer, key, glyph) {
  const { col, row } = H.keyToOffset(key);
  return paint(mission, layer, col, row, glyph);
}

function game(extra = {}, edit = null) {
  const m = blank();
  if (edit) edit(m);
  return create(setup(m, extra));
}

function ok(s, cmd) {
  const out = step(s, cmd);
  assert.ok(!out.events.some((e) => e.k === "refuse"), `refused ${JSON.stringify(cmd)}: ${out.events.map((e) => e.text).join(" ")}`);
  return out;
}

function refused(s, cmd) {
  const out = step(s, cmd);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].k, "refuse");
  assert.ok(out.events[0].text.length > 0);
  assert.equal(out.state, s);
  return out;
}

const kinds = (events, k) => events.filter((e) => e.k === k);

test("partState thresholds", () => {
  assert.equal(partState({ hp: 9, max: 9 }), "intact");
  assert.equal(partState({ hp: 7, max: 9 }), "intact");
  assert.equal(partState({ hp: 6, max: 9 }), "hurt");
  assert.equal(partState({ hp: 3, max: 9 }), "bad");
  assert.equal(partState({ hp: 0, max: 9 }), "crippled");
});

test("create builds the kaiju from data and mutations", () => {
  const s = game();
  assert.equal(s.turn, 1);
  assert.equal(s.phase, "kaiju");
  assert.equal(s.kaiju.at, HOME);
  assert.equal(s.kaiju.apMax, 6);
  assert.equal(s.kaiju.ap, 6);
  assert.equal(s.kaiju.hunger, 4, "phase start on turn 1 raises hunger");
  assert.equal(s.kaiju.parts.body.max, 16 + 3, "three unspent points become body");
  assert.equal(Object.keys(s.map.hexes).length, 12 * 14);
  assert.deepEqual(s.objective, { kind: "destroy", at: "11,0", type: "bunker" });

  const m = create(setup(blank(), { kaiju: "thalassor", mutations: ["hide", "bulk"] }));
  assert.equal(m.kaiju.armor, 3);
  assert.equal(m.kaiju.parts.body.max, 18 + 3);
  const r = create(setup(blank(), { kaiju: "radiosaur", mutations: ["legs", "voice"] }));
  assert.equal(r.kaiju.apMax, 7);
  assert.equal(r.kaiju.roarRadius, 5);
  assert.equal(r.kaiju.roarPressure, 1);
  const d = create(setup(blank(), { kaiju: "dairengo", mutations: ["reserves", "reach"] }));
  assert.equal(d.kaiju.apMax, 6, "thrusters add 1");
  assert.equal(d.kaiju.energyMax, 15);
  assert.equal(d.kaiju.energy, 13, "14 at start, less 1 drain at phase start");
  assert.equal(d.kaiju.hunger, null);

  assert.throws(() => create(setup(blank(), { kaiju: "squamous", mutations: ["regen"] })));
  assert.throws(() => create(setup(blank(), { mutations: ["hide", "legs"] })));
  assert.throws(() => create(setup(blank(), { mutations: ["nope"] })));
  assert.throws(() => create(setup(CITY_LITE)), "a chosen objective needs a target");
  const c = create(setup(CITY_LITE, { target: "lab" }));
  assert.deepEqual(c.objective, { kind: "destroy", at: at(6, 2), type: "lab" });
});

test("create never mutates its setup", () => {
  for (const [m, extra] of [[FORTRESS_LITE, {}], [COAST_LITE, { rival: "squamous" }], [CITY_LITE, { target: "plant" }]]) {
    const su = setup(m, extra);
    const before = JSON.stringify(su);
    create(su);
    assert.equal(JSON.stringify(su), before);
  }
});

test("a rival is picked from the dice when none is named", () => {
  const s = create(setup(COAST_LITE, { kaiju: "radiosaur" }));
  assert.ok(s.rival && s.rival.id !== "radiosaur");
  assert.equal(create(setup(COAST_LITE, { kaiju: "radiosaur" })).rival.id, s.rival.id);
});

test("move: cheapest path, facing from the last step, AP spent", () => {
  const s = game({}, (m) => paintKey(m, "terrain", E, "f"));
  const r = reach(s);
  assert.equal(r[E].cost, 2);
  const two = H.neighbor(H.neighbor(HOME, 1), 0);
  assert.equal(r[two].cost, 2);
  const { state, events } = ok(s, { t: "move", to: two });
  assert.equal(state.kaiju.at, two);
  assert.equal(state.kaiju.ap, 4);
  assert.equal(state.kaiju.facing, H.directionTo(state.kaiju.at === two ? r[two].path[0] : HOME, two));
  const mv = kinds(events, "move")[0];
  assert.equal(mv.from, HOME);
  assert.equal(mv.cost, 2);
  assert.deepEqual(mv.path, r[two].path);
  const far = H.ray(HOME, 0, 6)[5];
  const third = ok(state, { t: "move", to: H.ray(two, 0, 4)[3] }).state;
  assert.equal(third.kaiju.ap, 0);
  refused(third, { t: "move", to: far });
});

test("move: mountains cost 3, structures add their height, solid structures and air units block", () => {
  const s = game({}, (m) => {
    paintKey(m, "terrain", E, "^");
    paintKey(m, "features", W, "3");
    paintKey(m, "features", H.neighbor(HOME, 1), "W");
  });
  putUnit(s, "helicopter", H.neighbor(HOME, 2));
  const r = reach(s);
  assert.equal(r[E].cost, 3);
  assert.equal(r[W].cost, 1 + 3);
  assert.equal(r[H.neighbor(HOME, 1)], undefined);
  assert.equal(r[H.neighbor(HOME, 2)], undefined);
  refused(s, { t: "move", to: H.neighbor(HOME, 1) });
});

test("move through a building destroys it and scores", () => {
  const s = game({}, (m) => paintKey(m, "features", E, "2"));
  const { state, events } = ok(s, { t: "move", to: E });
  assert.equal(state.map.hexes[E].structure, null);
  assert.equal(state.map.hexes[E].terrain, "rubble");
  assert.equal(state.tally.structures, 25);
  assert.equal(kinds(events, "crush")[0].what, "structure");
  assert.equal(kinds(events, "destroyed")[0].points, 25);
  assert.equal(kinds(events, "eat").length, 0, "dead things are not eaten");
});

test("crush: ground units in the path die for +1 AP", () => {
  const s = game();
  putUnit(s, "tank", E);
  assert.equal(reach(s)[E].cost, 2);
  const { state, events } = ok(s, { t: "move", to: H.neighbor(E, 0) });
  assert.equal(state.units.length, 0);
  assert.equal(state.tally.units, 30);
  assert.equal(state.kaiju.ap, 6 - 3);
  assert.deepEqual(kinds(events, "crush").map((e) => [e.what, e.type, e.at]), [["unit", "tank", E]]);
});

test("face turns in place for free", () => {
  const s = game();
  const { state, events } = ok(s, { t: "face", dir: 3 });
  assert.equal(state.kaiju.facing, 3);
  assert.equal(state.kaiju.ap, 6);
  assert.equal(events[0].k, "face");
  refused(s, { t: "face", dir: 9 });
  for (const dir of [null, "", true, "x"]) refused(s, { t: "face", dir });
  assert.equal(ok(s, { t: "face", dir: "4" }).state.kaiju.facing, 4);
});

test("commands named after built-in object keys are refused, not thrown", () => {
  const s = game();
  for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    refused(s, { t: name });
    refused(s, { t: "move", to: name });
    refused(s, { t: "attack", attack: "bite", target: name });
    refused(s, { t: "stomp", target: name });
    refused(s, { t: "eat", target: name });
  }
});

test("air units may not stop over solid structures", () => {
  const s = game({}, (m) => paintKey(m, "features", H.ray(HOME, 0, 3)[2], "Y"));
  const u = putUnit(s, "helicopter", H.ray(HOME, 0, 4)[3]);
  const r = unitReach(s, u.id);
  assert.equal(r[H.ray(HOME, 0, 3)[2]], undefined);
  assert.ok(r[H.ray(HOME, 0, 2)[1]]);
});

test("attack: a hit, a miss, and the attack event shape", () => {
  const base = game();
  putUnit(base, "infantry", E);
  base.rng = rigDice((m) => m.roll(100) <= 85);
  const { state, events } = ok(base, { t: "attack", attack: "bite", target: E });
  assert.equal(state.kaiju.ap, 4);
  const a = kinds(events, "attack")[0];
  assert.deepEqual(a.attacker, { side: "kaiju", id: "kaiju", type: "radiosaur" });
  assert.deepEqual(a.defender, { side: "unit", id: "u1", type: "infantry" });
  assert.deepEqual(a.attack, { id: "bite", name: "Bite" });
  assert.equal(a.at, E);
  assert.equal(a.terrain, "open");
  assert.equal(a.structure, null);
  assert.equal(a.hit, true);
  assert.ok(a.damage >= 3 && a.damage <= 5);
  assert.equal(a.part, null);
  assert.equal(a.rear, false);
  assert.deepEqual(a.before, { hp: 2, max: 2 });
  assert.deepEqual(a.after, { hp: 0, max: 2 });
  assert.equal(state.units.length, 0);
  assert.equal(state.tally.units, 10);

  base.rng = rigDice((m) => m.roll(100) > 85);
  const miss = ok(base, { t: "attack", attack: "bite", target: E });
  const am = kinds(miss.events, "attack")[0];
  assert.equal(am.hit, false);
  assert.equal(am.damage, 0);
  assert.equal(miss.state.units[0].hp, 2);
  refused(base, { t: "attack", attack: "bite", target: H.neighbor(E, 0) });
  refused(base, { t: "attack", attack: "fist", target: E });
});

test("attack: AP, energy, crippled parts and once-per-mission refuse", () => {
  const s = game();
  putUnit(s, "infantry", E);
  refused(s, { t: "attack", attack: "breath", target: E });
  s.kaiju.ap = 1;
  refused(s, { t: "attack", attack: "bite", target: E });
  s.kaiju.ap = 6;
  s.kaiju.parts.head.hp = 0;
  refused(s, { t: "attack", attack: "bite", target: E });
  const bite = actions(s).find((a) => a.id === "bite");
  assert.equal(bite.enabled, false);
  assert.match(bite.why, /crippled/);
  s.kaiju.parts.aux.hp = 0;
  assert.deepEqual(attackTargets(s, "tail"), []);

  const d = game({ kaiju: "dairengo" });
  putUnit(d, "maser", E);
  d.units[0].hp = 99;
  d.kaiju.ap = 10;
  const once = ok(d, { t: "attack", attack: "finish", target: E }).state;
  assert.equal(once.kaiju.used.finish, true);
  assert.equal(once.kaiju.energy, d.kaiju.energy - 6);
  once.kaiju.energy = 12;
  refused(once, { t: "attack", attack: "finish", target: E });
});

test("area attacks strike everything in the pattern", () => {
  const s = game({}, (m) => paintKey(m, "features", H.ray(HOME, 0, 2)[1], "1"));
  s.kaiju.energy = 10;
  const line = H.ray(HOME, 0, 4);
  putUnit(s, "infantry", line[0]);
  putUnit(s, "tank", line[3]);
  assert.deepEqual(affected(s, "breath", line[2]), line);
  assert.deepEqual(attackTargets(s, "breath"), line);
  const { state, events } = ok(s, { t: "attack", attack: "breath", target: line[2] });
  const hits = kinds(events, "attack");
  assert.deepEqual(hits.map((e) => e.defender.side), ["unit", "structure", "unit"]);
  assert.equal(state.kaiju.energy, 6);
  assert.equal(state.map.hexes[line[1]].structure, null, "a low building cannot survive 4 damage");

  assert.deepEqual(attackTargets(s, "tail"), [], "an empty pattern is not offered");
  putUnit(s, "infantry", W);
  const rear = attackTargets(s, "tail");
  assert.deepEqual(rear.sort(), [2, 3, 4].map((d) => H.neighbor(HOME, d)).sort());

  const t = game({ kaiju: "thalassor" });
  t.kaiju.energy = 8;
  putUnit(t, "tank", H.ray(HOME, 0, 3)[2]);
  assert.equal(attackTargets(t, "surge").length, 6);
});

test("breath stops at a mountain", () => {
  const ray = H.ray(HOME, 0, 4);
  const s = game({}, (m) => paintKey(m, "terrain", ray[1], "^"));
  s.kaiju.energy = 10;
  putUnit(s, "tank", ray[0]);
  assert.deepEqual(attackTargets(s, "breath"), ray.slice(0, 2));
});

test("teleport and the gaze", () => {
  const s = game({ kaiju: "squamous" });
  s.kaiju.energy = 10;
  const dest = H.ray(HOME, 0, 3)[2];
  putUnit(s, "infantry", E);
  assert.ok(!attackTargets(s, "angle").includes(E), "occupied hexes are not destinations");
  const t = ok(s, { t: "attack", attack: "angle", target: dest });
  assert.equal(t.state.kaiju.at, dest);
  assert.equal(t.state.kaiju.energy, 7);
  assert.equal(t.state.kaiju.ap, 5);
  assert.equal(kinds(t.events, "move")[0].teleport, true);

  s.rng = rigDice((m) => m.roll(6) + m.roll(6) + 2 > 5);
  const g = ok(s, { t: "attack", attack: "gaze", target: E });
  const a = kinds(g.events, "attack")[0];
  assert.equal(a.damage, 0);
  assert.equal(kinds(g.events, "panic")[0].broke, true);
  assert.equal(g.state.units[0].panicked, 2);
  assert.equal(g.state.kaiju.energy, 10 - 2 + 1, "the squamous one feeds on panic");
});

test("tentacle grab pulls a unit two hexes away", () => {
  const s = game({ kaiju: "squamous" });
  const two = H.ray(HOME, 0, 2)[1];
  putUnit(s, "tank", two);
  s.units[0].hp = 99;
  s.rng = rigDice((m) => m.roll(100) <= 85);
  const { state, events } = ok(s, { t: "attack", attack: "grab", target: two });
  assert.equal(state.units[0].at, E);
  assert.equal(kinds(events, "umove")[0].pulled, true);
});

test("part penalties: legs cost AP, head costs aim, arms cost melee damage", () => {
  const s = game();
  s.kaiju.parts.legs.hp = 5;
  const next = ok(s, { t: "end" }).state;
  assert.equal(next.kaiju.apMax, 5);
  const c = game();
  c.kaiju.parts.legs.hp = 0;
  assert.equal(ok(c, { t: "end" }).state.kaiju.apMax, 3);

  const f = game();
  putUnit(f, "infantry", E);
  assert.equal(forecast(f, "bite", E).targets[0].hitChance, 85);
  assert.deepEqual(forecast(f, "bite", E).targets[0].damage, [3, 5]);
  f.kaiju.parts.head.hp = 2;
  assert.equal(forecast(f, "bite", E).targets[0].hitChance, 65);
  f.kaiju.parts.arms.hp = 0;
  assert.deepEqual(forecast(f, "bite", E).targets[0].damage, [1, 3]);
});

test("forecast: cover, ranged fall-off, eldritch, return fire", () => {
  const s = game({ kaiju: "thalassor" }, (m) => paintKey(m, "features", H.ray(HOME, 0, 3)[2], "2"));
  const three = H.ray(HOME, 0, 3)[2];
  putUnit(s, "infantry", three);
  putUnit(s, "gun", W);
  const f = forecast(s, "trident", three);
  assert.equal(f.apCost, 2);
  assert.equal(f.energyCost, 1);
  assert.equal(f.targets[0].kind, "unit");
  assert.equal(f.targets[0].hitChance, 75 - 10 - 10);
  assert.deepEqual(f.targets[0].damage, [2, 3]);
  assert.deepEqual(f.returnFire.map((r) => r.type).sort(), ["gun", "infantry"]);
  const gun = f.returnFire.find((r) => r.type === "gun");
  assert.equal(gun.hitChance, 60);
  assert.deepEqual(gun.damage, [1, 3], "the gun stands in Thalassor's rear arc");
  const q = game({ kaiju: "squamous" });
  putUnit(q, "tank", E);
  assert.equal(forecast(q, "grab", E).returnFire[0].hitChance, 55);
});

function gunShot(facing) {
  const s = game({ kaiju: "thalassor" });
  putUnit(s, "gun", E);
  s.kaiju.facing = facing;
  s.rng = rigDice((m) => m.roll(100) <= 60 && m.randint(2, 4) === 3);
  return kinds(ok(s, { t: "end" }).events, "attack")[0];
}

test("rear arc: +1 damage from behind", () => {
  const front = gunShot(0);
  const rear = gunShot(3);
  assert.equal(front.rear, false);
  assert.equal(rear.rear, true);
  assert.equal(front.hit, true);
  assert.equal(front.damage, 3 - 2);
  assert.equal(rear.damage, front.damage + 1);
  assert.equal(rear.attacker.side, "unit");
  assert.equal(rear.defender.side, "kaiju");
  assert.ok(["head", "arms", "body", "legs", "aux"].includes(rear.part));
  assert.equal(rear.after.hp, rear.before.hp - rear.damage);
});

test("damage beyond a part, or to a crippled part, goes to the body", () => {
  const s = game({ kaiju: "thalassor" });
  putUnit(s, "gun", E);
  for (const p of ["head", "arms", "legs", "aux"]) s.kaiju.parts[p].hp = 0;
  s.rng = rigDice((m) => m.roll(100) <= 60);
  const { state, events } = ok(s, { t: "end" });
  const a = kinds(events, "attack")[0];
  assert.equal(a.part, "body");
  assert.equal(state.kaiju.parts.body.hp, s.kaiju.parts.body.hp - a.damage);
});

test("blast: a pylon hurts, the reactor belly drinks it", () => {
  const t = game({ kaiju: "thalassor" }, (m) => paintKey(m, "features", E, "T"));
  const hurt = ok(t, { t: "move", to: E });
  const b = kinds(hurt.events, "blast")[0];
  assert.ok(b.damage >= 2 && b.damage <= 3);
  assert.ok(b.part);
  assert.equal(hurt.state.map.hexes[E].structure, null);

  const r = game({}, (m) => paintKey(m, "features", E, "T"));
  const fed = ok(r, { t: "move", to: E });
  const rb = kinds(fed.events, "blast")[0];
  assert.equal(rb.energy, 5);
  assert.equal(rb.damage, undefined);
  assert.equal(fed.state.kaiju.energy, r.kaiju.energy + 5);
  for (const p of ["head", "arms", "body", "legs", "aux"]) assert.equal(fed.state.kaiju.parts[p].hp, r.kaiju.parts[p].hp);

  const stomp = ok(t, { t: "stomp", target: E });
  assert.equal(kinds(stomp.events, "blast").length, 1, "stomping a pylon flat sets it off");

  const far = H.ray(HOME, 0, 3)[1];
  const safe = game({ kaiju: "thalassor" }, (m) => paintKey(m, "features", far, "T"));
  const shot = ok(safe, { t: "attack", attack: "trident", target: far });
  assert.equal(safe.map.hexes[far].structure.type, "pylon");
  assert.equal(shot.state.map.hexes[far].structure, null);
  assert.equal(kinds(shot.events, "blast").length, 0, "ranged attacks destroy power safely");
});

test("eat: units and populated buildings feed, power feeds the reactor belly", () => {
  const s = game({}, (m) => {
    paintKey(m, "features", W, "1");
    paintKey(m, "features", H.neighbor(HOME, 1), "P");
  });
  putUnit(s, "infantry", E);
  const a = ok(s, { t: "eat", target: E });
  assert.equal(a.state.kaiju.hunger, 0);
  assert.equal(a.state.kaiju.energy, s.kaiju.energy + 3);
  assert.equal(a.state.kaiju.ap, 5);
  assert.equal(a.state.units.length, 0);
  assert.equal(a.state.tally.units, 10);
  const b = ok(s, { t: "eat", target: W });
  assert.equal(b.state.kaiju.hunger, 1);
  assert.equal(b.state.map.hexes[W].structure, null);
  const c = ok(s, { t: "eat", target: H.neighbor(HOME, 1) });
  assert.equal(c.state.kaiju.energy, s.kaiju.energy + 6);
  assert.equal(c.state.kaiju.hunger, s.kaiju.hunger);
  refused(s, { t: "eat", target: H.neighbor(HOME, 4) });

  const t = game({ kaiju: "thalassor" }, (m) => paintKey(m, "features", E, "T"));
  assert.deepEqual(eatTargets(t), [], "only the reactor belly eats power");
  refused(t, { t: "eat", target: E });

  const d = game({ kaiju: "dairengo" });
  putUnit(d, "infantry", E);
  refused(d, { t: "eat", target: E });
  putUnit(s, "helicopter", H.neighbor(HOME, 5));
  refused(s, { t: "eat", target: H.neighbor(HOME, 5) });
});

test("hunger rises each turn, slows the kaiju when high, and iron gut halves it", () => {
  const s = game();
  const next = ok(s, { t: "end" });
  assert.equal(next.state.kaiju.hunger, 5);
  assert.equal(kinds(next.events, "hunger")[0].hunger, 5);
  s.kaiju.hunger = 6;
  const hungry = ok(s, { t: "end" }).state;
  assert.equal(hungry.kaiju.hunger, 7);
  assert.equal(hungry.kaiju.apMax, 5);
  const g = game({ kaiju: "thalassor", mutations: ["gut"] });
  assert.equal(g.kaiju.hunger, 2, "turn 1 is odd: no rise");
  const g2 = ok(g, { t: "end" }).state;
  assert.equal(g2.kaiju.hunger, 3);
  assert.equal(ok(g2, { t: "end" }).state.kaiju.hunger, 3);
});

test("berserk: at max hunger the kaiju feeds itself, then the defense acts", () => {
  const far = H.ray(HOME, 3, 3)[2];
  const s = game({}, (m) => paintKey(m, "features", far, "1"));
  s.kaiju.hunger = 9;
  const { state, events } = ok(s, { t: "end" });
  const ks = events.map((e) => e.k);
  const at0 = ks.indexOf("berserk");
  assert.ok(at0 > 0);
  assert.ok(ks.indexOf("eat", at0) > at0);
  assert.equal(state.map.hexes[far].structure, null);
  const drop = events.filter((e) => e.k === "hunger" && e.turn === 2).pop();
  assert.equal(drop.hunger, 6, "after the meal hunger falls to max - 4");
  assert.equal(state.kaiju.berserk, false);
  assert.equal(kinds(events, "phase").filter((e) => e.phase === "defense").length, 2);
  assert.equal(state.turn, 3, "the berserk phase was turn 2's; turn 3 is the player's again");
  assert.equal(state.kaiju.hunger, 7);
  assert.equal(state.phase, "kaiju");
});

test("roar and panic", () => {
  const s = game();
  putUnit(s, "infantry", E);
  putUnit(s, "maser", W);
  s.rng = rigDice((m) => m.roll(6) + m.roll(6) > 5);
  const r = ok(s, { t: "roar" });
  assert.equal(r.state.kaiju.ap, 5);
  assert.equal(r.state.kaiju.used.roar, true);
  const p = kinds(r.events, "panic");
  assert.deepEqual(p.map((e) => [e.type, e.broke]), [["infantry", true], ["maser", false]]);
  assert.equal(r.state.units[0].panicked, 2);
  assert.equal(kinds(r.events, "radio")[0].callsign, "GUARD");
  refused(r.state, { t: "roar" });

  s.rng = rigDice((m) => m.roll(6) + m.roll(6) <= 5);
  assert.equal(kinds(ok(s, { t: "roar" }).events, "panic")[0].broke, false);

  const after = ok(r.state, { t: "end" });
  const inf = after.state.units.find((u) => u.type === "infantry");
  assert.equal(inf.panicked, 1);
  assert.ok(!kinds(after.events, "attack").some((e) => e.attacker.id === "u1"), "a broken unit does not fire");
  assert.ok(H.distance(inf.at, HOME) > 1, "and it runs");
  assert.equal(ok(after.state, { t: "end" }).state.units.find((u) => u.type === "infantry").panicked, 0);
});

test("reinforcements arrive on their turn, at the nearest free hex", () => {
  const s = create(setup(FORTRESS_LITE));
  const t1 = ok(s, { t: "end" });
  assert.equal(kinds(t1.events, "reinforce").length, 0);
  const t2 = ok(t1.state, { t: "end" });
  const r = kinds(t2.events, "reinforce");
  assert.equal(r.length, 1);
  assert.equal(r[0].type, "helicopter");
  assert.equal(r[0].at, at(6, 0));
  assert.equal(t2.state.pending.length, 0);

  const blocked = structuredClone(t1.state);
  putUnit(blocked, "infantry", at(6, 0));
  const r2 = kinds(ok(blocked, { t: "end" }).events, "reinforce")[0];
  assert.equal(H.distance(r2.at, at(6, 0)), 1);
});

test("win: the objective falls", () => {
  const s = game();
  s.kaiju.at = "10,0";
  s.map.hexes["11,0"].structure.hp = 1;
  const { state, events } = ok(s, { t: "stomp", target: "11,0" });
  assert.equal(state.phase, "over");
  assert.equal(state.result.outcome, "goal");
  assert.equal(state.result.grade, "total victory");
  assert.deepEqual(state.result.score, { destruction: 200, units: 0, objective: 500, time: 180, parts: 250, total: 1130 });
  assert.ok(state.result.headline.length > 0);
  assert.equal(state.result.headline, state.result.headline.toUpperCase());
  assert.equal(events[events.length - 1].k, "over");
  refused(state, { t: "end" });

  s.kaiju.parts.body.hp = Math.floor(s.kaiju.parts.body.max / 2);
  assert.equal(ok(s, { t: "stomp", target: "11,0" }).state.result.grade, "victory");
});

test("loss: the body reaches zero", () => {
  const s = game({ kaiju: "thalassor" }, (m) => paintKey(m, "features", E, "P"));
  for (const p of ["head", "arms", "legs", "aux"]) s.kaiju.parts[p].hp = 0;
  s.kaiju.parts.body.hp = 1;
  const { state, events } = ok(s, { t: "move", to: E });
  assert.equal(state.result.outcome, "fallen");
  assert.equal(state.result.grade, "defeat");
  assert.equal(state.result.score.parts, 0);
  assert.ok(kinds(events, "destroyed").some((e) => e.what === "kaiju"));
});

test("time: the turn limit passes", () => {
  const s = game();
  s.turn = s.turnLimit;
  const { state } = ok(s, { t: "end" });
  assert.equal(state.result.outcome, "time");
  assert.equal(state.result.grade, "draw");
  assert.equal(state.result.score.objective, 0);
  assert.equal(state.result.score.time, 0);
  assert.equal(state.turn, s.turnLimit);
});

test("withdraw: only from a retreat hex", () => {
  const s = game();
  refused(s, { t: "withdraw" });
  s.kaiju.at = at(5, 13);
  const { state, events } = ok(s, { t: "withdraw" });
  assert.equal(state.kaiju.withdrawn, true);
  assert.equal(state.result.outcome, "withdrawn");
  assert.equal(state.result.grade, "draw");
  assert.equal(kinds(events, "withdraw").length, 1);
});

test("rival: beaten in a fight, or driven off", () => {
  const s = create(setup(COAST_LITE, { rival: "thalassor" }));
  s.rival.at = H.neighbor(s.kaiju.at, 1);
  s.rival.facing = 1;
  for (const p of ["head", "arms", "legs", "aux"]) s.rival.parts[p].hp = 0;
  s.rival.parts.body.hp = 1;
  const f = forecast(s, "bite", s.rival.at);
  assert.equal(f.targets[0].kind, "kaiju");
  assert.deepEqual(f.targets[0].damage, [3 + 1 - 2, 5 + 1 - 2], "bitten from behind, through armor 2");
  s.rng = rigDice((m) => m.roll(100) <= 85);
  const { state, events } = ok(s, { t: "attack", attack: "bite", target: s.rival.at });
  const a = kinds(events, "attack")[0];
  assert.equal(a.defender.side, "rival");
  assert.equal(a.rear, true);
  assert.equal(a.part, "body");
  assert.equal(state.result.outcome, "goal");

  const r = create(setup(COAST_LITE, { rival: "squamous" }));
  r.rival.at = at(8, 0);
  r.rival.parts.body.hp = 2;
  const out = ok(r, { t: "end" });
  assert.equal(out.state.rival.withdrawn, true);
  assert.equal(out.state.result.outcome, "goal");
});

test("lingering: the mad scientist's hits cost AP for the rest of the mission", () => {
  const s = game();
  putUnit(s, "scientist", H.ray(HOME, 0, 2)[1]);
  s.rng = rigDice((m) => m.roll(100) <= 70);
  const { state } = ok(s, { t: "end" });
  assert.equal(state.kaiju.lingering, 1);
  assert.equal(state.kaiju.apMax, 5);
});

test("the maser fires every other turn", () => {
  let s = game();
  s.kaiju.parts.body.hp = s.kaiju.parts.body.max = 999;
  putUnit(s, "maser", H.ray(HOME, 0, 3)[2]);
  const fired = [];
  for (let i = 0; i < 4; i++) {
    const out = ok(s, { t: "end" });
    fired.push(kinds(out.events, "attack").length);
    s = out.state;
  }
  assert.deepEqual(fired, [1, 0, 1, 0]);
});

test("unit orders and rival orders are refused from outside", () => {
  const s = create(setup(COAST_LITE, { rival: "thalassor" }));
  refused(s, { t: "umove", id: "u1", to: at(6, 8) });
  refused(s, { t: "ufire", id: "u1", target: "kaiju" });
  refused(s, { t: "move", actor: "rival", to: at(9, 3) });
  refused(s, { t: "dance" });
});

test("step never mutates its input", () => {
  let s = create(setup(COAST_LITE, { rival: "squamous", seed: 3 }));
  const cmds = [{ t: "roar" }, { t: "move", to: Object.keys(reach(s))[0] }, { t: "end" }, { t: "end" }, { t: "face", dir: 2 }, { t: "end" }];
  for (const cmd of cmds) {
    const before = JSON.stringify(s);
    const out = step(s, cmd);
    assert.equal(JSON.stringify(s), before);
    s = out.state;
  }
});

test("replays are deterministic and every event has plain text", () => {
  const su = setup(FORTRESS_LITE, { seed: 42 });
  const s0 = create(su);
  const cmds = [{ t: "move", to: Object.keys(reach(s0)).sort()[3] }, { t: "end" }, { t: "roar" }, { t: "end" }, { t: "end" }, { t: "end" }];
  const a = replay(su, cmds);
  const b = replay(su, cmds);
  assert.deepEqual(a, b);
  assert.notDeepEqual(replay(setup(FORTRESS_LITE, { seed: 43 }), cmds).rng, a.rng);

  let s = s0;
  for (const cmd of cmds) {
    const out = step(s, cmd);
    for (const e of out.events) {
      assert.equal(typeof e.text, "string");
      assert.ok(e.text.length > 0, `empty text for ${e.k}`);
      assert.ok(!e.text.includes("!"), e.text);
      assert.ok(!e.text.includes("{"), e.text);
      assert.ok(!e.text.includes("undefined"), e.text);
    }
    s = out.state;
  }
});

test("actions and describeHex", () => {
  const s = game({}, (m) => paintKey(m, "features", E, "2"));
  putUnit(s, "infantry", W);
  const list = actions(s);
  assert.deepEqual(list.map((a) => a.id), ["move", "face", "bite", "tail", "breath", "stomp", "eat", "roar", "withdraw", "end"]);
  for (const a of list) {
    assert.equal(typeof a.enabled, "boolean");
    assert.equal(typeof a.why, "string");
    if (!a.enabled) assert.ok(a.why.length > 0);
  }
  assert.equal(list.find((a) => a.id === "breath").enabled, false);
  assert.equal(list.find((a) => a.id === "eat").enabled, true);
  assert.equal(list.find((a) => a.id === "withdraw").enabled, false);
  const d = describeHex(s, E);
  assert.equal(d.structure.type, "mid");
  assert.equal(d.terrain.id, "open");
  assert.match(d.text, /Office block/);
  assert.equal(describeHex(s, W).units[0].type, "infantry");
  assert.equal(describeHex(s, HOME).kaiju.id, "radiosaur");
});

test("a defense phase with 20 units takes well under 50 ms", () => {
  const s = game();
  s.kaiju.parts.body.hp = s.kaiju.parts.body.max = 9999;
  const types = ["infantry", "tank", "artillery", "helicopter", "jet", "missile", "gun", "scientist"];
  const spots = Object.keys(s.map.hexes).filter((k) => H.distance(k, HOME) >= 3).sort();
  for (let i = 0; i < 20; i++) putUnit(s, types[i % types.length], spots[i * 7]);
  step(s, { t: "end" });
  const t0 = performance.now();
  const out = step(s, { t: "end" });
  const ms = performance.now() - t0;
  assert.equal(out.state.units.length, 20);
  assert.ok(ms < 50, `defense phase took ${ms.toFixed(1)} ms`);
});

test("forecast: return fire names the rival when it can reach, and not when it cannot", () => {
  const s = create(setup(COAST_LITE, { rival: "thalassor" }));
  s.units = [];
  const rivalNear = (st) => forecast(st, "bite", st.rival.at).returnFire.filter((x) => x.unit === "rival");
  const near = H.ray(s.kaiju.at, 0, 2)[1];
  s.map.hexes[near].structure = null;
  s.map.hexes[near].terrain = "open";
  s.rival.at = near;
  const [r] = rivalNear(s);
  assert.ok(r, "the rival two hexes off is in the return fire");
  assert.equal(r.type, "thalassor");
  assert.match(r.name, /^Thalassor: /);
  assert.ok(r.hitChance > 0 && r.damage[0] >= 1);
  const far = Object.keys(s.map.hexes).find((h) => H.distance(h, s.kaiju.at) > s.rival.apMax + 3);
  assert.ok(far, "the fixture map has a hex out of the rival's reach");
  s.rival.at = far;
  assert.equal(rivalNear(s).length, 0);
  s.rival.at = near;
  s.rival.parts.body.hp = 0;
  assert.equal(rivalNear(s).length, 0);
});

test("create refuses names it inherits rather than owns", () => {
  assert.throws(() => create(setup(blank(), { kaiju: "constructor" })), /Unknown kaiju/);
  assert.throws(() => create(setup(blank(), { mutations: ["constructor"] })), /Unknown mutation/);
  assert.throws(() => create(setup(CITY_LITE, { target: "constructor" })), /needs a target/);
  assert.throws(() => create(setup(COAST_LITE, { rival: "toString" })), /Unknown kaiju/);
});

test("air units fly over a wall but never stop on it", () => {
  const s = game({}, (m) => { m.map.features[3] = "WWWWWWWWWWWW"; });
  const heli = putUnit(s, "helicopter", at(2, 5));
  const tank = putUnit(s, "tank", at(8, 5));
  const flies = unitReach(s, heli.id);
  assert.ok(flies[at(2, 1)], "the helicopter reaches the far side of the wall");
  for (let c = 0; c < 12; c++) assert.equal(flies[at(c, 3)], undefined, "it may not stop on the wall");
  for (const key of Object.keys(unitReach(s, tank.id))) assert.ok(H.keyToOffset(key).row > 3, "the tank stays on its side");
});

test("a blast that kills mid-walk ends the move event where the walk ended", () => {
  const E2 = H.neighbor(E, 0);
  const s = game({ kaiju: "thalassor" }, (m) => {
    paintKey(m, "features", E, "T");
    paintKey(m, "terrain", H.neighbor(HOME, 1), "^");
    paintKey(m, "terrain", H.neighbor(HOME, 5), "^");
  });
  assert.deepEqual(reach(s)[E2].path, [E, E2], "the cheapest way runs through the pylon");
  for (const p of Object.keys(s.kaiju.parts)) s.kaiju.parts[p].hp = 1;
  const out = ok(s, { t: "move", to: E2 });
  const move = kinds(out.events, "move")[0];
  assert.equal(move.to, E);
  assert.deepEqual(move.path, [E]);
  assert.equal(out.state.kaiju.at, E);
  assert.equal(out.state.result.outcome, "fallen");
});

test("return fire leaves out a rival that cannot reach", () => {
  const s = create(setup(COAST_LITE, { rival: "squamous" }));
  s.units = [];
  const spot = Object.keys(s.map.hexes).find((h) => H.distance(h, s.kaiju.at) === 4 && H.neighbors(h).every((n) => s.map.hexes[n]));
  s.rival.at = spot;
  s.rival.energy = 0;
  for (const n of H.neighbors(spot)) s.map.hexes[n].structure = { type: "wall", hp: 8, maxHp: 8 };
  assert.equal(forecast(s, "bite", spot).returnFire.filter((x) => x.unit === "rival").length, 0,
    "walled in, with a grab of range 2, four hexes off");
});
