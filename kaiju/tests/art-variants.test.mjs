// Tests for the variants' art: every look draws (portrait, silhouette, figure, token) as
// well-formed SVG, silhouettes keep five data-part paths, and the four base kaiju draw
// exactly as they did before looks existed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { STATES, PARTS } from "../src/art/defs.js";
import * as K from "../src/art/kaiju.js";
import { VARIANT_ART, VARIANT_IDS } from "../src/art/variants.js";

const BASE = ["radiosaur", "thalassor", "squamous", "dairengo"];
const VARIANTS = ["meowthprrtep", "mekkasaurus", "colossus", "gekido"];
const all = (s) => Object.fromEntries(PARTS.map((p) => [p, s]));
const mixed = { head: "hurt", arms: "crippled", body: "bad", legs: "intact", aux: "hurt" };

function unbalanced(markup) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let m;
  while ((m = re.exec(markup))) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (!closing) stack.push(name);
    else if (stack.pop() !== name) return `unexpected </${name}>`;
  }
  return stack.length ? `unclosed <${stack.join("> <")}>` : null;
}

function wellFormed(markup, what) {
  assert.equal(typeof markup, "string", `${what}: not a string`);
  assert.match(markup, /^<(svg|g)[\s>]/, `${what}: does not start with <svg or <g`);
  assert.equal(unbalanced(markup), null, `${what}: tags not balanced`);
  assert.doesNotMatch(markup, /NaN|undefined/, `${what}: has NaN or undefined`);
}

test("LOOK_IDS lists the four base kaiju, then the four variants", () => {
  assert.deepEqual(K.KAIJU_IDS, BASE);
  assert.deepEqual(K.LOOK_IDS, [...BASE, ...VARIANTS]);
  assert.deepEqual(VARIANT_IDS, VARIANTS);
});

