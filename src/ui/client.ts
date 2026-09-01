import { browser } from "wxt/browser";

import type { UiCommand, UiReply } from "./port.js";

export const call = async (command: UiCommand): Promise<UiReply> => {
  const reply: unknown = await browser.runtime.sendMessage(command);

  if (
    typeof reply !== "object"
    || reply === null
    || !("for" in reply)
    || reply.for !== command.kind
  ) {
    throw new Error("The extension did not answer");
  }

  return reply as UiReply;
};
