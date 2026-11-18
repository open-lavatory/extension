import { engineSend } from "../engine/client.js";
import type { EngineResult } from "../engine/port.js";
import { type Connection, getConnection } from "./registry.js";

export const walletAccounts = async (connectionId: string): Promise<EngineResult<string[]>> => {
  const result = await engineSend(connectionId, { method: "eth_accounts", params: [] });

  if (!result.ok) return result;

  const accounts = Array.isArray(result.value)
    ? result.value.filter((account: unknown): account is string => typeof account === "string")
    : [];

  return { ok: true, value: accounts };
};

export const visibleAccounts = (accounts: readonly string[], approved: readonly string[]): string[] => {
  const allowed = new Set(approved.map(account => account.toLowerCase()));

  return accounts.filter(account => allowed.has(account.toLowerCase()));
};

export const siteAccounts = async (connection: Connection): Promise<string[]> => {
  if (!connection.binding?.accounts.length) return [];

  const { origin } = connection.binding;
  const result = await walletAccounts(connection.connectionId);
  const current = await getConnection(connection.connectionId);

  return result.ok && current?.binding?.origin === origin ? visibleAccounts(result.value, current.binding.accounts) : [];
};
