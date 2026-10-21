// Lets "node --test kaiju/tests/" run the whole suite: Node 22 loads a directory argument as a module.
// Imports every *.test.mjs beside this file, so a test file needs no entry here.
import { readdirSync } from "node:fs";

for (const name of readdirSync(new URL(".", import.meta.url)).filter(n => n.endsWith(".test.mjs")).sort()) {
  await import(new URL(name, import.meta.url));
}
