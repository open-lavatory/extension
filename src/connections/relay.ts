import { storage } from "wxt/utils/storage";

export const RELAY_PROTOCOLS = ["mqtt", "ntfy", "gun"] as const;

export type RelayProtocol = (typeof RELAY_PROTOCOLS)[number];

export type Relay = {
  p: RelayProtocol;
  s: string;
};

/**
 * Every connection carries the relay it was paired on. This only prefills the
 * next pairing form, so choosing a relay stays a per connection decision
 * rather than a setting made once and forgotten.
 */
export const lastRelayStore = storage.defineItem<Relay | undefined>(
  "local:last-relay",
  { fallback: undefined },
);

export const isRelayProtocol = (value: string): value is RelayProtocol =>
  (RELAY_PROTOCOLS as readonly string[]).includes(value);

export const relayLabel = (relay: Relay): string => `${relay.p} via ${relay.s}`;
