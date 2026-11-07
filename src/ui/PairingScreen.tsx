import LucideCheck from "lucide-solid/icons/check";
import { encodeQR } from "qr";
import { type JSX, Show } from "solid-js";

import { ConnectionLoading } from "./ConnectionLoading.js";
import type { Pairing } from "./pairing.js";

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
              <button type="button" title="Click to copy connection URL" onClick={() => void properties.pairing.copy()} innerHTML={encodeQR(url(), "svg", { optimize: true, encoding: "byte", border: 2 })} />
            </div>
            <button type="button" class="secondary full" onClick={() => void properties.pairing.copy()}>{properties.pairing.copied() ? "Copied" : "Copy Connection URL"}</button>
            <p class="scan-copy">
              Scan the code above using your mobile wallet.
              <br />
              Or copy the link and paste it into your wallet.
            </p>
          </>
        )}
      </Show>
      <Show when={!hasFailed() && state() !== "connected" && !(state() === "ready" && properties.pairing.url())}>
        <ConnectionLoading detail={state() === "linking" ? "This may take a few seconds..." : "Waiting for network connection..."} />
      </Show>
      <Show when={state() === "connected"}>
        <div class="state">
          <LucideCheck />
          <strong>Connected Successfully!</strong>
          <p>{properties.pairing.connection()?.wallet?.name ?? "Your wallet"}</p>
        </div>
        <button type="button" class="primary full" onClick={properties.onDone}>Done</button>
      </Show>
      <Show when={hasFailed()}>
        <div class="connection-error">
          <div class="connection-error-copy">
            <div class="connection-error-icon" aria-hidden="true">⚠️</div>
            <h2>Connection failed</h2>
            <p role="alert">{properties.pairing.failure() ?? "The connection could not be established."}</p>
          </div>
          <button type="button" class="primary full" onClick={properties.onRetry}>Try again</button>
        </div>
      </Show>
    </>
  );
};
