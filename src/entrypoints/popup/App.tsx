import LucideChevronRight from "lucide-solid/icons/chevron-right";
import LucideWallet from "lucide-solid/icons/wallet";
import {
  createEffect,
  createResource,
  createSignal,
  For,
  type JSX,
  lazy,
  on,
  onCleanup,
  Show,
  Suspense,
} from "solid-js";
import { browser } from "wxt/browser";

import { type Binding, type Connection, connectionStore } from "../../connections/registry.js";
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
import { t } from "../../i18n/catalogue.js";
import { call } from "../../ui/client.js";
import { ConnectionList } from "../../ui/ConnectionList.js";
import { ConnectionLoading } from "../../ui/ConnectionLoading.js";
import { ConnectionRow } from "../../ui/ConnectionRow.js";
import { Header } from "../../ui/Header.js";
import { createPairing } from "../../ui/pairing.js";
import { PermissionsEditor } from "../../ui/PermissionsEditor.js";

const PairingScreen = lazy(async () => {
  const { PairingScreen } = await import("../../ui/PairingScreen.js");

  return { default: PairingScreen };
});
const TransportSettings = lazy(async () => {
  const { TransportSettings } = await import("../../ui/TransportSettings.js");

  return { default: TransportSettings };
});

type Screen = "list" | "settings" | "signaling" | "transport" | "connect";
type View = { kind: Screen; } | { kind: "permissions"; connection: Connection & { binding: Binding; }; };

const titles: Record<Screen | "permissions", string> = {
  list: t("popup.title"),
  settings: t("settings.title"),
  signaling: t("settings.signaling.title"),
  transport: t("settings.transport.title"),
  connect: t("pairing.title"),
  permissions: t("actions.editPermissions"),
};

