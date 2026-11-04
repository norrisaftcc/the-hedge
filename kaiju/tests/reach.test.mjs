// KAI-11 (issue #27, DESIGN 17.2): a living monster can always hurt an adjacent rival kaiju.
// For every kaiju and every look, with any one of head, arms, legs or aux crippled, the
// once-a-mission attacks spent, full AP and energy, and the rival in any of the six directions,
// canHurtRival is true.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/hex.js";
import { create, computeAp } from "../src/rules.js";
import { KAIJU } from "../src/data/kaiju.js";
import { VARIANTS, kaijuDef } from "../src/data/variants.js";
import { canHurtRival } from "../tools/sim.mjs";
import { blank, setup } from "./fixtures.mjs";

const PARTS = ["head", "arms", "legs", "aux"];

// Every kaiju as the player's, base look first, then each variant of it.
const LOOKS = Object.keys(KAIJU).flatMap((id) => [{ id, variant: null }, ...Object.values(VARIANTS).filter((v) => v.of === id).map((v) => ({ id, variant: v.id }))]);

function field(look, rival) {
  const m = blank({ objective: { kind: "rival" }, rivalStart: { at: [5, 0], facing: 3 }, rivalRetreat: [] });
  return create(setup(m, { kaiju: look.id, variant: look.variant, rival }));
}

// Every case that fails, as a short description.
// hungry: the kaiju is also starving (hunger at its maximum), which costs AP.
// drained: a battery monster is also out of charge, which costs AP.
export function failures({ cripple = PARTS.map((p) => [p]), rivals = Object.keys(KAIJU), hungry = false, drained = false } = {}) {
  const bad = [];
  for (const look of LOOKS) {
    const def = kaijuDef(look.id, look.variant);
    for (const rival of rivals) {
      for (const parts of cripple) {
        for (let dir = 0; dir < 6; dir++) {
          const s = field(look, rival);
          for (const p of parts) s.kaiju.parts[p].hp = 0;
          if (hungry && s.kaiju.hunger !== null) s.kaiju.hunger = s.kaiju.hungerMax;
          if (drained && def.energy.rule === "battery") s.kaiju.energy = 0;
          // Full AP as the rules give it with these parts: crippled legs cost AP, with a floor of 1.
          s.kaiju.apMax = computeAp(s.kaiju);
          for (const a of def.attacks) if (a.effects.oncePerMission) s.kaiju.used[a.id] = true;
          s.rival.at = H.neighbor(s.kaiju.at, dir);
          if (!canHurtRival(s, { fresh: true })) bad.push(`${look.variant || look.id} vs ${rival}, ${parts.join("+")} crippled, rival in direction ${dir}`);
        }
      }
    }
  }
  return bad;
}

test("KAI-11: the cases cover every kaiju and every look", () => {
  assert.equal(LOOKS.length, Object.keys(KAIJU).length + Object.keys(VARIANTS).length);
});

test("KAI-11: every kaiju and look can hurt an adjacent rival with any one part crippled and its finishers spent", () => {
  const bad = failures();
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} cases fail`);
});

// Not yet true: a kaiju with crippled legs that is also starving has 1 AP (the floor), and a slam
// costs 2. It is the same case as the Squamous One's arms, one level down. (DESIGN 17.8)
test("KAI-11 (open): crippled legs and hunger leave 1 AP, and a 2 AP slam cannot be used", { todo: true }, () => {
  const bad = failures({ cripple: [["legs"]], hungry: true });
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} cases fail`);
});

// The same with a battery monster out of charge: crippled legs and an empty battery leave 1 AP.
test("KAI-11 (open): crippled legs and an empty battery leave 1 AP, and a 2 AP slam cannot be used", { todo: true }, () => {
  const bad = failures({ cripple: [["legs"]], drained: true });
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} cases fail`);
});