for (const id of K.LOOK_IDS) {
  test(`look ${id}: portrait, silhouette, figure and token in every state`, () => {
    for (const s of STATES) {
      wellFormed(K.portrait(id, { parts: all(s) }), `${id} portrait ${s}`);
      wellFormed(K.silhouette(id, { parts: all(s) }), `${id} silhouette ${s}`);
      wellFormed(K.figure(id, { parts: all(s) }), `${id} figure ${s}`);
      wellFormed(K.figure(id, { flip: true, parts: all(s) }), `${id} figure flipped ${s}`);
    }
    wellFormed(K.portrait(id, { parts: mixed }), `${id} portrait mixed`);
    wellFormed(K.portrait(id), `${id} portrait, no parts`);
    wellFormed(K.figure(id), `${id} figure, no parts`);
    wellFormed(K.token(id), `${id} token`);
    assert.match(K.token(id), new RegExp(`data-kaiju="${id}"`));
  });

  test(`look ${id}: the silhouette has the five data-part paths, in the same places`, () => {
    const svg = K.silhouette(id, { parts: mixed });
    const found = [...svg.matchAll(/<path data-part="(\w+)" class="part s-(\w+)" d="([^"]+)"/g)];
    assert.deepEqual(found.map((m) => m[1]).sort(), [...PARTS].sort());
    for (const [, part, state, d] of found) {
      assert.equal(state, mixed[part], `${id} ${part} state`);
      assert.ok(d.length > 20, `${id} ${part} path is empty`);
      for (const n of d.match(/-?\d+(\.\d+)?/g)) assert.ok(Math.abs(n) < 200, `${id} ${part}: ${n} is off the 100 x 160 box`);
    }
  });

  test(`look ${id}: drawn twice gives the same drawing`, () => {
    const norm = (svg) => svg.replace(/(pf|rim|[a-z]{1,3})[0-9a-z]+(?=["\)])/g, "#");
    assert.equal(norm(K.figure(id, { parts: mixed })), norm(K.figure(id, { parts: mixed })));
    assert.equal(K.silhouette(id, { parts: mixed }), K.silhouette(id, { parts: mixed }));
  });
}

test("an unknown look, or an inherited name, is not drawn", () => {
  for (const bad of ["nobody", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.throws(() => K.portrait(bad), /no art for kaiju/, bad);
    assert.throws(() => K.silhouette(bad), /no art for kaiju/, bad);
    assert.throws(() => K.figure(bad), /no art for kaiju/, bad);
    assert.throws(() => K.token(bad), /no art for kaiju/, bad);
  }
});

test("each variant draws differently from the kaiju it replaces", () => {
  const of = { meowthprrtep: "squamous", mekkasaurus: "radiosaur", colossus: "thalassor", gekido: "dairengo" };
  for (const [look, base] of Object.entries(of)) {
    assert.notEqual(K.token(look), K.token(base), look);
    // Mekkasaurus Prime keeps the tyrannosaurus's outline on purpose, so only the dressed drawings differ.
    assert.notEqual(K.figure(look).replace(look, base).replace(/ id="[^"]+"/g, ""), K.figure(base).replace(/ id="[^"]+"/g, ""), look);
    assert.notEqual(K.portrait(look).replace(/ id="[^"]+"/g, ""), K.portrait(base).replace(/ id="[^"]+"/g, ""), look);
    assert.equal(typeof VARIANT_ART[look].pal.frame, "string", look);
  }
});

// A sha1 of each base drawing (first 12 hex), taken from the code before looks existed.
// The ids a drawing makes up for its clip paths are renumbered, so the order the tests
// draw in does not matter.
const BASE_HASHES = {
  "radiosaur portrait none": "3cedde279b65",
  "radiosaur silhouette none": "48ae5d2b233f",
  "radiosaur figure none": "67649fdf877a",
  "radiosaur figure flip none": "b7b356411ab7",
  "radiosaur portrait intact": "3cedde279b65",
  "radiosaur silhouette intact": "48ae5d2b233f",
  "radiosaur figure intact": "67649fdf877a",
  "radiosaur figure flip intact": "b7b356411ab7",
  "radiosaur portrait hurt": "31983c8c4fd1",
  "radiosaur silhouette hurt": "2af7f7f16da7",
  "radiosaur figure hurt": "cebe821128e9",
  "radiosaur figure flip hurt": "79aea85f4d0d",
  "radiosaur portrait bad": "40d4dd0e32fb",
  "radiosaur silhouette bad": "65927ccdb2f1",
  "radiosaur figure bad": "f711dddd87a7",
  "radiosaur figure flip bad": "3cf9d7802556",
  "radiosaur portrait crippled": "b0fdde36e4ea",
  "radiosaur silhouette crippled": "3d59a56f7f32",
  "radiosaur figure crippled": "b2ca24578041",
  "radiosaur figure flip crippled": "f08db9d618ad",
  "radiosaur portrait mixed": "f8da63bd6ddd",
  "radiosaur silhouette mixed": "5673c13b61e0",
  "radiosaur figure mixed": "1079d5966ba1",
  "radiosaur figure flip mixed": "70626e0f87ea",
  "radiosaur token": "eb617844c397",
  "thalassor portrait none": "6d93000a78bd",
  "thalassor silhouette none": "3d3592a59d02",
  "thalassor figure none": "41e3a3e6ebbc",
  "thalassor figure flip none": "e867228dde75",
  "thalassor portrait intact": "6d93000a78bd",
  "thalassor silhouette intact": "3d3592a59d02",
  "thalassor figure intact": "41e3a3e6ebbc",
  "thalassor figure flip intact": "e867228dde75",
  "thalassor portrait hurt": "a5e9b67dd258",
  "thalassor silhouette hurt": "8fb1bf47b37b",
  "thalassor figure hurt": "35d44a136b9a",
  "thalassor figure flip hurt": "a3bab655e900",
  "thalassor portrait bad": "c0081e9de29d",
  "thalassor silhouette bad": "abe17564a4ef",
  "thalassor figure bad": "ac6cebea582f",
  "thalassor figure flip bad": "da72e0f13676",
  "thalassor portrait crippled": "80f859302e7d",
  "thalassor silhouette crippled": "41b8de4731d0",
  "thalassor figure crippled": "04b92fd5d860",
  "thalassor figure flip crippled": "0969f6953da5",
  "thalassor portrait mixed": "2cca8373df6a",
  "thalassor silhouette mixed": "36cc16cb8000",
  "thalassor figure mixed": "c41626e3014b",
  "thalassor figure flip mixed": "2d2be512e8d9",
  "thalassor token": "aaf758f918d3",
  "squamous portrait none": "29067371dbbe",
  "squamous silhouette none": "ac441e3032cb",
  "squamous figure none": "6a5d979e6eda",
  "squamous figure flip none": "71af0db3feb7",
  "squamous portrait intact": "29067371dbbe",
  "squamous silhouette intact": "ac441e3032cb",
  "squamous figure intact": "6a5d979e6eda",
  "squamous figure flip intact": "71af0db3feb7",
  "squamous portrait hurt": "773a3f423112",
  "squamous silhouette hurt": "6ba24f5f5bb8",
  "squamous figure hurt": "631c91b13141",
  "squamous figure flip hurt": "826910f61ca1",
  "squamous portrait bad": "3f3d8dad5c68",
  "squamous silhouette bad": "9bca64a9026e",
  "squamous figure bad": "1265934358c1",
  "squamous figure flip bad": "ce3feb526c1c",
  "squamous portrait crippled": "3a9e6e53544f",
  "squamous silhouette crippled": "67628115bac5",
  "squamous figure crippled": "ae2afe0843f7",
  "squamous figure flip crippled": "9a96c88f492f",
  "squamous portrait mixed": "eb62c0569076",
  "squamous silhouette mixed": "40ea268ef4e1",
  "squamous figure mixed": "b58a666219d9",
  "squamous figure flip mixed": "b21306d9075e",
  "squamous token": "5aac67f0fafa",
  "dairengo portrait none": "b13ccabef189",
  "dairengo silhouette none": "b09b64e5eb45",
  "dairengo figure none": "f75af652cdb1",
  "dairengo figure flip none": "2d61f83f6a92",
  "dairengo portrait intact": "b13ccabef189",
  "dairengo silhouette intact": "b09b64e5eb45",
  "dairengo figure intact": "f75af652cdb1",
  "dairengo figure flip intact": "2d61f83f6a92",
  "dairengo portrait hurt": "a62e7a7fa287",
  "dairengo silhouette hurt": "b2bb1d3747e6",
  "dairengo figure hurt": "afec96ab74f5",
  "dairengo figure flip hurt": "c07cfd5704ac",
  "dairengo portrait bad": "03b3248cec4a",
  "dairengo silhouette bad": "e6c4d0b8c680",
  "dairengo figure bad": "40aa5e9922f8",
  "dairengo figure flip bad": "dc0c60e9bc2d",
  "dairengo portrait crippled": "9160953e3368",
  "dairengo silhouette crippled": "e05610ee00d5",
  "dairengo figure crippled": "9a4d84f2cc36",
  "dairengo figure flip crippled": "5345ca915b4e",
  "dairengo portrait mixed": "5e5ea1a3a0a7",
  "dairengo silhouette mixed": "fd0dbb611993",
  "dairengo figure mixed": "952e0bbd9afb",
  "dairengo figure flip mixed": "384940877828",
  "dairengo token": "f6b8b2d8bc2a"
};

const renumber = (svg) => {
  const ids = new Map();
  for (const [, id] of svg.matchAll(/ id="([^"]+)"/g)) if (!ids.has(id)) ids.set(id, "#" + ids.size);
  let out = svg;
  for (const [id, n] of ids) out = out.split(id).join(n);
  return out;
};
const hashOf = (svg) => createHash("sha1").update(renumber(svg)).digest("hex").slice(0, 12);

test("the base drawings are unchanged, byte for byte", () => {
  const got = {};
  for (const id of BASE) {
    const sets = [["none", undefined], ...STATES.map((s) => [s, all(s)]), ["mixed", mixed]];
    for (const [n, parts] of sets) {
      got[`${id} portrait ${n}`] = hashOf(K.portrait(id, { parts }));
      got[`${id} silhouette ${n}`] = hashOf(K.silhouette(id, { parts }));
      got[`${id} figure ${n}`] = hashOf(K.figure(id, { parts }));
      got[`${id} figure flip ${n}`] = hashOf(K.figure(id, { flip: true, parts }));
    }
    got[`${id} token`] = hashOf(K.token(id));
  }
  assert.deepEqual(got, BASE_HASHES);
});
