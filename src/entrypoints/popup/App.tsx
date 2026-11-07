import LucideChevronRight from "lucide-solid/icons/chevron-right";
import LucideEllipsis from "lucide-solid/icons/ellipsis";
import LucideSmartphone from "lucide-solid/icons/smartphone";
import {
  createResource,
  createSignal,
  For,
  type JSX,
  lazy,
  onCleanup,
  Show,
  Suspense,
} from "solid-js";
import { browser } from "wxt/browser";

import {
  DEFAULT_RELAY_URLS,
  getSavedRelay,
  getSignalingSettings,
  type Relay,
  RELAY_PROTOCOLS,
  type RelayProtocol,
  type SignalingSettings,
  signalingStore,
} from "../../connections/relay.js";
import { transportStore } from "../../connections/settings.js";
import { isEngineEvent } from "../../engine/port.js";
import { call } from "../../ui/client.js";
import { ConnectionLoading } from "../../ui/ConnectionLoading.js";
import { Header } from "../../ui/Header.js";
import { createPairing } from "../../ui/pairing.js";

const PairingScreen = lazy(async () => {
  const { PairingScreen } = await import("../../ui/PairingScreen.js");

  return { default: PairingScreen };
});
const TransportSettings = lazy(async () => {
  const { TransportSettings } = await import("../../ui/TransportSettings.js");

  return { default: TransportSettings };
});

type View = "list" | "settings" | "signaling" | "transport" | "connect";

const titles: Record<View, string> = {
  list: "openlv-connect",
  settings: "Settings",
  signaling: "Signaling",
  transport: "Transport",
  connect: "Connect",
};

