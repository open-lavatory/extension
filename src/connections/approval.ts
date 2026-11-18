import { browser } from "wxt/browser";

import type { Decision } from "../ui/port.js";

export type PendingApproval = {
  origin: string;
  icon?: string | undefined;
  settle: (decision: Decision) => void;
};

export const askApproval = async (
  approvals: Map<string, PendingApproval>,
  origin: string,
  icon: string | undefined,
): Promise<Decision> => {
  const requestId = crypto.randomUUID();
  const decided = new Promise<Decision>((resolve) => {
    approvals.set(requestId, { origin, icon, settle: resolve });
  });
  const created = await browser.windows.create({
    url: `${browser.runtime.getURL("/approve.html")}?request=${requestId}`,
    type: "popup",
    width: 420,
    height: 660,
  });
  const openedId = created?.["id"];

  if (openedId !== undefined) {
    const onRemoved = (closedId: number) => {
      if (closedId !== openedId) return;

      browser.windows.onRemoved.removeListener(onRemoved);

      const waiting = approvals.get(requestId);

      if (!waiting) return;

      approvals.delete(requestId);
      waiting.settle({ kind: "rejected" });
    };

    browser.windows.onRemoved.addListener(onRemoved);
  }

  return await decided;
};
