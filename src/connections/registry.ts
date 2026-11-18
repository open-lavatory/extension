import { storage } from "wxt/utils/storage";

import type { Relay } from "./relay.js";

export type Wallet = {
  name: string;
  identity?: string;
  icon?: string;
};

export type Binding = {
  origin: string;
  accounts: string[];
  icon?: string | undefined;
};

/**
 * The persisted half of a connection. The session itself lives in the
 * offscreen document and does not survive a browser restart yet, so a record
 * read back from storage stays `disconnected` until it is paired again.
 */
export type Connection = {
  connectionId: string;
  relay: Relay;
  createdAt: number;
  wallet?: Wallet;
  binding?: Binding;
  chainId?: string;
};

export const connectionStore = storage.defineItem<Connection[]>(
  "local:connections",
  { fallback: [] },
);

const writes = { pending: Promise.resolve() };

/** Serialize registry writes so concurrent changes cannot overwrite each other. */
export const updateConnections = (change: (connections: Connection[]) => Connection[]): Promise<void> => {
  const previous = writes.pending;
  const next = (async () => {
    await Promise.allSettled([previous]);
    const current = await connectionStore.getValue();

    await connectionStore.setValue(change(current));
  })();

  writes.pending = next;

  return next;
};

export const listConnections = async (): Promise<Connection[]> =>
  await connectionStore.getValue();

export const getConnection = async (
  connectionId: string,
): Promise<Connection | undefined> => {
  const current = await connectionStore.getValue();

  return current.find(entry => entry.connectionId === connectionId);
};

export const patchConnection = async (
  connectionId: string,
  patch: Partial<Omit<Connection, "connectionId">>,
): Promise<void> => {
  await updateConnections(current => current.map(entry => (entry.connectionId === connectionId ? { ...entry, ...patch } : entry)));
};

export const putConnection = async (connection: Connection): Promise<void> => {
  await updateConnections((current) => {
    const index = current.findIndex(entry => entry.connectionId === connection.connectionId);

    return index === -1 ? [...current, connection] : current.with(index, connection);
  });
};

export const removeConnection = async (
  connectionId: string,
): Promise<void> => {
  await updateConnections(current => current.filter(entry => entry.connectionId !== connectionId));
};
