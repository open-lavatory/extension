import * as z from "zod/mini";

import type { PageRequest } from "./page.js";

const accountPermissionRequest = z.tuple([z.strictObject({ eth_accounts: z.strictObject({}) })]);
const address = z.string().check(z.regex(/^0x[\da-f]{40}$/iu));
const firstAccount = z.pipe(z.tuple([address, z.unknown()], z.unknown()), z.transform(([account]) => account));
const secondAccount = z.pipe(z.tuple([z.unknown(), address], z.unknown()), z.transform(([, account]) => account));
const transactionAccount = z.pipe(z.tuple([z.looseObject({ from: address })], z.unknown()), z.transform(([transaction]) => transaction.from));
const legacyTypedData = z.array(z.unknown());
const legacyTypedAccount = z.pipe(z.tuple([legacyTypedData, address], z.unknown()), z.transform(([, account]) => account));
const signerParameters = {
  personal_sign: secondAccount,
  eth_sign: firstAccount,
  eth_signTypedData: z.union([firstAccount, legacyTypedAccount]),
  eth_signTypedData_v3: firstAccount,
  eth_signTypedData_v4: firstAccount,
  eth_sendTransaction: transactionAccount,
  eth_signTransaction: transactionAccount,
  wallet_sendCalls: transactionAccount,
};
const signingMethod = z.keyof(z.object(signerParameters));

export const accountPermissions = (origin: string, accounts: string[]): object[] => (accounts.length === 0
  ? []
  : [{
      invoker: origin,
      parentCapability: "eth_accounts",
      caveats: [{ type: "restrictReturnedAccounts", value: accounts }],
    }]);

export const isAccountPermissionRequest = (parameters: unknown): boolean =>
  accountPermissionRequest.safeParse(parameters).success;

export const hasAuthorizedSigner = (request: PageRequest, accounts: string[]): boolean => {
  const method = signingMethod.safeParse(request.method);

  if (!method.success) return true;

  const signer = signerParameters[method.data].safeParse(request.params);

  return signer.success && accounts.some(account => account.toLowerCase() === signer.data.toLowerCase());
};
