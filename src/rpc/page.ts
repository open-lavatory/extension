import * as z from "zod/mini";

export const PAGE_CHANNEL = "openlv-connector";

const channel = z.literal(PAGE_CHANNEL);
const messageId = z.string();

const pageRequest = z.object({
  channel,
  kind: z.literal("request"),
  messageId,
  method: z.string(),
  params: z.optional(z.unknown()),
});

const rpcFailure = z.object({
  code: z.number(),
  message: z.string(),
  data: z.optional(z.unknown()),
});

const response = { channel, kind: z.literal("response"), messageId };
const pageResponse = z.union([
  z.looseObject({ ...response, result: z.unknown() }).check(z.refine(value => !("error" in value))),
  z.looseObject({ ...response, error: rpcFailure }).check(z.refine(value => !("result" in value))),
]);

const pageEvent = z.object({
  channel,
  kind: z.literal("event"),
  event: z.enum(["accountsChanged", "chainChanged", "connect", "disconnect", "message"]),
  data: z.unknown(),
});

const pageMessage = z.union([pageRequest, pageResponse, pageEvent]);

export type PageRequest = z.infer<typeof pageRequest>;
export type RpcFailure = z.infer<typeof rpcFailure>;
export type PageEvent = z.infer<typeof pageEvent>;
export type PageResponse = {
  channel: typeof PAGE_CHANNEL;
  kind: "response";
  messageId: string;
} & ({ result: unknown; } | { error: RpcFailure; });

export type PageMessage = PageRequest | PageResponse | PageEvent;

export const isRpcFailure = (value: unknown): value is RpcFailure => rpcFailure.safeParse(value).success;

export const isPageMessage = (value: unknown): value is PageMessage => pageMessage.safeParse(value).success;

export const answerPage = (
  messageId: string,
  result: unknown,
): PageResponse => ({
  channel: PAGE_CHANNEL,
  kind: "response",
  messageId,
  result,
});

export const refusePage = (
  messageId: string,
  error: RpcFailure,
): PageResponse => ({
  channel: PAGE_CHANNEL,
  kind: "response",
  messageId,
  error,
});
