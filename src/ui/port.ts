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
    | { kind: "ui:pair"; relay: Relay; }
    | { kind: "ui:url"; connectionId: string; }
    | { kind: "ui:forget"; connectionId: string; }
    | { kind: "ui:unbind"; origin: string; }
    | { kind: "approve:load"; requestId: string; }
    | { kind: "approve:accounts"; requestId: string; connectionId: string; }
    | { kind: "approve:decide"; requestId: string; decision: Decision; };

export type UiResult<T>
  = | { ok: true; value: T; }
    | { ok: false; error: string; };

export type UiReply
  = | { for: "ui:list"; result: UiResult<ConnectionView[]>; }
    | { for: "ui:pair"; result: UiResult<{ connectionId: string; url: string; }>; }
    | { for: "ui:url"; result: UiResult<{ url: string; }>; }
    | { for: "ui:forget"; result: UiResult<null>; }
    | { for: "ui:unbind"; result: UiResult<null>; }
    | {
      for: "approve:load";
      result: UiResult<{ origin: string; connections: ConnectionView[]; }>;
    }
    | { for: "approve:accounts"; result: UiResult<string[]>; }
    | { for: "approve:decide"; result: UiResult<null>; };

export const isUiCommand = (message: unknown): message is UiCommand =>
  typeof message === "object"
  && message !== null
  && "kind" in message
  && typeof message.kind === "string"
  && (message.kind.startsWith("ui:") || message.kind.startsWith("approve:"));
