import type { JSX } from "solid-js";

export const ConnectionLoading = (properties: { detail?: string; }): JSX.Element => (
  <div class="connection-loading" role="status">
    <div class="connection-loading-spinner" aria-hidden="true" />
    <div class="connection-loading-copy">
      <h2>Connecting</h2>
      <p>{properties.detail ?? "Waiting for network connection..."}</p>
    </div>
  </div>
);
