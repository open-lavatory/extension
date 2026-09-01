import {
  type Connection,
  connectionStore,
  getConnection,
  listConnections,
} from "./registry.js";

export type BindResult
  = | { ok: true; displaced?: string; }
    | { ok: false; reason: "unknown-connection"; };

export const connectionForOrigin = async (
  origin: string,
): Promise<Connection | undefined> => {
  const current = await listConnections();

  return current.find(entry => entry.binding?.origin === origin);
};

/**
 * A connection serves one origin at a time. Binding it to a second origin
 * takes it away from the first, and the displaced origin is returned so the
 * caller can tell its tabs they are disconnected.
 */
export const bindOrigin = async (
  connectionId: string,
  origin: string,
  accounts: string[],
): Promise<BindResult> => {
  const target = await getConnection(connectionId);

  if (!target) return { ok: false, reason: "unknown-connection" };

  const displaced = target.binding?.origin === origin
    ? undefined
    : target.binding?.origin;
  const current = await connectionStore.getValue();

  await connectionStore.setValue(
    current.map((entry) => {
      if (entry.connectionId === connectionId) {
        return { ...entry, binding: { origin, accounts } };
      }

      // An origin may not hold two connections either, otherwise revoking one
      // would leave the site quietly connected through the other.
      if (entry.binding?.origin === origin) {
        return { ...entry, binding: undefined };
      }

      return entry;
    }),
  );

  return displaced ? { ok: true, displaced } : { ok: true };
};

export const unbindOrigin = async (origin: string): Promise<void> => {
  const current = await connectionStore.getValue();

  await connectionStore.setValue(
    current.map((entry) => {
      if (entry.binding?.origin !== origin) return entry;

      return { ...entry, binding: undefined };
    }),
  );
};
