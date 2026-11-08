import LucideCheck from "lucide-solid/icons/check";
import { encodeQR } from "qr";
import { type JSX, Show } from "solid-js";

import { t } from "../i18n/catalogue.js";
import { ConnectionLoading } from "./ConnectionLoading.js";
import type { Pairing } from "./pairing.js";
import { WalletIcon } from "./WalletIcon.js";

export const PairingScreen = (properties: {
  pairing: Pairing;
  onDone: () => void;
  onRetry: () => void;
}): JSX.Element => {
  const state = () => properties.pairing.connection()?.state;
  const hasFailed = () => state() === "disconnected" || (!properties.pairing.isStarting() && !state() && !!properties.pairing.failure());

  return (
    <>
      <Show when={state() === "ready" && properties.pairing.url()}>
        {url => (
          <>
            <div class="qr-frame">
              <button type="button" title={t("handshake.clickToCopyUrl")} onClick={() => void properties.pairing.copy()} innerHTML={encodeQR(url(), "svg", { optimize: true, encoding: "byte", border: 2 })} />
            </div>
            <button type="button" class="secondary full" onClick={() => void properties.pairing.copy()}>{t(properties.pairing.copied() ? "pairing.copied" : "handshake.copyConnectionUrl")}</button>
            <p class="scan-copy">{t("handshake.scanCodeInstruction")}</p>
          </>
        )}
      </Show>
      <Show when={!hasFailed() && state() !== "connected" && !(state() === "ready" && properties.pairing.url())}>
        <ConnectionLoading detail={t(state() === "linking" ? "connectionFlow.mayTakeFewSeconds" : "connectionFlow.waitingForNetwork")} />
      </Show>
      <Show when={state() === "connected"}>
        <div class="state">
          <LucideCheck />
          <strong>{t("connectionFlow.connectedSuccessfully")}</strong>
          <p class="connected-wallet">
            <WalletIcon wallet={properties.pairing.connection()?.wallet} isConnected />
            {properties.pairing.connection()?.wallet?.name ?? t("pairing.yourWallet")}
          </p>
        </div>
        <button type="button" class="primary full" onClick={properties.onDone}>{t("actions.done")}</button>
      </Show>
      <Show when={hasFailed()}>
        <div class="connection-error">
          <div class="connection-error-copy">
            <div class="connection-error-icon" aria-hidden="true">⚠️</div>
            <h2>{t("connectionFlow.connectionFailed")}</h2>
            <p role="alert">{properties.pairing.failure() ?? t("connectionFlow.errorGeneric")}</p>
          </div>
          <button type="button" class="primary full" onClick={properties.onRetry}>{t("connectionFlow.tryAgain")}</button>
        </div>
      </Show>
    </>
  );
};
