import { browser } from "wxt/browser";

import { t } from "../i18n/catalogue.js";
import type { UiCommand, UiReply } from "./port.js";

export const call = async (command: UiCommand): Promise<UiReply> => {
  const reply: unknown = await browser.runtime.sendMessage(command);

  if (
    typeof reply !== "object"
    || reply === null
    || !("for" in reply)
    || reply.for !== command.kind
  ) {
    throw new Error(t("errors.extensionDidNotAnswer"));
  }

  return reply as UiReply;
};
