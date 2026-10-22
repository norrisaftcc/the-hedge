// KAI-11 (issue #27, DESIGN 17.7): the body slam on the page. A button with its own key, a forecast
// sheet like any attack's, and a dry log line chosen by the turn and the hex, never by a die.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/hex.js";
import { create, step, forecast, actions } from "../src/rules.js";
import { RULES, KAIJU } from "../src/data/kaiju.js";
import { VARIANTS } from "../src/data/variants.js";
import { say, LINES } from "../src/voice.js";
import { planScenes, buildScene } from "../src/ui/cutaway.js";
import { actionKeys, actions as actionBar, forecastSheet } from "../src/ui/panels.js";
import { blank, setup } from "./fixtures.mjs";

function pair(kaiju = "squamous", rival = "dairengo", variant = null) {
  const m = blank({ objective: { kind: "rival" }, rivalStart: { at: [5, 0], facing: 3 }, rivalRetreat: [] });
  const s = create(setup(m, { kaiju, variant, rival }));
  s.rival.at = H.neighbor(s.kaiju.at, 0);
  return s;
}

const LOOKS = [...Object.keys(KAIJU).map((id) => [id, null]), ...Object.values(VARIANTS).map((v) => [v.of, v.id])];

test("the slam has its own key, and no action shares a key, for every kaiju and look", () => {
  for (const [id, variant] of LOOKS) {
    const keys = actionKeys(actions(pair(id, "radiosaur", variant)));
    assert.equal(keys.slam, "8", `${variant || id}`);
    const used = Object.values(keys);
    assert.equal(new Set(used).size, used.length, `${variant || id}: ${JSON.stringify(keys)}`);
  }
});

test("the digit keys read in order down the action list, for every kaiju and look", () => {
  for (const [id, variant] of LOOKS) {
    const list = actions(pair(id, "radiosaur", variant));
    const keys = actionKeys(list);
    const digits = list.map((a) => keys[a.id]).filter((k) => /^\d$/.test(k));
    assert.deepEqual(digits, [...digits].sort(), `${variant || id}: ${digits.join(" ")}`);
  }
});

test("the action bar shows a button for the slam: named from the data, 2 AP, key 8; off with a reason when no kaiju is beside", () => {
  const near = pair();
  const html = actionBar(actions(near), { mode: "move", busy: false, undo: false });
  const button = html.match(/<button[^>]*data-action="slam"[^>]*>.*?<\/button>/s)[0];
  assert.match(button, new RegExp(RULES.slamName));
  assert.match(button, /<kbd>8<\/kbd>/);
  assert.match(button, new RegExp(`${RULES.slamAp} AP`));
  assert.ok(!/disabled/.test(button.split(">")[0]), "enabled beside the rival");
  const far = pair();
  far.rival.at = H.ray(far.kaiju.at, 0, 3)[2];
  const off = actionBar(actions(far), { mode: "move", busy: false, undo: false }).match(/<button[^>]*data-action="slam"[^>]*>.*?<\/button>/s)[0];
  assert.match(off, /disabled/);
  assert.match(off, /No kaiju adjacent to slam\./);
});

test("the forecast sheet for a slam names it, costs 2 AP and 0 energy, and lists the rival with hit and damage", () => {
  const s = pair();
  s.rival.armor = 0;
  const fc = forecast(s, "slam", s.rival.at);
  const sheet = forecastSheet(fc, { name: RULES.slamName, note: "" });
  assert.match(sheet, new RegExp(`<b>${RULES.slamName}</b>`));
  assert.match(sheet, new RegExp(`${RULES.slamAp} AP`));
  assert.ok(!/energy/.test(sheet.split("fc-table")[0]), "no energy cost");
  const t = fc.targets[0];
  assert.match(sheet, new RegExp(`${t.hitChance}%`));
  assert.match(sheet, new RegExp(`${t.damage[0]}–${t.damage[1]}`));
  assert.ok(!/disabled/.test(sheet.match(/<button[^>]*data-ui="confirm"[^>]*>/)[0]), "confirm is open");
  // With nobody beside, the sheet has nothing to confirm.
  const far = pair();
  far.rival.at = H.ray(far.kaiju.at, 0, 3)[2];
  assert.match(forecastSheet(forecast(far, "slam", far.rival.at), { name: RULES.slamName }).match(/<button[^>]*data-ui="confirm"[^>]*>/)[0], /disabled/);
});

// The data an attack event carries, as the rules raise it.
function slamEvent(s) {
  return step(s, { t: "slam", target: s.rival.at }).events.find((e) => e.k === "attack");
}

