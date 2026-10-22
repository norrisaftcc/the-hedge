// Plays one kaiju game in a real browser at phone and desktop sizes, light and dark, and reports
// what a person would see go wrong: console errors, sideways scroll, a missing end screen or review.
// Serve the page first (cd kaiju && python3 -m http.server 8000), then from the repository root:
//   node .claude/skills/kaiju-check/smoke.cjs [--url http://localhost:8000/] [--out DIR]
//        [--kaiju radiosaur] [--mission rampage] [--objective destruction] [--seed 12] [--cutaway on]
// The cutaway is set off to save time; --cutaway on leaves it at its default, as a player sees it.
// Prints one JSON line per run and exits 1 if any run has a problem.
const path = require("node:path");
const fs = require("node:fs");

function playwright() {
  for (const p of [process.env.PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* try the next */ }
  }
  throw new Error("Playwright not found. Set PLAYWRIGHT_PATH to its folder.");
}

const args = { url: "http://localhost:8000/", out: "kaiju-smoke", kaiju: "radiosaur", mission: "rampage", objective: "destruction", seed: "12" };
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
fs.mkdirSync(args.out, { recursive: true });

const idle = (page) => page.waitForFunction(() => window.kaiju && !window.kaiju.busy, null, { timeout: 90000 });

// A player who attacks when an attack is offered, and otherwise ends the turn.
async function playOut(page) {
  for (let i = 0; i < 400; i++) {
    await idle(page);
    if (await page.evaluate(() => !!window.kaiju.state.result)) return;
    const att = await page.$('.act[data-action]:not([disabled]):not([data-action="move"]):not([data-action="end"]):not([data-action="face"]):not([data-action="roar"]):not([data-action="withdraw"]):not([data-action="eat"])');
    if (att && i % 2 === 0) {
      await att.click(); await idle(page);
      const ok = await page.$('#sheet:not([hidden]) [data-ui="confirm"]:not([disabled])');
      if (ok) { await ok.click(); continue; }
      await page.keyboard.press("Escape");
    }
    await page.click('[data-action="end"]');
  }
}

(async () => {
  const { chromium } = playwright();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const sizes = [["phone", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ["desk", { viewport: { width: 1280, height: 800 } }]];
  let bad = false;
  for (const [size, opts] of sizes) {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ ...opts, colorScheme: theme });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(String(e)));
      if (args.cutaway !== "on") await page.addInitScript(() => { try { localStorage.setItem("kaiju-cutaway", "off"); } catch (e) { /* private window */ } });
      await page.goto(args.url);
      await page.click(`[data-kaiju="${args.kaiju}"]`);
      await page.click(`[data-mission="${args.mission}"]`);
      if (args.mission === "rampage") await page.click(`input[name="objective"][value="${args.objective}"]`);
      await page.fill("#seed", args.seed);
      await page.locator("#seed").dispatchEvent("change");
      await page.click("#deploy");
      await playOut(page);
      await page.click('[data-ui="confirm"]').catch(() => {});
      const tag = `${size}-${theme}`;
      let end = true;
      await page.waitForSelector("#end:not([hidden]) .review", { timeout: 20000 }).catch(() => { end = false; });
      await page.screenshot({ path: path.join(args.out, `${tag}-end.png`), fullPage: true });
      const seen = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        paragraphs: document.querySelectorAll(".review .rv-body > p").length,
        result: window.kaiju.state.result && { grade: window.kaiju.state.result.grade, outcome: window.kaiju.state.result.outcome, death: window.kaiju.state.result.death },
      }));
      const problems = [];
      if (errors.length) problems.push("console");
      if (seen.scroll > 0) problems.push("sideways scroll");
      if (!end) problems.push("no end screen with a review");
      else if (seen.paragraphs < 3) problems.push("review too short");
      if (problems.length) bad = true;
      console.log(JSON.stringify({ tag, ...seen, problems, errors }));
      await ctx.close();
    }
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
