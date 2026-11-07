import LucideSmartphone from "lucide-solid/icons/smartphone";
import { createEffect, createResource, createSignal, For, type JSX, lazy, on, onCleanup, Show, Suspense } from "solid-js";

import { getSavedRelay } from "../../connections/relay.js";
import { call } from "../../ui/client.js";
import { ConnectionLoading } from "../../ui/ConnectionLoading.js";
import { Header } from "../../ui/Header.js";
import { createPairing } from "../../ui/pairing.js";
import type { ConnectionView } from "../../ui/port.js";

const PairingScreen = lazy(async () => {
  const { PairingScreen } = await import("../../ui/PairingScreen.js");

  return { default: PairingScreen };
});

const requestId = new URLSearchParams(globalThis.location.search).get("request");

const shorten = (account: string): string =>
  `${account.slice(0, 10)}...${account.slice(-6)}`;

export const App = (): JSX.Element => {
  const [loaded, { refetch }] = createResource(async () => {
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
  const [isLoadingAccounts, setLoadingAccounts] = createSignal(false);
  const [isDeciding, setDeciding] = createSignal(false);
  const [isPairing, setPairing] = createSignal(false);
  const pairing = createPairing("approval");
  let completingId: string | undefined;

  if (requestId) {
    const timer = setInterval(() => {
      void call({ kind: "approve:load", requestId }).then((reply) => {
        if (reply.for === "approve:load" && !reply.result.ok) setFailure(reply.result.error);
      })
        .catch(() => setFailure("Could not refresh the request"));
    }, 20_000);

    onCleanup(() => clearInterval(timer));
  }

  const choose = async (entry: ConnectionView) => {
    setChosen(entry);
    setFailure(undefined);
    setAccounts([]);
    setSelected([]);

    if (!requestId) return;

    setLoadingAccounts(true);

    try {
      const reply = await call({
        kind: "approve:accounts",
        requestId,
        connectionId: entry.connectionId,
      });

      if (chosen()?.connectionId !== entry.connectionId || reply.for !== "approve:accounts") return;

      if (!reply.result.ok) {
        setFailure(reply.result.error);

        return;
      }

      setAccounts(reply.result.value);
      setSelected(reply.result.value);
    }
    catch (error) {
      if (chosen()?.connectionId === entry.connectionId) {
        setFailure(error instanceof Error ? error.message : "Could not load accounts");
      }
    }
    finally {
      if (chosen()?.connectionId === entry.connectionId) setLoadingAccounts(false);
    }
  };

  const finishPair = async (): Promise<void> => {
    const connection = pairing.connection();

    if (!connection || !isPairing() || completingId === connection.connectionId) return;

    const targetId = connection.connectionId;

    completingId = targetId;

    try {
      const request = await refetch();

      if (!isPairing() || pairing.connection()?.connectionId !== targetId) return;

      const updated = request?.connections.find(entry => entry.connectionId === targetId);

      if (!updated) throw new Error("Could not load the new connection");

      setPairing(false);
      pairing.end();
      await choose(updated);
    }
    catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not load the new connection");
      setPairing(false);
    }
    finally {
      if (completingId === targetId) completingId = undefined;
    }
  };

  createEffect(on(() => pairing.connection()?.connectionId, (connectionId, previous) => {
    if (connectionId) setPairing(true);

    if (!connectionId && previous) {
      setPairing(false);
      void refetch();
    }
  }));

  createEffect(on(() => pairing.connection()?.state, (state) => {
    if (state === "connected") void finishPair();
  }));

  const startPair = async (): Promise<void> => {
    setFailure(undefined);

    try {
      const relay = await getSavedRelay();
      const started = pairing.start(relay);

      setPairing(true);
      await started;
    }
    catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not start the connection");
    }
  };

  const backFromPair = async (): Promise<void> => {
    try {
      pairing.end();
      await refetch();
      setPairing(false);
    }
    catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not stop the connection");
      setPairing(false);
    }
  };

  const toggle = (account: string) => {
    setSelected(current => (current.includes(account)
      ? current.filter(entry => entry !== account)
      : [...current, account]));
  };

  const decide = async (isApproved: boolean) => {
    if (!requestId || isDeciding()) return;

    const connection = chosen();

    if (isApproved && (!connection || selected().length === 0 || isLoadingAccounts())) return;

    setDeciding(true);
    setFailure(undefined);

    try {
      const reply = await call({
        kind: "approve:decide",
        requestId,
        decision: isApproved && connection
          ? { kind: "approved", connectionId: connection.connectionId, accounts: selected() }
          : { kind: "rejected" },
      });

      if (!reply.result.ok) {
        setFailure(reply.result.error);

        return;
      }

      globalThis.close();
    }
    catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not submit the request");
    }
    finally {
      setDeciding(false);
    }
  };

  return (
    <div class="shell approval-shell">
      <Header title="Connect" onBack={isPairing() ? () => void backFromPair() : undefined} />
      <main class="body approval-body">
        <Show when={isPairing()}>
          <Suspense fallback={<ConnectionLoading />}>
            <PairingScreen pairing={pairing} onDone={() => void finishPair()} onRetry={() => void startPair()} />
          </Suspense>
          <Show when={failure()}>{message => <p class="bad" role="alert">{message()}</p>}</Show>
        </Show>
        <Show when={!isPairing()}>
          <Show when={!loaded.loading} fallback={<p class="empty">Loading request...</p>}>
            <Show when={loaded()} fallback={<p class="empty">This request is no longer waiting.</p>}>
              {request => (
                <>
                  <p class="origin">{request().origin}</p>
                  <fieldset class="connection-picker">
                    <legend>Connection</legend>
                    <Show when={request().connections.length > 0} fallback={<p class="empty">Connect a wallet first.</p>}>
                      <For each={request().connections}>
                        {entry => (
                          <label class="connection-choice">
                            <input
                              type="radio"
                              name="connection"
                              value={entry.connectionId}
                              checked={chosen()?.connectionId === entry.connectionId}
                              disabled={entry.state !== "connected" || isDeciding()}
                              onChange={() => void choose(entry)}
                            />
                            <span class="phone-state" classList={{ disconnected: entry.state !== "connected" }}><LucideSmartphone /></span>
                            <span class="connection-copy">
                              <strong>{entry.wallet?.name ?? "Unnamed wallet"}</strong>
                              <Show when={entry.binding}>{binding => <span>{binding().origin}</span>}</Show>
                            </span>
                          </label>
                        )}
                      </For>
                    </Show>
                  </fieldset>
                  <button type="button" class="secondary pair-button" disabled={isDeciding()} onClick={() => void startPair()}>Pair</button>
                  <Show when={chosen()?.binding}>
                    {binding => (
                      <Show when={binding().origin !== request().origin}>
                        <p class="transfer-warning">
                          Connecting here takes it away from
                          {" "}
                          <strong>{binding().origin}</strong>
                          .
                        </p>
                      </Show>
                    )}
                  </Show>
                  <Show when={isLoadingAccounts()}><p class="muted" role="status">Loading accounts...</p></Show>
                  <Show when={accounts().length > 0}>
                    <fieldset class="accounts">
                      <legend>Accounts this site may see</legend>
                      <For each={accounts()}>
                        {account => (
                          <label>
                            <input type="checkbox" checked={selected().includes(account)} disabled={isDeciding()} onChange={() => toggle(account)} />
                            <span title={account}>{shorten(account)}</span>
                          </label>
                        )}
                      </For>
                    </fieldset>
                  </Show>
                  <Show when={failure()}>{message => <p class="bad" role="alert">{message()}</p>}</Show>
                  <div class="approval-actions">
                    <button type="button" class="secondary" disabled={isDeciding()} onClick={() => void decide(false)}>Reject</button>
                    <button type="button" class="primary" disabled={!chosen() || selected().length === 0 || isLoadingAccounts() || isDeciding()} onClick={() => void decide(true)}>Connect</button>
                  </div>
                </>
              )}
            </Show>
          </Show>
        </Show>
      </main>
    </div>
  );
};
