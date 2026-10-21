// The dice match hedge/rng.py number for number.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Mulberry32, seedFromText } from "../src/rng.js";

test("nextU32 matches the Python vectors", () => {
  const m = new Mulberry32(7);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => m.nextU32()), [50271532, 266108690, 4195786334, 3002305430, 2239590375]);
});

test("roll(6) matches the Python vectors", () => {
  const m = new Mulberry32(7);
  assert.deepEqual(Array.from({ length: 10 }, () => m.roll(6)), [5, 3, 3, 3, 4, 3, 2, 6, 4, 3]);
});

test("seedFromText keeps the digits", () => {
  assert.equal(seedFromText("a1b2c3"), 123);
  assert.equal(seedFromText("no digits"), 0);
  assert.equal(seedFromText("99999999999999"), 276447231);
});

test("randint stays in bounds and the state is a u32", () => {
  const m = new Mulberry32(0xffffffff);
  for (let i = 0; i < 1000; i++) {
    const v = m.randint(3, 5);
    assert.ok(v >= 3 && v <= 5);
    assert.ok(Number.isInteger(m.state) && m.state >= 0 && m.state <= 0xffffffff);
  }
});
