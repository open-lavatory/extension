import { encodeConnectionURL } from "@openlv/core";
import { createSession, RequestFailedError, type Session, SessionStatus } from "@openlv/session";
import { webrtc } from "@openlv/transport/webrtc";
import { browser } from "wxt/browser";

import type { Wallet } from "../connections/registry.js";
import type { Relay } from "../connections/relay.js";
import type {
  ConnectionState,
  EngineEvent,
  EngineResult,
  RpcPayload,
} from "./port.js";

/**
 * What the paired wallet is told this peer is. One value for the life of a
 * connection: peer info travels once, during the handshake, and the extension
 * deliberately never claims to be the site it is serving.
 */
const PEER_INFO = {
  identity: "sh.openlv.connect",
  name: "openlv-connect",
} as const;

type Live = {
  session: Session;
  stop: () => void;
};

const live = new Map<string, Live>();
const preparing = new Map<string, object>();

const emit = (event: EngineEvent): void => {
  void (async () => {
    try {
      await browser.runtime.sendMessage(event);
    }
    catch {
      // Nothing is listening because the worker is asleep. Surfaces re-read
      // state through engine:states when they next open.
    }
  })();
};

const unwrap = (payload: unknown, requestIdentifier: string): EngineResult<unknown> => {
  if (
    typeof payload !== "object"
    || payload === null
    || !("jsonrpc" in payload)
    || payload.jsonrpc !== "2.0"
    || !("id" in payload)
    || payload["id"] !== requestIdentifier
    || Object.hasOwn(payload, "result") === Object.hasOwn(payload, "error")
  ) {
    return { ok: false, error: "Invalid JSON-RPC response from wallet", code: -32_603 };
  }

  if ("error" in payload) {
    const failure = payload.error;

    if (
      typeof failure !== "object"
      || failure === null
      || !("code" in failure)
      || typeof failure.code !== "number"
      || !Number.isSafeInteger(failure.code)
      || !("message" in failure)
      || typeof failure.message !== "string"
    ) {
      return { ok: false, error: "Invalid JSON-RPC response from wallet", code: -32_603 };
    }

    return {
      ok: false,
      error: failure.message,
      code: failure.code,
    };
  }

  if ("result" in payload) {
    return { ok: true, value: payload.result };
  }

  return { ok: false, error: "Invalid JSON-RPC response from wallet", code: -32_603 };
};

const onPeerRequest = async (message: unknown): Promise<object> => {
  const requestIdentifier = typeof message === "object"
    && message !== null
    && "id" in message
    && (typeof message["id"] === "string" || typeof message["id"] === "number")
    ? message["id"]
    : null;

  return {
    jsonrpc: "2.0",
    ["id"]: requestIdentifier,
    error: { code: -32_601, message: "Method not found" },
  };
};

const watch = (connectionId: string, session: Session): (() => void) => {
  const unsubscribeStatus = session.status.subscribe((status) => {
    const error = session.error.get();

    emit({
      kind: "engine:state",
      connectionId,
      state: status,
      ...(error && { error }),
    });
  });
  const unsubscribePeer = session.peerInfo.subscribe((info) => {
    if (!info) return;

    const wallet: Wallet = {
      name: info.name,
      ...(info.identity && { identity: info.identity }),
      ...(info.icon && { icon: info.icon }),
    };

    emit({ kind: "engine:wallet", connectionId, wallet });
  });

  return () => {
    unsubscribeStatus();
    unsubscribePeer();
  };
};

export const pair = async (
  connectionId: string,
  relay: Relay,
  transport: RTCConfiguration,
): Promise<EngineResult<{ url: string; }>> => {
  await close(connectionId);
  const attempt = {};

  preparing.set(connectionId, attempt);

  try {
    const session = await createSession(
      { p: relay.p, s: relay.s },
      [webrtc(transport)],
      onPeerRequest,
      { info: PEER_INFO },
    );

    if (preparing.get(connectionId) !== attempt) {
      await session.close();

      return { ok: false, error: "Connection canceled" };
    }

    preparing.delete(connectionId);
    live.set(connectionId, {
      session,
      stop: watch(connectionId, session),
    });

    await session.connect();

    return {
      ok: true,
      value: { url: encodeConnectionURL(session.getHandshakeParameters()) },
    };
  }
  catch (error) {
    await close(connectionId);

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
};

const request = async (
  session: Session,
  payload: RpcPayload,
  responseTimeoutMs: number,
): Promise<EngineResult<unknown>> => {
  try {
    const requestIdentifier = crypto.randomUUID();
    const response = await session.send({
      ...payload,
      jsonrpc: "2.0",
      ["id"]: requestIdentifier,
    }, 10_000, responseTimeoutMs);

    return unwrap(response, requestIdentifier);
  }
  catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The request failed",
      ...(error instanceof RequestFailedError && { code: -32_603 }),
    };
  }
};

export const send = async (
  connectionId: string,
  payload: RpcPayload,
): Promise<EngineResult<unknown>> => {
  const entry = live.get(connectionId);

  if (!entry || entry.session.status.get() !== SessionStatus.CONNECTED) {
    return { ok: false, error: "That connection is not connected", code: 4900 };
  }

  return await request(entry.session, payload, 60 * 60_000);
};

export const verify = async (
  connectionId: string,
): Promise<EngineResult<{ accounts: string[]; wallet?: Wallet; }>> => {
  const entry = live.get(connectionId);

  if (
    !entry
    || entry.session.status.get() !== SessionStatus.CONNECTED
    || entry.session.signalStatus.get() !== "encrypted"
  ) return { ok: false, error: "The connection is not encrypted", code: 4900 };

  const result = await request(entry.session, { method: "eth_accounts", params: [] }, 10_000);

  if (!result.ok) return result;

  if (!Array.isArray(result.value)) {
    return { ok: false, error: "The wallet returned invalid accounts", code: -32_603 };
  }

  const values: unknown[] = result.value;
  const accounts = values.filter((account): account is string => typeof account === "string" && /^0x[\da-f]{40}$/iu.test(account));

  if (accounts.length !== values.length) return { ok: false, error: "The wallet returned invalid accounts", code: -32_603 };

  const info = entry.session.peerInfo.get();

  return {
    ok: true,
    value: {
      accounts,
      ...(info && { wallet: { name: info.name, ...(info.identity && { identity: info.identity }), ...(info.icon && { icon: info.icon }) } }),
    },
  };
};

export const close = async (connectionId: string): Promise<void> => {
  preparing.delete(connectionId);
  const entry = live.get(connectionId);

  if (!entry) return;

  live.delete(connectionId);
  entry.stop();

  try {
    await entry.session.close();
  }
  catch {
    // A session that never linked has nothing to tear down.
  }
};

export const states = (): Record<string, ConnectionState> =>
  Object.fromEntries(
    [...live].map(([liveId, entry]) => [
      liveId,
      entry.session.status.get(),
    ]),
  );

export const urlOf = (
  connectionId: string,
): EngineResult<{ url: string; }> => {
  const entry = live.get(connectionId);

  if (!entry) return { ok: false, error: "That connection is not live" };

  return {
    ok: true,
    value: { url: encodeConnectionURL(entry.session.getHandshakeParameters()) },
  };
};
