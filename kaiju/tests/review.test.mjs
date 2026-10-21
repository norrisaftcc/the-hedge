// The review (DESIGN §14.5): the game writes a 1981 magazine column about the game just played.

import { test } from "node:test";
import assert from "node:assert/strict";
import { create, step, replayEvents } from "../src/rules.js";
import { review, MAGAZINE } from "../src/voice.js";
import { resolveMission, OBJECTIVES } from "../src/data/missions.js";
import { UNITS } from "../src/data/units.js";
import { neighbors } from "../src/hex.js";
import { at, putUnit, rigDice } from "./fixtures.mjs";
import { playBot, setupFor, rampageSetup } from "../tools/sim.mjs";

const MODEL = "Crush, Crumble and Chomp!";

// Bot games across every mission, and every rampage objective, each with its events.
function games() {
  const out = [];
  const cells = [{ mission: "fortress" }, { mission: "swathe", target: "lab" }, { mission: "coast" }];
  for (const seed of [1, 2]) {
    for (const cell of cells) out.push({ name: `${cell.mission} ${seed}`, setup: setupFor("thalassor", cell, seed) });
    for (const id of Object.keys(OBJECTIVES)) out.push({ name: `rampage ${id} ${seed}`, setup: rampageSetup(seed === 1 ? "radiosaur" : "squamous", id, seed) });
  }
  return out.map((g) => {
    const { commands } = playBot(g.setup);
    return { ...g, commands, ...replayEvents(g.setup, commands) };
  });
}

const GAMES = games();

function quiet(kaiju = "radiosaur") {
  const s = create({ kaiju, mutations: [], mission: resolveMission("rampage", { seed: 7 }), objective: "destruction", seed: 7 });
  s.units = [];
  s.waves.cap = 0;
  for (const p of ["head", "arms", "legs", "aux"]) s.kaiju.parts[p].hp = 0;
  s.kaiju.parts.body.hp = 1;
  return s;
}

test("review: the shape, for every mission", () => {
  for (const g of GAMES) {
    const r = review(g.state, g.events);
    assert.deepEqual(Object.keys(r), ["magazine", "issue", "title", "dek", "byline", "paragraphs", "quote", "stars", "ratingText", "text"], g.name);
    assert.equal(r.magazine, MAGAZINE);
    assert.equal(r.magazine, "Cassette & Disk Monthly");
    assert.ok(r.paragraphs.length === 3 || r.paragraphs.length === 4, g.name);
    for (const p of r.paragraphs) assert.ok(typeof p === "string" && p.length > 40, `${g.name}: ${p}`);
    for (const field of ["issue", "title", "dek", "byline", "quote", "ratingText"]) assert.ok(r[field].length > 0, `${g.name}: ${field}`);
    assert.ok(Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 5, g.name);
    assert.ok(r.ratingText.startsWith("★".repeat(r.stars) + "☆".repeat(5 - r.stars) + " "), `${g.name}: ${r.ratingText}`);
  }
});

test("review: deterministic for a replay", () => {
  for (const g of GAMES) {
    const again = replayEvents(g.setup, g.commands);
    assert.deepEqual(review(again.state, again.events), review(g.state, g.events), g.name);
  }
});

test("review: no exclamation marks, and the model named once", () => {
  for (const g of GAMES) {
    const { text } = review(g.state, g.events);
    assert.equal(text.split(MODEL).length - 1, 1, `${g.name}: the model is named once`);
    assert.ok(!text.replace(MODEL, "").includes("!"), `${g.name}: ${text}`);
    assert.ok(!/undefined|NaN|null|\{|\}| {2}/.test(text), `${g.name}: ${text}`);
  }
});

test("review: quotes a line that is in the events", () => {
  for (const g of GAMES) {
    const r = review(g.state, g.events);
    assert.ok(g.events.some((e) => e.text === r.quote), `${g.name}: ${r.quote}`);
    assert.ok(r.paragraphs[r.paragraphs.length - 1].includes(`"${r.quote}"`), g.name);
    const blows = g.events.filter((e) => e.k === "attack" && e.attacker.side === "kaiju" && e.hit && e.damage > 0);
    if (blows.length) assert.equal(r.quote, blows.reduce((a, b) => (b.damage > a.damage ? b : a)).text, `${g.name}: the biggest blow`);
  }
});

test("review: with no blow struck, the quote is the last radio line", () => {
  const s = quiet();
  s.kaiju.parts.body.hp = 99;
  putUnit(s, "tank", neighbors(s.kaiju.at).find((k) => s.map.hexes[k].terrain !== "water"));
  const { state, events } = step(s, { t: "end" });
  const radio = events.filter((e) => e.k === "radio");
  assert.ok(radio.length > 0);
  const r = review(state, events);
  assert.equal(r.quote, radio[radio.length - 1].text);
  assert.equal(r.paragraphs.length, 4);
  assert.match(r.dek, /still going/);
});

test("review: the attack used most counts uses, not the victims an area attack reached", () => {
  for (const g of GAMES) {
    const sent = new Map();
    for (const c of g.commands) {
      const id = c.t === "stomp" ? "stomp" : c.t === "attack" ? c.attack : null;
      if (id) sent.set(id, (sent.get(id) || 0) + 1);
    }
    const firsts = new Map();
    for (const e of g.events) if (e.k === "attack" && e.attacker.side === "kaiju" && e.first) firsts.set(e.attack.id, (firsts.get(e.attack.id) || 0) + 1);
    for (const [id, n] of firsts) assert.ok(n <= sent.get(id), `${g.name}: ${id} ${n} uses, ${sent.get(id)} sent`);
    if (sent.size) assert.ok(firsts.size, `${g.name}: every use is marked`);
  }
});

