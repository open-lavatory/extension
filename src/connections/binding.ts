import {
  type Connection,
  listConnections,
  updateConnections,
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

export const bindOrigin = async (
  connectionId: string,
  origin: string,
  accounts: string[],
  icon: string | undefined,
): Promise<BindResult> => {
  let result: BindResult = { ok: false, reason: "unknown-connection" };

  await updateConnections((current) => {
    const target = current.find(entry => entry.connectionId === connectionId);

    if (!target) return current;

    const displaced = target.binding?.origin === origin ? undefined : target.binding?.origin;

    result = displaced ? { ok: true, displaced } : { ok: true };

    return current.map((entry) => {
      if (entry.connectionId === connectionId) {
        return { ...entry, binding: { origin, accounts, icon } };
      }

      // Keep one connection per origin so revoking it fully disconnects the site.
      if (entry.binding?.origin === origin) {
        return { ...entry, binding: undefined };
      }

      return entry;
    });
  });

  return result;
};

export const unbindOrigin = async (origin: string): Promise<void> => {
  await updateConnections(current =>
    current.map((entry) => {
      if (entry.binding?.origin !== origin) return entry;

      return { ...entry, binding: undefined };
    }));
};
