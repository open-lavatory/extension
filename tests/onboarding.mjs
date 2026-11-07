import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { encodeQR } from "qr";

const extensionPath = new URL("../.output/chrome-mv3", import.meta.url).pathname;
const runningAnimations = () => document.getAnimations().filter(animation => animation.playState === "running").length;

test("welcome page opens on install, pauses, and holds still frames with reduced motion", { timeout: 40_000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), "openlv-onboarding-"));
  const options = {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  };
  let context;

  try {
    context = await chromium.launchPersistentContext(profile, options);
    const welcome = context.pages().find(page => page.url().endsWith("/onboarding.html")) ?? await context.waitForEvent("page");

    await welcome.waitForURL("**/onboarding.html");
    const failures = [];
    const remoteRequests = [];

    welcome.on("pageerror", error => failures.push(error.message));
    welcome.on("request", (request) => {
      if (/^https?:|^wss?:/u.test(request.url())) remoteRequests.push(request.url());
    });
    await context.setOffline(true);
    await welcome.reload();
    await welcome.getByRole("heading", { name: "Thank you for installing openlv-connect" }).waitFor();
    assert.equal(await welcome.getByRole("img", { name: /./u }).count(), 6);
    assert.equal(await welcome.locator(".welcome-qr svg path").getAttribute("d"), /\sd="([^"]+)"/u.exec(encodeQR("https://openlv.sh", "svg", { ecc: "low", border: 2 }))?.[1]);

    const pin = welcome.locator(".visual").first();
    const scene = pin.locator(".scene");

    await pin.getByRole("button", { name: "Pause animation" }).click();
    const paused = await scene.innerHTML();

    await welcome.waitForTimeout(4000);
    assert.equal(await scene.innerHTML(), paused);
    await pin.getByRole("button", { name: "Play animation" }).click();
    await welcome.waitForFunction(previous => document.querySelector(".scene")?.innerHTML !== previous, paused, { timeout: 6000 });

    const pair = welcome.locator(".visual").nth(1);

    await pair.scrollIntoViewIfNeeded();
    await welcome.waitForFunction(() => document.querySelectorAll(".scene")[1]?.getAnimations({ subtree: true }).some(animation => animation instanceof CSSAnimation && animation.playState === "running"), undefined, { timeout: 15_000 });
    await pair.getByRole("button", { name: "Pause animation" }).click();
    await welcome.waitForTimeout(500);
    assert.equal(await pair.locator(".scene").evaluate(scene => scene.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSAnimation && animation.playState === "running").length), 0);
    await pair.getByRole("button", { name: "Play animation" }).click();
    await pair.getByRole("button", { name: "Desktop" }).click();
    assert.equal(await pair.locator(".app-window").evaluate(element => getComputedStyle(element).visibility), "visible");

    await welcome.emulateMedia({ reducedMotion: "reduce" });
    await welcome.waitForFunction(() => document.querySelectorAll(".scene-frame").length === 5 && !document.querySelector(".visual-controls .icon-button"));
    assert.equal(await welcome.evaluate(runningAnimations), 0);
    await pair.getByRole("button", { name: "Phone" }).click();
    assert.equal(await pair.locator(".viewfinder-code").evaluate(element => getComputedStyle(element).opacity), "1");
    await pair.getByRole("button", { name: "Browser" }).click();
    assert.equal(await pair.locator(".web-wallet").evaluate(element => getComputedStyle(element).visibility), "visible");
    const stills = await welcome.locator(".scene").evaluateAll(scenes => scenes.map(entry => entry.innerHTML));

    await welcome.waitForTimeout(1500);
    assert.deepEqual(await welcome.locator(".scene").evaluateAll(scenes => scenes.map(entry => entry.innerHTML)), stills);
    assert.equal(await welcome.evaluate(runningAnimations), 0);
    assert.deepEqual(remoteRequests, []);
    assert.deepEqual(failures, []);
  }
  finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
