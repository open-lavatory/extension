import { type Accessor, For, type JSX, Show } from "solid-js";

import type { ConnectionView } from "./port.js";

export const ConnectionList = (properties: {
  connections: ConnectionView[];
  children: (connection: Accessor<ConnectionView>) => JSX.Element;
}): JSX.Element => (
  <For each={properties.connections.map(connection => connection.connectionId)}>
    {connectionId => (
      <Show when={properties.connections.find(connection => connection.connectionId === connectionId)}>
        {connection => properties.children(connection)}
      </Show>
    )}
  </For>
);
