// Tests for src/art: every drawing is an SVG string with balanced tags,
// silhouettes carry five parts, and damage changes what is drawn.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFS, STATES, PARTS } from "../src/art/defs.js";
import * as K from "../src/art/kaiju.js";
import * as U from "../src/art/units.js";
import * as T from "../src/art/terrain.js";

const KAIJU = ["radiosaur", "thalassor", "squamous", "dairengo"];
const UNITS = ["infantry", "tank", "artillery", "helicopter", "jet", "missile", "gun", "maser", "scientist"];
const TERRAIN = ["open", "road", "park", "forest", "shore", "water", "mountain", "rubble"];
const STRUCTURES = { low: 1, mid: 2, tower: 3, pylon: 1, plant: 2, lab: 2, leyline: 1, bunker: 2, wall: 3 };
const all = (s) => Object.fromEntries(PARTS.map((p) => [p, s]));

// Returns null when every opened tag is closed in order, else a description of the fault.
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

test("the checker catches unbalanced tags", () => {
  assert.equal(unbalanced("<g><path/></g>"), null);
  assert.notEqual(unbalanced("<g><g></g>"), null);
  assert.notEqual(unbalanced("<svg></g>"), null);
});

test("DEFS defines the damage patterns", () => {
  wellFormed(DEFS, "DEFS");
  for (const id of ["pat-hurt", "pat-bad", "pat-crippled"]) assert.ok(DEFS.includes(`id="${id}"`), id);
});

for (const id of KAIJU) {
  test(`kaiju ${id}: portrait, silhouette, figure and token in every state`, () => {
    for (const s of STATES) {
      wellFormed(K.portrait(id, { parts: all(s) }), `${id} portrait ${s}`);
      wellFormed(K.silhouette(id, { parts: all(s) }), `${id} silhouette ${s}`);
      wellFormed(K.figure(id, { parts: all(s) }), `${id} figure ${s}`);
      wellFormed(K.figure(id, { flip: true, parts: all(s) }), `${id} figure flipped ${s}`);
    }
    wellFormed(K.portrait(id), `${id} portrait, no parts`);
    wellFormed(K.figure(id), `${id} figure, no parts`);
    wellFormed(K.token(id), `${id} token`);
    assert.match(K.portrait(id), /viewBox="0 0 120 120"/);
    assert.match(K.silhouette(id), /viewBox="0 0 100 160"/);
    assert.match(K.figure(id), /viewBox="0 0 200 200"/);
  });

  test(`kaiju ${id}: silhouette has one path per part, classed by state`, () => {
    const parts = { head: "intact", arms: "hurt", body: "bad", legs: "crippled", aux: "hurt" };
    const svg = K.silhouette(id, { parts });
    const found = [...svg.matchAll(/<path data-part="(\w+)" class="part s-(\w+)"/g)];
    assert.equal(found.length, 5);
    assert.deepEqual(found.map((f) => f[1]).sort(), [...PARTS].sort());
    for (const [, part, state] of found) assert.equal(state, parts[part], part);
    assert.ok(svg.includes("url(#pat-crippled)"));
  });

  test(`kaiju ${id}: damage shows on the portrait and figure`, () => {
    const clean = (s) => s.replace(/id="[^"]+"|url\(#[^)]+\)/g, "");
    assert.notEqual(clean(K.portrait(id, { parts: all("crippled") })), clean(K.portrait(id)));
    assert.equal(clean(K.portrait(id, { parts: all("intact") })), clean(K.portrait(id)));
    assert.ok(clean(K.figure(id, { parts: all("bad") })).length > clean(K.figure(id)).length);
  });
}

test("kaiju facing notch is a group", () => {
  wellFormed(K.facingNotch(), "facingNotch");
});

test("unknown kaiju is refused", () => {
  assert.throws(() => K.portrait("mothra"));
});

for (const type of UNITS) {
  test(`unit ${type}: token and figures for counts 1 to 5`, () => {
    wellFormed(U.token(type), `${type} token`);
    for (let n = 1; n <= 5; n++) {
      const svg = U.figure(type, { count: n });
      wellFormed(svg, `${type} figure ${n}`);
      assert.equal((svg.match(/scale\(\d/g) || []).length, n, `${type} draws ${n}`);
    }
    wellFormed(U.figure(type, { flip: true, count: 3 }), `${type} flipped`);
    wellFormed(U.figure(type, { count: 9 }), `${type} count clamped`);
  });
}

test("terrain tiles", () => {
  for (const t of TERRAIN) {
    wellFormed(T.hexTile(t), `hexTile ${t}`);
    wellFormed(T.hexTile(t, 12), `hexTile ${t} small`);
    assert.ok(T.hexTile(t).includes(`--t-${t}`), `${t} uses its colour token`);
  }
});

test("structures, whole and damaged", () => {
  for (const [s, h] of Object.entries(STRUCTURES)) {
    wellFormed(T.structure(s, h), `structure ${s}`);
    wellFormed(T.structure(s, h, { damaged: true }), `structure ${s} damaged`);
    for (const hh of [1, 2, 3]) wellFormed(T.structure(s, hh), `structure ${s} height ${hh}`);
  }
});

test("backdrops for every terrain and structure", () => {
  for (const t of TERRAIN) {
    wellFormed(T.backdrop(t), `backdrop ${t}`);
    assert.match(T.backdrop(t), /viewBox="0 0 400 240"/);
    for (const s of Object.keys(STRUCTURES)) wellFormed(T.backdrop(t, { structure: s }), `backdrop ${t} + ${s}`);
  }
});
