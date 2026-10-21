// Hex arithmetic: offsets, distance, neighbours, lines, patterns and arcs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/hex.js";

test("offset and axial round trip", () => {
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 12; col++) {
      assert.deepEqual(H.keyToOffset(H.offsetToKey(col, row)), { col, row });
    }
  }
  assert.equal(H.offsetToKey(0, 1), "0,1");
  assert.equal(H.offsetToKey(0, 2), "-1,2");
  assert.deepEqual(H.parse("-3,4"), { q: -3, r: 4 });
});

test("distance", () => {
  assert.equal(H.distance("0,0", "0,0"), 0);
  assert.equal(H.distance("0,0", "3,0"), 3);
  assert.equal(H.distance("0,0", "2,-3"), 3);
  assert.equal(H.distance("0,0", "-2,-1"), 3);
  assert.equal(H.distance(H.offsetToKey(0, 0), H.offsetToKey(11, 13)), 18);
});

test("neighbours are six, distinct, at distance 1, in DIRS order", () => {
  const ns = H.neighbors("2,3");
  assert.equal(ns.length, 6);
  assert.equal(new Set(ns).size, 6);
  for (const n of ns) assert.equal(H.distance("2,3", n), 1);
  ns.forEach((n, d) => {
    assert.equal(n, H.neighbor("2,3", d));
    assert.equal(H.directionTo("2,3", n), d);
  });
});

test("line runs end to end in single steps", () => {
  assert.deepEqual(H.line("0,0", "0,0"), ["0,0"]);
  assert.deepEqual(H.line("0,0", "3,0"), ["0,0", "1,0", "2,0", "3,0"]);
  for (const b of ["4,-2", "-3,5", "2,2", "-5,0"]) {
    const l = H.line("0,0", b);
    assert.equal(l.length, H.distance("0,0", b) + 1);
    assert.equal(l[0], "0,0");
    assert.equal(l[l.length - 1], b);
    for (let i = 1; i < l.length; i++) assert.equal(H.distance(l[i - 1], l[i]), 1);
  }
});

test("ray, ring, range sizes", () => {
  assert.deepEqual(H.ray("0,0", 0, 3), ["1,0", "2,0", "3,0"]);
  assert.equal(H.ring("0,0", 0).length, 1);
  assert.equal(H.ring("0,0", 2).length, 12);
  for (const k of H.ring("1,1", 3)) assert.equal(H.distance("1,1", k), 3);
  assert.equal(H.range("0,0", 2).length, 19);
  assert.equal(H.range("0,0", 3).length, 37);
});

test("cones are the same size in every direction and partition the range", () => {
  const sizes = [0, 1, 2, 3, 4, 5].map((d) => H.cone("0,0", d, 3).length);
  assert.deepEqual(sizes, [6, 6, 6, 6, 6, 6]);
  const all = [0, 1, 2, 3, 4, 5].flatMap((d) => H.cone("0,0", d, 3));
  assert.equal(new Set(all).size, 36);
  assert.equal(H.cone("0,0", 0, 1).length, 1);
  for (const k of H.cone("0,0", 2, 3)) assert.equal(H.directionTo("0,0", k), 2);
});

test("directionTo breaks ties to the lower index", () => {
  assert.equal(H.directionTo("0,0", "2,-1"), 0); // 30 degrees: between east and north-east
  assert.equal(H.directionTo("0,0", "1,-2"), 1); // 90 degrees
  assert.equal(H.directionTo("0,0", "-1,-1"), 2); // 150 degrees
  assert.equal(H.directionTo("0,0", "-2,1"), 3); // 210 degrees
  assert.equal(H.directionTo("0,0", "-1,2"), 4); // 270 degrees
  assert.equal(H.directionTo("0,0", "1,1"), 5); // 330 degrees: the wrap goes to 5
  assert.equal(H.directionTo("0,0", "3,-1"), 0);
});

test("arc: front three sides, rear three sides", () => {
  const target = "0,0";
  for (let facing = 0; facing < 6; facing++) {
    const arcs = [0, 1, 2, 3, 4, 5].map((d) => H.arc(facing, H.neighbor(target, (facing + d) % 6), target));
    assert.deepEqual(arcs, ["front", "front", "rear", "rear", "rear", "front"]);
  }
  assert.equal(H.arc(0, "-3,0", "0,0"), "rear");
  assert.equal(H.arc(0, "3,0", "0,0"), "front");
});

test("toPixel and corners", () => {
  assert.deepEqual(H.toPixel("0,0", 24), { x: 0, y: 0 });
  const p = H.toPixel("0,2", 10);
  assert.ok(Math.abs(p.x - 10 * Math.sqrt(3)) < 1e-9 && Math.abs(p.y - 30) < 1e-9);
  const c = H.corners(0, 0, 10);
  assert.equal(c.length, 6);
  for (const [x, y] of c) assert.ok(Math.abs(Math.hypot(x, y) - 10) < 1e-9);
});
