import { type Browser, browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import {
  bindOrigin,
  connectionForOrigin,
  unbindOrigin,
} from "../connections/binding.js";
import { didHandlePairingEvent, endPairing, startPairing } from "../connections/pairing.js";
import {
  type Connection,
  getConnection,
  listConnections,
  patchConnection,
  removeConnection,
} from "../connections/registry.js";
import {
  engineClose,
  engineSend,
  engineStates,
  engineUrl,
} from "../engine/client.js";
import { isEngineEvent } from "../engine/port.js";
import {
  answerPage,
  isPageMessage,
  PAGE_CHANNEL,
  type PageEvent,
  type PageRequest,
  type PageResponse,
  refusePage,
  type RpcFailure,
} from "../rpc/page.js";
import { routeMethod } from "../rpc/policy.js";
import {
  type ConnectionView,
  type Decision,
  isUiCommand,
  type UiCommand,
  type UiReply,
} from "../ui/port.js";

const USER_REJECTED: RpcFailure = {
  code: 4001,
  message: "User rejected the request",
};
const UNAUTHORIZED: RpcFailure = {
  code: 4100,
  message: "This site is not connected to a wallet",
};
const DISCONNECTED: RpcFailure = {
  code: 4900,
  message: "The paired wallet is not reachable",
};

/**
 * What a site sees before it has connected. Nothing can be forwarded without
 * a binding, and an error here breaks the connect button on most dapps.
 */
const UNBOUND_CHAIN = "0x1";

const siteIcon = async (pageUrl: string): Promise<string | undefined> => {
  const response = await fetch(new URL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`, browser.runtime.getURL("/")));

  if (!response.ok) return undefined;

  const bytes = new Uint8Array(await response.arrayBuffer());

  return `data:${response.headers.get("content-type") ?? "image/png"};base64,${btoa(String.fromCodePoint(...bytes))}`;
};

const views = async (): Promise<ConnectionView[]> => {
  const stored = await listConnections();

  if (stored.length === 0) return [];

  const states = await engineStates();

  return stored.map(connection => ({
    ...connection,
    state: states[connection.connectionId] ?? "disconnected",
  }));
};

const readAccounts = async (connectionId: string): Promise<UiReply> => {
  const result = await engineSend(connectionId, {
    method: "eth_accounts",
    params: [],
  });

  if (!result.ok) {
    return {
      for: "approve:accounts",
      result: { ok: false, error: result.error },
    };
  }

  const accounts = Array.isArray(result.value)
    ? result.value.filter(entry => typeof entry === "string")
    : [];

  return { for: "approve:accounts", result: { ok: true, value: accounts } };
};

export default defineBackground(() => {
  const openWelcome = async (): Promise<void> => {
    const url = browser.runtime.getURL("/onboarding.html");
    const [existing] = await browser.runtime.getContexts({ contextTypes: ["TAB"], documentUrls: [url] });

    if (existing) {
      await browser.tabs.update(existing.tabId, { active: true });
      await browser.windows.update(existing.windowId, { focused: true });

      return;
    }

    await browser.tabs.create({ url });
  };

  browser.runtime.onInstalled.addListener(({ reason }) => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ ["id"]: "how-it-works", title: "How it works", contexts: ["action"] });
    });

    if (reason === "install") void openWelcome();
  });

  browser.contextMenus.onClicked.addListener(({ menuItemId }) => {
    if (menuItemId === "how-it-works") void openWelcome();
  });

  const ports = new Map<string, Set<Browser.runtime.Port>>();
  /**
   * Approvals are held in memory. A worker suspended while the approval
   * window is open forgets the request, and the site sees its call time out
   * rather than receive a wrong answer.
   */
  const approvals = new Map<
    string,
    { origin: string; icon?: string | undefined; settle: (decision: Decision) => void; }
  >();

  const emitToOrigin = (
    origin: string,
    event: PageEvent["event"],
    data: unknown,
  ): void => {
    const message: PageEvent = {
      channel: PAGE_CHANNEL,
      kind: "event",
      event,
      data,
    };
    const open = ports.get(origin) ?? new Set<Browser.runtime.Port>();

    for (const port of open) port.postMessage(message);
  };

  const askApproval = async (origin: string, icon: string | undefined): Promise<Decision> => {
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

  const connectOrigin = async (
    origin: string,
    messageId: string,
    pageUrl: string | undefined,
  ): Promise<PageResponse> => {
    const existing = await connectionForOrigin(origin);

    if (existing?.binding) return answerPage(messageId, existing.binding.accounts);

    const icon = pageUrl === undefined ? undefined : await siteIcon(pageUrl);
    const decision = await askApproval(origin, icon);

    if (decision.kind === "rejected") return refusePage(messageId, USER_REJECTED);

    const bound = await bindOrigin(
      decision.connectionId,
      origin,
      decision.accounts,
      icon,
    );

    if (!bound.ok) return refusePage(messageId, UNAUTHORIZED);

    if (bound.displaced) {
      emitToOrigin(bound.displaced, "accountsChanged", []);
      emitToOrigin(bound.displaced, "disconnect", DISCONNECTED);
    }

    const connection = await getConnection(decision.connectionId);

    emitToOrigin(origin, "connect", {
      chainId: connection?.chainId ?? UNBOUND_CHAIN,
    });
    emitToOrigin(origin, "accountsChanged", decision.accounts);

    return answerPage(messageId, decision.accounts);
  };

  const forwardAndCache = async (
    origin: string,
    connection: Connection,
    request: PageRequest,
  ): Promise<PageResponse> => {
    const result = await engineSend(connection.connectionId, {
      method: request.method,
      ...(request.params !== undefined && { params: request.params }),
    });

    if (!result.ok) {
      return refusePage(request.messageId, {
        code: result.code ?? DISCONNECTED.code,
        message: result.error,
      });
    }

    if (request.method === "eth_chainId" && typeof result.value === "string") {
      await patchConnection(connection.connectionId, { chainId: result.value });
    }

    if (
      request.method === "wallet_switchEthereumChain"
      || request.method === "wallet_addEthereumChain"
    ) {
      const refreshed = await engineSend(connection.connectionId, {
        method: "eth_chainId",
      });

      if (refreshed.ok && typeof refreshed.value === "string") {
        await patchConnection(connection.connectionId, {
          chainId: refreshed.value,
        });
        emitToOrigin(origin, "chainChanged", refreshed.value);
      }
    }

    return answerPage(request.messageId, result.value);
  };

  const handlePageRequest = async (
    origin: string,
    request: PageRequest,
    pageUrl: string | undefined,
  ): Promise<PageResponse> => {
    const route = routeMethod(request.method);

    if (route.kind === "refuse") {
      return refusePage(request.messageId, route.failure);
    }

    if (route.kind === "connect") {
      return await connectOrigin(origin, request.messageId, pageUrl);
    }

    if (route.kind === "revoke") {
      await unbindOrigin(origin);
      emitToOrigin(origin, "accountsChanged", []);

      return answerPage(request.messageId, null);
    }

    const connection = await connectionForOrigin(origin);

    if (route.kind === "accounts") {
      return answerPage(request.messageId, connection?.binding?.accounts ?? []);
    }

    if (route.kind === "chainId" && connection?.chainId) {
      return answerPage(request.messageId, connection.chainId);
    }

    if (!connection) {
      return route.kind === "chainId"
        ? answerPage(request.messageId, UNBOUND_CHAIN)
        : refusePage(request.messageId, UNAUTHORIZED);
    }

    return await forwardAndCache(origin, connection, request);
  };

  const forgetConnection = async (connectionId: string): Promise<UiReply> => {
    const connection = await getConnection(connectionId);

    await engineClose(connectionId);

    if (connection) await removeConnection(connectionId);

    if (connection?.binding) {
      emitToOrigin(connection.binding.origin, "accountsChanged", []);
      emitToOrigin(connection.binding.origin, "disconnect", DISCONNECTED);
    }

    return { for: "ui:forget", result: { ok: true, value: null } };
  };

  const handleUi = async (command: UiCommand): Promise<UiReply> => {
    switch (command.kind) {
      case "ui:list": {
        return { for: "ui:list", result: { ok: true, value: await views() } };
      }

      case "ui:url": {
        return {
          for: "ui:url",
          result: await engineUrl(command.connectionId),
        };
      }

      case "ui:forget": {
        return await forgetConnection(command.connectionId);
      }

      case "ui:pair": {
        await startPairing(command.connectionId, command.relay, command.surface);

        return { for: "ui:pair", result: { ok: true, value: null } };
      }

      case "ui:end-pair": {
        await endPairing(command.connectionId);

        return { for: "ui:end-pair", result: { ok: true, value: null } };
      }

      case "ui:unbind": {
        await unbindOrigin(command.origin);
        emitToOrigin(command.origin, "accountsChanged", []);
        emitToOrigin(command.origin, "disconnect", DISCONNECTED);

        return { for: "ui:unbind", result: { ok: true, value: null } };
      }

      case "approve:load": {
        const waiting = approvals.get(command.requestId);

        if (!waiting) {
          return {
            for: "approve:load",
            result: { ok: false, error: "This request is no longer waiting" },
          };
        }

        return {
          for: "approve:load",
          result: {
            ok: true,
            value: { origin: waiting.origin, icon: waiting.icon, connections: await views() },
          },
        };
      }

      case "approve:accounts": {
        return await readAccounts(command.connectionId);
      }

      case "approve:decide": {
        const waiting = approvals.get(command.requestId);

        if (!waiting) {
          return {
            for: "approve:decide",
            result: { ok: false, error: "This request is no longer waiting" },
          };
        }

        approvals.delete(command.requestId);
        waiting.settle(command.decision);

        return { for: "approve:decide", result: { ok: true, value: null } };
      }
    }
  };

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== PAGE_CHANNEL) return;

    // The origin comes from the port, never from the message body: a page can
    // write anything into a postMessage payload and nothing into its sender.
    const origin = port.sender?.origin;

    if (!origin) {
      port.disconnect();

      return;
    }

    const open = ports.get(origin) ?? new Set<Browser.runtime.Port>();

    open.add(port);
    ports.set(origin, open);

    port.onDisconnect.addListener(() => {
      open.delete(port);

      if (open.size === 0) ports.delete(origin);
    });

    port.onMessage.addListener((message: unknown) => {
      if (!isPageMessage(message) || message.kind !== "request") return;

      void (async () => {
        try {
          port.postMessage(await handlePageRequest(origin, message, port.sender?.url));
        }
        catch (error) {
          port.postMessage(
            refusePage(message.messageId, {
              code: -32_603,
              message: error instanceof Error ? error.message : "Internal error",
            }),
          );
        }
      })();
    });
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isEngineEvent(message)) {
      void (async () => {
        if (await didHandlePairingEvent(message)) return;

        if (message.kind === "engine:wallet") await patchConnection(message.connectionId, { wallet: message.wallet });
      })();

      return false;
    }

    if (!isUiCommand(message)) return false;

    void (async () => {
      try {
        sendResponse(await handleUi(message));
      }
      catch (error) {
        sendResponse({
          for: message.kind,
          result: { ok: false, error: error instanceof Error ? error.message : "Internal error" },
        } satisfies UiReply);
      }
    })();

    return true;
  });
});
