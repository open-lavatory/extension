import type { JSX } from "solid-js";

import { t } from "../i18n/catalogue.js";

export const ConnectionLoading = (properties: { detail?: string; }): JSX.Element => (
  <div class="connection-loading" role="status">
    <div class="connection-loading-spinner" aria-hidden="true" />
    <div class="connection-loading-copy">
      <h2>{t("connectionFlow.connecting")}</h2>
      <p>{properties.detail ?? t("connectionFlow.waitingForNetwork")}</p>
    </div>
  </div>
);
