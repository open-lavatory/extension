import { type Accessor, createSignal, onCleanup } from "solid-js";

import type { Relay } from "../connections/relay.js";
import { t } from "../i18n/catalogue.js";
import { call } from "./client.js";
import { type ConnectionView, pairingStore, type PairingSurface, type PairingView } from "./port.js";

export type Pairing = {
  connection: Accessor<ConnectionView | undefined>;
  url: Accessor<string | undefined>;
  failure: Accessor<string | undefined>;
  isStarting: Accessor<boolean>;
  copied: Accessor<boolean>;
  start: (relay: Relay) => Promise<void>;
  end: () => void;
  copy: () => Promise<void>;
};

export const createPairing = (surface: PairingSurface): Pairing => {
  const [view, setView] = createSignal<PairingView | undefined>();
  const [failure, setFailure] = createSignal<string | undefined>();
  const [copied, setCopied] = createSignal(false);
  const started: { connectionId?: string; } = {};
  const ended = new Set<string>();
  const show = (value: PairingView | null | undefined): void => {
    setView(value && !ended.has(value.connection.connectionId) ? value : undefined);
  };

  onCleanup(pairingStore.watch(show));
  void pairingStore.getValue().then((value) => {
    if (!view()) show(value);
  });

  const url = () => view()?.url;

  return {
    connection: () => view()?.connection,
    url,
    failure: () => failure() ?? view()?.error,
    isStarting: () => !!view() && !url() && !view()?.error,
    copied,
    start: async (relay) => {
      const connectionId = crypto.randomUUID();

      started.connectionId = connectionId;
      setCopied(false);
      setFailure(undefined);

      const reply = await call({ kind: "ui:pair", connectionId, relay, surface });

      if (!reply.result.ok) setFailure(reply.result.error);
    },
    end: () => {
      const connectionId = view()?.connection.connectionId ?? started.connectionId;

      delete started.connectionId;
      setView(undefined);
      setFailure(undefined);

      if (!connectionId) return;

      ended.add(connectionId);
      void call({ kind: "ui:end-pair", connectionId });
    },
    copy: async () => {
      const value = url();

      if (!value) return;

      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }
      catch {
        setFailure(t("errors.couldNotCopyUrl"));
      }
    },
  };
};
