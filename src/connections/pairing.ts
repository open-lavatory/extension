import { browser } from "wxt/browser";

import { engineClose, enginePair, engineVerify } from "../engine/client.js";
import type { EngineEvent } from "../engine/port.js";
import { t } from "../i18n/catalogue.js";
import { type ConnectionView, pairingStore, type PairingSurface, type PairingView } from "../ui/port.js";
import { getConnection, putConnection, removeConnection } from "./registry.js";
import { getSignalingSettings, type Relay, signalingStore } from "./relay.js";
import { transportStore } from "./settings.js";

/**
 * Every change reads `held.view` and assigns the next value in the same synchronous step after `load()`, so concurrent engine events cannot overwrite each other.
 * Session storage only carries the record across a service worker restart and to the popup.
 */
const held: { view?: PairingView; loading?: Promise<void>; } = {};

const load = async (): Promise<void> => {
  held.loading ??= (async () => {
    held.view = await pairingStore.getValue() ?? undefined;
  })();
  await held.loading;
};

const store = async (next: PairingView | undefined): Promise<void> => {
  held.view = next;
  await (next ? pairingStore.setValue(next) : pairingStore.removeValue());
};

const update = async (connectionId: string, change: (view: PairingView) => PairingView | undefined): Promise<void> => {
  await load();

  if (held.view?.connection.connectionId === connectionId) await store(change(held.view));
};

const fail = async (connectionId: string, error: string): Promise<void> => {
  await engineClose(connectionId);
  await update(connectionId, view => (view.connection.state === "connected" || view.error
    ? view
    : { connection: { ...view.connection, state: "disconnected" }, surface: view.surface, error }));
};

const finish = async (connectionId: string): Promise<void> => {
  const verified = await engineVerify(connectionId);

  await load();
  const view = held.view;

  if (view?.connection.connectionId !== connectionId) return;

  if (!verified.ok) {
    await fail(connectionId, verified.error);

    return;
  }

  const connection = {
    connectionId,
    relay: view.connection.relay,
    createdAt: view.connection.createdAt,
    wallet: verified.value.wallet ?? view.connection.wallet,
  };

  await putConnection(connection);

  if (held.view?.connection.connectionId === connectionId) {
    await store({ connection: { ...connection, state: "connected" }, surface: view.surface });

    if (view.surface === "approval") return;

    try {
      await browser.action.openPopup();
    }
    catch {
      // Chrome refuses without a focused browser window and before version 127, and the next open shows Connected anyway.
    }

    return;
  }

  await removeConnection(connectionId);
  await engineClose(connectionId);
};

export const endPairing = async (connectionId: string): Promise<void> => {
  await update(connectionId, () => undefined);

  if (!await getConnection(connectionId)) await engineClose(connectionId);
};

export const startPairing = async (connectionId: string, relay: Relay, surface: PairingSurface): Promise<void> => {
  await load();
  const previous = held.view;

  await store({ connection: { connectionId, relay, createdAt: Date.now(), state: "created" }, surface });

  if (previous && !await getConnection(previous.connection.connectionId)) await engineClose(previous.connection.connectionId);

  void (async () => {
    try {
      const transport = await transportStore.getValue();

      if (held.view?.connection.connectionId !== connectionId) return;

      const paired = await enginePair(connectionId, relay, transport);

      await load();

      if (held.view?.connection.connectionId !== connectionId) {
        await engineClose(connectionId);

        return;
      }

      if (!paired.ok) throw new Error(paired.error);
    }
    catch (error) {
      await fail(connectionId, error instanceof Error ? error.message : t("errors.couldNotStartConnection"));
    }
  })();
};

const advance = async (connectionId: string, change: (connection: ConnectionView) => ConnectionView): Promise<void> => {
  await update(connectionId, view => (view.connection.state === "connected" || view.error
    ? view
    : { ...view, connection: change(view.connection) }));
};

export const didHandlePairingEvent = async (message: EngineEvent): Promise<boolean> => {
  await load();
  const view = held.view;

  if (message.kind === "engine:notification" || view?.connection.connectionId !== message.connectionId || view.connection.state === "connected" || view.error) return false;

  if (message.kind === "engine:wallet") {
    await advance(message.connectionId, connection => ({ ...connection, wallet: message.wallet }));
  }
  else if (message.state === "disconnected") {
    await fail(message.connectionId, message.error ?? t("connectionFlow.connectionClosed"));
  }
  else if (message.state === "connected") {
    await advance(message.connectionId, connection => ({ ...connection, state: "linking" }));
    await finish(message.connectionId);
  }
  else {
    const { state, url } = message;

    await advance(message.connectionId, connection => ({ ...connection, state }));

    if (url) {
      const { relay } = view.connection;
      const settings = await getSignalingSettings();

      await signalingStore.setValue({ p: relay.p, s: { ...settings.s, [relay.p]: relay.s } });
      await update(message.connectionId, value => ({ ...value, url }));
    }
  }

  return true;
};
