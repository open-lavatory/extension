import * as z from "zod/mini";

import type { Connection } from "../connections/registry.js";
import { patchConnection } from "../connections/registry.js";
import { engineSend } from "../engine/client.js";
import { answerPage, type PageRequest, type PageResponse, refusePage } from "./page.js";

export const forwardWalletRequest = async (
  origin: string,
  connection: Connection,
  request: PageRequest,
  emitToOrigin: (origin: string, event: "chainChanged", data: string) => void,
): Promise<PageResponse> => {
  const result = await engineSend(connection.connectionId, {
    method: request.method,
    ...(request.params !== undefined && { params: request.params }),
  });

  if (!result.ok) {
    return refusePage(request.messageId, {
      code: result.code ?? 4900,
      message: result.error,
    });
  }

  if (request.method === "eth_chainId") {
    const chainId = z.string().safeParse(result.value);

    if (chainId.success) await patchConnection(connection.connectionId, { chainId: chainId.data });
  }

  else if (
    request.method === "wallet_switchEthereumChain"
    || request.method === "wallet_addEthereumChain"
  ) {
    const refreshed = await engineSend(connection.connectionId, {
      method: "eth_chainId",
    });

    const chainId = z.string().safeParse(refreshed.ok ? refreshed.value : undefined);

    if (chainId.success) {
      await patchConnection(connection.connectionId, {
        chainId: chainId.data,
      });
      emitToOrigin(origin, "chainChanged", chainId.data);
    }
  }

  return answerPage(request.messageId, result.value);
};
