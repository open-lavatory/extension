import { defineContentScript } from "wxt/utils/define-content-script";

import {
  isPageMessage,
  PAGE_CHANNEL,
  type PageRequest,
  type RpcFailure,
} from "../rpc/page.js";

const ICON
  = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjMGYxMDE0Ii8+PGNpcmNsZSBjeD0iMTEiIGN5PSIxNiIgcj0iNCIgZmlsbD0iI2U4NzYzZCIvPjxjaXJjbGUgY3g9IjIxIiBjeT0iMTYiIHI9IjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2U4NzYzZCIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+";

const PROVIDER_INFO = {
  name: "OpenLV Connector",
  rdns: "sh.openlv.connector",
  icon: ICON,
};

class ProviderRpcError extends Error {
  readonly code: number;

  constructor(failure: RpcFailure) {
    super(failure.message);
    this.name = "ProviderRpcError";
    this.code = failure.code;
  }
}

type Listener = (data: never) => void;

type Settle = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

const createProvider = () => {
  const waiting = new Map<string, Settle>();
  const listeners = new Map<string, Set<Listener>>();

  globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== globalThis.window) return;

    const message = event.data;

    if (!isPageMessage(message)) return;

    if (message.kind === "response") {
      const settle = waiting.get(message.messageId);

      if (!settle) return;

      waiting.delete(message.messageId);

      if ("error" in message) {
        settle.reject(new ProviderRpcError(message.error));

        return;
      }

      settle.resolve(message.result);

      return;
    }

    if (message.kind === "event") {
      const subscribed = listeners.get(message.event) ?? new Set<Listener>();

      for (const listener of subscribed) {
        (listener as (data: unknown) => void)(message.data);
      }
    }
  });

  const request = async (call: { method: string; params?: unknown; }) =>
    await new Promise<unknown>((resolve, reject) => {
      const messageId = crypto.randomUUID();

      waiting.set(messageId, { resolve, reject });

      const payload: PageRequest = {
        channel: PAGE_CHANNEL,
        kind: "request",
        messageId,
        method: call.method,
        ...(call.params !== undefined && { params: call.params }),
      };

      globalThis.postMessage(payload, globalThis.location.origin);
    });

  const provider = {
    isOpenLV: true,
    request,
    on(event: string, listener: Listener) {
      const subscribed = listeners.get(event) ?? new Set<Listener>();

      subscribed.add(listener);
      listeners.set(event, subscribed);

      return provider;
    },
    removeListener(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);

      return provider;
    },
  };

  return provider;
};

export default defineContentScript({
  matches: ["<all_urls>"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    const provider = createProvider();
    const detail = Object.freeze({
      info: Object.freeze({ uuid: crypto.randomUUID(), ...PROVIDER_INFO }),
      provider,
    });
    const announce = () => {
      globalThis.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", { detail }),
      );
    };

    globalThis.addEventListener("eip6963:requestProvider", announce);
    announce();

    // Only claimed when nothing else wants it. Whoever writes last wins that
    // property, and a fight over it is one nobody can win reliably.
    if (!("ethereum" in globalThis)) {
      Object.defineProperty(globalThis, "ethereum", {
        value: provider,
        configurable: true,
        writable: true,
      });
    }
  },
});
