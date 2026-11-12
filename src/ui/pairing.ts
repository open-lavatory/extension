import { type Accessor, createSignal, onCleanup } from "solid-js";

import type { Relay } from "../connections/relay.js";
import { t } from "../i18n/catalogue.js";
import { call } from "./client.js";
import { type ConnectionView, pairingStore, type PairingSurface, type PairingView } from "./port.js";

export type Pairing = {
  connection: Accessor<ConnectionView | undefined>;
  surface: Accessor<PairingSurface | undefined>;
  url: Accessor<string | undefined>;
  failure: Accessor<string | undefined>;
  isStarting: Accessor<boolean>;
  copied: Accessor<boolean>;
  start: (relay: Relay) => Promise<void>;
  end: () => Promise<boolean>;
  copy: () => Promise<void>;
};

export const createPairing = (surface: PairingSurface): Pairing => {
  const [view, setView] = createSignal<PairingView | undefined>();
  const [failure, setFailure] = createSignal<string | undefined>();
  const [copied, setCopied] = createSignal(false);
  let started: { connectionId: string; pending: ReturnType<typeof call>; } | undefined;
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
    surface: () => view()?.surface,
    url,
    failure: () => failure() ?? view()?.error,
    isStarting: () => !!view() && !url() && !view()?.error,
    copied,
    start: async (relay) => {
      const connectionId = crypto.randomUUID();

      setCopied(false);
      setFailure(undefined);

      const pending = call({ kind: "ui:pair", connectionId, relay, surface });

      started = { connectionId, pending };
      const reply = await pending;

      if (started?.connectionId === connectionId && !reply.result.ok) setFailure(reply.result.error);
    },
    end: async () => {
      const connectionId = view()?.connection.connectionId ?? started?.connectionId;

      if (!connectionId) return true;

      try {
        await Promise.allSettled([started?.pending]);
        const reply = await call({ kind: "ui:end-pair", connectionId });

        if (!reply.result.ok) {
          setFailure(reply.result.error);

          return false;
        }

        ended.add(connectionId);

        if (started?.connectionId === connectionId) started = undefined;

        if (view()?.connection.connectionId === connectionId) setView(undefined);

        setFailure(undefined);

        return true;
      }
      catch (error) {
        setFailure(error instanceof Error ? error.message : t("approval.couldNotStopConnection"));

        return false;
      }
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
