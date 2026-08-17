import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("../backend/node_modules/playwright");

test("setup fragment is sent as an HTTP header and then removed from the URL", async () => {
  const script = await readFile(new URL("../frontend/setup-security.js", import.meta.url), "utf8");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent("<body></body>");
    await page.evaluate(() => { window.location.hash = "setup=secret%20token"; });
    const captured = await page.evaluate(async scriptText => {
      let seen = null;
      window.fetch = async (_input, init) => { seen = new Headers(init?.headers).get("X-MusikBot-Setup-Token"); return new Response("{}", { status: 200 }); };
      const el = document.createElement("script"); el.textContent = scriptText; document.documentElement.appendChild(el);
      await window.fetch("/api/setup", { method: "POST" });
      return { seen, hash: window.location.hash };
    }, script);
    assert.equal(captured.seen, "secret token");
    assert.equal(captured.hash, "");
  } finally {
    await browser.close();
  }
});
