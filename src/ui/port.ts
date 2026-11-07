import type { Connection } from "../connections/registry.js";
import type { Relay } from "../connections/relay.js";
import type { ConnectionState } from "../engine/port.js";

export type ConnectionView = Connection & {
  state: ConnectionState;
};

export type Decision
  = | { kind: "approved"; connectionId: string; accounts: string[]; }
    | { kind: "rejected"; };

export type UiCommand
  = | { kind: "ui:list"; }
    | { kind: "ui:url"; connectionId: string; }
    | { kind: "ui:forget"; connectionId: string; }
    | { kind: "ui:cancel-pair"; connectionId: string; }
    | { kind: "ui:unbind"; origin: string; }
    | { kind: "approve:load"; requestId: string; }
    | { kind: "approve:accounts"; requestId: string; connectionId: string; }
    | { kind: "approve:decide"; requestId: string; decision: Decision; };

export type UiResult<T>
  = | { ok: true; value: T; }
    | { ok: false; error: string; };

export type UiReply
  = | { for: "ui:list"; result: UiResult<ConnectionView[]>; }
    | { for: "ui:url"; result: UiResult<{ url: string; }>; }
    | { for: "ui:forget"; result: UiResult<null>; }
    | { for: "ui:cancel-pair"; result: UiResult<null>; }
    | { for: "ui:unbind"; result: UiResult<null>; }
    | {
      for: "approve:load";
      result: UiResult<{ origin: string; connections: ConnectionView[]; }>;
    }
    | { for: "approve:accounts"; result: UiResult<string[]>; }
    | { for: "approve:decide"; result: UiResult<null>; };

export const PAIRING_PORT = "openlv-pairing";

export type PairingCommand
  = | { kind: "pair:start"; connectionId: string; relay: Relay; }
    | { kind: "pair:keepalive"; };

export type PairingMessage
  = | { kind: "pair:ready"; url: string; }
    | { kind: "pair:state"; connection: ConnectionView; error?: string; }
    | { kind: "pair:error"; error: string; };

export const isPairingMessage = (value: unknown): value is PairingMessage => {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;

  if (value.kind === "pair:ready") return "url" in value && typeof value.url === "string";

  if (value.kind === "pair:error") return "error" in value && typeof value.error === "string";

  if (value.kind !== "pair:state" || !("connection" in value)) return false;

  const connection = value.connection;

  return typeof connection === "object"
    && connection !== null
    && "connectionId" in connection
    && typeof connection.connectionId === "string"
    && "state" in connection
    && typeof connection.state === "string"
    && ["created", "signaling", "ready", "linking", "connected", "disconnected"].includes(connection.state);
};

export const isUiCommand = (message: unknown): message is UiCommand =>
  typeof message === "object"
  && message !== null
  && "kind" in message
  && typeof message.kind === "string"
  && (message.kind.startsWith("ui:") || message.kind.startsWith("approve:"));
