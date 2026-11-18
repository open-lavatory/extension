import { type Browser, browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { siteAccounts, visibleAccounts, walletAccounts } from "../connections/accounts.js";
import { askApproval, type PendingApproval } from "../connections/approval.js";
import {
  bindOrigin,
  connectionForOrigin,
  unbindOrigin,
} from "../connections/binding.js";
import { didHandlePairingEvent, endPairing, startPairing } from "../connections/pairing.js";
import {
  getConnection,
  listConnections,
  patchConnection,
  removeConnection,
  updateConnections,
} from "../connections/registry.js";
import {
  engineClose,
  engineStates,
  engineUrl,
} from "../engine/client.js";
import { isEngineEvent } from "../engine/port.js";
import { t } from "../i18n/catalogue.js";
import { forwardWalletRequest } from "../rpc/forward.js";
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
import { accountPermissions, hasAuthorizedSigner, isAccountPermissionRequest } from "../rpc/permissions.js";
import { routeMethod } from "../rpc/policy.js";
import {
  type ConnectionView,
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
      browser.contextMenus.create({ ["id"]: "how-it-works", title: t("menu.howItWorks"), contexts: ["action"] });
    });

    if (reason === "install") void openWelcome();
  });

  browser.contextMenus.onClicked.addListener(({ menuItemId }) => {
    if (menuItemId === "how-it-works") void openWelcome();
  });

  const ports = new Map<string, Set<Browser.runtime.Port>>();
  const approvals = new Map<string, PendingApproval>();

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

  const connectOrigin = async (
    origin: string,
    messageId: string,
    pageUrl: string | undefined,
  ): Promise<PageResponse> => {
    const existing = await connectionForOrigin(origin);

    if (existing?.binding) {
      const accounts = await siteAccounts(existing);

      if (accounts.length > 0) return answerPage(messageId, accounts);
    }

    const icon = pageUrl === undefined ? undefined : await siteIcon(pageUrl);
    const decision = await askApproval(approvals, origin, icon);

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

    if (route.kind === "requestPermissions") {
      if (!isAccountPermissionRequest(request.params)) return refusePage(request.messageId, { code: 4200, message: "Only eth_accounts permissions are supported" });

      const response = await connectOrigin(origin, request.messageId, pageUrl);

      if ("error" in response) return response;

      const connection = await connectionForOrigin(origin);

      return answerPage(request.messageId, accountPermissions(origin, connection ? await siteAccounts(connection) : []));
    }

    if (route.kind === "revoke") {
      await unbindOrigin(origin);
      emitToOrigin(origin, "accountsChanged", []);

      return answerPage(request.messageId, null);
    }

    const connection = await connectionForOrigin(origin);

    if (["accounts", "permissions", "coinbase"].includes(route.kind)) {
      const accounts = connection ? await siteAccounts(connection) : [];
      const value = route.kind === "permissions" ? accountPermissions(origin, accounts) : (route.kind === "coinbase" ? accounts[0] ?? null : accounts);

      return answerPage(request.messageId, value);
    }

    if (route.kind === "chainId" && connection?.chainId) {
      return answerPage(request.messageId, connection.chainId);
    }

    if (!connection) {
      return route.kind === "chainId"
        ? answerPage(request.messageId, UNBOUND_CHAIN)
        : refusePage(request.messageId, UNAUTHORIZED);
    }

    if (!hasAuthorizedSigner(request, connection.binding?.accounts ?? [])) return refusePage(request.messageId, UNAUTHORIZED);

    return await forwardWalletRequest(origin, connection, request, emitToOrigin);
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

      case "ui:permission-accounts": {
        return { for: "ui:permission-accounts", result: await walletAccounts(command.connectionId) };
      }

      case "ui:permission-save": {
        const connection = await getConnection(command.connectionId);

        if (connection?.binding?.origin !== command.origin) {
          return { for: "ui:permission-save", result: { ok: false, error: t("approval.noLongerWaiting") } };
        }

        const result = await walletAccounts(command.connectionId);

        if (!result.ok) return { for: "ui:permission-save", result };

        let accounts: string[] | undefined;

        await updateConnections(connections => connections.map((entry) => {
          if (entry.connectionId !== command.connectionId || entry.binding?.origin !== command.origin) return entry;

          const allowed = new Set([...result.value, ...entry.binding.accounts].map(account => account.toLowerCase()));

          accounts = command.accounts.filter(account => allowed.has(account.toLowerCase()));

          return { ...entry, binding: { ...entry.binding, accounts } };
        }));

        if (!accounts) return { for: "ui:permission-save", result: { ok: false, error: t("approval.noLongerWaiting") } };

        const visible = visibleAccounts(result.value, accounts);

        emitToOrigin(command.origin, "accountsChanged", visible);

        return { for: "ui:permission-save", result: { ok: true, value: null } };
      }

      case "approve:load": {
        const waiting = approvals.get(command.requestId);

        if (!waiting) {
          return {
            for: "approve:load",
            result: { ok: false, error: t("approval.noLongerWaiting") },
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
        return { for: "approve:accounts", result: await walletAccounts(command.connectionId) };
      }

      case "approve:decide": {
        const waiting = approvals.get(command.requestId);

        if (!waiting) {
          return {
            for: "approve:decide",
            result: { ok: false, error: t("approval.noLongerWaiting") },
          };
        }

        if (command.decision.kind === "approved") {
          const decision = command.decision;
          const result = await walletAccounts(decision.connectionId);

          if (approvals.get(command.requestId) !== waiting || !result.ok) {
            return { for: "approve:decide", result: { ok: false, error: t("approval.noLongerWaiting") } };
          }

          const accounts = visibleAccounts(result.value, decision.accounts);

          if (accounts.length !== decision.accounts.length || accounts.length === 0) {
            return { for: "approve:decide", result: { ok: false, error: t("approval.noLongerWaiting") } };
          }
        }

        approvals.delete(command.requestId);
        waiting.settle(command.decision);

        return { for: "approve:decide", result: { ok: true, value: null } };
      }
    }
  };

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== PAGE_CHANNEL) return;

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

  let notifying: Promise<void> = Promise.resolve();

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isEngineEvent(message) && message.kind === "engine:notification") {
      const previous = notifying;

      notifying = (async () => {
        await Promise.allSettled([previous]);
        const connection = await getConnection(message.connectionId);

        if (message.event === "chainChanged" || message.event === "connect") {
          await patchConnection(message.connectionId, { chainId: message.event === "connect" ? message.data.chainId : message.data });
        }

        if (connection?.binding) {
          const data = message.event === "accountsChanged" ? visibleAccounts(message.data, connection.binding.accounts) : message.data;
          const notification = { origin: connection.binding.origin, event: { channel: PAGE_CHANNEL, kind: "event", event: message.event, data } satisfies PageEvent };
          const tabs = await browser.tabs.query({});

          await Promise.allSettled(tabs.flatMap(tab => (tab["id"] === undefined ? [] : [browser.tabs.sendMessage(tab["id"], notification)])));
        }

        sendResponse(null);
      })();

      return true;
    }

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
