import { blo } from "blo";
import { createEffect, createResource, createSignal, For, type JSX, lazy, on, onCleanup, Show, Suspense } from "solid-js";
import { browser } from "wxt/browser";

import { connectionStore } from "../../connections/registry.js";
import { getSavedRelay } from "../../connections/relay.js";
import { isWalletAddress } from "../../engine/notification.js";
import { isEngineEvent } from "../../engine/port.js";
import { t } from "../../i18n/catalogue.js";
import { call } from "../../ui/client.js";
import { ConnectionList } from "../../ui/ConnectionList.js";
import { ConnectionLoading } from "../../ui/ConnectionLoading.js";
import { ConnectionRow } from "../../ui/ConnectionRow.js";
import { Header } from "../../ui/Header.js";
import { createPairing } from "../../ui/pairing.js";
import type { ConnectionView, UiCommand } from "../../ui/port.js";
import { SiteIcon } from "../../ui/WalletIcon.js";

const PairingScreen = lazy(async () => {
  const { PairingScreen } = await import("../../ui/PairingScreen.js");

  return { default: PairingScreen };
});

const requestId = new URLSearchParams(globalThis.location.search).get("request");

const transferWarning = t("approval.transferWarning").split("{origin}");

const shorten = (account: string): string =>
  `${account.slice(0, 10)}...${account.slice(-6)}`;

const identicon = (account: string): string | undefined => {
  if (!isWalletAddress(account)) return undefined;

  return blo(account);
};

