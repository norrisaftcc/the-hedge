// Variants (DESIGN §15): another look for a kaiju. Data, rules, voice and the bot.
// The art test lives in art.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { create, step, replayEvents } from "../src/rules.js";
import { KAIJU, PART_SLOTS } from "../src/data/kaiju.js";
import { MUTATIONS, BUDGET } from "../src/data/mutations.js";
import { VARIANTS, LOOKS, kaijuDef } from "../src/data/variants.js";
import { headline, review, say } from "../src/voice.js";
import { playBot, setupFor, rampageSetup } from "../tools/sim.mjs";
import { blank, paint, setup, at } from "./fixtures.mjs";
import * as H from "../src/hex.js";

const ids = Object.keys(VARIANTS);
const CELLS = [{ mission: "fortress" }, { mission: "swathe", target: "lab" }, { mission: "coast" }];

// Events with the words and the variant marker taken out: what is left is the numbers.
function bare(v) {
  if (Array.isArray(v)) return v.map(bare);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!["text", "variant", "name", "headline"].includes(k)) out[k] = bare(x);
    return out;
  }
  return v;
}

test("kaijuDef with no variant is the base, with a look", () => {
  for (const id of Object.keys(KAIJU)) {
    const d = kaijuDef(id);
    assert.deepEqual(d, { ...KAIJU[id], look: id, variant: null });
    assert.equal(kaijuDef(id, null), d, "cached");
    assert.ok(Object.isFrozen(d) && Object.isFrozen(d.parts.head) && Object.isFrozen(d.attacks[0]));
  }
});

test("the looks: every kaiju lists its base first, at most four, and each variant is listed", () => {
  for (const [id, looks] of Object.entries(LOOKS)) {
    assert.equal(looks[0], id);
    assert.ok(looks.length <= 4);
    for (const l of looks.slice(1)) assert.equal(VARIANTS[l].of, id);
  }
  for (const v of ids) assert.ok(LOOKS[VARIANTS[v].of].includes(v), `${v} is listed`);
  assert.equal(ids.length, 4);
});

test("a variant has the base's shape, ids and patterns, and its own names", () => {
  for (const v of ids) {
    const x = VARIANTS[v];
    const base = KAIJU[x.of];
    const d = kaijuDef(x.of, v);
    assert.equal(d.variant, v);
    assert.equal(d.look, v);
    assert.equal(d.id, x.of);
    assert.deepEqual(Object.keys(d.parts), PART_SLOTS);
    assert.deepEqual(d.hitTable, base.hitTable);
    assert.deepEqual(d.attacks.map((a) => [a.id, a.pattern, a.kind, a.uses]), base.attacks.map((a) => [a.id, a.pattern, a.kind, a.uses]));
    assert.ok(d.name !== base.name && d.epithet !== base.epithet && d.blurb !== base.blurb);
    for (const p of PART_SLOTS) assert.ok(x.parts[p] && x.parts[p].name, `${v} names ${p}`);
    for (const a of base.attacks) assert.ok(x.attacks[a.id] && x.attacks[a.id].name, `${v} names ${a.id}`);
    assert.ok(d.attacks.some((a) => a.name !== base.attacks.find((b) => b.id === a.id).name), "some attack is renamed");
    // Nothing the variant renames shows the base's names.
    const text = JSON.stringify([d.name, d.epithet, Object.values(d.parts).map((p) => p.name), d.attacks.map((a) => a.name)]);
    assert.ok(!text.includes(base.name), `${v} does not use ${base.name}`);
  }
});

test("a variant's blurb or numbers do not touch the base", () => {
  const before = JSON.stringify(KAIJU);
  for (const v of ids) kaijuDef(VARIANTS[v].of, v);
  assert.equal(JSON.stringify(KAIJU), before);
});

