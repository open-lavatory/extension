import type { RpcFailure } from "./page.js";

export type Route
  = | { kind: "connect"; }
    | { kind: "accounts"; }
    | { kind: "chainId"; }
    | { kind: "revoke"; }
    | { kind: "forward"; }
    | { kind: "refuse"; failure: RpcFailure; };

const UNSUPPORTED = new Set([
  "eth_subscribe",
  "eth_unsubscribe",
  "eth_newFilter",
  "eth_newBlockFilter",
  "eth_newPendingTransactionFilter",
  "eth_getFilterChanges",
  "eth_uninstallFilter",
]);

/**
 * The extension approves sites, the wallet approves transactions. Only
 * `eth_requestAccounts` raises a prompt of our own; everything a wallet has
 * to think about is forwarded untouched and confirmed on the phone.
 */
export const routeMethod = (method: string): Route => {
  if (method === "eth_requestAccounts") return { kind: "connect" };

  if (method === "eth_accounts") return { kind: "accounts" };

  if (method === "eth_chainId") return { kind: "chainId" };

  if (method === "wallet_revokePermissions") return { kind: "revoke" };

  if (UNSUPPORTED.has(method)) {
    return {
      kind: "refuse",
      failure: {
        code: -32_601,
        message: `${method} is not supported over an OpenLV session`,
      },
    };
  }

  return { kind: "forward" };
};