export const App = (): JSX.Element => {
  const [loaded, { refetch }] = createResource(async () => {
    if (!requestId) return undefined;

    const reply = await call({ kind: "approve:load", requestId });

    return reply.for === "approve:load" && reply.result.ok
      ? reply.result.value
      : undefined;
  });
  const [chosenId, setChosenId] = createSignal<string>();
  const chosen = () => loaded()?.connections.find(entry => entry.connectionId === chosenId() && entry.state === "connected");
  const [accounts, setAccounts] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [failure, setFailure] = createSignal<string | undefined>();
  const [isLoadingAccounts, setLoadingAccounts] = createSignal(false);
  const [isSubmitting, setSubmitting] = createSignal(false);
  const [isPairing, setPairing] = createSignal(false);
  const pairing = createPairing("approval");
  let completingId: string | undefined;
  let accountLoad = 0;

  onCleanup(connectionStore.watch(() => void refetch()));
  const onEngineEvent = (message: unknown): void => {
    if (!isEngineEvent(message)) return;

    void refetch();

    if (message.kind === "engine:notification" && message.event === "accountsChanged" && message.connectionId === chosenId()) {
      accountLoad += 1;
      setAccounts(message.data);
      setSelected(previous => message.data.filter(account => previous.some(selectedAccount => selectedAccount.toLowerCase() === account.toLowerCase())));
      setLoadingAccounts(false);
      setFailure(undefined);
    }
  };

  browser.runtime.onMessage.addListener(onEngineEvent);
  onCleanup(() => browser.runtime.onMessage.removeListener(onEngineEvent));

  if (requestId) {
    const timer = setInterval(() => {
      void call({ kind: "approve:load", requestId }).then((reply) => {
        if (reply.for === "approve:load" && !reply.result.ok) setFailure(reply.result.error);
      })
        .catch(() => setFailure(t("approval.couldNotRefresh")));
    }, 20_000);

    onCleanup(() => clearInterval(timer));
  }

  const choose = async (entry: ConnectionView) => {
    const load = ++accountLoad;

    setChosenId(entry.connectionId);
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

      if (load !== accountLoad || chosen()?.connectionId !== entry.connectionId || reply.for !== "approve:accounts") return;

      if (!reply.result.ok) {
        setFailure(reply.result.error);

        return;
      }

      setAccounts(reply.result.value);
      setSelected(reply.result.value);
    }
    catch (error) {
      if (load === accountLoad && chosen()?.connectionId === entry.connectionId) {
        setFailure(error instanceof Error ? error.message : t("approval.couldNotLoadAccounts"));
      }
    }
    finally {
      if (load === accountLoad && chosen()?.connectionId === entry.connectionId) setLoadingAccounts(false);
    }
  };

  const updateConnection = async (command: Extract<UiCommand, { kind: "ui:forget" | "ui:unbind"; }>): Promise<void> => {
    if (isSubmitting()) return;

    setSubmitting(true);
    setFailure(undefined);

    try {
      const reply = await call(command);

      if (!reply.result.ok) {
        setFailure(reply.result.error);

        return;
      }

      await refetch();
    }
    catch (error) {
      setFailure(error instanceof Error ? error.message : t("approval.couldNotUpdateConnection"));
    }
    finally {
      setSubmitting(false);
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

      if (!updated) throw new Error(t("approval.couldNotLoadNewConnection"));

      if (!await pairing.end()) return;

      setPairing(false);
      await choose(updated);
    }
    catch (error) {
      setFailure(error instanceof Error ? error.message : t("approval.couldNotLoadNewConnection"));
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
      const started = pairing.start(await getSavedRelay());

      setPairing(true);
      await started;
    }
    catch (error) {
      setFailure(error instanceof Error ? error.message : t("errors.couldNotStartConnection"));
    }
  };

  const backFromPair = async (): Promise<void> => {
    try {
      if (!await pairing.end()) return;

      await refetch();
      setPairing(false);
    }
    catch (error) {
      setFailure(error instanceof Error ? error.message : t("approval.couldNotStopConnection"));
      setPairing(false);
    }
  };

  const toggle = (account: string) => {
    setSelected(current => (current.includes(account)
      ? current.filter(entry => entry !== account)
      : [...current, account]));
  };

  const decide = async (isApproved: boolean) => {
    if (!requestId || isSubmitting()) return;

    const connection = chosen();

    if (isApproved && (!connection || selected().length === 0 || isLoadingAccounts())) return;

    setSubmitting(true);
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
      setFailure(error instanceof Error ? error.message : t("approval.couldNotSubmit"));
    }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <div class="shell approval-shell">
      <Header title={t("pairing.title")} onBack={isPairing() ? () => void backFromPair() : undefined} />
      <main class="body approval-body">
        <Show when={isPairing()}>
          <Suspense fallback={<ConnectionLoading />}>
            <PairingScreen pairing={pairing} onDone={() => void finishPair()} onRetry={() => void startPair()} />
          </Suspense>
          <Show when={failure()}>{message => <p class="bad" role="alert">{message()}</p>}</Show>
        </Show>
        <Show when={!isPairing()}>
          <Show when={loaded.state !== "pending"} fallback={<p class="empty">{t("approval.loadingRequest")}</p>}>
            <Show when={loaded()} fallback={<p class="empty">{t("approval.noLongerWaiting")}</p>}>
              {request => (
                <>
                  <p class="origin">
                    <SiteIcon icon={request().icon} />
                    <span>{request().origin}</span>
                  </p>
                  <fieldset class="connection-picker">
                    <legend class="picker-heading">
                      <span>{t("settings.connection.title")}</span>
                      <button type="button" class="pair-link" disabled={isSubmitting()} onClick={() => void startPair()}>{t("actions.pair")}</button>
                    </legend>
                    <Show when={request().connections.length > 0} fallback={<p class="empty">{t("approval.connectWalletFirst")}</p>}>
                      <ConnectionList connections={request().connections}>
                        {entry => (
                          <ConnectionRow
                            connection={entry()}
                            selection={{ checked: chosen()?.connectionId === entry().connectionId, onSelect: () => void choose(entry()) }}
                            disabled={isSubmitting()}
                            onForget={() => void updateConnection({ kind: "ui:forget", connectionId: entry().connectionId })}
                            onRevoke={origin => void updateConnection({ kind: "ui:unbind", origin })}
                          />
                        )}
                      </ConnectionList>
                    </Show>
                  </fieldset>
                  <Show when={chosen()?.binding}>
                    {binding => (
                      <Show when={binding().origin !== request().origin}>
                        <p class="transfer-warning">
                          {transferWarning[0]}
                          <strong>{binding().origin}</strong>
                          {transferWarning[1]}
                        </p>
                      </Show>
                    )}
                  </Show>
                  <Show when={chosen() && isLoadingAccounts()}><p class="muted" role="status">{t("approval.loadingAccounts")}</p></Show>
                  <Show when={chosen() && accounts().length > 0}>
                    <fieldset class="accounts">
                      <legend>{t("approval.accountsSiteMaySee")}</legend>
                      <For each={accounts()}>
                        {account => (
                          <label class="account-card">
                            <Show when={identicon(account)}>{source => <img class="account-identicon" src={source()} alt="" aria-hidden="true" />}</Show>
                            <span class="account-address" title={account}>{shorten(account)}</span>
                            <input type="checkbox" checked={selected().includes(account)} disabled={isSubmitting()} onChange={() => toggle(account)} />
                          </label>
                        )}
                      </For>
                    </fieldset>
                  </Show>
                  <Show when={failure()}>{message => <p class="bad" role="alert">{message()}</p>}</Show>
                  <div class="approval-actions">
                    <button type="button" class="secondary" disabled={isSubmitting()} onClick={() => void decide(false)}>{t("actions.reject")}</button>
                    <button type="button" class="primary" disabled={!chosen() || selected().length === 0 || isLoadingAccounts() || isSubmitting()} onClick={() => void decide(true)}>{t("actions.connect")}</button>
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
