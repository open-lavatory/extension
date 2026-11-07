import { createSignal, onCleanup } from "solid-js";
import { type Browser, browser } from "wxt/browser";

import type { Relay } from "../connections/relay.js";
import { call } from "./client.js";
import { type ConnectionView, isPairingMessage, PAIRING_PORT, type PairingCommand } from "./port.js";

export const createPairing = () => {
  const [connection, setConnection] = createSignal<ConnectionView | undefined>();
  const [url, setUrl] = createSignal<string | undefined>();
  const [failure, setFailure] = createSignal<string | undefined>();
  const [isStarting, setStarting] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  let active: { connectionId: string; port: Browser.runtime.Port; finish: () => void; } | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const cancel = (): void => {
    const pending = active;

    active = undefined;
    clearInterval(keepalive);
    pending?.finish();
    pending?.port.disconnect();
    setStarting(false);
    setConnection(undefined);
    setUrl(undefined);
    setFailure(undefined);
  };

  onCleanup(() => {
    const pending = active;

    active = undefined;
    clearInterval(keepalive);
    pending?.finish();
    pending?.port.disconnect();
  });

  const start = async (relay: Relay): Promise<void> => {
    cancel();
    setCopied(false);
    setStarting(true);
    const connectionId = crypto.randomUUID();
    const port = browser.runtime.connect({ name: PAIRING_PORT });

    await new Promise<void>((resolve) => {
      const pending = { connectionId, port, finish: resolve };

      active = pending;
      port.onMessage.addListener((message: unknown) => {
        if (active !== pending || !isPairingMessage(message)) return;

        if (message.kind === "pair:ready") {
          setUrl(message.url);
          setStarting(false);
          resolve();
        }
        else if (message.kind === "pair:error") {
          setFailure(message.error);
          setConnection(undefined);
          setStarting(false);
          resolve();
        }
        else if (message.connection.connectionId === connectionId) {
          setConnection(message.connection);

          if (message.error) setFailure(message.error);
        }
      });
      port.onDisconnect.addListener(() => {
        if (active !== pending) return;

        active = undefined;
        clearInterval(keepalive);
        setStarting(false);

        if (connection()?.state !== "connected") {
          setFailure(current => current ?? "Connection closed");
          setConnection(undefined);
          void call({ kind: "ui:cancel-pair", connectionId });
        }

        resolve();
      });
      const command: PairingCommand = { kind: "pair:start", connectionId, relay };

      port.postMessage(command);
      keepalive = setInterval(() => {
        if (active !== pending) return;

        const message: PairingCommand = { kind: "pair:keepalive" };

        port.postMessage(message);
      }, 20_000);
    });
  };

  const copy = async (): Promise<void> => {
    const value = url();

    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    }
    catch {
      setFailure("Could not copy the connection URL");
    }
  };

  return { connection, url, failure, isStarting, copied, start, cancel, copy };
};

export type Pairing = ReturnType<typeof createPairing>;