test("unknown, inherited and wrong-kaiju variants throw", () => {
  assert.throws(() => kaijuDef("radiosaur", "nope"), /Unknown variant/);
  for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.throws(() => kaijuDef("radiosaur", bad), /Unknown variant/, bad);
    assert.throws(() => kaijuDef(bad), /Unknown kaiju/, bad);
  }
  assert.throws(() => kaijuDef("radiosaur", "gekido"), /not a look of/);
  assert.throws(() => kaijuDef("squamous", "mekkasaurus"), /not a look of/);
  assert.throws(() => create(setup(blank(), { variant: "gekido" })), /not a look of/);
  assert.throws(() => create(setup(blank(), { variant: "constructor" })), /Unknown variant/);
});

test("Meow'thprrtep quotes the art note, and says the head was redrawn", () => {
  const d = kaijuDef("squamous", "meowthprrtep");
  assert.ok(d.blurb.includes('"The Squamous head reads as a cat (two ear spikes)."'));
  assert.match(d.blurb, /redrawn/);
  assert.match(d.blurb, /restores it/);
  assert.match(d.blurb, /paws at the ends of the feelers/);
  assert.deepEqual(Object.values(d.parts).map((p) => p.name), ["Ears", "Paws", "Coat", "Footing", "The Eye"]);
  assert.deepEqual(d.attacks.map((a) => a.name), ["Paw grab", "The stare", "Wrong angle"]);
});

test("VAR-3: a variant with no changed numbers plays as its base, apart from the words", () => {
  const same = ids.filter((v) => !VARIANTS[v].change);
  assert.deepEqual(same.sort(), ["colossus", "gekido", "meowthprrtep"]);
  for (const v of same) {
    const x = VARIANTS[v];
    // A preset is a build, not a changed number: give the base the same build.
    const mutations = x.preset || [];
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const cell of CELLS) {
        const a = { ...setupFor(x.of, cell, seed), mutations };
        const b = { ...setupFor(`${x.of}:${v}`, cell, seed), mutations };
        const base = playBot(a);
        const alt = playBot(b);
        assert.deepEqual(alt.commands, base.commands, `${v} ${cell.mission} ${seed}: same commands`);
        const e1 = replayEvents(a, base.commands).events;
        const e2 = replayEvents(b, alt.commands).events;
        assert.deepEqual(bare(e2), bare(e1), `${v} ${cell.mission} ${seed}: same events`);
        assert.ok(e2.some((e) => e.variant === v), "the events carry the variant");
        assert.ok(e1.every((e) => e.variant === undefined), "a base game carries none");
      }
    }
  }
});

test("a variant game uses the variant's names in the log, and never the base's", () => {
  for (const v of ids) {
    const x = VARIANTS[v];
    const baseName = KAIJU[x.of].name;
    const baseParts = Object.values(KAIJU[x.of].parts).map((p) => p.name.toLowerCase());
    for (const cell of CELLS) {
      const s = setupFor(`${x.of}:${v}`, cell, 3);
      const { commands } = playBot(s);
      const { events, state } = replayEvents(s, commands);
      const log = events.map((e) => e.text).filter(Boolean);
      const all = log.join("\n");
      // The look's own part names may contain a base word ("sensor head"): take them out first.
      let rest = all;
      for (const q of Object.values(x.parts)) rest = rest.split(q.name.toLowerCase()).join("").split(q.name).join("");
      assert.ok(!all.includes(baseName), `${v}: no ${baseName} in the log`);
      for (const a of KAIJU[x.of].attacks) {
        if (Object.values(x.attacks).some((q) => q.name === a.name)) continue; // a name the look keeps
        assert.ok(!all.toLowerCase().includes(a.name.toLowerCase()), `${v}: no ${a.name}`);
      }
      for (const p of baseParts) {
        if (Object.values(x.parts).some((q) => q.name.toLowerCase() === p)) continue;
        assert.ok(!new RegExp(`\\b${p}\\b`, "i").test(rest), `${v}: no base part "${p}"`);
      }
      if (events.some((e) => e.actor === "kaiju" && e.text)) assert.ok(all.includes(x.name), `${v}: the log names ${x.name}`);
      // The newspaper and the review.
      if (state.result) {
        assert.ok(!headline(state.result, state).includes(baseName.toUpperCase()), "headline");
        const text = review(state, events);
        assert.ok(!JSON.stringify(text).includes(baseName), `${v}: the review does not use ${baseName}`);
        assert.ok(JSON.stringify(text).includes(x.name), `${v}: the review names ${x.name}`);
      }
    }
  }
});

