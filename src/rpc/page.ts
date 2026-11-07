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

export const isPageMessage = (value: unknown): value is PageMessage => {
  if (
    typeof value !== "object"
    || value === null
    || !("channel" in value)
    || value.channel !== PAGE_CHANNEL
    || !("kind" in value)
  ) return false;

  if (value.kind === "event") {
    return "event" in value
      && typeof value.event === "string"
      && ["accountsChanged", "chainChanged", "connect", "disconnect"].includes(value.event)
      && "data" in value;
  }

  if (!("messageId" in value) || typeof value.messageId !== "string") return false;

  if (value.kind === "request") {
    return "method" in value && typeof value.method === "string";
  }

  if (value.kind !== "response") return false;

  if ("error" in value) {
    return !("result" in value)
      && typeof value.error === "object"
      && value.error !== null
      && "code" in value.error
      && typeof value.error.code === "number"
      && "message" in value.error
      && typeof value.error.message === "string";
  }

  return "result" in value;
};

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
