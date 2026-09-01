export const PAGE_CHANNEL = "openlv-connector";

export type PageRequest = {
  channel: typeof PAGE_CHANNEL;
  kind: "request";
  messageId: string;
  method: string;
  params?: unknown;
};

export type RpcFailure = {
  code: number;
  message: string;
};

export type PageResponse = {
  channel: typeof PAGE_CHANNEL;
  kind: "response";
  messageId: string;
} & ({ result: unknown; } | { error: RpcFailure; });

export type PageEvent = {
  channel: typeof PAGE_CHANNEL;
  kind: "event";
  event: "accountsChanged" | "chainChanged" | "connect" | "disconnect";
  data: unknown;
};

export type PageMessage = PageRequest | PageResponse | PageEvent;

export const isPageMessage = (value: unknown): value is PageMessage =>
  typeof value === "object"
  && value !== null
  && "channel" in value
  && value.channel === PAGE_CHANNEL;

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
