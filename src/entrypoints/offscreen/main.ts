import { browser } from "wxt/browser";

import { close, pair, send, states, urlOf } from "../../engine/host.js";
import type { EngineCommand, EngineReply } from "../../engine/port.js";

const handle = async (command: EngineCommand): Promise<EngineReply> => {
  switch (command.kind) {
    case "engine:pair": {
      return {
        for: "engine:pair",
        result: await pair(command.connectionId, command.relay),
      };
    }

    case "engine:url": {
      return { for: "engine:url", result: urlOf(command.connectionId) };
    }

    case "engine:send": {
      return {
        for: "engine:send",
        result: await send(command.connectionId, command.payload),
      };
    }

    case "engine:close": {
      await close(command.connectionId);

      return { for: "engine:close", result: { ok: true, value: null } };
    }

    case "engine:states": {
      return { for: "engine:states", result: { ok: true, value: states() } };
    }
  }
};

const isEngineCommand = (message: unknown): message is EngineCommand =>
  typeof message === "object"
  && message !== null
  && "kind" in message
  && typeof message.kind === "string"
  && message.kind.startsWith("engine:");

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isEngineCommand(message)) return false;

  void (async () => {
    sendResponse(await handle(message));
  })();

  return true;
});
