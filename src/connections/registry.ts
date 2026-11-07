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

export const listConnections = async (): Promise<Connection[]> =>
  await connectionStore.getValue();

export const getConnection = async (
  connectionId: string,
): Promise<Connection | undefined> => {
  const current = await connectionStore.getValue();

  return current.find(entry => entry.connectionId === connectionId);
};

export const putConnection = async (connection: Connection): Promise<void> => {
  const current = await connectionStore.getValue();
  const index = current.findIndex(
    entry => entry.connectionId === connection.connectionId,
  );

  await connectionStore.setValue(
    index === -1 ? [...current, connection] : current.with(index, connection),
  );
};

export const patchConnection = async (
  connectionId: string,
  patch: Partial<Omit<Connection, "connectionId">>,
): Promise<void> => {
  const existing = await getConnection(connectionId);

  if (!existing) return;

  await putConnection({ ...existing, ...patch });
};

export const removeConnection = async (
  connectionId: string,
): Promise<void> => {
  const current = await connectionStore.getValue();

  await connectionStore.setValue(
    current.filter(entry => entry.connectionId !== connectionId),
  );
};