export const App = (): JSX.Element => {
  const [view, setView] = createSignal<View>({ kind: "list" });
  const pairing = createPairing("popup");
  const [connections, { refetch }] = createResource(async () => {
    const reply = await call({ kind: "ui:list" });

    if (reply.for !== "ui:list" || !reply.result.ok) {
      throw new Error("Could not load connections");
    }

    return reply.result.value;
  });
  const [transport, { mutate: updateTransport }] = createResource(() => view().kind === "transport", async () => await transportStore.getValue());

  onCleanup(connectionStore.watch(() => void refetch()));
  const [protocol, setProtocol] = createSignal<RelayProtocol>("mqtt");
  const [servers, setServers] = createSignal<SignalingSettings["s"]>({});
  const server = () => servers()[protocol()] ?? DEFAULT_RELAY_URLS[protocol()];
  const [failure, setFailure] = createSignal<string | undefined>();
  let saving = Promise.resolve();
  let hasSaveFailure = false;

  createEffect(on(() => pairing.connection()?.connectionId, (connectionId, previous) => {
    if (connectionId && view().kind === "list") setView({ kind: "connect" });

    if (!connectionId && previous && view().kind === "connect") {
      setView({ kind: "list" });
      void refetch();
    }
  }));

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
        setFailure(error instanceof Error ? error.message : t("popup.couldNotSaveSettings"));
      }
    })();
  };

  const open = async (next: Screen) => {
    await saving;

    if (hasSaveFailure) return;

    setFailure(undefined);

    if (next === "settings" || next === "signaling") {
      const remembered = await getSignalingSettings();

      setProtocol(remembered.p);
      setServers(remembered.s);
    }

    setView({ kind: next });
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

  const connect = async (relay?: Relay, connectionId?: string) => {
    await saving;

    if (hasSaveFailure) return;

    const selected = relay ?? await getSavedRelay();

    if (!selected.s.trim()) {
      setFailure(t("popup.setSignalingServer"));

      return;
    }

    setFailure(undefined);
    setView({ kind: "connect" });
    await pairing.start(selected, connectionId);
    await refetch();
  };

  const back = async () => {
    await saving;

    if (hasSaveFailure) return;

    if (view().kind === "connect") {
      if (!await pairing.end()) return;

      await refetch();
    }

    setFailure(undefined);
    setView({ kind: view().kind === "transport" || view().kind === "signaling" ? "settings" : "list" });
  };

  const forget = async (targetId: string) => {
    await call({ kind: "ui:forget", connectionId: targetId });
    void refetch();
  };

  const unbind = async (origin: string) => {
    await call({ kind: "ui:unbind", origin });
    void refetch();
  };

  const editPermissions = (connectionId: string) => {
    const connection = connections()?.find(entry => entry.connectionId === connectionId);

    if (connection?.binding) setView({ kind: "permissions", connection: { ...connection, binding: connection.binding } });
  };

  return (
    <div class="shell">
      <Header
        title={titles[view().kind]}
        onBack={view().kind === "list" ? undefined : () => void back()}
        onSettings={view().kind === "list" ? () => void open("settings") : undefined}
      />
      <main class="body">
        <div class="screen-stack">
          <Show when={view()} keyed>
            {screen => (
              <div
                class="screen-layer"
              >
                <Show when={screen.kind === "list"}>
                  <Show when={connections.state !== "pending"} fallback={<div class="state" role="status"><p>{t("popup.loadingConnections")}</p></div>}>
                    <Show
                      when={(connections() ?? []).length > 0}
                      fallback={(
                        <div class="empty-state">
                          <LucideWallet />
                          <p>{t("popup.noConnections")}</p>
                        </div>
                      )}
                    >
                      <div class="connection-list">
                        <ConnectionList connections={connections() ?? []}>
                          {entry => (
                            <ConnectionRow
                              connection={entry()}
                              onReconnect={() => void connect(entry().relay, entry().connectionId)}
                              onForget={() => void forget(entry().connectionId)}
                              onRevoke={origin => void unbind(origin)}
                              onEditPermissions={connectionId => void editPermissions(connectionId)}
                            />
                          )}
                        </ConnectionList>
                      </div>
                    </Show>
                    <button type="button" class="primary full" onClick={() => void connect()}>{t("actions.connect")}</button>
                  </Show>
                </Show>

                <Show when={screen.kind === "settings"}>
                  <nav class="settings-menu" aria-label={t("settings.title")}>
                    <button type="button" onClick={() => void open("signaling")}>
                      <span>{t("settings.signaling.title")}</span>
                      <span class="menu-value">{protocol().toUpperCase()}</span>
                      <LucideChevronRight class="directional" />
                    </button>
                    <button type="button" onClick={() => void open("transport")}>
                      <span>{t("settings.transport.title")}</span>
                      <span class="menu-value">{t("settings.transport.webrtc")}</span>
                      <LucideChevronRight class="directional" />
                    </button>
                  </nav>
                </Show>

                <Show when={screen.kind === "signaling"}>
                  <div class="signaling-settings">
                    <div class="settings-row">
                      <span id="protocol-label">{t("common.protocol")}</span>
                      <div class="protocol-options" role="group" aria-labelledby="protocol-label">
                        <For each={RELAY_PROTOCOLS}>
                          {option => <button type="button" aria-pressed={protocol() === option} onClick={() => saveProtocol(option)}>{option.toUpperCase()}</button>}
                        </For>
                      </div>
                    </div>
                    <div class="settings-row">
                      <label for="server">{t("settings.signaling.server")}</label>
                      <input
                        id="server"
                        aria-label={t("settings.signaling.serverUrl")}
                        dir="ltr"
                        value={server()}
                        placeholder={t("settings.signaling.serverUrl")}
                        onInput={event => saveServer(event.currentTarget.value)}
                        spellcheck={false}
                        autocomplete="off"
                      />
                    </div>
                  </div>
                </Show>

                <Show when={screen.kind === "transport"}>
                  <Suspense fallback={<p class="empty">{t("popup.loadingSettings")}</p>}>
                    <Show when={transport()} fallback={<p class="empty">{t("popup.loadingSettings")}</p>}>
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

                <Show when={screen.kind === "connect"}>
                  <Suspense fallback={<ConnectionLoading />}>
                    <PairingScreen
                      pairing={pairing}
                      onDone={async () => {
                        if (!await pairing.end()) return;

                        await refetch();
                        setView({ kind: "list" });
                      }}
                      onRetry={async () => {
                        if (!await pairing.end()) return;

                        await open("signaling");
                      }}
                    />
                  </Suspense>
                </Show>

                <Show when={screen.kind === "permissions" && screen}>
                  {permissions => (
                    <PermissionsEditor
                      connection={permissions().connection}
                      onSaved={async () => {
                        await refetch();
                        setView(current => (current === permissions() ? { kind: "list" } : current));
                      }}
                    />
                  )}
                </Show>
              </div>
            )}
          </Show>
        </div>
        <Show when={failure()}>{message => <p class="bad" role="alert">{message()}</p>}</Show>
        <Show when={connections.error}><p class="bad" role="alert">{t("popup.couldNotLoadConnections")}</p></Show>
      </main>
    </div>
  );
};
