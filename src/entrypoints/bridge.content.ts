import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import * as z from "zod/mini";

import { isPageMessage, PAGE_CHANNEL } from "../rpc/page.js";

const originEvent = z.object({ origin: z.string(), event: z.unknown() });

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
      // Worker suspension closes the port. The next request wakes the worker.
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
      const parsed = originEvent.safeParse(message);

      if (!parsed.success || parsed.data.origin !== globalThis.location.origin || !isPageMessage(parsed.data.event)) return;

      globalThis.postMessage(parsed.data.event, globalThis.location.origin);
    });

    connect();
  },
});
