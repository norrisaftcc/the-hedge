// The version a playtest names must be the one CHANGELOG.md describes (src/version.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version.js";

test("the newest CHANGELOG entry is the current VERSION", () => {
  const log = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const first = log.match(/^## (\d+\.\d+\.\d+)/m);
  assert.ok(first, "CHANGELOG.md has a '## x.y.z' heading");
  assert.equal(first[1], VERSION);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});
