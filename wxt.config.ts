import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-solid"],
  webExt: {
    // A fresh temporary profile would drop the relay list and every paired
    // connection on each restart, which makes the extension untestable.
    chromiumProfile: ".wxt/chromium-profile",
    keepProfileChanges: true,
  },
  manifest: {
    name: "OpenLV Connector",
    description:
      "Pair wallets over Open Lavatory and route web3 sites to them.",
    permissions: ["storage", "offscreen"],
    action: {},
  },
});
