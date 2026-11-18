import { blo } from "blo";
import { type JSX, Show } from "solid-js";

import { isWalletAddress } from "../engine/notification.js";

const identicon = (account: string): string | undefined => (isWalletAddress(account) ? blo(account) : undefined);

export const AccountIdentity = (properties: { account: string; }): JSX.Element => (
  <span class="account-identity" title={properties.account}>
    <Show when={identicon(properties.account)}>{source => <img src={source()} alt="" width="28" height="28" />}</Show>
    <code>
      {properties.account.slice(0, 8)}
      ...
      {properties.account.slice(-6)}
    </code>
  </span>
);
