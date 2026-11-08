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
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    key: "MIIBJDANBgkqhkiG9w0BAQEFAAOCAREAMIIBDAKCAQEA3dUJMGVpf2Dpbjb7V2zsrIIfDc1KisKT6Sldud8y+bVKEVLfVTzk/nSUGxpnfehZSp1c8Rlc9sBYnV7ZUzgiorm1DHpBzXwueVTt5+lqSvZGIasKZvidUU5XKBjKxjd23HliONZeVR+jyKDGc/LQeHybOx+SDOFWCcp908epw7qbkcCjHdTrRLZ7zWTRwx7ICDQ8PRDGPwDksD8Yu6M3i8dGfeBymNcGXurfPND0jtEwC2FSY/5u8Kbj6u77GPeXcwFMwAarG5wj0g2DcCRe2VGD6Yugn+UNthYPmMEu6FJCcYXgGgKTwsKWguIccHFg3KpakfD21Ub3/bARBuVW3wIFAREFgbM=",
    permissions: ["storage", "offscreen", "contextMenus", "favicon"],
    action: {},
  },
});
