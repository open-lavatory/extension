import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { connect, createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = new URL("../", import.meta.url).pathname;
const relay = process.env.OPENLV_TEST_RELAY ?? "ws://127.0.0.1:18884";
const port = 5177;

const request = async (page, method, params) => await page.evaluate(async (call) => {
  let provider;
  const discover = (event) => {
    if (event.detail.info.rdns === "sh.openlv.connect") provider = event.detail.provider;
  };

  globalThis.addEventListener("eip6963:announceProvider", discover);
  globalThis.dispatchEvent(new Event("eip6963:requestProvider"));
  globalThis.removeEventListener("eip6963:announceProvider", discover);
  if (!provider) throw new Error("openlv-connect did not announce its provider");

  try {
    return { result: await provider.request(call) };
  }
  catch (error) {
    return { error: { code: error.code, message: error.message } };
  }
}, { method, ...(params !== undefined && { params }) });

const signCount = async wallet => await wallet.locator("#log li").filter({ hasText: /^personal_sign$/ }).count();

const beginApproval = async (context, page) => {
  const opened = context.waitForEvent("page");
  const response = request(page, "eth_requestAccounts");
  const approval = await opened;

  await approval.waitForURL(url => url.pathname === "/approve.html");
  await approval.waitForLoadState("domcontentloaded");
  await approval.getByRole("button", { name: "Reject", exact: true }).waitFor();
  return { approval, response };
};

const grant = async (context, page, index) => {
  const { approval, response } = await beginApproval(context, page);

  await approval.getByRole("radio").nth(index).check();
  await approval.getByRole("checkbox").first().check();
  await approval.getByRole("button", { name: "Connect", exact: true }).click();
  const answer = await response;

  assert.ok(Array.isArray(answer.result));
  assert.ok(answer.result.length > 0);
  return answer.result;
};

test("origins pair during approval and route only to their bound wallet", { timeout: 120_000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), "openlv-provider-test-"));
  const server = await createServer({
    root: join(root, "dev"),
    cacheDir: join(profile, "vite"),
    configFile: false,
    optimizeDeps: { force: true },
    logLevel: "error",
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  let context;

  try {
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: true,
      viewport: { width: 380, height: 600 },
      args: [
        `--disable-extensions-except=${join(root, ".output/chrome-mv3")}`,
        `--load-extension=${join(root, ".output/chrome-mv3")}`,
      ],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionOrigin = `chrome-extension://${new URL(worker.url()).host}`;
    let openedPages = 0;

    context.on("page", () => { openedPages += 1; });
    const popup = await context.newPage();
    const openPopup = async () => {
      await popup.goto(`${extensionOrigin}/popup.html`);
      await popup.bringToFront();
    };

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const joinWallet = async (pairingPage) => {
      const copy = pairingPage.getByRole("button", { name: "Copy Connection URL", exact: true });

      try {
        await copy.waitFor();
      }
      catch {
        const errors = await pairingPage.getByRole("alert").allTextContents();

        throw new Error(`Connection screen did not become ready: ${errors.join("; ")}`);
      }

      await pairingPage.bringToFront();
      await copy.click();
      const connectionUrl = await pairingPage.evaluate(async () => await navigator.clipboard.readText());
      const wallet = await context.newPage();

      await wallet.goto(`http://localhost:${port}/wallet/`);
      await wallet.locator("#url").evaluate((field, value) => { field.value = value; }, connectionUrl);
      await wallet.locator("#connect").click();
      await wallet.locator("#url").fill("");
      await wallet.locator("body[data-status='connected']").waitFor({ timeout: 30_000 });
      return wallet;
    };
    await openPopup();
    await popup.getByRole("button", { name: "Settings", exact: true }).click();
    await popup.getByRole("button", { name: /^Signaling / }).click();
    const serverUrl = popup.getByRole("textbox", { name: "Server URL", exact: true });
    const ntfyUrl = "http://127.0.0.1:18885/ntfy";

    await popup.getByRole("button", { name: "MQTT", exact: true }).click();
    await serverUrl.fill(relay);
    await serverUrl.press("Enter");
    assert.equal(await popup.getByRole("heading", { name: "Signaling", exact: true }).count(), 1);
    assert.equal(await popup.getByRole("button", { name: "Generate QR", exact: true }).count(), 0);
    assert.equal(await popup.getByRole("button", { name: "Copy Connection URL", exact: true }).count(), 0);
    await popup.getByRole("button", { name: "NTFY", exact: true }).click();
    assert.equal(await serverUrl.inputValue(), "https://ntfy.sh");
    await serverUrl.fill(ntfyUrl);
    await popup.getByRole("button", { name: "MQTT", exact: true }).click();
    assert.equal(await serverUrl.inputValue(), relay);
    await popup.getByRole("button", { name: "NTFY", exact: true }).click();
    assert.equal(await serverUrl.inputValue(), ntfyUrl);
    await popup.getByRole("button", { name: "Back", exact: true }).click();
    await openPopup();
    await popup.getByRole("button", { name: "Settings", exact: true }).click();
    await popup.getByRole("button", { name: /^Signaling / }).click();
    assert.equal(await serverUrl.inputValue(), ntfyUrl);
    await popup.getByRole("button", { name: "MQTT", exact: true }).click();
    assert.equal(await serverUrl.inputValue(), relay);
    await popup.getByRole("button", { name: "Back", exact: true }).click();
    const firstSite = await context.newPage();
    const secondSite = await context.newPage();

    await firstSite.goto(`http://localhost:${port}/dapp/`);
    await secondSite.goto(`http://127.0.0.1:${port}/dapp/`);
    await firstSite.locator("[data-rdns='sh.openlv.connect']").waitFor();
    await secondSite.locator("[data-rdns='sh.openlv.connect']").waitFor();
    assert.match(await firstSite.locator("[data-rdns='sh.openlv.connect']").textContent(), /^openlv-connect /);

    assert.deepEqual(await request(firstSite, "eth_accounts"), { result: [] });
    assert.equal((await request(firstSite, null)).error.code, -32600);
    assert.equal((await request(firstSite, "personal_sign", ["0x01", "0x00"])).error.code, 4100);
    const firstApproval = await beginApproval(context, firstSite);
    const historyBeforePair = await popup.evaluate(async () => await chrome.storage.local.get("connections"));
    let firstSettled = false;

    void firstApproval.response.then(() => { firstSettled = true; });
    assert.equal(await firstApproval.approval.getByRole("radio").count(), 0);
    await firstApproval.approval.getByRole("button", { name: "Pair", exact: true }).click();
    await firstApproval.approval.getByRole("button", { name: "Copy Connection URL", exact: true }).waitFor();
    await openPopup();
    await popup.getByRole("button", { name: "Copy Connection URL", exact: true }).waitFor();
    assert.deepEqual(await popup.evaluate(async () => await chrome.storage.local.get("connections")), historyBeforePair);
    assert.equal(await firstApproval.approval.getByRole("textbox", { name: "Server URL", exact: true }).count(), 0);
    assert.equal(firstSettled, false);
    await firstApproval.approval.getByRole("button", { name: "Back", exact: true }).click();
    await firstApproval.approval.getByRole("button", { name: "Pair", exact: true }).waitFor();
    await openPopup();
    await popup.getByText("No connections yet.", { exact: true }).waitFor();
    assert.deepEqual(await popup.evaluate(async () => await chrome.storage.local.get("connections")), historyBeforePair);
    assert.equal(firstSettled, false);
    assert.deepEqual(await request(firstSite, "eth_accounts"), { result: [] });
    await firstApproval.approval.getByRole("button", { name: "Pair", exact: true }).click();
    await firstApproval.approval.getByRole("button", { name: "Copy Connection URL", exact: true }).waitFor();
    await firstApproval.approval.waitForTimeout(35_000);
    assert.equal(firstSettled, false);
    const firstWallet = await joinWallet(firstApproval.approval);

    await firstApproval.approval.getByRole("radio", { checked: true }).waitFor();
    await firstApproval.approval.getByRole("checkbox", { checked: true }).first().waitFor();
    assert.equal(firstSettled, false);
    assert.deepEqual(await request(firstSite, "eth_accounts"), { result: [] });
    await firstApproval.approval.getByRole("button", { name: "Connect", exact: true }).click();
    const firstAnswer = await firstApproval.response;
    const firstAccounts = firstAnswer.result;

    assert.ok(Array.isArray(firstAccounts) && firstAccounts.length > 0);
    assert.ok((await request(firstSite, "personal_sign", ["0x00", firstAccounts[0]])).result);
    assert.equal(await signCount(firstWallet), 1);
    await openPopup();
    await popup.getByRole("button", { name: "Connect", exact: true }).click();
    const secondWallet = await joinWallet(popup);

    await popup.getByRole("button", { name: "Done", exact: true }).click();
    const pageCount = openedPages;

    await firstSite.reload();
    await firstSite.locator("[data-rdns='sh.openlv.connect']").waitFor();

    assert.deepEqual(await request(firstSite, "eth_requestAccounts"), { result: firstAccounts });
    assert.equal(openedPages, pageCount);
    assert.equal((await request(firstSite, "openlv_testUnsupported")).error.code, -32601);
    assert.deepEqual(await request(secondSite, "eth_accounts"), { result: [] });
    const rejected = await beginApproval(context, secondSite);

    await rejected.approval.getByRole("button", { name: "Pair", exact: true }).waitFor();
    await rejected.approval.getByRole("button", { name: "Reject", exact: true }).click();
    assert.equal((await rejected.response).error.code, 4001);
    assert.deepEqual(await request(secondSite, "eth_accounts"), { result: [] });

    const secondAccounts = await grant(context, secondSite, 1);

    assert.ok((await request(firstSite, "personal_sign", ["0x01", firstAccounts[0]])).result);
    assert.equal(await signCount(firstWallet), 2);
    assert.equal(await signCount(secondWallet), 0);
    assert.ok((await request(secondSite, "personal_sign", ["0x02", secondAccounts[0]])).result);
    assert.equal(await signCount(firstWallet), 2);
    assert.equal(await signCount(secondWallet), 1);

    assert.deepEqual(await request(secondSite, "wallet_revokePermissions", [{ eth_accounts: {} }]), { result: null });
    const transferred = await beginApproval(context, secondSite);

    await transferred.approval.getByRole("radio").first().check();
    await transferred.approval.getByText(/Connecting here takes it away from/).waitFor();
    await transferred.approval.getByRole("checkbox").first().check();
    await transferred.approval.getByRole("button", { name: "Connect", exact: true }).click();
    assert.deepEqual((await transferred.response).result, firstAccounts);
    assert.deepEqual(await request(firstSite, "eth_accounts"), { result: [] });
    assert.equal((await request(firstSite, "personal_sign", ["0x03", firstAccounts[0]])).error.code, 4100);
    assert.ok((await request(secondSite, "personal_sign", ["0x04", firstAccounts[0]])).result);
    assert.equal(await signCount(firstWallet), 3);
    assert.equal(await signCount(secondWallet), 1);

    for (const isOpenLV of [false, true]) {
      const nativeSite = await context.newPage();

      await nativeSite.addInitScript((openlv) => {
        const nativeProvider = Object.freeze({
          ...(openlv && { isOpenLV: true }),
          request: async () => ["native-page-account"],
        });
        const detail = Object.freeze({
          info: Object.freeze({
            uuid: crypto.randomUUID(),
            name: openlv ? "Page OpenLV" : "Page wallet",
            rdns: "sh.openlv.page",
            icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
          }),
          provider: nativeProvider,
        });

        globalThis.nativePageProvider = nativeProvider;
        Object.defineProperty(globalThis, "ethereum", { value: nativeProvider, configurable: false });
        globalThis.addEventListener("eip6963:requestProvider", () => {
          globalThis.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
        });
      }, isOpenLV);
      await nativeSite.goto(`http://localhost:${port}/dapp/`);
      await nativeSite.locator("[data-rdns='sh.openlv.connect']").waitFor();
      await nativeSite.locator("[data-rdns='sh.openlv.page']").waitFor();
      assert.equal(await nativeSite.evaluate(() => globalThis.ethereum === globalThis.nativePageProvider), true);
      assert.deepEqual(await nativeSite.evaluate(async () => await globalThis.ethereum.request({ method: "eth_accounts" })), ["native-page-account"]);
      assert.deepEqual(await request(nativeSite, "eth_accounts"), { result: [] });
    }
    const closed = await beginApproval(context, firstSite);
    const historyBeforeClose = await popup.evaluate(async () => await chrome.storage.local.get("connections"));

    await closed.approval.getByRole("button", { name: "Pair", exact: true }).click();
    await closed.approval.getByRole("button", { name: "Copy Connection URL", exact: true }).waitFor();
    await closed.approval.close();
    assert.equal((await closed.response).error.code, 4001);
    await openPopup();
    await popup.getByRole("button", { name: "Copy Connection URL", exact: true }).waitFor();
    await popup.getByRole("button", { name: "Back", exact: true }).click();
    await popup.getByRole("button", { name: "Connect", exact: true }).waitFor();
    assert.equal(await popup.locator(".connection-row").count(), 2);
    assert.deepEqual(await popup.evaluate(async () => await chrome.storage.local.get("connections")), historyBeforeClose);
  }
  finally {
    await context?.close();
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("a refused relay ends on the error screen and Back leaves a stalled pairing", { timeout: 60_000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), "openlv-relay-failure-test-"));
  const relays = createHttpServer();
  const sockets = [];
  let context;

  relays.on("upgrade", (incoming, socket) => {
    sockets.push(socket);
    socket.on("error", () => {});

    if (incoming.url === "/refuse") {
      socket.end("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");

      return;
    }

    const accept = createHash("sha1").update(`${incoming.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");

    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: mqtt\r\n\r\n`);
  });

  try {
    await new Promise((resolve) => {
      relays.listen(0, "127.0.0.1", resolve);
    });
    const stalledRelay = `ws://127.0.0.1:${relays.address().port}/stall`;
    const refusedRelay = `ws://127.0.0.1:${relays.address().port}/refuse`;

    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: true,
      viewport: { width: 380, height: 600 },
      args: [
        `--disable-extensions-except=${join(root, ".output/chrome-mv3")}`,
        `--load-extension=${join(root, ".output/chrome-mv3")}`,
      ],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const popup = await context.newPage();
    const pageErrors = [];

    popup.on("pageerror", (error) => { pageErrors.push(error.message); });
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await popup.evaluate(async (server) => {
      await chrome.storage.local.set({
        connections: [{ connectionId: crypto.randomUUID(), relay: { p: "mqtt", s: server }, createdAt: Date.now(), wallet: { name: "Stored wallet" } }],
        signaling: { p: "mqtt", s: { mqtt: server } },
      });
    }, stalledRelay);
    await popup.reload();
    await popup.getByText("Stored wallet", { exact: true }).waitFor();
    assert.equal(await popup.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length), 0);

    await popup.evaluate(async () => {
      [...document.querySelectorAll("button")].find(button => button.textContent === "Connect").click();

      while (!document.querySelector("button[aria-label='Back']")) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      document.querySelector("button[aria-label='Back']").click();
    });
    await popup.getByText("Stored wallet", { exact: true }).waitFor();
    await popup.waitForTimeout(1500);
    assert.equal(await popup.evaluate(async () => (await chrome.storage.session.get("pairing")).pairing), undefined);
    assert.equal(await popup.getByRole("button", { name: "Back", exact: true }).count(), 0);
    assert.deepEqual(await popup.evaluate(async () => {
      try {
        return Object.keys((await chrome.runtime.sendMessage({ kind: "engine:states" })).result.value);
      }
      catch {
        return [];
      }
    }), []);

    await popup.getByRole("button", { name: "Connect", exact: true }).click();
    await popup.getByText("Waiting for network connection...", { exact: true }).waitFor();
    await popup.getByRole("button", { name: "Back", exact: true }).click();
    await popup.getByText("Stored wallet", { exact: true }).waitFor();

    await popup.evaluate(async (server) => {
      await chrome.storage.local.set({ signaling: { p: "mqtt", s: { mqtt: server } } });
    }, refusedRelay);
    await popup.getByRole("button", { name: "Connect", exact: true }).click();
    await popup.getByRole("button", { name: "Try again", exact: true }).waitFor({ timeout: 5000 });
    assert.ok((await popup.getByRole("alert").textContent()).includes(refusedRelay));
    assert.deepEqual(pageErrors, []);
  }
  finally {
    await context?.close();
    for (const socket of sockets) socket.destroy();
    relays.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("a pairing outlives the popup and the service worker", { timeout: 90_000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), "openlv-outlive-test-"));
  const server = await createServer({
    root: join(root, "dev"),
    cacheDir: join(profile, "vite"),
    configFile: false,
    optimizeDeps: { force: true },
    logLevel: "error",
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  let context;
  let delayed;

  try {
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: true,
      viewport: { width: 380, height: 600 },
      args: [
        `--disable-extensions-except=${join(root, ".output/chrome-mv3")}`,
        `--load-extension=${join(root, ".output/chrome-mv3")}`,
      ],
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const popupUrl = `chrome-extension://${new URL(worker.url()).host}/popup.html`;
    const openPopup = async () => {
      const popup = await context.newPage();

      await popup.goto(popupUrl);

      return popup;
    };
    const copyUrl = async (popup) => {
      await popup.getByRole("button", { name: "Copy Connection URL", exact: true }).click();

      return await popup.evaluate(async () => await navigator.clipboard.readText());
    };

    delayed = createTcpServer((socket) => {
      socket.pause();
      setTimeout(() => {
        const upstream = connect(new URL(relay).port, new URL(relay).hostname);

        socket.pipe(upstream).pipe(socket);
        socket.resume();
      }, 2000);
    });

    await new Promise((resolve) => {
      delayed.listen(0, "127.0.0.1", resolve);
    });
    let popup = await openPopup();

    await popup.evaluate(async (server) => {
      await chrome.storage.local.set({ signaling: { p: "mqtt", s: { mqtt: server } } });
    }, `ws://127.0.0.1:${delayed.address().port}`);
    await popup.getByRole("button", { name: "Connect", exact: true }).click();
    await popup.getByText("Waiting for network connection...", { exact: true }).waitFor();
    await popup.close();
    const cdp = await context.newCDPSession(await context.newPage());

    await cdp.send("ServiceWorker.enable");
    await cdp.send("ServiceWorker.stopAllWorkers");
    popup = await openPopup();
    const firstUrl = await copyUrl(popup);

    await popup.close();

    const wallet = await context.newPage();

    await wallet.goto(`http://localhost:${port}/wallet/`);
    await wallet.locator("#url").evaluate((field, value) => { field.value = value; }, firstUrl);
    await wallet.locator("#connect").click();
    await wallet.locator("body[data-status='connected']").waitFor({ timeout: 30_000 });
    const opened = await worker.evaluate(async () => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if ((await chrome.runtime.getContexts({ contextTypes: ["POPUP"] })).length > 0) return true;

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return false;
    });

    assert.equal(opened, true);

    popup = await openPopup();
    await popup.getByText("Connected Successfully!", { exact: true }).waitFor({ timeout: 30_000 });
    await popup.close();

    const site = await context.newPage();

    await site.goto(`http://localhost:${port}/dapp/`);
    await site.locator("[data-rdns='sh.openlv.connect']").waitFor();
    const { approval, response } = await beginApproval(context, site);

    await approval.getByRole("radio", { checked: true }).waitFor();
    await approval.getByRole("checkbox", { checked: true }).first().waitFor();
    await approval.getByRole("button", { name: "Connect", exact: true }).click();
    assert.ok((await response).result.length > 0);
    popup = await openPopup();
    await popup.locator(".connection-row").waitFor();
    assert.equal(await popup.locator(".connection-row").count(), 1);
    assert.equal(await popup.getByText("Connected Successfully!", { exact: true }).count(), 0);
    await popup.close();

    const otherSite = await context.newPage();

    await otherSite.goto(`http://127.0.0.1:${port}/dapp/`);
    await otherSite.locator("[data-rdns='sh.openlv.connect']").waitFor();
    const closing = await beginApproval(context, otherSite);

    await closing.approval.getByRole("button", { name: "Pair", exact: true }).click();
    const secondUrl = await copyUrl(closing.approval);

    await closing.approval.close();
    assert.equal((await closing.response).error.code, 4001);
    const secondWallet = await context.newPage();

    await secondWallet.goto(`http://localhost:${port}/wallet/`);
    await secondWallet.locator("#url").evaluate((field, value) => { field.value = value; }, secondUrl);
    await secondWallet.locator("#connect").click();
    await secondWallet.locator("body[data-status='connected']").waitFor({ timeout: 30_000 });
    assert.equal(await context.serviceWorkers().at(-1).evaluate(async () => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if ((await chrome.storage.session.get("pairing")).pairing?.connection.state === "connected") break;

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      return (await chrome.runtime.getContexts({ contextTypes: ["POPUP"] })).length;
    }), 0);
  }
  finally {
    await context?.close();
    await server.close();
    delayed?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("wallet icons from peer info show safely in the list and the approval window", { timeout: 90_000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), "openlv-icon-test-"));
  const server = await createServer({
    root: join(root, "dev"),
    cacheDir: join(profile, "vite"),
    configFile: false,
    optimizeDeps: { force: true },
    logLevel: "error",
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  const walletIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Ccircle cx='4' cy='4' r='4' fill='green'/%3E%3C/svg%3E";
  const bitmapIcon = "data:image/bmp;base64,Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AA==";
  let context;

  try {
    await server.listen();
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: true,
      viewport: { width: 380, height: 600 },
      args: [
        `--disable-extensions-except=${join(root, ".output/chrome-mv3")}`,
        `--load-extension=${join(root, ".output/chrome-mv3")}`,
      ],
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const popup = await context.newPage();

    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await popup.evaluate(async (server) => {
      await chrome.storage.local.set({ signaling: { p: "mqtt", s: { mqtt: server } } });
    }, relay);

    for (const icon of [walletIcon, bitmapIcon, undefined, "http://127.0.0.1:9/icon.png"]) {
      await popup.getByRole("button", { name: "Connect", exact: true }).click();
      await popup.getByRole("button", { name: "Copy Connection URL", exact: true }).click();
      const url = await popup.evaluate(async () => await navigator.clipboard.readText());
      const wallet = await context.newPage();

      await wallet.goto(`http://localhost:${port}/wallet/${icon ? `?icon=${encodeURIComponent(icon)}` : ""}`);
      await wallet.locator("#url").evaluate((field, value) => { field.value = value; }, url);
      await wallet.locator("#connect").click();
      await popup.getByText("Connected Successfully!", { exact: true }).waitFor({ timeout: 30_000 });
      assert.equal(await popup.locator(".connected-wallet img").count(), icon?.startsWith("data:") ? 1 : 0);
      await popup.getByRole("button", { name: "Done", exact: true }).click();
    }

    const rowIcons = async page => await page.locator(".wallet-state").evaluateAll(spans => spans.map(span => span.querySelector("img")?.getAttribute("src") ?? (span.querySelector("svg") ? "neutral" : "none")));

    await popup.locator(".connection-row").nth(3).waitFor();
    assert.deepEqual((await rowIcons(popup)).toSorted(), [walletIcon, bitmapIcon, "neutral", "neutral"].toSorted());

    const site = await context.newPage();

    await site.goto(`http://localhost:${port}/dapp/`);
    await site.locator("[data-rdns='sh.openlv.connect']").waitFor();
    const { approval, response } = await beginApproval(context, site);

    await approval.getByRole("radio").nth(3).waitFor();
    assert.deepEqual((await rowIcons(approval)).toSorted(), [walletIcon, bitmapIcon, "neutral", "neutral"].toSorted());
    assert.deepEqual(await approval.locator(".origin .site-icon").evaluate(async (image) => {
      await image.decode();
      const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
      const context2d = canvas.getContext("2d");

      context2d.drawImage(image, 0, 0);

      return [...context2d.getImageData(image.naturalWidth / 2, image.naturalHeight / 2, 1, 1).data];
    }), [59, 130, 246, 255]);
    await approval.getByRole("button", { name: "Reject", exact: true }).click();
    assert.equal((await response).error.code, 4001);
  }
  finally {
    await context?.close();
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