test("a rampage review and headline name the variant", () => {
  const s = rampageSetup("radiosaur:mekkasaurus", "balanced", 2);
  const { commands } = playBot(s);
  const { events, state } = replayEvents(s, commands);
  assert.ok(state.result, "the game ended");
  const text = JSON.stringify(review(state, events));
  assert.ok(text.includes("Mekkasaurus Prime"));
  assert.ok(!text.includes("Radiosaur"));
  assert.match(headline(state.result, state), /MEKKASAURUS PRIME|ROBOT/);
});

test("the rival's variant is stored and named", () => {
  const m = blank({ rivalStart: { at: [5, 2], facing: 3 }, objective: { kind: "rival" } });
  const s = create(setup(m, { kaiju: "thalassor", rival: "dairengo", rivalVariant: "gekido" }));
  assert.equal(s.rival.variant, "gekido");
  assert.equal(s.kaiju.variant, null);
  assert.deepEqual(s.rival.mutations, [], "the rival takes no build");
  assert.throws(() => create(setup(m, { kaiju: "thalassor", rival: "radiosaur", rivalVariant: "gekido" })), /not a look of/);
});

test("Mekkasaurus Prime: armor 3, AP 5, no hunger, a battery that drains and charges beside power", () => {
  const d = kaijuDef("radiosaur", "mekkasaurus");
  assert.equal(d.armor, 3);
  assert.equal(d.ap, 5);
  assert.deepEqual(d.energy, { max: 12, start: 12, rule: "battery" });
  assert.equal(d.hunger, null);
  assert.deepEqual(d.passives, ["reactorBelly", "noHunger"]);
  assert.deepEqual(d.forbid, ["regen", "gut"]);
  assert.throws(() => create(setup(blank(), { variant: "mekkasaurus", mutations: ["regen"] })), /cannot take/);

  const mission = blank();
  const s = create(setup(mission, { variant: "mekkasaurus" }));
  const k = s.kaiju;
  assert.equal(k.variant, "mekkasaurus");
  assert.equal(k.armor, 3);
  assert.equal(k.hunger, null);
  assert.equal(k.hungerMax, null);
  const start = k.energy;
  assert.ok(start < 12, "the first phase has already drained one");
  const t1 = step(s, { t: "end" }).state;
  assert.equal(t1.kaiju.energy, start - 1, "a turn drains one");
  assert.equal(t1.kaiju.hunger, null, "and hunger never rises");
  assert.ok(step(s, { t: "end" }).events.some((e) => e.k === "energy" && e.why === "drain"));

  // Beside a pylon, the drain is made good and the cell charges.
  paint(mission, "features", 6, 7, "T");
  const near = create(setup(mission, { variant: "mekkasaurus" }));
  const adjacent = H.neighbors(near.kaiju.at).includes(at(6, 7)) || near.kaiju.at === at(6, 7);
  assert.ok(adjacent, "the pylon is beside the monster");
  assert.equal(near.kaiju.energy, 12, "drain 1, charge 4, capped at the maximum");
  near.kaiju.energy = 6;
  const t2 = step(near, { t: "end" }).state;
  assert.equal(t2.kaiju.energy, 6 - 1 + 4);
  assert.ok(step(near, { t: "end" }).events.some((e) => e.k === "energy" && e.why === "charge"));

  // The energy tracks the base's rule: the same kaiju without the variant eats and has hunger.
  const plain = create(setup(blank(), {}));
  assert.notEqual(plain.kaiju.hunger, null);
});

