import { defineConfig } from "wxt";

// WXT still runs its auto-import plugin when imports is false.
const imports = { presets: [], exclude: [/.*/u] };

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-solid"],
  imports,
  webExt: {
    // A fresh temporary profile would drop the relay list and every paired
    // connection on each restart, which makes the extension untestable.
    chromiumProfile: ".wxt/chromium-profile",
    keepProfileChanges: true,
  },
  hooks: {
    "server:started": (_wxt, server) => {
      let hasReloaded = false;

      // Chromium keeps the previous build's service worker in a kept profile until the extension reloads.
      server.ws.on("wxt:background-initialized", () => {
        if (hasReloaded) return;

        hasReloaded = true;
        server.reloadExtension();
      });
    },
  },
  manifest: {
    name: "openlv-connect",
    description:
      "Connect approved sites to wallets over Open Lavatory.",
    permissions: ["storage", "offscreen"],
    action: {},
  },
});
