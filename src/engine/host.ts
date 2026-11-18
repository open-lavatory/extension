import { encodeConnectionURL } from "@openlv/core";
import { createSession, RequestFailedError, type Session, SessionStatus } from "@openlv/session";
import { webrtc } from "@openlv/transport/webrtc";
import { browser } from "wxt/browser";
import * as z from "zod/mini";

import type { Wallet } from "../connections/registry.js";
import type { Relay } from "../connections/relay.js";
import { isWalletNotification, walletAddress } from "./notification.js";
import type {
  ConnectionState,
  EngineEvent,
  EngineResult,
  RpcPayload,
} from "./port.js";

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
      // A suspended worker has no listener. Surfaces reload state when they open.
    }
  })();
};

const jsonrpc = z.literal("2.0");
const responseFields = { jsonrpc, ["id"]: z.string() };
const walletSuccess = z.looseObject({ ...responseFields, result: z.unknown() })
  .check(z.refine(value => !("error" in value)));
const walletFailureFields = z.object({ code: z.int(), message: z.string() });
const walletFailure = z.looseObject({ ...responseFields, error: walletFailureFields })
  .check(z.refine(value => !("result" in value)));

type WalletResponse = { requestIdentifier: string; result: EngineResult<unknown>; };

const walletResponse = z.union([
  z.pipe(walletSuccess, z.transform((reply): WalletResponse => ({
    requestIdentifier: reply["id"],
    result: { ok: true, value: reply.result },
  }))),
  z.pipe(walletFailure, z.transform((reply): WalletResponse => ({
    requestIdentifier: reply["id"],
    result: { ok: false, error: reply.error.message, code: reply.error.code },
  }))),
]);
const peerNotification = z.looseObject({
  jsonrpc,
  method: z.string(),
  params: z.array(z.unknown()),
}).check(z.refine(value => !("id" in value)));
const peerRequestId = z.object({ ["id"]: z.union([z.string(), z.number()]) });

const unwrap = (payload: unknown, requestIdentifier: string): EngineResult<unknown> => {
  const parsed = walletResponse.safeParse(payload);

  if (!parsed.success || parsed.data.requestIdentifier !== requestIdentifier) {
    return { ok: false, error: "Invalid JSON-RPC response from wallet", code: -32_603 };
  }

  return parsed.data.result;
};

const onPeerRequest = async (connectionId: string, message: unknown): Promise<object | null> => {
  const parsed = peerNotification.safeParse(message);

  if (parsed.success) {
    const [data] = parsed.data.params;
    const notification = { event: parsed.data.method, data };

    if (isWalletNotification(notification)) {
      await browser.runtime.sendMessage({ kind: "engine:notification", connectionId, ...notification } satisfies EngineEvent);

      return null;
    }
  }

  const request = peerRequestId.safeParse(message);

  return {
    jsonrpc: "2.0",
    ["id"]: request.success ? request.data["id"] : null,
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
      ...(status === SessionStatus.READY && { url: encodeConnectionURL(session.getHandshakeParameters()) }),
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
): Promise<EngineResult<null>> => {
  const attempt = {};

  preparing.set(connectionId, attempt);

  try {
    const session = await createSession(
      { p: relay.p, s: relay.s },
      [webrtc(transport)],
      async message => await onPeerRequest(connectionId, message),
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

    return { ok: true, value: null };
  }
  catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";

    await close(connectionId);
    emit({ kind: "engine:state", connectionId, state: "disconnected", error: message });

    return { ok: false, error: message };
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

  const accounts = z.array(walletAddress).safeParse(result.value);

  if (!accounts.success) return { ok: false, error: "The wallet returned invalid accounts", code: -32_603 };

  const info = entry.session.peerInfo.get();

  return {
    ok: true,
    value: {
      accounts: accounts.data,
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
