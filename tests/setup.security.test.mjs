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
    await page.goto("data:text/html,<body></body>#setup=secret%20token");
    await page.addScriptTag({ content: script });
    const result = await page.evaluate(async () => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        const headers = new Headers(init?.headers);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      };
      await window.fetch("/api/setup", { method: "POST" });
      return window.location.href;
    });
    assert.ok(result.includes("data:text/html"));
    assert.ok(!result.includes("#setup="));
  } finally {
    await browser.close();
  }
});