test("review: a teleport attack counts as a use", () => {
  const s = quiet("squamous");
  const ev = (k, d) => ({ k, actor: "kaiju", turn: 1, text: "", ...d });
  const grab = { k: "attack", turn: 1, text: "", first: true, hit: false, damage: 0, attack: { id: "grab", name: "Tentacle grab" }, attacker: { side: "kaiju", id: "squamous" }, defender: { side: "unit", id: "u1", type: "tank" } };
  const events = [
    ev("move", { who: "squamous", teleport: true, attack: "angle", from: s.kaiju.at, to: s.kaiju.at, path: [s.kaiju.at] }),
    grab,
    ev("move", { who: "squamous", teleport: true, attack: "angle", from: s.kaiju.at, to: s.kaiju.at, path: [s.kaiju.at] }),
    grab,
    ev("move", { who: "squamous", teleport: true, attack: "angle", from: s.kaiju.at, to: s.kaiju.at, path: [s.kaiju.at] }),
  ];
  const r = review(s, events);
  assert.match(r.paragraphs[1], /wrong angle[^.]*three times/i);
});

test("review: with no blow and no radio line, the quote is the last line of the log", () => {
  const s = quiet();
  s.kaiju.at = at(5, 13);
  const { state, events } = step(s, { t: "withdraw" });
  assert.ok(!events.some((e) => e.k === "radio"));
  const r = review(state, events);
  assert.equal(r.quote, events[events.length - 1].text);
  assert.ok(r.paragraphs[3].includes(`"${r.quote}"`));
});

test("review: an inherited name on the state reads as somewhere, not undefined", () => {
  const s = quiet();
  for (const name of ["constructor", "toString", "__proto__"]) {
    s.mission = name;
    assert.doesNotMatch(review(s, []).text, /undefined|function|\[object/, name);
  }
});

test("review: the text holds every paragraph", () => {
  for (const g of GAMES) {
    const r = review(g.state, g.events);
    for (const part of [r.title, r.dek, r.byline, r.issue, ...r.paragraphs]) assert.ok(r.text.includes(part), `${g.name}: ${part}`);
    assert.ok(r.text.includes(MAGAZINE.toUpperCase()));
  }
});

test("review: stars come from the rampage's rating, or from the grade", () => {
  const byGrade = { "total victory": 5, victory: 4, draw: 3 };
  for (const g of GAMES) {
    const res = g.state.result;
    const want = res.grade === "rampage" ? res.stars : byGrade[res.grade] || (res.score.total > 500 ? 2 : 1);
    assert.equal(review(g.state, g.events).stars, want, g.name);
  }
});

test("review: a rampage names its objective, and the death in the dek and the third paragraph", () => {
  const phrases = { cuts: /thousand cuts/, sudden: /sudden death/, lingering: /lingering death/ };
  for (const g of GAMES.filter((x) => x.state.mission === "rampage")) {
    const r = review(g.state, g.events);
    assert.ok(r.paragraphs[0].includes(`${g.state.objective.name} rules`), g.name);
    assert.match(r.dek, phrases[g.state.result.death], g.name);
    assert.match(r.paragraphs[2], phrases[g.state.result.death], g.name);
  }
});

test("review: each of the Three Deaths is told", () => {
  // A thousand cuts: a tank finishes it.
  const c = quiet();
  putUnit(c, "tank", neighbors(c.kaiju.at).find((k) => c.map.hexes[k].terrain !== "water"));
  c.rng = rigDice((m) => m.roll(100) <= UNITS.tank.accuracy);
  const cuts = step(c, { t: "end" });
  // The sudden death: Thalassor stamps a power plant flat.
  const s = quiet("thalassor");
  const plant = at(...resolveMission("rampage", { seed: 7 }).targets.plant);
  s.map.hexes[plant].structure.hp = 1;
  s.kaiju.at = neighbors(plant).find((k) => s.map.hexes[k] && !s.map.hexes[k].structure);
  const sudden = step(s, { t: "stomp", target: plant });
  // The lingering death: the paralysis passes what AP can pay.
  const l = quiet();
  l.kaiju.lingering = 6;
  const lingering = step(l, { t: "end" });
  const told = [[cuts, "cuts", /thousand cuts/], [sudden, "sudden", /sudden death.*power plant/], [lingering, "lingering", /lingering death/]];
  for (const [out, death, phrase] of told) {
    assert.equal(out.state.result.death, death);
    const r = review(out.state, out.events);
    assert.match(r.paragraphs[2], phrase, death);
    assert.match(r.dek, death === "cuts" ? /thousand cuts/ : new RegExp(`${death} death`), death);
  }
});

test("review: two games do not read alike", () => {
  const texts = GAMES.map((g) => review(g.state, g.events));
  assert.equal(new Set(texts.map((r) => r.text)).size, texts.length);
  for (const i of [0, 1, 2, 3]) {
    const openings = new Set(texts.map((r) => r.paragraphs[i].split(". ")[0]));
    assert.ok(openings.size > 1, `paragraph ${i + 1} always opens the same way`);
  }
  assert.ok(new Set(texts.map((r) => r.title)).size > 3);
});
