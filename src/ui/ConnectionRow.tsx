import LucideEllipsis from "lucide-solid/icons/ellipsis";
import { type JSX, Show } from "solid-js";

import { t } from "../i18n/catalogue.js";
import type { ConnectionView } from "./port.js";
import { SiteIcon, WalletIcon } from "./WalletIcon.js";

type ConnectionRowProperties = {
  connection: ConnectionView;
  onConnect?: () => void;
  onForget: () => void;
  onRevoke: (origin: string) => void;
  disabled?: boolean;
  selection?: { checked: boolean; onSelect: () => void; };
};

export const ConnectionRow = (properties: ConnectionRowProperties): JSX.Element => (
  <div class="connection-row">
    <label class="connection-details" classList={{ selectable: Boolean(properties.selection) }}>
      <WalletIcon wallet={properties.connection.wallet} isConnected={properties.connection.state === "connected"} label={t(properties.connection.state === "connected" ? "popup.walletConnected" : "popup.walletNotConnected")} />
      <span class="connection-copy">
        <strong>{properties.connection.wallet?.name ?? t("wallet.unnamed")}</strong>
        <Show when={properties.connection.binding}>
          {binding => (
            <span>
              <SiteIcon icon={binding().icon} />
              {binding().origin}
            </span>
          )}
        </Show>
      </span>
      <Show when={properties.selection}>
        {selection => (
          <input type="radio" name="connection" value={properties.connection.connectionId} checked={selection().checked} disabled={properties.disabled || properties.connection.state !== "connected"} onChange={() => selection().onSelect()} />
        )}
      </Show>
    </label>
    <details
      class="row-menu"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) event.currentTarget.open = false;
      }}
    >
      <summary aria-label={t("popup.actionsFor", { name: properties.connection.wallet?.name ?? t("wallet.unnamed") })}><LucideEllipsis /></summary>
      <div class="menu-items">
        <Show when={properties.connection.state === "disconnected" && properties.onConnect}>
          {connect => <button type="button" disabled={properties.disabled} onClick={() => connect()()}>{t("actions.connect")}</button>}
        </Show>
        <Show when={properties.connection.binding}>
          {binding => <button type="button" disabled={properties.disabled} onClick={() => properties.onRevoke(binding().origin)}>{t("actions.revoke")}</button>}
        </Show>
        <button type="button" disabled={properties.disabled} onClick={() => properties.onForget()}>{t("actions.forget")}</button>
      </div>
    </details>
  </div>
);
