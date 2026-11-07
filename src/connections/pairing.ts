import type { Browser } from "wxt/browser";

import { engineClose, enginePair, engineVerify } from "../engine/client.js";
import type { EngineEvent } from "../engine/port.js";
import type { ConnectionView, PairingCommand, PairingMessage } from "../ui/port.js";
import { type Connection, getConnection, putConnection } from "./registry.js";
import { getSignalingSettings, isRelayProtocol, signalingStore } from "./relay.js";
import { transportStore } from "./settings.js";

type PendingPairing = {
  connection: Connection;
  port: Browser.runtime.Port;
  state: ConnectionView["state"];
  isComplete: boolean;
  isChecking: boolean;
  hasStarted: boolean;
};

const pairings = new Map<string, PendingPairing>();

const postPairing = (entry: PendingPairing, message: PairingMessage): void => {
  try {
    entry.port.postMessage(message);
  }
  catch {
    return;
  }
};

const stopPairing = async (entry: PendingPairing, error?: string): Promise<void> => {
  const connectionId = entry.connection.connectionId;

  if (pairings.get(connectionId) !== entry) return;

  pairings.delete(connectionId);

  if (!entry.isComplete && entry.hasStarted) await engineClose(connectionId);

  if (error) postPairing(entry, { kind: "pair:error", error });
};

const finishPairing = async (entry: PendingPairing): Promise<void> => {
  if (entry.isChecking || entry.isComplete) return;

  const connectionId = entry.connection.connectionId;

  entry.isChecking = true;

  try {
    const verified = await engineVerify(connectionId);

    if (pairings.get(connectionId) !== entry) return;

    if (!verified.ok) throw new Error(verified.error);

    entry.connection = { ...entry.connection, ...(verified.value.wallet && { wallet: verified.value.wallet }) };
    entry.isComplete = true;
    await putConnection(entry.connection);
    entry.state = "connected";
    postPairing(entry, { kind: "pair:state", connection: { ...entry.connection, state: "connected" } });
  }
  catch (error) {
    entry.isComplete = false;

    if (pairings.get(connectionId) === entry) {
      await stopPairing(entry, error instanceof Error ? error.message : "Could not connect the wallet");
    }
    else {
      await engineClose(connectionId);
    }
  }
};

export const openPairing = (port: Browser.runtime.Port): void => {
  let isClosed = false;
  let pending: PendingPairing | undefined;

  port.onDisconnect.addListener(() => {
    isClosed = true;

    if (pending) void stopPairing(pending);
  });
  port.onMessage.addListener((message: unknown) => {
    if (
      isClosed
      || pending
      || typeof message !== "object"
      || message === null
      || !("kind" in message)
      || message.kind !== "pair:start"
      || !("connectionId" in message)
      || typeof message.connectionId !== "string"
      || !("relay" in message)
      || typeof message.relay !== "object"
      || message.relay === null
      || !("p" in message.relay)
      || typeof message.relay.p !== "string"
      || !isRelayProtocol(message.relay.p)
      || !("s" in message.relay)
      || typeof message.relay.s !== "string"
    ) return;

    const command: Extract<PairingCommand, { kind: "pair:start"; }> = {
      kind: "pair:start",
      connectionId: message.connectionId,
      relay: { p: message.relay.p, s: message.relay.s },
    };
    const entry: PendingPairing = {
      connection: { connectionId: command.connectionId, relay: command.relay, createdAt: Date.now() },
      port,
      state: "created",
      isComplete: false,
      isChecking: false,
      hasStarted: false,
    };

    pending = entry;
    pairings.set(command.connectionId, entry);
    postPairing(entry, { kind: "pair:state", connection: { ...entry.connection, state: "created" } });
    void (async () => {
      try {
        if (await getConnection(command.connectionId)) throw new Error("That connection already exists");

        const transport = await transportStore.getValue();

        if (isClosed || pairings.get(command.connectionId) !== entry) return;

        entry.hasStarted = true;
        const paired = await enginePair(command.connectionId, command.relay, transport);

        if (isClosed || pairings.get(command.connectionId) !== entry) {
          await engineClose(command.connectionId);

          return;
        }

        if (!paired.ok) throw new Error(paired.error);

        const settings = await getSignalingSettings();

        await signalingStore.setValue({ p: command.relay.p, s: { ...settings.s, [command.relay.p]: command.relay.s } });
        postPairing(entry, { kind: "pair:ready", url: paired.value.url });
      }
      catch (error) {
        await stopPairing(entry, error instanceof Error ? error.message : "Could not start the connection");
      }
    })();
  });
};

export const didHandlePairingEvent = (message: EngineEvent): boolean => {
  const pending = pairings.get(message.connectionId);

  if (!pending) return false;

  if (message.kind === "engine:wallet") {
    pending.connection = { ...pending.connection, wallet: message.wallet };
  }
  else if (message.state === "connected" && !pending.isComplete) {
    pending.state = "linking";
    void finishPairing(pending);
  }
  else {
    pending.state = message.state;
  }

  if (message.kind === "engine:state" && message.state === "disconnected" && !pending.isComplete) {
    void stopPairing(pending, message.error ?? "Connection closed");
  }
  else {
    postPairing(pending, { kind: "pair:state", connection: { ...pending.connection, state: pending.state } });
  }

  return true;
};
