import { encodeQR } from "qr";
import {
  createResource,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { browser } from "wxt/browser";

import {
  isRelayProtocol,
  lastRelayStore,
  type Relay,
  RELAY_PROTOCOLS,
  relayLabel,
} from "../../connections/relay.js";
import { type ConnectionState, isEngineEvent } from "../../engine/port.js";
import { call } from "../../ui/client.js";
import type { ConnectionView } from "../../ui/port.js";

type View
  = | { kind: "list"; }
    | { kind: "form"; }
    | { kind: "pair"; connectionId: string; };

const RELAY_HINT: Record<string, string> = {
  mqtt: "wss://broker.example.org:8081/mqtt",
  ntfy: "https://ntfy.example.org",
  gun: "https://gun.example.org/gun",
};

const Mark = (): JSX.Element => (
  <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="11" cy="16" r="6" fill="var(--lv-primary-background)" />
    <circle
      cx="21"
      cy="16"
      r="6"
      fill="none"
      stroke="var(--lv-primary-background)"
      stroke-width="2.5"
    />
  </svg>
);

const Spinner = (): JSX.Element => <div class="spinner" />;

const stateLabel = (state: ConnectionState): string => {
  switch (state) {
    case "connected": {
      return "connected";
    }

    case "linking": {
      return "linking";
    }

    case "ready": {
      return "waiting for a scan";
    }

    case "disconnected": {
      return "offline";
    }

    default: {
      return "connecting";
    }
  }
};

const dotClass = (state: ConnectionState): string => {
  if (state === "connected") return "dot connected";

  if (state === "disconnected") return "dot disconnected";

  return "dot";
};

// The wire only bounds the icon size, so vetting what reaches an img src is
// this renderer job.
const renderableIcon = (icon?: string): string | undefined => {
  if (!icon) return undefined;

  const isRenderable
    = icon.startsWith("data:image/") || icon.startsWith("https://");

  return isRenderable ? icon : undefined;
};

export const App = (): JSX.Element => {
  const [view, setView] = createSignal<View>({ kind: "list" });
  const [connections, { refetch }] = createResource(async () => {
    const reply = await call({ kind: "ui:list" });

    return reply.for === "ui:list" && reply.result.ok ? reply.result.value : [];
  });
  const [lastRelay] = createResource(async () => await lastRelayStore.getValue());
  const [protocol, setProtocol] = createSignal<string>("");
  const [server, setServer] = createSignal("");
  const [url, setUrl] = createSignal<string | undefined>();
  const [failure, setFailure] = createSignal<string | undefined>();
  const [copied, setCopied] = createSignal(false);

  const onRuntimeMessage = (message: unknown) => {
    if (!isEngineEvent(message)) return false;

    const current = view();

    if (message.kind === "engine:state" && current.kind === "pair"
      && message.connectionId === current.connectionId) {
      setFailure(message.error);
    }

    void refetch();

    return false;
  };

  browser.runtime.onMessage.addListener(onRuntimeMessage);
  onCleanup(() => browser.runtime.onMessage.removeListener(onRuntimeMessage));

  const paired = (): ConnectionView | undefined => {
    const current = view();

    if (current.kind !== "pair") return undefined;

    return (connections() ?? []).find(
      entry => entry.connectionId === current.connectionId,
    );
  };

  // The session runs to READY before ui:pair even answers, so every state
  // event lands before the pairing view exists. The list is the one place
  // that always holds the current state.
  const state = (): ConnectionState => paired()?.state ?? "created";
  const isPairing = (): boolean =>
    view().kind === "pair" && state() !== "connected";

  const startForm = (prefill?: Relay) => {
    const remembered = prefill ?? lastRelay();

    setProtocol(remembered?.p ?? RELAY_PROTOCOLS[0]);
    setServer(remembered?.s ?? "");
    setFailure(undefined);
    setView({ kind: "form" });
  };

  const pair = async () => {
    const p = protocol();
    const s = server().trim();

    if (s === "" || !isRelayProtocol(p)) {
      setFailure("Choose a protocol and enter a relay address.");

      return;
    }

    setFailure(undefined);

    const relay: Relay = { p, s };
    const reply = await call({ kind: "ui:pair", relay });

    if (reply.for !== "ui:pair") return;

    if (!reply.result.ok) {
      setFailure(reply.result.error);

      return;
    }

    setUrl(reply.result.value.url);
    setCopied(false);
    setView({ kind: "pair", connectionId: reply.result.value.connectionId });
    void refetch();
  };

  const copy = async () => {
    const value = url();

    if (!value) return;

    await navigator.clipboard.writeText(value);
    setCopied(true);
  };

  const cancel = async () => {
    const current = view();

    if (current.kind === "pair") {
      await call({ kind: "ui:forget", connectionId: current.connectionId });
    }

    setUrl(undefined);
    setFailure(undefined);
    setView({ kind: "list" });
    void refetch();
  };

  const forget = async (connectionId: string) => {
    await call({ kind: "ui:forget", connectionId });
    void refetch();
  };

  const unbind = async (origin: string) => {
    await call({ kind: "ui:unbind", origin });
    void refetch();
  };

  return (
    <div class="shell">
      <header class="header">
        <Mark />
        <h1>OpenLV Connector</h1>
        <Show when={view().kind === "form" || isPairing()}>
          <button class="tertiary" onClick={() => void cancel()}>
            cancel
          </button>
        </Show>
      </header>

      <div class="body">
        <Show when={view().kind === "list"}>
          <Show
            when={(connections() ?? []).length > 0}
            fallback={(
              <p class="empty">
                No connections yet. Pair one and it appears here.
              </p>
            )}
          >
            <For each={connections()}>
              {entry => (
                <div class="card tight">
                  <div class="card-head">
                    <Show when={renderableIcon(entry.wallet?.icon)}>
                      {icon => <img class="avatar" src={icon()} alt="" />}
                    </Show>
                    <strong>{entry.wallet?.name ?? "Unnamed wallet"}</strong>
                    <span class={dotClass(entry.state)} />
                    <span class="muted">{stateLabel(entry.state)}</span>
                  </div>
                  <span class="muted">{relayLabel(entry.relay)}</span>
                  <Show
                    when={entry.binding}
                    fallback={<span class="muted">not in use</span>}
                  >
                    {binding => (
                      <span class="secondary">
                        in use by
                        {" "}
                        {binding().origin}
                      </span>
                    )}
                  </Show>
                  <div class="card-actions">
                    <Show when={entry.state === "disconnected"}>
                      <button
                        class="tertiary"
                        onClick={() => startForm(entry.relay)}
                      >
                        pair again
                      </button>
                    </Show>
                    <Show when={entry.binding}>
                      {binding => (
                        <button
                          class="tertiary"
                          onClick={() => void unbind(binding().origin)}
                        >
                          revoke
                        </button>
                      )}
                    </Show>
                    <button
                      class="tertiary"
                      onClick={() => void forget(entry.connectionId)}
                    >
                      forget
                    </button>
                  </div>
                </div>
              )}
            </For>
          </Show>

          <button class="primary full" onClick={() => startForm()}>
            Pair a connection
          </button>
        </Show>

        <Show when={view().kind === "form"}>
          <div class="card">
            <span class="section-label">relay for this connection</span>
            <p class="muted">
              The relay carries the handshake and nothing after it. Each
              connection uses its own, so this is asked every time.
            </p>
            <label>
              protocol
              <select
                value={protocol()}
                onChange={event => setProtocol(event.currentTarget.value)}
              >
                <For each={RELAY_PROTOCOLS}>
                  {option => <option value={option}>{option}</option>}
                </For>
              </select>
            </label>
            <label>
              server
              <input
                type="text"
                value={server()}
                placeholder={RELAY_HINT[protocol()] ?? ""}
                onInput={event => setServer(event.currentTarget.value)}
              />
            </label>
          </div>
          <Show when={failure()}>
            {message => <p class="bad">{message()}</p>}
          </Show>
          <button class="primary full" onClick={() => void pair()}>
            Start pairing
          </button>
        </Show>

        <Show when={view().kind === "pair"}>
          <Show when={state() === "created" || state() === "signaling"}>
            <div class="state">
              <Spinner />
              <div>
                <h2>Connecting</h2>
                <p>Reaching the relay you chose.</p>
              </div>
            </div>
          </Show>

          <Show when={state() === "ready"}>
            <div class="card">
              <Show when={url()}>
                {value => (
                  <div class="qr-frame">
                    <button
                      title="Click to copy the connection url"
                      onClick={() => void copy()}
                      innerHTML={encodeQR(value(), "svg", {
                        optimize: true,
                        encoding: "byte",
                        border: 2,
                      })}
                    />
                  </div>
                )}
              </Show>
              <button class="secondary full" onClick={() => void copy()}>
                {copied() ? "Copied" : "Copy connection url"}
              </button>
            </div>
            <p class="secondary">Scan this code with your wallet.</p>
          </Show>

          <Show when={state() === "linking"}>
            <div class="state">
              <Spinner />
              <div>
                <h2>Establishing connection</h2>
                <p>This can take a few seconds.</p>
              </div>
            </div>
          </Show>

          <Show when={state() === "connected"}>
            <div class="state">
              <Show
                when={renderableIcon(paired()?.wallet?.icon)}
                fallback={<div class="tick">✓</div>}
              >
                {icon => <img class="avatar" src={icon()} alt="" />}
              </Show>
              <div>
                <h2>Connected</h2>
                <p>
                  {paired()?.wallet?.name ?? "Your wallet"}
                  {" "}
                  is paired and free to use.
                </p>
              </div>
              <button
                class="primary"
                onClick={() => {
                  setView({ kind: "list" });
                  void refetch();
                }}
              >
                Done
              </button>
            </div>
          </Show>

          <Show when={state() === "disconnected"}>
            <div class="state">
              <div>
                <h2>Pairing failed</h2>
                <p>{failure() ?? "The connection dropped before it linked."}</p>
              </div>
              <button class="secondary" onClick={() => startForm()}>
                Try again
              </button>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};
