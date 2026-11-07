import { storage } from "wxt/utils/storage";

export const RELAY_PROTOCOLS = ["mqtt", "ntfy", "gun"] as const;

export type RelayProtocol = (typeof RELAY_PROTOCOLS)[number];

export type Relay = {
  p: RelayProtocol;
  s: string;
};

export type SignalingSettings = {
  p: RelayProtocol;
  s: Partial<Record<RelayProtocol, string>>;
};

export const DEFAULT_RELAY_URLS: Record<RelayProtocol, string> = {
  mqtt: "wss://test.mosquitto.org:8081/mqtt",
  ntfy: "https://ntfy.sh",
  gun: "wss://try.axe.eco/gun",
};

const legacyRelayStore = storage.defineItem<Relay | undefined>(
  "local:last-relay",
  { fallback: undefined },
);

export const signalingStore = storage.defineItem<SignalingSettings | undefined>(
  "local:signaling",
  { fallback: undefined },
);

export const getSignalingSettings = async (): Promise<SignalingSettings> => {
  const saved = await signalingStore.getValue();

  if (saved) return saved;

  const previous = await legacyRelayStore.getValue();
  const initial: SignalingSettings = {
    p: previous?.p ?? "mqtt",
    s: { ...DEFAULT_RELAY_URLS, ...(previous && { [previous.p]: previous.s }) },
  };

  await signalingStore.setValue(initial);

  if (previous) await legacyRelayStore.removeValue();

  return initial;
};

export const getSavedRelay = async (): Promise<Relay> => {
  const settings = await getSignalingSettings();

  return { p: settings.p, s: settings.s[settings.p] ?? DEFAULT_RELAY_URLS[settings.p] };
};

export const isRelayProtocol = (value: string): value is RelayProtocol =>
  (RELAY_PROTOCOLS as readonly string[]).includes(value);

export const relayLabel = (relay: Relay): string => `${relay.p} via ${relay.s}`;
