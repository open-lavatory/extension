import LucideWallet from "lucide-solid/icons/wallet";
import { type JSX, Show } from "solid-js";

import type { Wallet } from "../connections/registry.js";

export const imageUrl = (value: string | undefined): string | undefined =>
  (value && /^(?:https:|data:image\/)/iu.test(value) ? value : undefined);

export const WalletIcon = (properties: { wallet?: Wallet | undefined; isConnected: boolean; label?: string; }): JSX.Element => (
  <span
    class="wallet-state"
    classList={{ disconnected: !properties.isConnected }}
    role={properties.label ? "img" : undefined}
    aria-label={properties.label}
  >
    <Show when={imageUrl(properties.wallet?.icon)} fallback={<LucideWallet />}>
      {source => <img src={source()} alt="" width="32" height="32" referrerpolicy="no-referrer" />}
    </Show>
  </span>
);

export const SiteIcon = (properties: { icon?: string | undefined; }): JSX.Element => (
  <Show when={imageUrl(properties.icon)}>
    {source => <img class="site-icon" src={source()} alt="" width="16" height="16" referrerpolicy="no-referrer" />}
  </Show>
);
