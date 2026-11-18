import * as z from "zod/mini";

export const walletAddress = z.string().check(z.regex(/^0x[\da-f]{40}$/iu));
const chainId = z.string().check(z.regex(/^0x[\da-f]+$/iu));
const disconnectError = z.object({ code: z.int(), message: z.string(), data: z.optional(z.unknown()) });
const providerMessage = z.object({ type: z.string(), data: z.unknown() });

const walletNotification = z.discriminatedUnion("event", [
  z.object({ event: z.literal("accountsChanged"), data: z.array(walletAddress) }),
  z.object({ event: z.literal("chainChanged"), data: chainId }),
  z.object({ event: z.literal("connect"), data: z.object({ chainId }) }),
  z.object({ event: z.literal("disconnect"), data: disconnectError }),
  z.object({ event: z.literal("message"), data: providerMessage }),
]);

export type WalletNotification = z.infer<typeof walletNotification>;

export const isWalletAddress = (value: unknown): value is `0x${string}` =>
  walletAddress.safeParse(value).success;

export const isWalletNotification = (notification: unknown): notification is WalletNotification =>
  walletNotification.safeParse(notification).success;
