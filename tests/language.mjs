import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";

const extensionPath = new URL("../.output/chrome-mv3", import.meta.url).pathname;

const english = { language: "en", welcome: "Thank you for installing", title: "Connections", connect: "Connect", description: "Connect and manage openlv connections" };

const cases = [
  { browser: "nl", language: "nl", welcome: "Bedankt voor het installeren", title: "Verbindingen", connect: "Verbinden", description: "openlv-verbindingen maken en beheren" },
  { browser: "nl-BE", language: "nl", welcome: "Bedankt voor het installeren", title: "Verbindingen", connect: "Verbinden" },
  { browser: "fr", ...english },
  { browser: "ar", ...english },
  { browser: "zh-CN", ...english },
];

for (const expected of cases) {
  test(`the extension follows the browser language ${expected.browser}`, { timeout: 30_000 }, async () => {
    const profile = await mkdtemp(join(tmpdir(), "openlv-language-"));
    let context;

    try {
      context = await chromium.launchPersistentContext(profile, {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        headless: true,
        locale: expected.browser,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, `--lang=${expected.browser}`],
      });
      const welcome = context.pages().find(page => page.url().endsWith("/onboarding.html")) ?? await context.waitForEvent("page");

      await welcome.getByRole("heading", { level: 1, name: expected.welcome, exact: true }).waitFor();
      assert.equal(await welcome.evaluate(() => document.documentElement.lang), expected.language);

      const popup = await context.newPage();

      await popup.goto(welcome.url().replace("onboarding.html", "popup.html"));
      await popup.getByRole("heading", { level: 1, name: expected.title, exact: true }).waitFor();
      assert.equal(await popup.locator("button.primary").textContent(), expected.connect);
      assert.equal(await popup.evaluate(() => document.documentElement.lang), expected.language);

      // Chromium resolves `_locales` from its own UI locale, which stays English for a regional tag such as nl-BE.
      if (expected.description) assert.equal(await popup.evaluate(() => chrome.i18n.getMessage("extDescription")), expected.description);
    }
    finally {
      await context?.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