test("Mekkasaurus Prime plays differently from its base: it refuses to eat", () => {
  const s = create(setup(blank(), { variant: "mekkasaurus" }));
  const out = step(s, { t: "eat", target: at(5, 6) });
  assert.equal(out.events[0].k, "refuse");
  assert.match(out.events[0].text, /Mekkasaurus Prime does not eat/);
});

test("a preset build is used when mutations is absent, and obeys the budget and forbid", () => {
  for (const v of ids) {
    const x = VARIANTS[v];
    if (!x.preset) continue;
    const d = kaijuDef(x.of, v);
    const cost = x.preset.reduce((n, m) => n + MUTATIONS[m].cost, 0);
    assert.equal(cost, BUDGET, `${v} spends exactly the budget`);
    for (const m of x.preset) {
      assert.ok(Object.hasOwn(MUTATIONS, m));
      assert.ok(!d.forbid.includes(m), `${v} may take ${m}`);
    }
    assert.equal(new Set(x.preset).size, x.preset.length);
  }
  const g = create(setup(blank(), { kaiju: "dairengo", variant: "gekido", mutations: undefined }));
  assert.deepEqual(g.kaiju.mutations, ["hide", "bulk"]);
  assert.equal(g.kaiju.armor, KAIJU.dairengo.armor + 1);
  assert.equal(g.kaiju.parts.body.max, KAIJU.dairengo.parts.body.hp + 3, "bulk, and nothing left over");
  // The player may change it: explicit mutations win, even an empty list.
  const own = create(setup(blank(), { kaiju: "dairengo", variant: "gekido", mutations: ["legs"] }));
  assert.deepEqual(own.kaiju.mutations, ["legs"]);
  const none = create(setup(blank(), { kaiju: "dairengo", variant: "gekido", mutations: [] }));
  assert.deepEqual(none.kaiju.mutations, []);
  // A kaiju with no preset takes no build when mutations is absent.
  const plain = create(setup(blank(), { kaiju: "dairengo", mutations: undefined }));
  assert.deepEqual(plain.kaiju.mutations, []);
  // The budget still applies to a variant's own build.
  assert.throws(() => create(setup(blank(), { kaiju: "dairengo", variant: "gekido", mutations: ["hide", "legs"] })), /budget/);
});

test("changes lay over the base: a variant may change AP, armor, part hp and attack numbers", () => {
  // The four shipped variants change few numbers; check the mechanism with a made-up one.
  VARIANTS.testing = {
    id: "testing",
    of: "thalassor",
    name: "Test",
    epithet: "a test",
    blurb: "A test.",
    parts: Object.fromEntries(PART_SLOTS.map((p) => [p, { name: p }])),
    attacks: { fist: { name: "F" }, trident: { name: "T" }, surge: { name: "S" } },
    change: { ap: 7, armor: 0, parts: { body: { hp: 30 } }, attacks: { fist: { damage: [1, 2], ap: 1 } } },
  };
  try {
    const d = kaijuDef("thalassor", "testing");
    assert.equal(d.ap, 7);
    assert.equal(d.armor, 0);
    assert.equal(d.parts.body.hp, 30);
    assert.equal(d.parts.head.hp, KAIJU.thalassor.parts.head.hp);
    assert.deepEqual(d.attacks[0].damage, [1, 2]);
    assert.equal(d.attacks[0].ap, 1);
    assert.equal(d.attacks[1].ap, KAIJU.thalassor.attacks[1].ap);
    assert.equal(KAIJU.thalassor.attacks[0].damage[0], 3, "the base is untouched");
    // Replace the data (the def is cached by the data object): a change to an attack that is not there.
    VARIANTS.testing = { ...VARIANTS.testing, change: { attacks: { nope: { ap: 1 } } } };
    assert.throws(() => kaijuDef("thalassor", "testing"), /Variant testing changes no attack nope/);
    VARIANTS.testing = { ...VARIANTS.testing, change: { parts: { nope: { hp: 1 } } } };
    assert.throws(() => kaijuDef("thalassor", "testing"), /Variant testing changes no part nope/);
    VARIANTS.testing = { ...VARIANTS.testing, change: {}, parts: { nope: { name: "N" } } };
    assert.throws(() => kaijuDef("thalassor", "testing"), /Variant testing has no part nope/);
    VARIANTS.testing = { ...VARIANTS.testing, parts: {}, attacks: { nope: { name: "N" } } };
    assert.throws(() => kaijuDef("thalassor", "testing"), /Variant testing has no attack nope/);
  } finally {
    delete VARIANTS.testing;
  }
});

