// A chromium with the extension loaded, driven headlessly, plus the dev wallet
// and dev dapp pages it needs to complete a real pairing. Screenshots land in
// .tmp/lab so extension surfaces can be looked at without clicking through
// them by hand.
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extension = join(root, ".output/chrome-mv3");
const shots = join(root, ".tmp/lab/shots");
const profile = join(root, ".tmp/lab/profile");
const PAGES_PORT = 5174;

const command = process.argv[2] ?? "shots";
const isHeaded = process.argv.includes("--headed");

const startPages = async () => {
  const server = await createServer({
    root: join(root, "dev"),
    configFile: false,
    logLevel: "warn",
    server: { port: PAGES_PORT, strictPort: true },
  });

  await server.listen();

  return server;
};

const launch = async ({ fresh = true } = {}) => {
  // A reused profile keeps connections from earlier runs, and a run that
  // then picks "the first connection" picks a dead one.
  if (fresh) rmSync(profile, { recursive: true, force: true });

  mkdirSync(profile, { recursive: true });
  mkdirSync(shots, { recursive: true });

  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: !isHeaded,
    viewport: { width: 420, height: 700 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });

  let [worker] = context.serviceWorkers();

  worker ??= await context.waitForEvent("serviceworker", { timeout: 20_000 });

  return { context, id: new URL(worker.url()).host };
};

const surface = async (context, id, name) => {
  const page = await context.newPage();

  await page.goto(`chrome-extension://${id}/${name}`);
  await page.waitForLoadState("domcontentloaded");

  return page;
};

/** Chrome sizes a popup to its content, so a shot should too. */
const capture = async (page, name, settle = 250) => {
  await page.waitForTimeout(settle);

  const height = await page.evaluate(() => document.body.scrollHeight);

  await page.setViewportSize({ width: 420, height: Math.max(height, 120) });
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(shots, `${name}.png`) });
  console.log(`  shot ${name}.png`);
};

/** Writes straight into the extension's own storage from one of its pages. */
const seed = async (page, connections) => {
  await page.evaluate(async (value) => {
    await chrome.storage.local.set({ connections: value });
  }, connections);
};

const runShots = async () => {
  const { context, id } = await launch();

  console.log(`extension ${id}`);

  const popup = await surface(context, id, "popup.html");

  await capture(popup, "popup-empty");

  await popup.getByRole("button", { name: "Pair a connection" }).click();
  await capture(popup, "popup-relay-form");

  await seed(popup, [
    {
      connectionId: "seed-1",
      relay: { p: "ntfy", s: "https://ntfy.sh" },
      createdAt: Date.now(),
      wallet: { name: "Dev Wallet", identity: "sh.openlv.devwallet" },
      binding: {
        origin: "https://app.uniswap.org",
        accounts: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
      },
      chainId: "0x1",
    },
    {
      connectionId: "seed-2",
      relay: { p: "mqtt", s: "wss://test.mosquitto.org:8081/mqtt" },
      createdAt: Date.now(),
      wallet: { name: "Safe Mobile", identity: "global.safe" },
    },
  ]);
  await popup.reload();
  await capture(popup, "popup-list");

  await context.close();
};

const runLive = async () => {
  const pages = await startPages();
  const { context, id } = await launch();

  console.log(`extension ${id}`);

  const popup = await surface(context, id, "popup.html");

  await popup.getByRole("button", { name: "Pair a connection" }).click();
  await popup.getByLabel("protocol").selectOption("ntfy");
  await popup.getByLabel("server").fill("https://ntfy.sh");
  await popup.getByRole("button", { name: "Start pairing" }).click();

  await popup.getByText("Scan this code").waitFor({ timeout: 30_000 });
  await capture(popup, "pair-ready");

  const url = await popup.evaluate(async () => {
    const list = await chrome.runtime.sendMessage({ kind: "ui:list" });
    const pairing = list.result.value.find(entry => entry.state === "ready");
    const answer = await chrome.runtime.sendMessage({
      kind: "ui:url",
      connectionId: pairing.connectionId,
    });

    return answer.result.value.url;
  });

  console.log(`  session url ${url.slice(0, 48)}...`);

  const wallet = await context.newPage();

  await wallet.goto(`http://localhost:${PAGES_PORT}/wallet/`);
  await wallet.locator("#url").fill(url);
  await wallet.locator("#connect").click();

  // Linking often completes inside a second, so the shot is verified rather
  // than assumed: a stale frame labelled "linking" would be a lie.
  try {
    await popup.getByText("Establishing connection").waitFor({ timeout: 20_000 });
    await capture(popup, "pair-linking", 0);

    const stillLinking = await popup
      .getByText("Establishing connection")
      .isVisible();

    if (!stillLinking) {
      rmSync(join(shots, "pair-linking.png"), { force: true });
      console.log("  linking ended mid-shot, dropped pair-linking.png");
    }
  }
  catch {
    console.log("  linking passed too quickly to catch");
  }

  await popup.getByText("Connected", { exact: false }).waitFor({ timeout: 60_000 });
  await capture(popup, "pair-connected");

  const dapp = await context.newPage();

  await dapp.goto(`http://localhost:${PAGES_PORT}/dapp/`);
  await dapp.locator("li[data-rdns='sh.openlv.connector']").waitFor({ timeout: 10_000 });

  const approvalOpens = context.waitForEvent("page", { timeout: 20_000 });

  await dapp.locator("#connect").click();

  const approval = await approvalOpens;

  await approval.waitForLoadState("domcontentloaded");
  await capture(approval, "approve-fresh");

  await approval.locator(".pick").first().click();
  await approval.locator(".accounts label").first().waitFor({ timeout: 20_000 });
  await capture(approval, "approve-accounts");

  await approval.getByRole("button", { name: "Connect", exact: true }).click();
  await dapp.waitForFunction(
    () => (document.body.dataset.accounts ?? "").includes("0x"),
    undefined,
    { timeout: 20_000 },
  );

  console.log(`  dapp accounts ${await dapp.evaluate(() => document.body.dataset.accounts)}`);

  await popup.reload();
  await capture(popup, "popup-live-list");

  await context.close();
  await pages.close();
};

const runOpen = async () => {
  const pages = await startPages();
  const { context, id } = await launch({ fresh: false });

  console.log(`extension ${id}`);
  console.log(`popup    chrome-extension://${id}/popup.html`);
  console.log(`wallet   http://localhost:${PAGES_PORT}/wallet/`);
  console.log(`dapp     http://localhost:${PAGES_PORT}/dapp/`);
  console.log("ctrl-c to stop");

  await surface(context, id, "popup.html");
  await new Promise(() => {});
};

rmSync(shots, { recursive: true, force: true });

if (command === "shots") await runShots();
else if (command === "live") await runLive();
else if (command === "open") await runOpen();
else {
  console.error(`unknown command ${command}`);
  process.exit(1);
}
