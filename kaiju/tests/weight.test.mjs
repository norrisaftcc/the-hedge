// NFR-1: the first load stays under 300 KB over the wire. Counted as the page itself, its
// stylesheet and every module reachable from its script tag, each gzipped, summed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUDGET = 300_000;
const IMPORT = /(?:import|export)\s[^"']*?from\s*["'](\.[^"']+)["']|import\s*\(\s*["'](\.[^"']+)["']\s*\)|import\s*["'](\.[^"']+)["']/g;

function loaded() {
  const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
  const files = [resolve(ROOT, "index.html")];
  for (const [, href] of html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)) files.push(resolve(ROOT, href));
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const m of readFileSync(f, "utf8").matchAll(IMPORT)) walk(resolve(dirname(f), m[1] || m[2] || m[3]));
  };
  for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) walk(resolve(ROOT, src));
  return [...files, ...[...seen].sort()];
}

test("the first load is under 300 KB gzipped (NFR-1)", () => {
  const files = loaded();
  assert.ok(files.some((f) => f.endsWith("rules.js")), "the walk reaches the rules");
  const gz = files.reduce((n, f) => n + gzipSync(readFileSync(f), { level: 9 }).length, 0);
  assert.ok(gz < BUDGET, `${gz} bytes gzipped over ${files.length} files; the budget is ${BUDGET}`);
});