test("kaijuDef checks its arguments before its cache, so a bad call throws on a warm cache too", () => {
  // Warm every base and look first.
  for (const id of Object.keys(KAIJU)) for (const look of LOOKS[id]) kaijuDef(id, look === id ? null : look);
  // The string "null" is not the null variant.
  assert.throws(() => kaijuDef("radiosaur", "null"), /Unknown variant/);
  assert.equal(kaijuDef("radiosaur", null).variant, null);
  assert.equal(kaijuDef("radiosaur", undefined).variant, null);
  // An array that prints as an id is not the id.
  assert.throws(() => kaijuDef(["radiosaur"]), /Unknown kaiju/);
  assert.throws(() => kaijuDef("radiosaur", ["mekkasaurus"]), /Unknown variant/);
  // A look of another kaiju still throws once the right pair is cached.
  assert.throws(() => kaijuDef("thalassor", "mekkasaurus"), /not a look of/);
  assert.throws(() => kaijuDef(null), /Unknown kaiju/);
  // A look that is taken out of the data is gone, though its def was cached.
  VARIANTS.gone = { ...VARIANTS.colossus, id: "gone", name: "Gone" };
  try {
    assert.equal(kaijuDef("thalassor", "gone").name, "Gone");
    VARIANTS.gone = { ...VARIANTS.gone, name: "Changed" };
    assert.equal(kaijuDef("thalassor", "gone").name, "Changed", "new data, new def");
  } finally {
    delete VARIANTS.gone;
  }
  assert.throws(() => kaijuDef("thalassor", "gone"), /Unknown variant/);
});

test("the base kaiju's log lines are the base's own, and a look gets its own words for the same blows", () => {
  const blow = (type, variant, attack, defender) => ({
    attacker: { side: "kaiju", type, variant },
    defender,
    attack,
    hit: true,
    damage: 4,
    part: "body",
    spill: 0,
    terrain: "plain",
    turn: 1,
    n: 0,
  });
  const house = { side: "structure", type: "house" };
  // The base Thalassor's surge on a structure still speaks of water, on both lines of the pick.
  const base = [];
  for (const turn of [0, 1]) base.push(say("attack", { ...blow("thalassor", null, { id: "surge", name: "Tidal surge" }, house), turn }));
  assert.ok(base.every((t) => /water|sea/i.test(t)), base.join(" | "));
  // Base Radiosaur and Dairengo keep their own words too.
  assert.match(say("attack", blow("radiosaur", null, { id: "breath", name: "Atomic breath" }, house)), /^Atomic breath/);
  assert.match(say("attack", blow("dairengo", null, { id: "finish", name: "Final formation" }, { side: "kaiju", type: "squamous", variant: null })), /Five machines/);
  assert.match(say("attack", blow("squamous", null, { id: "grab", name: "Tentacle grab" }, { side: "kaiju", type: "dairengo", variant: null })), /Tentacle/);
  // The look gets its own: no sea, no water, nothing of the base's blow.
  for (const turn of [0, 1]) {
    const t = say("attack", { ...blow("thalassor", "colossus", { id: "surge", name: "Ion surge" }, house), turn });
    assert.ok(!/water|sea|tidal/i.test(t), t);
  }
});

test("the bot plays every variant to an end on a seed", () => {
  for (const v of ids) {
    const { state } = playBot(setupFor(`${VARIANTS[v].of}:${v}`, CELLS[0], 1));
    assert.ok(state.result, `${v}: the game ended with a result`);
    assert.ok(state.turn > 1, `${v}: it ran more than one turn`);
  }
});
