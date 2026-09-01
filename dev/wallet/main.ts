import { connectSession } from "@openlv/session";
import { webrtc } from "@openlv/transport/webrtc";

/** anvil's first development account, so signatures are obviously fake. */
const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const CHAIN_ID = "0x1";
const FAKE_SIGNATURE = `0x${"11".repeat(65)}`;
const FAKE_TX = `0x${"22".repeat(32)}`;

const status = document.querySelector("#status");
const log = document.querySelector("#log");
const url = document.querySelector("#url");
const connect = document.querySelector("#connect");

const setStatus = (value: string) => {
  document.body.dataset["status"] = value;

  if (status) status.textContent = value;
};

const note = (line: string) => {
  if (!log) return;

  const item = document.createElement("li");

  item.textContent = line;
  log.append(item);
};

const answer = (method: string): object => {
  switch (method) {
    case "eth_accounts":
    case "eth_requestAccounts": {
      return { result: [ACCOUNT] };
    }

    case "eth_chainId": {
      return { result: CHAIN_ID };
    }

    case "personal_sign":
    case "eth_signTypedData_v4": {
      return { result: FAKE_SIGNATURE };
    }

    case "eth_sendTransaction": {
      return { result: FAKE_TX };
    }

    default: {
      return { error: { code: -32_601, message: `no handler for ${method}` } };
    }
  }
};

const onRequest = async (message: object): Promise<object> => {
  const method = "method" in message ? String(message.method) : "unknown";

  note(method);

  return answer(method);
};

const join = async () => {
  if (!(url instanceof HTMLTextAreaElement)) return;

  const value = url.value.trim();

  if (!value.startsWith("openlv://")) {
    setStatus("paste a connection url first");

    return;
  }

  setStatus("joining");

  try {
    const session = await connectSession(value, onRequest, [webrtc()], {
      info: { identity: "sh.openlv.devwallet", name: "Dev Wallet" },
    });

    session.status.subscribe(setStatus);
    await session.connect();
  }
  catch (error) {
    setStatus(error instanceof Error ? error.message : "failed");
  }
};

connect?.addEventListener("click", () => void join());