test("the log line for a slam is dry, names no one it should not, and is the same every time", () => {
  for (const [id, variant] of LOOKS) {
    const s = pair(id, "thalassor", variant);
    const e = slamEvent(s);
    assert.equal(e.attack.id, "slam");
    assert.ok(e.text.length > 0 && !/[!{}]|undefined|NaN/.test(e.text), e.text);
    assert.equal(e.text, say("attack", e), "the event's text is the voice's text");
    assert.equal(say("attack", e), say("attack", { ...e }), "same data, same words");
  }
});

test("the slam's lines are the slam's own: not the generic ones, and the attack's name comes from the data", () => {
  const base = { attacker: { side: "kaiju", type: "radiosaur", variant: null }, defender: { side: "rival", type: "squamous", variant: null }, attack: { id: "slam", name: RULES.slamName }, damage: 3, rear: false, part: "head", terrain: "open", spill: 0, at: "4,4", turn: 1 };
  const hitTable = LINES.attack["kaijuHitsKaiju.slam"];
  const missTable = LINES.attack["kaijuMissesKaiju.slam"];
  assert.ok(Array.isArray(hitTable) && hitTable.length >= 3, "three hit lines");
  assert.ok(Array.isArray(missTable) && missTable.length >= 3, "three miss lines");
  for (const line of [...hitTable, ...missTable]) {
    assert.ok(!line.includes(RULES.slamName), `the name is hard-coded: ${line}`);
    assert.ok(!/closes the gap|just left/i.test(line), `a slam is thrown from beside the target: ${line}`);
    assert.ok(!/[!]/.test(line), line);
  }
  for (const hit of [true, false]) {
    const data = { ...base, hit, damage: hit ? 3 : 0 };
    const generic = { ...data, attack: { id: "nonesuch", name: RULES.slamName } };
    const mine = new Set();
    for (let n = 0; n < 6; n++) {
      const line = say("attack", { ...data, n });
      assert.notEqual(line, say("attack", { ...generic, n }), `${hit ? "hit" : "miss"} n=${n} fell back to the generic line`);
      assert.ok(!/[!{}]|undefined|NaN/.test(line), line);
      if (hit) assert.match(line, /3/, "the damage figure is in the line");
      mine.add(line);
    }
    assert.equal(mine.size, (hit ? hitTable : missTable).length, "every template is reachable");
  }
});

test("a rename in the data shows in the log: no slam line says 'Body slam' when the attack is named otherwise", () => {
  const base = { attacker: { side: "kaiju", type: "radiosaur", variant: null }, defender: { side: "rival", type: "squamous", variant: null }, attack: { id: "slam", name: "Shoulder charge" }, damage: 3, rear: false, part: "head", terrain: "open", spill: 0, at: "4,4" };
  const lines = [];
  for (const hit of [true, false]) for (let n = 0; n < 6; n++) lines.push(say("attack", { ...base, hit, damage: hit ? 3 : 0, turn: 1, n }));
  for (const line of lines) assert.ok(!/body slam/i.test(line), line);
  assert.ok(lines.some((l) => l.includes("Shoulder charge")), "the new name is used somewhere");
});

test("the slam's lines, hit and miss, differ with the turn", () => {
  const base = { attacker: { side: "kaiju", type: "radiosaur", variant: null }, defender: { side: "rival", type: "squamous", variant: null }, attack: { id: "slam", name: RULES.slamName }, damage: 3, rear: false, part: "head", terrain: "open", spill: 0, at: "4,4" };
  const hits = new Set();
  const misses = new Set();
  for (let turn = 1; turn <= 6; turn++) {
    hits.add(say("attack", { ...base, hit: true, turn }));
    misses.add(say("attack", { ...base, hit: false, damage: 0, turn }));
  }
  assert.ok(hits.size >= 2 && misses.size >= 2, "more than one line each");
});

test("a slam plays the kaiju-against-kaiju cutaway in the modes that show one, titled from the data", () => {
  const s = pair("squamous", "dairengo");
  const out = step(s, { t: "slam", target: s.rival.at });
  assert.equal(planScenes(out.events, "off").length, 0);
  for (const mode of ["all", "kaiju"]) {
    const groups = planScenes(out.events, mode);
    assert.equal(groups.length, 1, mode);
    const scene = buildScene(groups[0], s, out.state, out.events);
    assert.equal(scene.title, RULES.slamName);
    assert.equal(scene.left.name, "The Squamous One");
    assert.equal(scene.right.name, "Dai-Rengō");
    assert.match(scene.result.text, /^(MISS|−\d+)$/);
  }
});
