// The city: Sidewinder and braid as MazeBuilder grows them, drawn as streets on the hex grid.

import { test } from "node:test";
import assert from "node:assert/strict";
import { growCity, growMaze, Grid, sidewinder, braid } from "../src/city.js";
import { Mulberry32 } from "../src/rng.js";
import { offsetToKey, keyToOffset, neighbors } from "../src/hex.js";

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

test("same seed, same city; other seeds, other cities", () => {
  assert.deepEqual(growCity({ seed: 7 }), growCity({ seed: 7 }));
  const seen = new Set(SEEDS.map((seed) => JSON.stringify(growCity({ seed }))));
  assert.ok(seen.size > 45);
});

test("the maze is MazeBuilder's: the same links as the Python for the same seed", () => {
  // From py_port's SidewinderMaze.on and Braid.on on a 6 x 6 Grid rolling Mulberry32 (hedge/maze.py).
  const vectors = [
    [1, 0, "4,12,14,12,12,8,6,14,15,14,12,10,3,1,3,7,8,1,3,4,11,7,14,10,7,8,1,1,3,3,5,12,8,4,9,1"],
    [7, 0.5, "6,14,12,14,12,10,3,3,4,11,4,9,3,7,10,5,14,10,3,3,3,6,9,3,3,1,1,1,6,11,5,12,12,12,13,9"],
    [7, 1, "6,14,14,14,12,10,3,3,5,11,6,9,3,7,10,5,15,10,3,3,3,6,9,3,3,5,9,5,14,11,5,12,12,12,13,9"],
  ];
  for (const [seed, p, links] of vectors) {
    assert.equal(growMaze({ seed, rows: 6, cols: 6, braid: p }).links.flat().join(","), links, `seed ${seed}, braid ${p}`);
  }
});

test("Sidewinder alone grows a perfect maze; full braiding leaves no dead ends", () => {
  for (const seed of SEEDS) {
    const grid = sidewinder(new Grid(6, 6, new Mulberry32(seed)));
    let links = 0;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) links += grid.linkCount(r, c);
    assert.equal(links / 2, 35);
    braid(grid, 1);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) assert.notEqual(grid.linkCount(r, c), 1);
  }
});

test("only city glyphs; every road bare, every block built on or a park", () => {
  for (const seed of SEEDS) {
    const { terrain, features } = growCity({ seed });
    assert.equal(terrain.length, 11);
    assert.equal(features.length, 11);
    for (let r = 0; r < 11; r++) {
      assert.equal(terrain[r].length, 12);
      assert.equal(features[r].length, 12);
      for (let c = 0; c < 12; c++) {
        const t = terrain[r][c];
        const f = features[r][c];
        assert.ok(["=", ".", '"'].includes(t), `terrain ${t}`);
        assert.ok([".", "1", "2", "3"].includes(f), `feature ${f}`);
        if (t === "=" || t === '"') assert.equal(f, ".");
        else assert.notEqual(f, ".");
      }
    }
  }
});

function roadKeys(terrain) {
  const keys = new Set();
  terrain.forEach((line, r) => [...line].forEach((g, c) => g === "=" && keys.add(offsetToKey(c, r))));
  return keys;
}

test("every road hex is connected to every other", () => {
  for (const size of [{}, { cols: 12, rows: 14 }, { cols: 9, rows: 7 }, { cols: 12, rows: 11, braid: 0 }, { cols: 12, rows: 11, braid: 1 }]) {
    for (const seed of SEEDS) {
      const roads = roadKeys(growCity({ seed, ...size }).terrain);
      const first = roads.values().next().value;
      const seen = new Set([first]);
      const queue = [first];
      while (queue.length) {
        for (const n of neighbors(queue.shift())) {
          if (roads.has(n) && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      assert.equal(seen.size, roads.size, `seed ${seed} ${JSON.stringify(size)}`);
    }
  }
});

test("Sidewinder's tell: the top row is one unbroken avenue", () => {
  for (const seed of SEEDS) {
    const { terrain } = growCity({ seed });
    assert.equal(terrain[0].slice(0, 11), "===========", `seed ${seed}`);
    // Below the avenue no other row of intersections runs unbroken every time.
  }
  const unbroken = SEEDS.filter((seed) => growCity({ seed }).terrain[4].slice(0, 11) === "===========");
  assert.ok(unbroken.length < SEEDS.length / 2);
});

test("the streets follow the coarse grid: intersections on even rows and columns", () => {
  for (const seed of SEEDS) {
    const roads = roadKeys(growCity({ seed }).terrain);
    for (const k of roads) {
      const { col, row } = keyToOffset(k);
      assert.ok(col % 2 === 0 || row % 2 === 0, `seed ${seed}: road at odd ${col},${row}`);
    }
    for (let row = 0; row < 11; row += 2) for (let col = 0; col < 12; col += 2) assert.ok(roads.has(offsetToKey(col, row)));
  }
});

test("buildings stand taller toward the middle", () => {
  let middle = 0;
  let middleN = 0;
  let edge = 0;
  let edgeN = 0;
  for (const seed of SEEDS) {
    const { features } = growCity({ seed });
    features.forEach((line, r) =>
      [...line].forEach((f, c) => {
        if (f === ".") return;
        if (c >= 3 && c <= 8 && r >= 3 && r <= 7) {
          middle += Number(f);
          middleN += 1;
        } else if (c <= 1 || c >= 10 || r <= 1 || r >= 9) {
          edge += Number(f);
          edgeN += 1;
        }
      }),
    );
  }
  assert.ok(middle / middleN > edge / edgeN + 0.4, `${middle / middleN} vs ${edge / edgeN}`);
});
