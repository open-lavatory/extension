import { encodeConnectionURL } from "@openlv/core";
import { createSession, type Session, SessionStatus } from "@openlv/session";
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
  identity: "sh.openlv.connector",
  name: "OpenLV Connector",
} as const;

type Live = {
  session: Session;
  stop: () => void;
};

const live = new Map<string, Live>();

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

/** Wallet handlers answer with `{ result }` or `{ error }` envelopes. */
const unwrap = (payload: unknown): EngineResult<unknown> => {
  if (typeof payload !== "object" || payload === null) {
    return { ok: true, value: payload };
  }

  if ("error" in payload && payload.error) {
    const failure = payload.error as { code?: number; message?: string; };

    return {
      ok: false,
      error: failure.message ?? "The wallet returned an error",
      ...(failure.code !== undefined && { code: failure.code }),
    };
  }

  if ("result" in payload) {
    return { ok: true, value: (payload as { result: unknown; }).result };
  }

  return { ok: true, value: payload };
};

/**
 * Requests travelling from the wallet to the extension. None are implemented
 * yet, so each one is answered rather than left to time out.
 */
const onPeerRequest = async (): Promise<object> => ({
  error: { code: -32_601, message: "Method not found" },
});

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
): Promise<EngineResult<{ url: string; }>> => {
  await close(connectionId);

  try {
    const session = await createSession(
      { p: relay.p, s: relay.s },
      [webrtc()],
      onPeerRequest,
      { info: PEER_INFO },
    );

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
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Pairing failed",
    };
  }
};

export const send = async (
  connectionId: string,
  payload: RpcPayload,
): Promise<EngineResult<unknown>> => {
  const entry = live.get(connectionId);

  if (!entry) {
    return { ok: false, error: "That connection is not live", code: 4900 };
  }

  if (entry.session.status.get() !== SessionStatus.CONNECTED) {
    return { ok: false, error: "That connection is not connected", code: 4900 };
  }

  try {
    return unwrap(await entry.session.send(payload));
  }
  catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The request failed",
    };
  }
};

export const close = async (connectionId: string): Promise<void> => {
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
