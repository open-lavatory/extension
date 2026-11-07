import type { SessionStatus } from "@openlv/session";

import type { Wallet } from "../connections/registry.js";
import type { Relay } from "../connections/relay.js";

export type RpcPayload = {
  method: string;
  params?: unknown;
};

/**
 * The session's own status, carried through unchanged. Collapsing it would
 * hide the difference between "waiting for the relay" and "waiting for the
 * user to scan", which is what the pairing screen switches on.
 */
export type ConnectionState = SessionStatus;

export type EngineCommand
  = | { kind: "engine:pair"; connectionId: string; relay: Relay; transport: RTCConfiguration; }
    | { kind: "engine:url"; connectionId: string; }
    | { kind: "engine:send"; connectionId: string; payload: RpcPayload; }
    | { kind: "engine:verify"; connectionId: string; }
    | { kind: "engine:close"; connectionId: string; }
    | { kind: "engine:states"; };

export type EngineResult<T>
  = | { ok: true; value: T; }
    | { ok: false; error: string; code?: number; };

export type EngineReply
  = | { for: "engine:pair"; result: EngineResult<null>; }
    | { for: "engine:url"; result: EngineResult<{ url: string; }>; }
    | { for: "engine:send"; result: EngineResult<unknown>; }
    | { for: "engine:verify"; result: EngineResult<{ accounts: string[]; wallet?: Wallet; }>; }
    | { for: "engine:close"; result: EngineResult<null>; }
    | {
      for: "engine:states";
      result: EngineResult<Record<string, ConnectionState>>;
    };

export type EngineFailure = { for: "engine:failed"; error: string; };

export type EngineEvent
  = | {
    kind: "engine:state";
    connectionId: string;
    state: ConnectionState;
    error?: string;
    url?: string;
  }
  | { kind: "engine:wallet"; connectionId: string; wallet: Wallet; };

export const isEngineEvent = (message: unknown): message is EngineEvent =>
  typeof message === "object"
  && message !== null
  && "kind" in message
  && (message.kind === "engine:state" || message.kind === "engine:wallet");
