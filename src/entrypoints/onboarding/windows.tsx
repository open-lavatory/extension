import Check from "lucide-solid/icons/check";
import Ellipsis from "lucide-solid/icons/ellipsis";
import Unplug from "lucide-solid/icons/unplug";
import { For, type JSX, Show } from "solid-js";

import { ConnectionLoading } from "../../ui/ConnectionLoading.js";
import { Header } from "../../ui/Header.js";
import { ACCOUNT_APPROVE, ORIGIN, type Peer, PEER_NAME, PeerIcon, QR_SVG } from "./parts.js";

const idle = () => undefined;

export const PopupWindow = (properties: { style: JSX.CSSProperties; isShown?: boolean; children: JSX.Element; }): JSX.Element => (
  <div class="extension-window popup-window shell" classList={{ hidden: properties.isShown === false }} style={properties.style}>
    {properties.children}
  </div>
);

export const ListView = (properties: {
  rows: { peer: Peer; isBound?: boolean; }[];
  isMenuOpen?: boolean;
  connectRef?: (element: HTMLElement) => void;
  moreRef?: (element: HTMLElement) => void;
}): JSX.Element => (
  <>
    <Header title="openlv-connect" onSettings={idle} />
    <main class="body">
      <Show
        when={properties.rows.length > 0}
        fallback={(
          <div class="empty-state">
            <Unplug />
            <p>No connections yet.</p>
          </div>
        )}
      >
        <div class="connection-list">
          <For each={properties.rows}>
            {(row, rowIndex) => (
              <div class="connection-row">
                <PeerIcon peer={row.peer} size={32} />
                <div class="connection-copy">
                  <strong>{PEER_NAME[row.peer]}</strong>
                  <Show when={row.isBound}>
                    <span class="connection-origin">
                      <PeerIcon peer="site" size={14} />
                      {ORIGIN}
                    </span>
                  </Show>
                </div>
                <details class="row-menu" open={rowIndex() === 0 && properties.isMenuOpen}>
                  <summary ref={rowIndex() === 0 ? properties.moreRef : undefined}><Ellipsis /></summary>
                  <div class="menu-items">
                    <button type="button">Revoke</button>
                    <button type="button">Forget</button>
                  </div>
                </details>
              </div>
            )}
          </For>
        </div>
      </Show>
      <button type="button" class="primary full" ref={properties.connectRef}>Connect</button>
    </main>
  </>
);

export const QrView = (properties: { isCopied: boolean; copyRef?: (element: HTMLElement) => void; }): JSX.Element => (
  <>
    <Header title="Connect" onBack={idle} />
    <main class="body">
      <div class="qr-frame">
        <button type="button" innerHTML={QR_SVG} />
      </div>
      <button type="button" class="secondary full" ref={properties.copyRef}>{properties.isCopied ? "Copied" : "Copy Connection URL"}</button>
      <p class="scan-copy">
        Scan the code above using your mobile wallet.
        <br />
        Or copy the link and paste it into your wallet.
      </p>
    </main>
  </>
);

export const LoadingView = (): JSX.Element => (
  <>
    <Header title="Connect" onBack={idle} />
    <main class="body">
      <ConnectionLoading detail="This may take a few seconds..." />
    </main>
  </>
);

export const PairedView = (properties: { peer: Peer; doneRef?: (element: HTMLElement) => void; }): JSX.Element => (
  <>
    <Header title="Connect" onBack={idle} />
    <main class="body">
      <div class="state">
        <span class="peer-badge">
          <PeerIcon peer={properties.peer} size={48} />
          <Check />
        </span>
        <strong>Connected Successfully!</strong>
        <p>{PEER_NAME[properties.peer]}</p>
      </div>
      <button type="button" class="primary full" ref={properties.doneRef}>Done</button>
    </main>
  </>
);

export const ApprovalWindow = (properties: {
  style: JSX.CSSProperties;
  isShown: boolean;
  rows: Peer[];
  picked?: Peer;
  pickRef?: (element: HTMLElement) => void;
  connectRef?: (element: HTMLElement) => void;
}): JSX.Element => (
  <div class="extension-window approval-window shell" classList={{ hidden: !properties.isShown }} style={properties.style}>
    <Header title="Connect" />
    <main class="body approval-body">
      <p class="origin">
        <PeerIcon peer="site" size={24} />
        {ORIGIN}
      </p>
      <fieldset class="connection-picker">
        <legend>Connection</legend>
        <For each={properties.rows}>
          {peer => (
            <label class="connection-choice" ref={peer === properties.rows[0] ? properties.pickRef : undefined}>
              <input type="radio" name="connection" checked={properties.picked === peer} />
              <PeerIcon peer={peer} size={24} />
              <span class="connection-copy"><strong>{PEER_NAME[peer]}</strong></span>
            </label>
          )}
        </For>
      </fieldset>
      <button type="button" class="secondary pair-button">Pair</button>
      <fieldset class="accounts" classList={{ hidden: !properties.picked }}>
        <legend>Accounts this site may see</legend>
        <label>
          <input type="checkbox" checked />
          <span>{ACCOUNT_APPROVE}</span>
        </label>
      </fieldset>
      <div class="approval-actions">
        <button type="button" class="secondary">Reject</button>
        <button type="button" class="primary" disabled={!properties.picked} ref={properties.connectRef}>Connect</button>
      </div>
    </main>
  </div>
);
