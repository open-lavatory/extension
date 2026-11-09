import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";

import { isPageMessage, PAGE_CHANNEL } from "../rpc/page.js";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  main() {
    let port: ReturnType<typeof browser.runtime.connect> | undefined;

    const connect = () => {
      const opened = browser.runtime.connect({ name: PAGE_CHANNEL });

      opened.onMessage.addListener((message: unknown) => {
        if (!isPageMessage(message)) return;

        globalThis.postMessage(message, globalThis.location.origin);
      });
      // The worker suspends when idle and takes the port with it. The next
      // request opens a new one, which wakes the worker again.
      opened.onDisconnect.addListener(() => {
        port = undefined;
      });
      port = opened;

      return opened;
    };

    globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (event.source !== globalThis.window) return;

      const message = event.data;

      if (!isPageMessage(message) || message.kind !== "request") return;

      (port ?? connect()).postMessage(message);
    });

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (typeof message !== "object" || message === null || !("origin" in message) || message.origin !== globalThis.location.origin || !("event" in message) || !isPageMessage(message.event)) return;

      globalThis.postMessage(message.event, globalThis.location.origin);
    });

    connect();
  },
});
