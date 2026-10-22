// The page reads kaijuDef(id, variant).look and hands it to the art. Every look the data lists
// must have art under the same id, or the page throws when it draws the card.
import test from "node:test";
import assert from "node:assert/strict";
import { LOOKS, VARIANTS, kaijuDef } from "../src/data/variants.js";
import { LOOK_IDS, portrait, silhouette, figure, token } from "../src/art/kaiju.js";

test("every look in LOOKS has art under its own id", () => {
  for (const [kaiju, list] of Object.entries(LOOKS)) {
    for (const look of list) {
      const def = kaijuDef(kaiju, look === kaiju ? null : look);
      assert.equal(def.look, look);
      assert.ok(LOOK_IDS.includes(look), `no art id ${look}`);
      for (const draw of [portrait, silhouette, figure, token]) assert.match(draw(def.look), /^<svg|^<g|^<circle/, `${look} ${draw.name}`);
    }
  }
});

test("every variant is a look of its base, and every art id is a look", () => {
  for (const v of Object.values(VARIANTS)) assert.ok(LOOKS[v.of].includes(v.id), v.id);
  const listed = Object.values(LOOKS).flat();
  for (const id of LOOK_IDS) assert.ok(listed.includes(id), `art id ${id} is in no LOOKS list`);
});
