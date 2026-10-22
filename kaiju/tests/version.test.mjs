// The version a playtest names must be the one CHANGELOG.md describes (src/version.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version.js";

test("the newest CHANGELOG entry is the current VERSION", () => {
  const log = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const first = log.match(/^## (.*)$/m);
  assert.ok(first, "CHANGELOG.md has a '## ' heading");
  const version = /^(\d+\.\d+\.\d+)(:|$)/.exec(first[1]);
  assert.ok(version, `the newest entry is a version, not "${first[1]}"`);
  assert.equal(version[1], VERSION);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});
