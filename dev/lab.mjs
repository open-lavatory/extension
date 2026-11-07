import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const shots = join(root, ".tmp/lab/shots");
const command = process.argv[2] ?? "shots";
const port = 5178;
const relay = "ws://127.0.0.1:18884";
const profile = await mkdtemp(join(tmpdir(), "openlv-lab-"));
const server = await createServer({
  root: join(root, "dev"),
  cacheDir: join(root, ".tmp/lab/vite"),
  configFile: false,
  logLevel: "warn",
  optimizeDeps: { force: true },
  server: { host: "127.0.0.1", port, strictPort: true },
});
let context;

try {
  await server.listen();
  await mkdir(shots, { recursive: true });
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: !process.argv.includes("--headed"),
    viewport: { width: 380, height: 600 },
    args: [
      `--disable-extensions-except=${join(root, ".output/chrome-mv3")}`,
      `--load-extension=${join(root, ".output/chrome-mv3")}`,
    ],
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionOrigin = `chrome-extension://${new URL(worker.url()).host}`;
  const popup = await context.newPage();
  const openPopup = async () => {
    await popup.goto(`${extensionOrigin}/popup.html`);
    await popup.bringToFront();
    await popup.getByRole("button", { name: "Connect", exact: true }).waitFor();
  };
  const capture = async (page, name) => {
    for (const mode of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: mode });
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.evaluate(async () => await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
      const isApproval = new URL(page.url()).pathname === "/approve.html";

      await page.setViewportSize({ width: isApproval ? 420 : 380, height: 600 });
      if (!isApproval) {
        const height = await page.evaluate(() => Math.min(600, Math.max(220, document.body.scrollHeight)));

        await page.setViewportSize({ width: 380, height });
      }
      await page.screenshot({
        path: join(shots, `${name}-latest-revision-${mode}.png`),
        animations: "disabled",
        mask: [page.locator(".qr-frame"), page.locator("#url")],
        maskColor: "#CBD5E1",
      });
    }
  };
  const joinWallet = async (pairingPage) => {
    await pairingPage.getByRole("button", { name: "Copy Connection URL", exact: true }).waitFor();
    await pairingPage.bringToFront();
    await pairingPage.getByRole("button", { name: "Copy Connection URL", exact: true }).click();
    const connectionUrl = await pairingPage.evaluate(async () => await navigator.clipboard.readText());
    const wallet = await context.newPage();

    await wallet.goto(`http://localhost:${port}/wallet/`);
    await wallet.locator("#url").evaluate((field, value) => { field.value = value; }, connectionUrl);
    await wallet.locator("#connect").click();
    await wallet.locator("#url").fill("");
    await wallet.locator("body[data-status='connected']").waitFor({ timeout: 30_000 });
    return wallet;
  };
  const connectPhone = async () => {
    await openPopup();
    await popup.getByRole("button", { name: "Connect", exact: true }).click();
    await popup.getByRole("button", { name: "Copy Connection URL", exact: true }).waitFor();
    await capture(popup, "connect-qr");
    const wallet = await joinWallet(popup);

    await popup.getByRole("button", { name: "Done", exact: true }).waitFor();
    await capture(popup, "connect-success");
    await popup.getByRole("button", { name: "Done", exact: true }).click();
    return wallet;
  };
  const approvalFor = async (site) => {
    const opens = context.waitForEvent("page");

    await site.locator("#connect").click();
    const approval = await opens;

    await approval.getByRole("button", { name: "Reject", exact: true }).waitFor();
    return approval;
  };

  await openPopup();
  await capture(popup, "empty");
  await popup.getByRole("button", { name: "Settings", exact: true }).click();
  await capture(popup, "settings");
  await popup.getByRole("button", { name: /Transport WebRTC/u }).click();
  await capture(popup, "transport-empty");
  await popup.getByRole("button", { name: "Add STUN Server", exact: true }).click();
  await popup.getByRole("textbox", { name: "STUN Server 1", exact: true }).fill("stun:127.0.0.1:3478");
  await popup.getByRole("button", { name: "Back", exact: true }).click();
  await openPopup();
  await popup.getByRole("button", { name: "Settings", exact: true }).click();
  await popup.getByRole("button", { name: /Transport WebRTC/u }).click();
  if (await popup.getByRole("textbox", { name: "STUN Server 1", exact: true }).inputValue() !== "stun:127.0.0.1:3478") {
    throw new Error("STUN server did not survive reload");
  }
  console.log("STUN entry saved and restored after popup reload.");
  await popup.getByRole("button", { name: "Add TURN Server", exact: true }).click();
  await capture(popup, "transport");
  await popup.getByRole("button", { name: "Remove STUN Server 1", exact: true }).click();
  await popup.getByRole("button", { name: "Remove TURN Server 1", exact: true }).click();
  await popup.getByRole("button", { name: "Back", exact: true }).click();
  await popup.getByRole("button", { name: /^Signaling /u }).click();
  await popup.getByRole("textbox", { name: "Server URL", exact: true }).fill(relay);
  await popup.getByRole("button", { name: "NTFY", exact: true }).click();
  await popup.getByRole("textbox", { name: "Server URL", exact: true }).fill("http://127.0.0.1:18885/ntfy");
  await popup.getByRole("button", { name: "MQTT", exact: true }).click();
  if (await popup.getByRole("textbox", { name: "Server URL", exact: true }).inputValue() !== relay) {
    throw new Error("Protocol switch lost the MQTT server");
  }
  await popup.getByRole("button", { name: "Back", exact: true }).click();
  await openPopup();
  await popup.getByRole("button", { name: "Settings", exact: true }).click();
  await popup.getByRole("button", { name: /^Signaling /u }).click();
  if (await popup.getByRole("textbox", { name: "Server URL", exact: true }).inputValue() !== relay) {
    throw new Error("Signaling settings did not survive reload");
  }
  await popup.getByRole("button", { name: "NTFY", exact: true }).click();
  if (await popup.getByRole("textbox", { name: "Server URL", exact: true }).inputValue() !== "http://127.0.0.1:18885/ntfy") {
    throw new Error("Protocol switch lost the NTFY server");
  }
  await popup.getByRole("button", { name: "MQTT", exact: true }).click();
  await capture(popup, "signaling");
  await popup.getByRole("button", { name: "Back", exact: true }).click();
  console.log("Each protocol retained its server after switches and reload.");

  if (command === "live" || command === "open") {
    const firstSite = await context.newPage();

    await firstSite.goto(`http://localhost:${port}/dapp/`);
    const approval = await approvalFor(firstSite);

    await capture(approval, "approval-empty");
    await approval.getByRole("button", { name: "Pair", exact: true }).click();
    await approval.getByRole("button", { name: "Copy Connection URL", exact: true }).waitFor();
    await capture(approval, "approval-pair");
    const wallet = await joinWallet(approval);

    await approval.getByRole("radio", { checked: true }).waitFor();
    await approval.getByRole("checkbox", { checked: true }).first().waitFor();
    await capture(approval, "approval");
    await approval.getByRole("button", { name: "Connect", exact: true }).click();
    await firstSite.waitForFunction(() => document.querySelector("#result").textContent.startsWith("accounts:"));
    await firstSite.locator("#sign").click();
    await firstSite.waitForFunction(() => document.querySelector("#result").textContent.startsWith("signature:"));
    console.log("Paired from the empty approval window, approved the site, and answered personal_sign over local MQTT/WebRTC.");
    await openPopup();
    await capture(popup, "connections-bound");
    const secondWallet = await connectPhone();

    await capture(popup, "connections");
    const secondSite = await context.newPage();

    await secondSite.goto(`http://127.0.0.1:${port}/dapp/`);
    const transfer = await approvalFor(secondSite);

    await transfer.getByRole("radio").first().check();
    await transfer.getByRole("checkbox").first().waitFor();
    await transfer.getByText(/Connecting here takes it away from/u).waitFor();
    await capture(transfer, "transfer");
    await transfer.getByRole("button", { name: "Connect", exact: true }).click();
    await secondSite.waitForFunction(() => document.querySelector("#result").textContent.startsWith("accounts:"));
    console.log("Second origin transferred the connection after approval.");
    const rejection = await approvalFor(firstSite);

    await rejection.getByRole("button", { name: "Reject", exact: true }).click();
    await firstSite.waitForFunction(() => document.querySelector("#result").textContent.includes("rejected"));
    console.log("Rejected origin received the user rejection.");
    await secondWallet.close();
    await openPopup();
    await popup.getByRole("img", { name: "Phone not connected", exact: true }).waitFor({ timeout: 30_000 });
    await capture(popup, "connections-phone-gone");
    console.log("Closed wallet is shown with the disconnected phone icon.");
    if (command === "open") {
      console.log(`Popup ${extensionOrigin}/popup.html`);
      console.log("The lab stays open until interrupted.");
      await new Promise(() => {});
    }
    await wallet.close();
  }
  else if (command !== "shots") throw new Error(`Unknown lab command: ${command}`);

  console.log(`Screenshots: ${shots}`);
}
finally {
  await context?.close();
  await server.close();
  await rm(profile, { recursive: true, force: true });
}