export const App = (): JSX.Element => {
  const [view, setView] = createSignal<View>("list");
  const pairing = createPairing();
  const [connections, { refetch }] = createResource(async () => {
    const reply = await call({ kind: "ui:list" });

    if (reply.for !== "ui:list" || !reply.result.ok) {
      throw new Error("Could not load connections");
    }

    return reply.result.value;
  });
  const [transport, { mutate: updateTransport }] = createResource(() => view() === "transport", async () => await transportStore.getValue());
  const [protocol, setProtocol] = createSignal<RelayProtocol>("mqtt");
  const [servers, setServers] = createSignal<SignalingSettings["s"]>({});
  const server = () => servers()[protocol()] ?? DEFAULT_RELAY_URLS[protocol()];
  const [failure, setFailure] = createSignal<string | undefined>();
  let saving = Promise.resolve();
  let hasSaveFailure = false;

  const persist = (write: () => Promise<void>) => {
    const previous = saving;

    saving = (async () => {
      await previous;

      try {
        await write();
        hasSaveFailure = false;
      }
      catch (error) {
        hasSaveFailure = true;
        setFailure(error instanceof Error ? error.message : "Could not save settings");
      }
    })();
  };

  const open = async (next: View) => {
    await saving;

    if (hasSaveFailure) return;

    setFailure(undefined);

    if (next === "settings" || next === "signaling") {
      const remembered = await getSignalingSettings();

      setProtocol(remembered.p);
      setServers(remembered.s);
    }

    setView(next);
  };

  const saveProtocol = (p: RelayProtocol) => {
    const settings = { p, s: servers() };

    setProtocol(p);
    persist(async () => await signalingStore.setValue(settings));
  };

  const saveServer = (url: string) => {
    const settings = { p: protocol(), s: { ...servers(), [protocol()]: url.trim() } };

    setServers(settings.s);
    persist(async () => await signalingStore.setValue(settings));
  };

  const onRuntimeMessage = (message: unknown) => {
    if (!isEngineEvent(message)) return false;

    void refetch();

    return false;
  };

  browser.runtime.onMessage.addListener(onRuntimeMessage);
  onCleanup(() => browser.runtime.onMessage.removeListener(onRuntimeMessage));

  const connect = async (relay?: Relay) => {
    await saving;

    if (hasSaveFailure) return;

    const selected = relay ?? await getSavedRelay();

    if (!selected.s.trim()) {
      setFailure("Set a signaling server in Settings.");

      return;
    }

    setFailure(undefined);
    setView("connect");
    await pairing.start(selected);
    await refetch();
  };

  const back = async () => {
    await saving;

    if (hasSaveFailure) return;

    if (view() === "connect") {
      pairing.cancel();
      void refetch();
    }

    setFailure(undefined);
    setView(view() === "transport" || view() === "signaling" ? "settings" : "list");
  };

  const forget = async (targetId: string) => {
    await call({ kind: "ui:forget", connectionId: targetId });
    void refetch();
  };

  const unbind = async (origin: string) => {
    await call({ kind: "ui:unbind", origin });
    void refetch();
  };

  return (
    <div class="shell">
      <Header
        title={titles[view()]}
        onBack={view() === "list" ? undefined : () => void back()}
        onSettings={view() === "list" ? () => void open("settings") : undefined}
      />
      <main class="body">
        <div class="screen-stack">
          <Show when={view()} keyed>
            {screen => (
              <div
                class="screen-layer"
              >
                <Show when={screen === "list"}>
                  <Show when={!connections.loading} fallback={<div class="state" role="status" aria-label="Loading connections"><p>Loading connections...</p></div>}>
                    <Show
                      when={(connections() ?? []).length > 0}
                      fallback={(
                        <div class="empty-state">
                          <LucideSmartphone />
                          <p>No connections yet.</p>
                        </div>
                      )}
                    >
                      <div class="connection-list">
                        <For each={connections()}>
                          {entry => (
                            <div class="connection-row">
                              <span class="phone-state" classList={{ disconnected: entry.state !== "connected" }} role="img" aria-label={entry.state === "connected" ? "Phone connected" : "Phone not connected"}>
                                <LucideSmartphone />
                              </span>
                              <div class="connection-copy">
                                <strong>{entry.wallet?.name ?? "Unnamed wallet"}</strong>
                                <Show when={entry.binding}>{binding => <span>{binding().origin}</span>}</Show>
                              </div>
                              <details class="row-menu">
                                <summary aria-label={`Actions for ${entry.wallet?.name ?? "Unnamed wallet"}`}><LucideEllipsis /></summary>
                                <div class="menu-items">
                                  <Show when={entry.state === "disconnected"}>
                                    <button type="button" onClick={() => void connect(entry.relay)}>Connect</button>
                                  </Show>
                                  <Show when={entry.binding}>
                                    {binding => <button type="button" onClick={() => void unbind(binding().origin)}>Revoke</button>}
                                  </Show>
                                  <button type="button" onClick={() => void forget(entry.connectionId)}>Forget</button>
                                </div>
                              </details>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                    <button type="button" class="primary full" onClick={() => void connect()}>Connect</button>
                  </Show>
                </Show>

                <Show when={screen === "settings"}>
                  <nav class="settings-menu" aria-label="Settings">
                    <button type="button" onClick={() => void open("signaling")}>
                      <span>Signaling</span>
                      <span class="menu-value">{protocol().toUpperCase()}</span>
                      <LucideChevronRight />
                    </button>
                    <button type="button" onClick={() => void open("transport")}>
                      <span>Transport</span>
                      <span class="menu-value">WebRTC</span>
                      <LucideChevronRight />
                    </button>
                  </nav>
                </Show>

                <Show when={screen === "signaling"}>
                  <div class="signaling-settings">
                    <div class="settings-row">
                      <span id="protocol-label">Protocol</span>
                      <div class="protocol-options" role="group" aria-labelledby="protocol-label">
                        <For each={RELAY_PROTOCOLS}>
                          {option => <button type="button" aria-pressed={protocol() === option} onClick={() => saveProtocol(option)}>{option.toUpperCase()}</button>}
                        </For>
                      </div>
                    </div>
                    <div class="settings-row">
                      <label for="server">Server</label>
                      <input
                        id="server"
                        aria-label="Server URL"
                        value={server()}
                        placeholder="Server URL"
                        onInput={event => saveServer(event.currentTarget.value)}
                        spellcheck={false}
                        autocomplete="off"
                      />
                    </div>
                  </div>
                </Show>

                <Show when={screen === "transport"}>
                  <Suspense fallback={<p class="empty">Loading settings...</p>}>
                    <Show when={transport()} fallback={<p class="empty">Loading settings...</p>}>
                      {config => (
                        <TransportSettings
                          value={config()}
                          onChange={(value) => {
                            updateTransport(value);
                            persist(async () => await transportStore.setValue(value));
                          }}
                        />
                      )}
                    </Show>
                  </Suspense>
                </Show>

                <Show when={screen === "connect"}>
                  <Suspense fallback={<ConnectionLoading />}>
                    <PairingScreen
                      pairing={pairing}
                      onDone={async () => {
                        await refetch();
                        setView("list");
                      }}
                      onRetry={() => void open("signaling")}
                    />
                  </Suspense>
                </Show>
              </div>
            )}
          </Show>
        </div>
        <Show when={failure()}>{message => <p class="bad" role="alert">{message()}</p>}</Show>
        <Show when={connections.error}><p class="bad" role="alert">Could not load connections.</p></Show>
      </main>
    </div>
  );
};
