import { createResource, createSignal, For, type JSX, Show } from "solid-js";

import { call } from "../../ui/client.js";
import type { ConnectionView } from "../../ui/port.js";

const requestId = new URLSearchParams(globalThis.location.search).get("request");

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

const shorten = (account: string): string =>
  `${account.slice(0, 8)}...${account.slice(-6)}`;

export const App = (): JSX.Element => {
  const [loaded] = createResource(async () => {
    if (!requestId) return undefined;

    const reply = await call({ kind: "approve:load", requestId });

    return reply.for === "approve:load" && reply.result.ok
      ? reply.result.value
      : undefined;
  });
  const [chosen, setChosen] = createSignal<ConnectionView | undefined>();
  const [accounts, setAccounts] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [failure, setFailure] = createSignal<string | undefined>();

  const choose = async (entry: ConnectionView) => {
    setChosen(entry);
    setFailure(undefined);
    setAccounts([]);
    setSelected([]);

    if (!requestId) return;

    const reply = await call({
      kind: "approve:accounts",
      requestId,
      connectionId: entry.connectionId,
    });

    if (reply.for !== "approve:accounts") return;

    if (!reply.result.ok) {
      setFailure(reply.result.error);

      return;
    }

    setAccounts(reply.result.value);
    setSelected(reply.result.value);
  };

  const toggle = (account: string) => {
    setSelected((current) => {
      if (!current.includes(account)) return [...current, account];

      return current.filter(entry => entry !== account);
    });
  };

  const decide = async (isApproved: boolean) => {
    if (!requestId) return;

    const connection = chosen();

    await call({
      kind: "approve:decide",
      requestId,
      decision: isApproved && connection
        ? {
            kind: "approved",
            connectionId: connection.connectionId,
            accounts: selected(),
          }
        : { kind: "rejected" },
    });

    globalThis.close();
  };

  return (
    <div class="shell">
      <header class="header">
        <Mark />
        <h1>Connect</h1>
      </header>

      <div class="body">
        <Show
          when={loaded()}
          fallback={<p class="empty">This request is no longer waiting.</p>}
        >
          {request => (
            <>
              <div class="card tight">
                <span class="origin">{request().origin}</span>
                <span class="muted">wants to use one of your connections</span>
              </div>

              <span class="section-label">connection</span>
              <Show
                when={request().connections.length > 0}
                fallback={<p class="empty">Pair a connection first.</p>}
              >
                <For each={request().connections}>
                  {entry => (
                    <button
                      class={
                        chosen()?.connectionId === entry.connectionId
                          ? "pick chosen"
                          : "pick"
                      }
                      onClick={() => void choose(entry)}
                    >
                      <span class="card-head">
                        <strong>
                          {entry.wallet?.name ?? "Unnamed wallet"}
                        </strong>
                        <span
                          class={
                            entry.state === "connected"
                              ? "dot connected"
                              : "dot disconnected"
                          }
                        />
                        <span class="muted">{entry.state}</span>
                      </span>
                      <Show
                        when={entry.binding}
                        fallback={<span class="muted">free</span>}
                      >
                        {binding => (
                          <span class="warn">
                            in use by
                            {" "}
                            {binding().origin}
                            , connecting here takes it away
                          </span>
                        )}
                      </Show>
                    </button>
                  )}
                </For>
              </Show>

              <Show when={accounts().length > 0}>
                <span class="section-label">accounts this site may see</span>
                <div class="accounts card tight">
                  <For each={accounts()}>
                    {account => (
                      <label>
                        <input
                          type="checkbox"
                          checked={selected().includes(account)}
                          onChange={() => toggle(account)}
                        />
                        {shorten(account)}
                      </label>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={failure()}>
                {message => <p class="bad">{message()}</p>}
              </Show>

              <div class="row">
                <button class="secondary" onClick={() => void decide(false)}>
                  Reject
                </button>
                <button
                  class="primary"
                  disabled={!chosen() || selected().length === 0}
                  onClick={() => void decide(true)}
                >
                  Connect
                </button>
              </div>
            </>
          )}
        </Show>
      </div>
    </div>
  );
};
