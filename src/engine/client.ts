import { browser } from "wxt/browser";

import type { Wallet } from "../connections/registry.js";
import type { Relay } from "../connections/relay.js";
import type {
  ConnectionState,
  EngineCommand,
  EngineFailure,
  EngineReply,
  EngineResult,
  RpcPayload,
} from "./port.js";

const engine: { ready?: Promise<void>; } = {};

/**
 * Every session runs in the offscreen document: a service worker has no
 * `RTCPeerConnection`, so the transport cannot live in the worker at all.
 */
const ensureEngine = async (): Promise<void> => {
  if (await browser.offscreen.hasDocument()) return;

  engine.ready ??= (async () => {
    if (await browser.offscreen.hasDocument()) return;

    await browser.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [browser.offscreen.Reason.WEB_RTC],
      justification: "Holds the peer to peer connection to your paired wallet.",
    });
  })();

  try {
    await engine.ready;
  }
  finally {
    delete engine.ready;
  }
};

const isReplyTo = (
  command: EngineCommand,
  reply: unknown,
): reply is EngineReply =>
  typeof reply === "object"
  && reply !== null
  && "for" in reply
  && reply.for === command.kind
  && "result" in reply;

const isEngineFailure = (reply: unknown): reply is EngineFailure =>
  typeof reply === "object"
  && reply !== null
  && "for" in reply
  && reply.for === "engine:failed"
  && "error" in reply
  && typeof reply.error === "string";

const engineFailed = (message: string): never => {
  console.error(message);
  throw new Error(message);
};

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 100;

/**
 * A freshly created offscreen document may not have run its script yet, so
 * the first message after a browser start can arrive before anything is
 * listening. Retrying beats failing the first pairing of every session.
 */
const callEngine = async (command: EngineCommand): Promise<EngineReply> => {
  if (engine.ready) await engine.ready;

  if (!await browser.offscreen.hasDocument()) throw new Error("The wallet is not connected");

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    let reply: unknown;

    try {
      reply = await browser.runtime.sendMessage(command);
    }
    catch {
      // Nothing is listening yet.
    }

    if (isEngineFailure(reply)) engineFailed(`The engine failed: ${reply.error}`);

    if (isReplyTo(command, reply)) return reply;

    if (attempt < ATTEMPTS) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, RETRY_DELAY_MS);
      });
    }
  }

  return engineFailed("The engine did not answer");
};

const WRONG_COMMAND = "The engine answered the wrong command";

export const enginePair = async (
  connectionId: string,
  relay: Relay,
  transport: RTCConfiguration,
): Promise<EngineResult<{ url: string; }>> => {
  await ensureEngine();

  const reply = await callEngine({ kind: "engine:pair", connectionId, relay, transport });

  return reply.for === "engine:pair"
    ? reply.result
    : { ok: false, error: WRONG_COMMAND };
};

export const engineUrl = async (
  connectionId: string,
): Promise<EngineResult<{ url: string; }>> => {
  const reply = await callEngine({ kind: "engine:url", connectionId });

  return reply.for === "engine:url"
    ? reply.result
    : { ok: false, error: WRONG_COMMAND };
};

export const engineSend = async (
  connectionId: string,
  payload: RpcPayload,
): Promise<EngineResult<unknown>> => {
  try {
    const reply = await callEngine({
      kind: "engine:send",
      connectionId,
      payload,
    });

    return reply.for === "engine:send"
      ? reply.result
      : { ok: false, error: WRONG_COMMAND };
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The wallet is not connected", code: 4900 };
  }
};

export const engineVerify = async (
  connectionId: string,
): Promise<EngineResult<{ accounts: string[]; wallet?: Wallet; }>> => {
  const reply = await callEngine({ kind: "engine:verify", connectionId });

  return reply.for === "engine:verify"
    ? reply.result
    : { ok: false, error: WRONG_COMMAND };
};

export const engineClose = async (connectionId: string): Promise<void> => {
  try {
    if (engine.ready) await engine.ready;

    if (!await browser.offscreen.hasDocument()) return;

    await callEngine({ kind: "engine:close", connectionId });
  }
  catch {
    // No engine means the session is already gone, which is the wanted state.
  }
};

export const engineStates = async (): Promise<
  Record<string, ConnectionState>
> => {
  if (!await browser.offscreen.hasDocument()) return {};

  try {
    const reply = await callEngine({ kind: "engine:states" });

    return reply.for === "engine:states" && reply.result.ok
      ? reply.result.value
      : {};
  }
  catch {
    // No engine means nothing is live, which is what an empty map says.
    return {};
  }
};
